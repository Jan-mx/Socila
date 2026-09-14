/**
 * PATCH /api/admin/users/:userId/status（09-02 §9.3，AUTH-FR-008）。
 *
 * 启用/禁用：AUTH-AC-013（authVersion 递增 + 全部刷新会话撤销 + 审计）、
 * AUTH-AC-014（最后 active admin 保护，409 LAST_ADMIN_REQUIRED）。
 * actor 的 role/status/authVersion 经 requireFreshAdmin 在数据库重新校验。
 */
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { updateUserStatus } from "@/server/modules/identity/application/admin-users.use-case";
import { IdentityError } from "@/server/modules/identity/application/errors";
import { isDatabaseUnavailableError } from "@/lib/api/route-errors";
import { AdminStatusPatchSchema } from "@/server/modules/identity/contracts/identity.contracts";
import { checkWriteRequestContract } from "@/lib/security/same-origin";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";

export const dynamic = "force-dynamic";

export async function PATCH(
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  const parsed = AdminStatusPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { userId } = await params;
  try {
    const updated = await updateUserStatus(
      getIdentityDeps(),
      { actorUserId: actor.userId, actorAuthVersion: actor.authVersion ?? 0 },
      userId,
      parsed.data.status,
    );
    return NextResponse.json({
      user: {
        id: updated.id,
        username: updated.username,
        role: updated.role,
        status: updated.status,
        authVersion: updated.authVersion,
      },
    });
  } catch (err) {
    if (err instanceof IdentityError) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    if (isDatabaseUnavailableError(err)) {
      return NextResponse.json({ error: "AUTH_STORE_UNAVAILABLE" }, { status: 503 });
    }
    console.error(
      JSON.stringify({ level: "error", event: "admin.users_status_error" }),
    );
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
