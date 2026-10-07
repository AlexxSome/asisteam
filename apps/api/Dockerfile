FROM node:24.16.0-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY packages/api-client/ packages/api-client/
COPY apps/api/ apps/api/
RUN pnpm install --frozen-lockfile --filter @asisteam/api... && pnpm exec turbo run build --filter @asisteam/api
# --legacy deploy supports the existing workspace without changing package injection.
RUN pnpm --filter @asisteam/api deploy --legacy --prod /runtime
RUN rm -rf /runtime/src /runtime/test /runtime/node_modules/@asisteam/core/src

FROM node:24.16.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
