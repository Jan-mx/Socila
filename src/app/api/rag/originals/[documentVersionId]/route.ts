/**
 * GET /api/rag/originals/[documentVersionId]
 *
 * 登录态政策原件下载代理（SHV2-FR-031/NFR-009，WI-20260913-01任务4）：
 * - 必须已登录（匿名一律401）；
 * - 经新签发的Next→Agent服务JWT代理Agent /internal/v1/rag/documents/{id}/original；
 * - Agent端已复核对象SHA；本路由只转发字节流，绝不暴露MinIO地址/凭据/预签名URL；
 * - 附件安全头：Content-Disposition: attachment、X-Content-Type-Options: nosniff、
 *   Cache-Control: private, no-store。
 */
import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/auth/require-actor";
import { getServiceJwt } from "@/lib/security/service-jwt-provider";
import { createRequestLogger } from "@/lib/logging";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ documentVersionId: string }> },
) {
  const logger = createRequestLogger();

  // SHV2-FR-031：Web下载要求已登录用户（匿名拒绝）。
  const gate = await requireActor();
  if (!gate.ok) {
    return gate.response;
  }

  const { documentVersionId } = await params;
  // 版本ID为uuid：非法格式400且不发起Agent调用（防路径注入）。
  if (!UUID_PATTERN.test(documentVersionId)) {
    return NextResponse.json({ error: "INVALID_DOCUMENT_VERSION_ID" }, { status: 400 });
  }

  const base = (process.env.AGENT_INTERNAL_URL ?? "http://127.0.0.1:8100").replace(/\/+$/, "");
  try {
    // 每次代理新签发短期服务JWT（TTL 300秒；HS256；固定Next身份）。
    const token = await getServiceJwt().signNextToken();
    const agentResponse = await fetch(
      `${base}/internal/v1/rag/documents/${documentVersionId}/original`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (agentResponse.status === 404) {
      return NextResponse.json({ error: "DOCUMENT_NOT_FOUND" }, { status: 404 });
    }
    if (!agentResponse.ok || !agentResponse.body) {
      logger.warn("rag.original.agent_error", { status: agentResponse.status });
      return NextResponse.json({ error: "ORIGINAL_FETCH_FAILED" }, { status: 502 });
    }
    return new NextResponse(agentResponse.body, {
      status: 200,
      headers: {
        "Content-Type": agentResponse.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="original-${documentVersionId}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.warn("rag.original.proxy_error", {
      error_message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "ORIGINAL_FETCH_FAILED" }, { status: 502 });
  }
}
