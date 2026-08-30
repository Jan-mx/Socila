/**
 * 审核决定代理（06.6）：管理员决定 → FastAPI review 端点（含幂等键）。
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

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

  const resp = await fetch(
    `${AGENT_BASE}/internal/v1/proposals/${proposalId}/review`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
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
