# Pharos backend image. Runs the TypeScript entrypoint via tsx (v0.0.1); a tsc
# build step can replace this for production hardening later.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]
