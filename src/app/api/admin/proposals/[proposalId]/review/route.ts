/**
 * 审核决定代理（06.6 + 09-03 SJWT-FR-004）：管理员决定 → FastAPI review 端点（含幂等键）。
 * 服务身份：下游请求前签发新的固定Next身份服务JWT（Authorization Bearer）；
 * X-Service-Name 仅作日志上下文，不再承担鉴权（SJWT-FR-006）。
 * 网络重试由调用方复用 Idempotency-Key，Agent侧JTI重放保护独立生效（§11）。
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getServiceJwt } from "@/lib/security/service-jwt-provider";

const AGENT_BASE = process.env.AGENT_INTERNAL_URL ?? "http://localhost:8100";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { proposalId } = await params;
  const body = await req.json();
  const idempotencyKey = req.headers.get("idempotency-key") ?? `review-${proposalId}-${Date.now()}`;
  // SJWT-FR-007：每次下游调用签发新令牌（新JTI），只使用current Secret。
  const token = await getServiceJwt().signNextToken();

  const resp = await fetch(
    `${AGENT_BASE}/internal/v1/proposals/${proposalId}/review`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Service-Name": "next-core",
        "Idempotency-Key": idempotencyKey,
        "X-Admin-Actor": (session.user as { email?: string })?.email ?? "admin",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}
