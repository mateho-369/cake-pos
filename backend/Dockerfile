# syntax=docker/dockerfile:1.7
FROM composer:2.8 AS vendor
WORKDIR /app
# Copy composer.* (not just composer.json) so a committed composer.lock is used.
# With a lock present this is a pure install with no dependency resolution, which
# is (a) byte-for-byte reproducible and (b) immune to Composer's advisory
# blocking, which only fires while resolving. Regenerate the lock with
# bin/refresh-composer-lock.sh -- never hand-edit it.
COPY composer.* ./
RUN if [ -f composer.lock ]; then \
        echo '==> composer.lock present: reproducible install from lock'; \
    else \
        echo '==> WARNING: no composer.lock; resolving latest versions (not reproducible)'; \
    fi \
    && composer install --no-dev --no-interaction --no-progress --prefer-dist --no-scripts --optimize-autoloader
ARG CACHEBUST=1
# CACHEBUST is an unused build arg by itself; consume it so changing the
# value on every deploy actually invalidates the COPY and dump-autoload
# layers below. Without this, `docker compose up --build` can keep the old
# vendor image and OPcache (validate_timestamps=0) would serve stale code.
RUN echo "cachebust=$CACHEBUST" > /tmp/cachebust
COPY . .
RUN composer dump-autoload --no-dev --classmap-authoritative --no-interaction

FROM php:8.4-fpm-alpine AS runtime
WORKDIR /var/www/html
RUN apk add --no-cache freetype-dev libjpeg-turbo-dev libpng-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j1 pdo_mysql opcache gd \
    && WWW_CONF="$(find /usr/local/etc -type f -name www.conf -print -quit)" \
    && test -n "$WWW_CONF" \
    && echo "php-fpm pool config: $WWW_CONF" \
    && sed -i 's/^;\?clear_env[[:space:]]*=.*/clear_env = no/' "$WWW_CONF" \
    && grep -Eq '^clear_env[[:space:]]*=[[:space:]]*no' "$WWW_CONF"
COPY docker/opcache.ini /usr/local/etc/php/conf.d/opcache.ini
COPY docker/error-reporting.ini /usr/local/etc/php/conf.d/error-reporting.ini
COPY --from=vendor /app /var/www/html
RUN mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache
USER www-data
EXPOSE 9000
CMD ["php-fpm", "-F"]
