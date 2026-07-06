# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable
ARG NPM_REGISTRY=https://registry.npmmirror.com/
RUN pnpm config set registry "$NPM_REGISTRY" \
  && pnpm config set store-dir /pnpm/store \
  && pnpm config set fetch-retries 5 \
  && pnpm config set fetch-retry-factor 2 \
  && pnpm config set fetch-retry-mintimeout 10000 \
  && pnpm config set fetch-retry-maxtimeout 120000 \
  && pnpm config set fetch-timeout 600000

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN --mount=type=cache,id=api-starter-kit-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS backend-build
COPY . .
RUN pnpm --filter @api-starter-kit/backend exec node ace build --package-manager=pnpm

FROM base AS backend
ENV NODE_ENV=production
COPY --from=backend-build /app/apps/backend/build /app
WORKDIR /app
RUN --mount=type=cache,id=api-starter-kit-pnpm-store,target=/pnpm/store \
  pnpm install --prod --ignore-scripts
EXPOSE 13333
CMD ["node", "docker-entrypoint.js"]

FROM deps AS frontend-build
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
COPY . .
RUN pnpm --filter frontend build

FROM nginx:1.29-alpine AS frontend
COPY --from=frontend-build /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 18080
CMD ["nginx", "-g", "daemon off;"]
