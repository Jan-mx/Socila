/**
 * agent-integration 模块端口（CORE-FR-010，步骤02.6）。
 * 只定义端口——实际全国政策上下文（阶段03）与草案物化（阶段06）在后续阶段实现。
 * Agent 只能通过这些受限端口读取上下文 / 导入 draft，不允许直连数据库。
 */

/** Agent 读取已发布政策上下文的受限只读端口（阶段03提供实现）。 */
export interface PolicyContextPort {
  /** 按地区与生效日期读取已发布的规则/参数上下文（含 provenance）。 */
  getEffectiveContext(input: {
    jurisdictionId: string;
    asOfDate: string;
    ruleSetId?: string;
    policyPackId?: string;
  }): Promise<{
    rules: ReadonlyArray<Record<string, unknown>>;
    params: ReadonlyArray<Record<string, unknown>>;
    provenance: ReadonlyArray<Record<string, unknown>>;
  }>;
}

/** Agent 草案物化端口（阶段06提供实现）：仅允许创建 draft，不允许直接修改 published。 */
export interface DraftMaterializationPort {
  materializeDraftBundle(input: {
    proposalId: string;
    bundle: Readonly<Record<string, unknown>>;
    idempotencyKey: string;
    actorId: string;
  }): Promise<{ draftId: string; created: boolean }>;
}
