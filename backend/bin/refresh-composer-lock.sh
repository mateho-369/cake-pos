#!/usr/bin/env bash
# Regenerate backend/composer.lock reproducibly.
#
# Why a script instead of "just run composer update": the lock must be produced
# by the same resolver that consumes it. The Docker build stage uses the
# composer:2.8 image, CI uses whatever shivammathur/setup-php ships, and the
# runtime image is php:8.4-fpm-alpine. Running this script pins the resolver to
# the build image, and config.platform.php in composer.json pins the PHP version
# that resolution targets, so the same composer.json always yields the same lock.
#
# Usage:
#   backend/bin/refresh-composer-lock.sh              # refresh the whole lock
#   backend/bin/refresh-composer-lock.sh laravel/framework   # bump one package
#
# Env:
#   COMPOSER_IMAGE   Composer image to resolve with (default: composer:2.8,
#                    keep in sync with the vendor stage in backend/Dockerfile)

set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSER_IMAGE="${COMPOSER_IMAGE:-composer:2.8}"

cd "$BACKEND_DIR"

run_composer() {
    if command -v docker >/dev/null 2>&1; then
        docker run --rm \
            -u "$(id -u):$(id -g)" \
            -v "$BACKEND_DIR:/app" \
            -w /app \
            -e COMPOSER_HOME=/tmp/composer \
            -e COMPOSER_NO_INTERACTION=1 \
            "$COMPOSER_IMAGE" "$@"
    elif command -v composer >/dev/null 2>&1; then
        echo "==> docker not found, falling back to local composer ($(composer -V))" >&2
        echo "    Resolution is still pinned by config.platform.php, but prefer" >&2
        echo "    Docker so the resolver matches the build image exactly." >&2
        COMPOSER_NO_INTERACTION=1 composer "$@"
    else
        echo "error: need either docker or composer on PATH" >&2
        exit 1
    fi
}

echo "==> Resolving dependencies with $COMPOSER_IMAGE"
run_composer update --prefer-dist --no-progress --no-scripts "$@"

echo
echo "==> composer validate --strict"
run_composer validate --strict || echo "    (validate reported issues, see above)"

echo
echo "==> composer audit --locked (advisories against the pinned versions)"
# Informational only: a new advisory against an already-locked package must not
# fail this script, otherwise refreshing the lock becomes impossible exactly
# when you most need to. Deploys install from the lock and never resolve, so
# they are unaffected; act on anything reported here by bumping the package.
run_composer audit --locked || true

echo
echo "==> Done. Review and commit backend/composer.lock:"
echo "      git add backend/composer.lock && git commit -m 'chore(backend): refresh composer.lock'"
