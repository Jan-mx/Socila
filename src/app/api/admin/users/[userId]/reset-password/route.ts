/**
 * POST /api/admin/users/:userId/reset-password（09-02 §9.3，AUTH-FR-010）。
 *
 * 生成随机临时密码：明文只在 no-store 响应中展示一次（AUTH-AC-015），
 * 24 小时失效；目标用户进入强制改密状态，旧密码与全部刷新会话立即失效。
 * 不可对本人执行（§8.1）。
 */
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { resetUserPassword } from "@/server/modules/identity/application/admin-users.use-case";
import { IdentityError } from "@/server/modules/identity/application/errors";
import { isDatabaseUnavailableError } from "@/lib/api/route-errors";
import { checkWriteRequestContract } from "@/lib/security/same-origin";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const contractViolation = checkWriteRequestContract(req);
  if (contractViolation === "INVALID_INPUT") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if (contractViolation === "FORBIDDEN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const session = await auth();
  const actor = session?.user;
  if (!actor?.userId) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  const { userId } = await params;
  try {
    const result = await resetUserPassword(
      getIdentityDeps(),
      { actorUserId: actor.userId, actorAuthVersion: actor.authVersion ?? 0 },
      userId,
    );
    const response = NextResponse.json({
      temporaryPassword: result.temporaryPassword,
      expiresAt: result.expiresAt.toISOString(),
    });
    // 明文临时密码只展示一次：禁止任何缓存层留存（AUTH-AC-015）
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json({ error: "AUTH_STORE_UNAVAILABLE" }, { status: 503 });
    }
    console.error(
      JSON.stringify({ level: "error", event: "admin.users_reset_error" }),
    );
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
