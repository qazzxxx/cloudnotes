# syntax=docker/dockerfile:1.7

############################
# 1. Base — Node + pnpm
############################
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate
WORKDIR /app

############################
# 2. deps — install all (for building)
#    使用 hoisted 链接器，确保跨阶段 COPY node_modules 时不丢失符号链接
############################
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN pnpm install --no-frozen-lockfile --config.node-linker=hoisted

############################
# 3. build — compile server + web
############################
FROM deps AS build
COPY tsconfig.base.json ./
COPY server/ ./server/
COPY web/ ./web/
RUN pnpm --filter @cloudnote/web build \
 && pnpm --filter @cloudnote/server build

############################
# 4. prod-deps — 仅 server 运行时依赖
############################
FROM base AS prod-deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN pnpm install --prod --no-frozen-lockfile --config.node-linker=hoisted

############################
# 5. runtime — 极简最终镜像
############################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3130 \
    ROOT_SPACE=/data/notes \
    WEB_DIST_DIR=/app/web/dist
WORKDIR /app

# 运行时依赖（扁平化的 node_modules）
COPY --from=prod-deps /app/node_modules ./node_modules
# server 构建产物 + package.json（CommonJS 运行）
COPY --from=build /app/server/dist ./server/dist
COPY server/package.json ./server/
# web 构建产物（由 Express 静态托管）
COPY --from=build /app/web/dist ./web/dist

# 笔记根目录挂载点（100% 数据主权 —— 文件就躺在宿主机上）
RUN mkdir -p /data/notes
VOLUME /data/notes

EXPOSE 3130
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3130/api/health || exit 1

CMD ["node", "server/dist/index.js"]
