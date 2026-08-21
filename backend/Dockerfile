FROM node:22-bookworm-slim AS build

WORKDIR /app

# better-sqlite3 is a native addon. Compile it inside this image with the
# exact Node 22 Debian toolchain used by the runtime image below.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

# Only the node_modules produced by the build stage is copied; host modules
# are never included in the image.
COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY scripts ./scripts
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
