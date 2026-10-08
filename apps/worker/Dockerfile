FROM node:24.16.0-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/api-client/ packages/api-client/
COPY apps/api/ apps/api/
COPY apps/worker/ apps/worker/
RUN pnpm install --frozen-lockfile --filter @asisteam/worker... && pnpm exec turbo run build --filter @asisteam/worker
RUN pnpm --filter @asisteam/worker deploy --legacy --prod /runtime
RUN rm -rf /runtime/src /runtime/test /runtime/node_modules/@asisteam/api/src /runtime/node_modules/@asisteam/api/test /runtime/node_modules/@asisteam/core/src
FROM node:24.16.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
USER node
CMD ["node", "dist/main.js"]
