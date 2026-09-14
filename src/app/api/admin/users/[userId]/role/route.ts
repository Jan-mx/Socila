/**
 * PATCH /api/admin/users/:userId/role（09-02 §9.3，AUTH-FR-009）。
 *
 * 在 user/admin 固定双角色间变更其他 active 账号；不可自我变更；
 * 降级最后一个 active admin 返回 409 LAST_ADMIN_REQUIRED。
 */
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { updateUserRole } from "@/server/modules/identity/application/admin-users.use-case";
import { IdentityError } from "@/server/modules/identity/application/errors";
import { isDatabaseUnavailableError } from "@/lib/api/route-errors";
import { AdminRolePatchSchema } from "@/server/modules/identity/contracts/identity.contracts";
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
  const parsed = AdminRolePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { userId } = await params;
  try {
    const updated = await updateUserRole(
      getIdentityDeps(),
      { actorUserId: actor.userId, actorAuthVersion: actor.authVersion ?? 0 },
      userId,
      parsed.data.role,
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
      JSON.stringify({ level: "error", event: "admin.users_role_error" }),
    );
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
