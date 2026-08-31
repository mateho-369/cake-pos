#!/bin/sh
# Measure the two cheapest production lag signals before/after a change:
#   a) PHP request overhead (OPcache + config/route/view cache) via /healthz
#   b) MySQL round-trip to the external Aiven host (the VM-Aiven latency)
# plus a quick `docker stats` snapshot for RAM headroom.
#
# It is meant to be run on the VM, not in this sandbox (the sandbox has no
# Docker/PHP/DB access). The same script should be run BEFORE deploying the
# performance change and again AFTER, then the medians compared:
#
#   cd ~/cake-pos/backend
#   sh bin/measure-perf.sh
#
# Options:
#   BASE_URL   public origin to hit, default http://127.0.0.1:${PORT:-8080}
#   REQUESTS   number of /healthz samples, default 10
set -eu
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT:-8080}}"
REQUESTS="${REQUESTS:-10}"

echo "== /healthz response time (${REQUESTS} samples) =="
times=""
i=0
while [ "$i" -lt "$REQUESTS" ]; do
  read -r code ms < <(curl -sS -o /dev/null -w '%{http_code} %{time_total}' \
    "${BASE_URL}/healthz" | awk '{printf "%s %d", $1, $2*1000}')
  echo "  #$((i+1)) status=$code time=${ms}ms"
  times="${times} ${ms}"
  i=$((i + 1))
done
# Median avoids skew from a cold first request.
median=$(printf '%s\n' $times | sort -n | awk '{a[NR]=$1} END {print a[int((NR+1)/2)]}')
echo "  median=${median}ms"

echo
echo "== MySQL/Aiven round-trip (inside the app container) =="
if docker compose exec -T app php -r '
  require "vendor/autoload.php";
  $app = require "bootstrap/app.php";
  $app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
  $start = microtime(true);
  DB::select("SELECT 1");
  printf("roundtrip_select1_ms=%.2f\n", (microtime(true) - $start) * 1000);
  $start = microtime(true);
  $count = DB::table("orders")->count();
  printf("roundtrip_orders_count_ms=%.2f rows=%d\n", (microtime(true) - $start) * 1000, $count);
' 2>&1; then
  :
else
  echo "  (could not run PHP probe inside app container)"
fi

echo
echo "== docker stats (container RAM, --no-stream) =="
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}'

echo
echo "Next: run this again after deploying the perf change and compare the two /healthz medians."
