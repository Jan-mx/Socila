import { conversationReads, conversationWrites } from "@/server/modules/conversation/application";
import { requireActor } from "@/lib/auth/require-actor";
import { mapRouteError } from "@/lib/api/route-errors";
import { createOwnedConversation } from "@/server/modules/conversation/application/create-conversation.use-case";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/conversations：认证用户列出本人会话（owner_user_id 过滤，09-02 AUTH-FR-005/006）。 */
export async function GET() {
  const gate = await requireActor();
  if (!gate.ok) {
    return gate.response;
  }

  try {
    const rows = await conversationReads.listConversations();
    const own = rows.filter((c) => c.ownerUserId === gate.actor.userId);
    return NextResponse.json({ conversations: own });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "conversation.list" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}

/**
 * POST /api/conversations（任务3 JRP-FR-021/JRP-AC-001）：
 * 认证受控会话预创建入口。新会话必须先经本接口持久创建，获得服务端生成的
 * 真实会话 ID 后，地区选择器才可对该会话写入确认——杜绝新会话 404 竞态。
 * 匿名请求 401；创建失败 500 且零写入。
 */
export async function POST(): Promise<NextResponse> {
  const gate = await requireActor();
  if (!gate.ok) {
    return gate.response;
  }

  try {
    const result = await createOwnedConversation(
      { write: conversationWrites },
      { userId: gate.actor.userId },
    );
    if (!result.ok) {
      if (result.reason === "auth-required") {
        return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
      }
      return NextResponse.json({ error: "会话创建失败" }, { status: 500 });
    }
    return NextResponse.json({ conversation: result.conversation }, { status: 201 });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "conversation.create" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
