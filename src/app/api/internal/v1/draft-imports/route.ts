/**
 * Route Handler 薄适配层（DRF-FR-013/014 + 09-03 SJWT-FR-005）：
 * Agent → Core 的唯一 draft 导入入口。
 *
 * 服务身份（ADR-0005 服务JWT）：
 * - 解析请求体前验证固定Agent身份Bearer令牌（iss=policy-agent/aud=ssp-next-core/
 *   sub=agent-runtime）；`X-Service-Name` 仅可作结构化日志上下文，不参与允许/拒绝
 *   判断（SJWT-FR-006）；
 * - 鉴权失败（缺失/格式/签名/claims/过期/重放）统一 401 SERVICE_AUTH_INVALID；
 * - 重放存储不可用 → 503 SERVICE_AUTH_STORE_UNAVAILABLE（均 Cache-Control: no-store，
 *   §8.3）；
 * - 日志不含令牌、Authorization Header、Secret或签名片段（§10/NFR-006）。
 */
import { NextRequest, NextResponse } from "next/server";
import {
  MaterializationRejected,
  materializeDraftBundle,
  parseAndReject,
} from "@/server/modules/agent-integration/application/materialize";
import {
  JtiReplayConflictError,
  ServiceAuthStoreUnavailableError,
} from "@/server/modules/agent-integration/infrastructure/drizzle/service-jwt-replay.repository";
import { ServiceAuthInvalidError, extractBearerToken } from "@/lib/security/service-jwt";
import { getServiceJwt } from "@/lib/security/service-jwt-provider";

export const dynamic = "force-dynamic";

function serviceAuthInvalid() {
  // SJWT-FR-009/§8.3：统一错误体，不区分失败原因；no-store防止错误被缓存。
  return NextResponse.json(
    { error: "SERVICE_AUTH_INVALID" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  // SJWT-FR-005：解析请求体前验证固定Agent身份令牌。
  let token: string | null;
  try {
    token = extractBearerToken(req.headers.get("authorization"));
  } catch {
    return serviceAuthInvalid();
  }
  if (!token) {
    // 日志只记稳定类别，不记Header/令牌（§10）。
    console.info(`[service-jwt] deny direction=agent-to-core category=missing-bearer service=${req.headers.get("x-service-name") ?? "-"}`);
    return serviceAuthInvalid();
  }
  let claims;
  try {
    const verification = await getServiceJwt().verifyAgentToken(token);
    claims = verification.claims;
  } catch (err) {
    if (err instanceof ServiceAuthInvalidError) {
      console.info(`[service-jwt] deny direction=agent-to-core category=verification-failed`);
      return serviceAuthInvalid();
    }
    // 配置无效（Secret缺失等）→ 失败关闭（NFR-004），不泄露配置细节。
    console.error(`[service-jwt] config invalid: ${err instanceof Error ? err.message : "unknown"}`);
    return NextResponse.json(
      { error: "SERVICE_AUTH_STORE_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const raw = await req.json();
    const bundle = parseAndReject(raw);
    const result = await materializeDraftBundle(
      bundle,
      `agent-runtime:${bundle.proposal_id}`,
      claims,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    if (err instanceof JtiReplayConflictError) {
      // SJWT-FR-008/AC-012：JTI重放 → 统一401（事务已回滚，无副作用）。
      console.info(`[service-jwt] deny direction=agent-to-core category=jti-replay jti=${err.jti}`);
      return serviceAuthInvalid();
    }
    if (err instanceof ServiceAuthStoreUnavailableError) {
      // AC-014：重放存储不可用 → 503，不执行业务写入。
      console.error(`[service-jwt] store unavailable category=${err.category}`);
      return NextResponse.json(
        { error: "SERVICE_AUTH_STORE_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (err instanceof MaterializationRejected) {
      return NextResponse.json(
        { error: err.reason, detail: err.message },
        { status: err.status },
      );
    }
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
