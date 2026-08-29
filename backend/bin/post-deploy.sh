#!/bin/sh
# Run on the VM after `docker compose up -d --build` (and after .env is in
# place). Recreates app/queue so OPcache (validate_timestamps=0) cannot
# keep serving the previous image, then bakes Laravel config/routes/views.
#
# The GitHub deploy workflow still runs `config:clear` + migrate + seed and
# cannot be updated from this branch (GitHub App lacks `workflows` scope).
# Until that YAML is patched, run this script on the VM after each deploy:
#
#   cd ~/cake-pos/backend && sh bin/post-deploy.sh
set -eu
cd "$(dirname "$0")/.."
CACHEBUST=$(git -C .. rev-parse HEAD)
export CACHEBUST
docker compose up -d --build --force-recreate
docker compose exec -T app php artisan migrate --force
docker compose exec -T app php artisan db:seed --force
docker compose exec -T app php artisan config:cache
docker compose exec -T app php artisan route:cache
docker compose exec -T app php artisan view:cache
