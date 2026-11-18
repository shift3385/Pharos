# Pharos backend image. Runs the TypeScript entrypoint via tsx (v0.0.1); a tsc
# build step can replace this for production hardening later (DEU-01).
# Build context: the repo root (`docker compose build api`, or
# `docker build -f server/Dockerfile .`), because the server imports the shared
# `packages/formats` (@pharos/formats, ADR-0053) through its tsconfig paths.
FROM node:22-alpine

WORKDIR /app/server

COPY server/package.json server/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund

COPY packages/formats /app/packages/formats
COPY server/ ./
# The shared package resolves its imports (zod, uuid) upward from
# /app/packages/formats: let it find the server's node_modules.
RUN ln -s /app/server/node_modules /app/node_modules

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
