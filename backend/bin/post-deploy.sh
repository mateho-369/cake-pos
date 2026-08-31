#!/bin/sh
# Manual VM fallback for the cache-busting workflow. Use it after a GitHub
# deploy while `deploy-backend.yml` is still blocked from being patched by
# this GitHub App (it lacks the `workflows` permission), and also for manual
# VM deploys or after changing backend/.env on the server.
#
# It forces the app/queue containers to restart so OPcache
# (validate_timestamps=0) cannot keep serving the previous image, then bakes
# Laravel config/routes/views.
#
# The `deploy-backend.yml` patch (same steps, all in GitHub Actions) is
# available in docs/patches/deploy-backend-cache-opcache.patch.
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
