import { NextRequest, NextResponse } from "next/server";
import { getPlan } from "@/lib/db/queries";
import { readAnonymousSession } from "@/lib/security/anon-session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const plan = await getPlan(id);

    if (!plan) {
      return NextResponse.json({ error: "未找到规划方案" }, { status: 404 });
    }

    // 归属校验：方案带 session 标记时，只有创建它的会话能读取（旧数据 sessionId 为
    // null 不限制）。用 404 而非 403，避免泄露"该 id 存在"。
    if (plan.sessionId && plan.sessionId !== readAnonymousSession(req)) {
      return NextResponse.json({ error: "未找到规划方案" }, { status: 404 });
    }

    // 不把归属会话 token 回显到响应体里。
    const safePlan: Record<string, unknown> = { ...plan };
    delete safePlan.sessionId;
    return NextResponse.json({ plan: safePlan });
  } catch {
    return NextResponse.json(
      { error: "加载规划方案失败" },
      { status: 500 },
    );
  }
}
