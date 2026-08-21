# syntax=docker/dockerfile:1.7
FROM composer:2.8 AS vendor
WORKDIR /app
COPY composer.json ./
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist --no-scripts --optimize-autoloader
COPY . .
RUN composer dump-autoload --no-dev --classmap-authoritative --no-interaction

FROM php:8.3-fpm-alpine AS runtime
WORKDIR /var/www/html
RUN docker-php-ext-install -j1 pdo_mysql opcache \
    && WWW_CONF="$(find /usr/local/etc -type f -name www.conf -print -quit)" \
    && test -n "$WWW_CONF" \
    && echo "php-fpm pool config: $WWW_CONF" \
    && sed -i 's/^;\?clear_env[[:space:]]*=.*/clear_env = no/' "$WWW_CONF" \
    && grep -Eq '^clear_env[[:space:]]*=[[:space:]]*no' "$WWW_CONF"
COPY --from=vendor /app /var/www/html
RUN mkdir -p storage/framework/{cache,sessions,views} storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache
USER www-data
EXPOSE 9000
CMD ["php-fpm", "-F"]
