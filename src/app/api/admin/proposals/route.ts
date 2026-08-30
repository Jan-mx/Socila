/**
 * 审核代理（06.6）：Next 管理后台 → FastAPI 控制面。
 * 服务身份：内网 + X-Service-Name（ADR-0005 服务 JWT 于阶段07接入）。
 * 管理员身份经 NextAuth 会话校验（AGT/DRF 权限边界）。
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const AGENT_BASE = process.env.AGENT_INTERNAL_URL ?? "http://localhost:8100";

export async function GET() {
  const session = await auth();
  if (!session || (session.user as { role?: string })?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // FastAPI 提供 /internal/v1/proposals 列表；Personal Demo 直接透传。
  const resp = await fetch(`${AGENT_BASE}/internal/v1/proposals`, {
    headers: { "X-Service-Name": "next-core" },
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
    headers: { "content-type": "application/json", "X-Service-Name": "next-core" },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return NextResponse.json(data, { status: resp.status });
}
