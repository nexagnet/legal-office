# Một Dockerfile, hai đích: `--target api` (NestJS) và `--target web` (Next.js).
# Bí mật KHÔNG vào image; chỉ nhận qua biến môi trường lúc chạy (xem docs/engineering/northflank-deploy.md).
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY apps apps
COPY packages packages
RUN pnpm --filter @legal-office/api build
# Next ghi sẵn đích rewrite `/api/*` lúc build, nên API_URL phải truyền qua --build-arg.
ARG API_URL=http://localhost:3001
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @legal-office/web build

FROM build AS api-prod
RUN pnpm --filter @legal-office/api deploy --prod /out/api && cp -r apps/api/dist /out/api/dist && cp -r apps/api/drizzle /out/api/drizzle && cp apps/api/docker-entrypoint.sh /out/api/docker-entrypoint.sh

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-prod --chown=node:node /out/api ./
USER node
EXPOSE 3001
CMD ["sh", "docker-entrypoint.sh"]

FROM build AS web-prod
RUN pnpm --filter @legal-office/web deploy --prod /out/web && cp -r apps/web/.next /out/web/.next

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
WORKDIR /app
COPY --from=web-prod --chown=node:node /out/web ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
