/**
 * Route Handler 认证辅助（09-02，AUTH-FR-003/005）。
 *
 * Route Handler 只负责认证、解析、用例调用与响应映射（§7.1）；
 * 这里把 NextAuth Session 规整为 AuthenticatedActor 或直接返回 401/503 响应。
 */
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { AuthenticatedActor } from "@/server/modules/identity/domain/access";

export type RequireActorResult =
  | { ok: true; actor: AuthenticatedActor }
  | { ok: false; response: NextResponse };

export async function requireActor(): Promise<RequireActorResult> {
  const session = await auth();

  if (session?.storeUnavailable) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "AUTH_STORE_UNAVAILABLE" },
        { status: 503 },
      ),
    };
  }

  const user = session?.user;
  if (
    !user ||
    typeof user.userId !== "string" ||
    typeof user.username !== "string" ||
    (user.role !== "user" && user.role !== "admin") ||
    typeof user.authVersion !== "number"
  ) {
    return {
      ok: false,
      response: NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 }),
    };
  }

  return {
    ok: true,
    actor: {
      userId: user.userId,
      username: user.username,
      role: user.role,
      authVersion: user.authVersion,
      mustChangePassword: user.mustChangePassword === true,
    },
  };
}
