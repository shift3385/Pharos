# Pharos backend image (DEU-01, ADR-0052 «A5»): compiled with tsc, run with
# plain node as the unprivileged `node` user.
# Build context: the repo root (`docker compose build api`, or
# `docker build -f server/Dockerfile .`), because the server uses the shared
# `packages/formats` (@pharos/formats, ADR-0053); `npm run build` compiles it
# into dist/node_modules/@pharos/formats.

# --- build: every dependency, tsc, dist/ ---
FROM node:22-alpine AS build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY packages/formats /app/packages/formats
COPY server/ ./
RUN npm run build

# --- runtime: production dependencies, dist/ and the SQL migrations ---
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/server/dist ./dist
COPY server/migrations ./migrations
# The only folder the server writes to: stored attachments (BLOB_DIR, default
# data/blobs). The code stays owned by root, read-only for the server.
RUN mkdir -p data/blobs && chown -R node:node data
USER node
EXPOSE 3000
# Alpine has no curl: node's fetch. /health answers plain http from loopback
# even in production (SEC-07, httpsOnly).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
