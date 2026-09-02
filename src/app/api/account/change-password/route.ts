/**
 * POST /api/account/change-password（09-02 §9.2，AUTH-FR-007，AUTH-AC-016）。
 *
 * 需要已登录会话；成功 204：递增 authVersion、撤销全部刷新会话并清除当前
 * Cookie（客户端随后跳转登录页重新登录）。强制改密会话同样可用本接口。
 */
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { checkWriteRequestContract } from "@/lib/security/same-origin";
import { ChangePasswordRequestSchema } from "@/server/modules/identity/contracts/identity.contracts";
import { changeOwnPassword } from "@/server/modules/identity/application/change-password.use-case";
import { IdentityError } from "@/server/modules/identity/application/errors";
import { isDatabaseUnavailableError } from "@/lib/api/route-errors";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const parsed = ChangePasswordRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    await changeOwnPassword(getIdentityDeps(), {
      actorUserId: userId,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    const response = new NextResponse(null, { status: 204 });
    clearAuthSessionCookies(response);
    return response;
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json({ error: "AUTH_STORE_UNAVAILABLE" }, { status: 503 });
    }
    console.error(
      JSON.stringify({ level: "error", event: "auth.change_password_error" }),
    );
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/** NextAuth v5 默认 Cookie 名（HTTP/HTTPS 两种形态一并清除）。 */
function clearAuthSessionCookies(response: NextResponse): void {
  const expired = (name: string) =>
    `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  response.headers.append("set-cookie", expired("authjs.session-token"));
  response.headers.append(
    "set-cookie",
    expired("__Secure-authjs.session-token"),
  );
  response.headers.append("set-cookie", expired("authjs.csrf-token"));
  response.headers.append("set-cookie", expired("__Host-authjs.csrf-token"));
}
