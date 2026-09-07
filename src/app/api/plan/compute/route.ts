import { NextRequest, NextResponse } from "next/server";
import { mapRouteError } from "@/lib/api/route-errors";
import { PlanComputeRequestSchema } from "@/lib/validators/plan-input";
import { requireActor } from "@/lib/auth/require-actor";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
} from "@/lib/security/rate-limit";
import { createJurisdictionComputePlan } from "@/server/modules/planning/application";
import {
  JURISDICTION_ERROR_STATUS,
  JurisdictionContextMismatchError,
  JurisdictionInvalidError,
  JurisdictionRequiredError,
  JurisdictionUnsupportedError,
  PolicyConflictError,
  PolicySnapshotUnavailableError,
  PolicyStoreUnavailableError,
} from "@/server/modules/planning/application/stable-errors";

export const dynamic = "force-dynamic";

const PLAN_RATE_LIMIT = 12;
const PLAN_RATE_WINDOW_MS = 60_000;
const MAX_REQUEST_BYTES = 64 * 1024;

/**
 * POST /api/plan/compute（任务3 JRP-FR-001/003/008）：
 * 唯一规划入口——必填 jurisdiction_code、strict Schema（拒绝规则集/参数包/快照
 * 注入与未知字段），服务端按地区活动快照确定性执行并落库留痕。
 * 稳定错误映射见 JRP §8.4（400/422/409/503）。
 */
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
      // JRP-AC-001：缺少地区代码 → 400 JURISDICTION_REQUIRED；
      // JRP-FR-003/AC-006：未知字段/版本注入 → 400 INVALID_INPUT。
      const missingJurisdiction =
        !body || typeof body !== "object" || !("jurisdiction_code" in body);
      const errorCode = missingJurisdiction ? "JURISDICTION_REQUIRED" : "INVALID_INPUT";
      return respondJson(
        { error: errorCode, details: parsed.error.flatten() },
        { status: missingJurisdiction ? 400 : 400 },
      );
    }

    const { user, jurisdiction_code, as_of_date } = parsed.data;
    const asOfDate = as_of_date ?? new Date().toISOString().slice(0, 10);

    const runPlan = createJurisdictionComputePlan();
    const result = await runPlan({
      user: user as Record<string, unknown>,
      jurisdictionCode: jurisdiction_code,
      asOfDate,
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
    if (err instanceof Error && err.message in JURISDICTION_ERROR_STATUS) {
      // JRP §8.4 稳定错误：响应体只含稳定错误码，不泄露内部细节。
      const status = JURISDICTION_ERROR_STATUS[err.message];
      return respondJson({ error: err.message }, { status });
    }
    if (
      err instanceof JurisdictionRequiredError ||
      err instanceof JurisdictionInvalidError ||
      err instanceof JurisdictionUnsupportedError ||
      err instanceof PolicySnapshotUnavailableError ||
      err instanceof PolicyConflictError ||
      err instanceof JurisdictionContextMismatchError ||
      err instanceof PolicyStoreUnavailableError
    ) {
      return respondJson(
        { error: err.message },
        { status: JURISDICTION_ERROR_STATUS[err.message] ?? 500 },
      );
    }
    const mapped = mapRouteError(err, { operation: "plan.compute" });
    return respondJson(mapped.body, { status: mapped.status });
  }
}
