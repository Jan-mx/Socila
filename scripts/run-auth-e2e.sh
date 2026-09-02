#!/usr/bin/env bash
# 09-02 Chromium E2E 验收脚本（AUTH-US-001～005）。
#
# 前提：
# 1. 全新 PostgreSQL 17 验收库已执行：core migration、Jan 管理员引导、seed；
# 2. `npm run build` 已产出生产构建；
# 3. Playwright Chromium 已安装（npx playwright install chromium）。
#
# 变量为本地验收专用一次性值，不属于生产 Secret：
# - SSRP_E2E_DATABASE_URL       验收库连接串（默认指向本地一次性容器；
#   容器需以对应 POSTGRES_PASSWORD 创建：docker run -d --name socila-pg-auth-acceptance #     -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=auth_acceptance -p 5434:5432 postgres:17-alpine）
# - SSRP_E2E_PORT / MOCK_PORT   本地端口
# - SSRP_E2E_ADMIN_PASSWORD     Jan 引导口令（与引导脚本的 ADMIN_PASSWORD_HASH 对应）
# - SSRP_E2E_NEXTAUTH_SECRET / SSRP_E2E_REFRESH_PEPPER（两者必须不同，§12.2）
set -euo pipefail
cd "$(dirname "$0")/.."

export SSRP_E2E_DATABASE_URL="${SSRP_E2E_DATABASE_URL:-postgresql://postgres:postgres@localhost:5434/auth_acceptance}"
export SSRP_E2E_PORT="${SSRP_E2E_PORT:-3100}"
export SSRP_E2E_MOCK_PORT="${SSRP_E2E_MOCK_PORT:-8787}"
export SSRP_E2E_ADMIN_USERNAME="${SSRP_E2E_ADMIN_USERNAME:-Jan}"
export SSRP_E2E_ADMIN_PASSWORD_HASH="${SSRP_E2E_ADMIN_PASSWORD_HASH:-$(node -e "require('bcryptjs').hash(process.argv[1],12).then(h=>console.log(h))" "${SSRP_E2E_ADMIN_PASSWORD:-Acceptance-Temp-9137}")}"
export SSRP_E2E_NEXTAUTH_SECRET="${SSRP_E2E_NEXTAUTH_SECRET:-e2e-nextauth-secret-value-1}"
export SSRP_E2E_REFRESH_PEPPER="${SSRP_E2E_REFRESH_PEPPER:-e2e-refresh-pepper-value-2}"

npx playwright test "$@"
