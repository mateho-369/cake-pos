# Two frontends: build @bloom/sale or @bloom/admin (see apps/*).
# Example: docker build --build-arg APP=sale ...
ARG APP=sale
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY public ./public
RUN npm ci
ARG APP=sale
RUN npm run build -w @bloom/${APP}

FROM nginx:1.27-alpine
COPY docker/frontend/default.conf /etc/nginx/conf.d/default.conf
ARG APP=sale
COPY --from=build /app/apps/${APP}/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
