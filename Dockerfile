# PolicyOps Web（Next standalone，REL-FR-001 / 09-03 PMG-FR-030）
# 构建上下文=仓库根：docker build -f Dockerfile -t web:latest .
#
# 镜像加固（PMG-FR-030）：
# - 构建占位配置不使用 Docker ARG/ENV 保存 Secret 名称；
#   占位值只出现在执行 build 的单层命令中，且全部为明确的非真实占位。
# - 最终运行镜像更新可修复 Alpine 系统包、删除运行期用不到的 npm/npx，
#   保留非 root 用户。
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" \
    NEXTAUTH_SECRET="build-placeholder-not-real" \
    AUTH_REFRESH_PEPPER="build-placeholder-not-real" \
    NEXTAUTH_URL="http://localhost:3000" \
    npm run build

FROM node:22-alpine AS runtime
# 更新可修复系统包；删除运行期用不到的 npm/npx/corepack
# （standalone 只依赖 node 本体；node 官方 alpine 镜像的 npm 在 /usr/local/lib/node_modules，
# 不是 apk 包，必须直接删除目录，否则其依赖树会留在最终镜像里）
RUN apk upgrade --no-cache \
    && rm -f /usr/bin/npm /usr/bin/npx /usr/bin/corepack \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npx /usr/local/lib/node_modules/corepack \
    && rm -rf /usr/lib/node_modules/npm /usr/lib/node_modules/npx
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
