/**
 * POST /api/auth/logout（09-02 AUTH-NFR-005）。
 *
 * 撤销调用者本人的当前刷新会话并写审计；Cookie 清理由客户端随后调用
 * NextAuth signout 端点完成（框架处理 CSRF 与 Cookie 删除）。
 */
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { revokeCurrentRefreshSession } from "@/server/modules/identity/application/logout.use-case";
import { isDatabaseUnavailableError } from "@/lib/api/route-errors";
import { checkWriteRequestContract } from "@/lib/security/same-origin";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";
import { readRefreshSessionIdFromCookies } from "@/lib/auth/session-cookie";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const contractViolation = checkWriteRequestContract(req);
  if (contractViolation === "INVALID_INPUT") {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if (contractViolation === "FORBIDDEN") {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const session = await auth();
  const userId = session?.user?.userId;
  if (!session?.user || !userId) {
    return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
  }

  try {
    await revokeCurrentRefreshSession(getIdentityDeps(), {
      userId,
      refreshSessionId: await readRefreshSessionIdFromCookies(req),
    });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json({ error: "AUTH_STORE_UNAVAILABLE" }, { status: 503 });
    }
    console.error(
      JSON.stringify({ level: "error", event: "auth.logout_error" }),
    );
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
