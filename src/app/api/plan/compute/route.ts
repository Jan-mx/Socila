import { NextRequest, NextResponse } from "next/server";
import { mapRouteError } from "@/lib/api/route-errors";
import { PlanComputeRequestSchema } from "@/lib/validators/plan-input";
import { computePlan } from "@/server/modules/planning/application/compute-plan.use-case";
import { requireActor } from "@/lib/auth/require-actor";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

const PLAN_RATE_LIMIT = 12;
const PLAN_RATE_WINDOW_MS = 60_000;
const MAX_REQUEST_BYTES = 64 * 1024;

export async function POST(req: NextRequest) {
  // 09-02 AUTH-FR-003/006：规划 API 拒绝匿名；新方案只绑定 owner_user_id。
  const gate = await requireActor();
  if (!gate.ok) {
    return gate.response;
  }
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`plan:${clientIp}`, {
    limit: PLAN_RATE_LIMIT,
    windowMs: PLAN_RATE_WINDOW_MS,
  });

  const respondJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    applyRateLimitHeaders(response, rateLimit, PLAN_RATE_LIMIT);
    return response;
  };

  if (!rateLimit.allowed) {
    return respondJson({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
  }

  const contentLengthRaw = req.headers.get("content-length");
  const contentLength = contentLengthRaw ? parseInt(contentLengthRaw, 10) : 0;
  if (!Number.isNaN(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return respondJson(
      { error: `请求体过大，最大 ${MAX_REQUEST_BYTES} 字节` },
      { status: 413 },
    );
  }

  try {
    const body = await req.json();
    const parsed = PlanComputeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return respondJson(
        { error: "输入内容无效", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const {
      user,
      as_of_date,
      rule_set_id = "RS-SHANGHAI-PLAN-V1",
      policy_pack_id = "SHANGHAI_BASE",
    } = parsed.data;

    const asOfDate = as_of_date ?? new Date().toISOString().slice(0, 10);

    const result = await computePlan({
      user: user as Record<string, unknown>,
      asOfDate,
      ruleSetId: rule_set_id,
      policyPackId: policy_pack_id,
      ownerUserId: gate.actor.userId,
    });

    return respondJson({
      plan_id: result.planId,
      plan: result.plan,
      calc: result.calc,
      meta: result.meta,
      needs_agent: result.needsAgent,
      questions: result.questions,
      warnings: result.warnings,
      caveats: result.caveats,
    });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "plan.compute" });
    return respondJson(mapped.body, { status: mapped.status });
  }
}
