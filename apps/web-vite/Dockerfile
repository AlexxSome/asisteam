FROM node:24.16.0-bookworm-slim AS build
ARG SOURCE_COMMIT
ENV SOURCE_COMMIT=${SOURCE_COMMIT}
WORKDIR /repo
RUN test -n "$SOURCE_COMMIT" && corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/api-client/ packages/api-client/
COPY packages/db/package.json packages/db/package.json
# Next components are shared temporarily until WEB10; no Next runtime is shipped.
COPY apps/web/ apps/web/
COPY apps/web-vite/ apps/web-vite/
RUN pnpm install --frozen-lockfile --filter @asisteam/web-vite... --filter @asisteam/web && pnpm exec turbo run build --filter @asisteam/web-vite

FROM node:24.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3130 ASISTEAM_STATIC_DIR=/app/dist
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web-vite/dist/ ./dist/
COPY --chown=node:node apps/web-vite/scripts/static-server.mjs ./static-server.mjs
USER node
EXPOSE 3130
HEALTHCHECK --interval=5s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3130/legal/2026-09-21').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "static-server.mjs"]
