/**
 * 审核代理（06.6 + 09-03 SJWT-FR-004）：Next 管理后台 → FastAPI 控制面。
 * 服务身份：每个下游请求前签发新的固定Next身份服务JWT（Authorization Bearer）；
 * X-Service-Name 仅作日志上下文，不再承担鉴权（SJWT-FR-006）。
 * 管理员身份经 NextAuth 会话校验（AGT/DRF 权限边界）。
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getServiceJwt } from "@/lib/security/service-jwt-provider";

const AGENT_BASE = process.env.AGENT_INTERNAL_URL ?? "http://localhost:8100";

/** SJWT-FR-007：每次下游调用签发新令牌（新JTI），只使用current Secret。 */
async function nextTokenHeaders(): Promise<Record<string, string>> {
  const token = await getServiceJwt().signNextToken();
  return { Authorization: `Bearer ${token}`, "X-Service-Name": "next-core" };
}

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // FastAPI 提供 /internal/v1/proposals 列表；Personal Demo 直接透传。
  const resp = await fetch(`${AGENT_BASE}/internal/v1/proposals`, {
    headers: await nextTokenHeaders(),
    cache: "no-store",
  });
  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const resp = await fetch(`${AGENT_BASE}/internal/v1/proposals`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await nextTokenHeaders()) },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}
