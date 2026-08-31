# PolicyOps Web（Next standalone，REL-FR-001）
# 构建上下文=仓库根：docker build -f Dockerfile -t web:latest .
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# 构建期占位凭据（运行时由环境注入真实值；构建期不访问数据库）
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder \
    NEXTAUTH_SECRET=build-placeholder \
    NEXTAUTH_URL=http://localhost:3000
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
