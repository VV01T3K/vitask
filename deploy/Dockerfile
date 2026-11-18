# The deploy and migrate jobs (compose.yaml): the repo with the web app built into the Worker's assets, plus celld.
FROM ghcr.io/denoland/celld:v0.6.3 AS celld

FROM node:24.22.3-bookworm-slim
COPY --from=celld /usr/local/bin/celld /usr/local/bin/celld
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @vitask/web build
WORKDIR /app/apps/worker
CMD ["node", "scripts/deploy-celld.mjs"]
