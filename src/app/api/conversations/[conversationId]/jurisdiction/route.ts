import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActor } from "@/lib/auth/require-actor";
import { mapRouteError } from "@/lib/api/route-errors";
import { conversationReads, conversationWrites } from "@/server/modules/conversation/application";
import {
  confirmConversationJurisdiction,
} from "@/server/modules/conversation/application/jurisdiction-profile.use-case";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

export const dynamic = "force-dynamic";

const ConfirmBodySchema = z.object({
  code: z.string().regex(/^(CN|\d{6})$/, "地区代码必须是 CN 或 6 位行政区划代码"),
  source: z.enum(["selector", "conversation-confirmation"]).optional(),
});

/**
 * POST /api/conversations/:conversationId/jurisdiction（任务3 JRP-FR-015/016/019）：
 * 用户明确选择/确认规划地区后，服务端校验稳定代码并把规范化确认结果写入会话画像。
 * 模型/AI 候选不经过本接口（候选不构成确认，JRP-AC-014）。
 * 切换地区时历史消息保留、旧地区派生状态清除（JRP-FR-019/AC-016）。
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { conversationId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const parsed = ConfirmBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const readRepo = new DrizzleJurisdictionReadRepository();
    const result = await confirmConversationJurisdiction(
      {
        findJurisdiction: async (code) => {
          const row = await readRepo.getByCode(code);
          return row
            ? { code: row.code, name: row.name, level: row.level, enabled: row.enabled }
            : null;
        },
        getConversation: (id) => conversationReads.getConversation(id),
        updateConversation: (id, data) =>
          conversationWrites.updateConversation(id, data),
      },
      conversationId,
      { userId: gate.actor.userId },
      parsed.data.code,
      parsed.data.source ?? "selector",
    );

    if (!result.ok) {
      if (result.reason === "not-found") {
        return NextResponse.json({ error: "会话不存在" }, { status: 404 });
      }
      if (result.reason === "forbidden") {
        return NextResponse.json({ error: "无权限访问该会话" }, { status: 403 });
      }
      if (result.reason === "JURISDICTION_INVALID") {
        return NextResponse.json(
          { error: "JURISDICTION_INVALID" },
          { status: 422 },
        );
      }
      return NextResponse.json({ error: "确认失败" }, { status: 500 });
    }

    return NextResponse.json({ jurisdiction: result.jurisdiction });
  } catch (err) {
    const mapped = mapRouteError(err, {
      operation: "conversation.jurisdiction.confirm",
    });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
