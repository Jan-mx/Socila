/**
 * GET /api/admin/users（09-02 §9.3，AUTH-FR-008，管理员用户查询）。
 *
 * 查询参数：q（规范化用户名包含匹配）、role、status、cursor、limit
 * （默认25、上限100，(created_at,id) 游标分页）。响应不包含 passwordHash。
 * 权限：proxy 已拒绝非 admin；此处再经 requireFreshAdmin 数据库回读校验。
 */
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { listUsersForAdmin } from "@/server/modules/identity/application/admin-users.use-case";
import { IdentityError } from "@/server/modules/identity/application/errors";
import { isDatabaseUnavailableError } from "@/lib/api/route-errors";
import { AdminUserListQuerySchema } from "@/server/modules/identity/contracts/identity.contracts";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  const user = session?.user;
  if (!user?.userId) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const query: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    if (value !== "") query[key] = value;
  });
  const parsed = AdminUserListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const page = await listUsersForAdmin(
      getIdentityDeps(),
      { actorUserId: user.userId, actorAuthVersion: user.authVersion ?? 0 },
      parsed.data,
    );
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json({ error: "AUTH_STORE_UNAVAILABLE" }, { status: 503 });
    }
    console.error(
      JSON.stringify({ level: "error", event: "admin.users_list_error" }),
    );
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
