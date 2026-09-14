/**
 * publishing 模块用例端口（CORE-FR-005/010，步骤02.6）。
 * 状态机门禁（promote/rollback，promoteEntity/rollbackEntity）在 02.7 协议适配时
 * 经本端口接入；发布状态转换只允许经由 publishing 模块，页面/Agent 不得直接改 status。
 */
import type { PublishRow, PublishReadRepository } from "./ports";
import type { PublishWriteRepository } from "./write-ports";

export interface PublishingUseCase {
  /** 记录一次发布事件（审计留痕；actor 必填——发布操作必须可归因）。 */
  recordPublish(input: {
    entityType: string;
    entityId: string;
    fromStage: string;
    toStage: string;
    actor: string;
    reason?: string | null;
    gateResults?: unknown;
    diff?: unknown;
  }): Promise<PublishRow>;
  /** 最近发布历史。 */
  listHistory(limit?: number): Promise<PublishRow[]>;
}

export function createPublishingUseCase(deps: {
  write: PublishWriteRepository;
  read: PublishReadRepository;
}): PublishingUseCase {
  return {
    async recordPublish(input) {
      return deps.write.insertPublish({
        entityType: input.entityType,
        entityId: input.entityId,
        fromStage: input.fromStage,
        toStage: input.toStage,
        actor: input.actor,
        reason: input.reason ?? null,
        gateResults: input.gateResults ?? null,
        diff: input.diff ?? null,
      });
    },
    async listHistory(limit?: number) {
      return deps.read.listPublishes(limit);
    },
  };
}
