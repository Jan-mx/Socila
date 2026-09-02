/**
 * POST /api/auth/register（09-02 §9.2，AUTH-FR-001，AUTH-AC-002/003）。
 *
 * 公开注册：角色固定 user；请求契约严格（出现 role/status 等未登记字段 400）；
 * 限流 5次/IP/小时（AUTH-NFR-003）；同源 Origin 校验（AUTH-NFR-004）。
 * 成功 201，不自动登录——界面跳转 /login?registered=1。
 */
import { NextRequest, NextResponse } from "next/server";

import { applyRateLimitHeaders, checkRateLimit, clientIpFromRequest } from "@/lib/security/rate-limit";
import { checkWriteRequestContract } from "@/lib/security/same-origin";
import { RegisterRequestSchema } from "@/server/modules/identity/contracts/identity.contracts";
import { IdentityError } from "@/server/modules/identity/application/errors";
import { registerUser } from "@/server/modules/identity/application/register.use-case";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";

export const dynamic = "force-dynamic";

const REGISTER_RATE_LIMIT = 5;
const REGISTER_RATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const clientIp = clientIpFromRequest(req);
  const rateLimit = checkRateLimit(`auth:register:${clientIp}`, {
    limit: REGISTER_RATE_LIMIT,
    windowMs: REGISTER_RATE_WINDOW_MS,
  });

  const respondJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    applyRateLimitHeaders(response, rateLimit, REGISTER_RATE_LIMIT);
    return response;
  };

  if (!rateLimit.allowed) {
    return respondJson({ error: "RATE_LIMITED" }, { status: 429 });
  }

  const contractViolation = checkWriteRequestContract(req);
  if (contractViolation === "INVALID_INPUT") {
    return respondJson({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if (contractViolation === "FORBIDDEN") {
    return respondJson({ error: "FORBIDDEN" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return respondJson({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const parsed = RegisterRequestSchema.safeParse(body);
  if (!parsed.success) {
    return respondJson({ error: "INVALID_INPUT" }, { status: 400 });
  }

  try {
    const user = await registerUser(getIdentityDeps(), {
      username: parsed.data.username,
      password: parsed.data.password,
    });
    return respondJson(
      {
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof IdentityError) {
      return respondJson({ error: err.code }, { status: err.status });
    }
    console.error(
      JSON.stringify({ level: "error", event: "auth.register_error" }),
    );
    return respondJson({ error: "服务器内部错误" }, { status: 500 });
  }
}
