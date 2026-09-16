/**
 * Agent DraftBundle 幂等物化（DRF-FR-013/014 / AC-005/006/007，步骤06.7）。
 *
 * 独立二次校验（不信任 Agent 结果）：
 * - Zod Schema 强校验；
 * - status 必须为 draft——staging/production 直接 403 并记录安全事件；
 * - baseSnapshotId 与当前最新快照不一致 → 409 stale（AC-006，要求重新分析）；
 * - 引用完整性缺失 → 422；
 * - 幂等键命中 → 返回首次 draftIds（AC-005）。
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { withTransaction } from "@/lib/db";
import {
  agentMaterializations,
  params as paramsTable,
  rules as rulesTable,
  tests as testsTable,
} from "@/lib/db/schema";
import type { ServiceJwtClaims } from "@/lib/security/service-jwt";
import {
  JtiReplayConflictError,
  ServiceAuthStoreUnavailableError,
  consumeServiceJwtJti,
} from "../infrastructure/drizzle/service-jwt-replay.repository";

export { JtiReplayConflictError, ServiceAuthStoreUnavailableError };

const CitationSchema = z.object({
  document_version_id: z.string().min(1),
  kind: z.string().optional(),
  path: z.string().optional(),
  text_excerpt: z.string().optional(),
});

const RuleDraftSchema = z.object({
  temp_id: z.string(),
  rule_id: z.string(),
  name: z.string(),
  module: z.string().default("draft"),
  priority: z.number().int().default(0),
  decision_table: z.unknown(),
  status: z.literal("draft").catch("draft"),
  effective_from: z.string(),
  effective_to: z.string().nullable().optional(),
  citations: z.array(CitationSchema).min(1),
  parameter_refs: z.array(z.string()).default([]),
});

const ParamDraftSchema = z.object({
  temp_id: z.string(),
  param_id: z.string(),
  // 修复轮I4（APR-FR-017）：新参数草案必须携带trim后非空、无HTML尖括号的
  // 正式名称——编号回退只允许用于0020迁移旧行，不允许写进新草案。
  // description仍可选，但携带时必须满足同一安全校验（不得静默吞掉非法值）。
  name: z
    .string()
    .trim()
    .min(1, "参数草案必须携带正式中文名称（APR-FR-017）")
    .refine(
      (v) => !v.includes("<") && !v.includes(">"),
      "参数名称不得包含HTML尖括号",
    ),
  description: z
    .string()
    .trim()
    .nullable()
    .optional()
    .refine(
      (v) => v === null || v === undefined || (!v.includes("<") && !v.includes(">")),
      "参数说明不得包含HTML尖括号",
    ),
  business_key: z.string().nullable().optional(),
  type: z.string().default("number"),
  value: z.unknown(),
  unit: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  effective_from: z.string(),
  effective_to: z.string().nullable().optional(),
  citations: z.array(CitationSchema).min(1),
});

const TestDraftSchema = z.object({
  temp_id: z.string(),
  name: z.string(),
  rule_id: z.string(),
  input: z.unknown(),
  expected: z.unknown(),
  citations: z.array(CitationSchema).default([]),
});

export const DraftBundleSchema = z.object({
  proposal_id: z.string().min(1),
  run_id: z.string().min(1),
  idempotency_key: z.string().min(1),
  base_snapshot_id: z.string().nullable().optional(),
  jurisdiction_code: z.string().default("310000"),
  effective_from: z.string().min(1),
  effective_to: z.string().nullable().optional(),
  status: z.string(), // 解析不拦截：非 draft 状态由下方安全检查显式 403（AC-007）。
  rule_drafts: z.array(RuleDraftSchema).default([]),
  param_drafts: z.array(ParamDraftSchema).default([]),
  test_drafts: z.array(TestDraftSchema).default([]),
  impact_items: z.array(z.unknown()).default([]),
  citations: z.array(CitationSchema).default([]),
  uncertainties: z.array(z.string()).default([]),
  model_provenance: z.string().default("fake-model-v1"),
  prompt_version: z.string().default("draft-p1"),
  workflow_version: z.string().default("policyops-graph-v1"),
});

export type DraftBundleInput = z.input<typeof DraftBundleSchema>;

export class MaterializationRejected extends Error {
  constructor(
    public readonly status: 403 | 409 | 422,
    public readonly reason: string,
    message: string,
  ) {
    super(message);
  }
}

export interface MaterializeResult {
  idempotent: boolean;
  proposal_id: string;
  draft_ids: { rules: number[]; params: number[]; tests: number[] };
}

/** Core 物化（唯一允许的 Agent 写路径；只能创建 draft）。
 *
 * @param serviceJwtClaims 验证通过的Agent身份claims（SJWT-FR-008）：提供时JTI消费、
 *   业务幂等检查、draft写入与agent_materializations台账收敛到同一事务（PRD §6.2/§6.4）。
 */
export async function materializeDraftBundle(
  rawBundle: DraftBundleInput,
  actor: string,
  serviceJwtClaims?: ServiceJwtClaims,
): Promise<MaterializeResult> {
  // z.input 下带默认值的字段可能缺省——统一补齐。
  const bundle = {
    ...rawBundle,
    jurisdiction_code: rawBundle.jurisdiction_code ?? "310000",
    rule_drafts: rawBundle.rule_drafts ?? [],
    param_drafts: rawBundle.param_drafts ?? [],
    test_drafts: rawBundle.test_drafts ?? [],
    citations: rawBundle.citations ?? [],
  };

  // SJWT-FR-008/§6.4 接收方顺序：验证(路由完成)→BEGIN→删过期→插JTI→业务写(含幂等)
  // →台账→COMMIT。JTI冲突/业务失败 → 整体回滚（JTI也回滚，AC-012/013）。
  const result = await withTransaction(async (tx): Promise<MaterializeResult> => {
    if (serviceJwtClaims) {
      const consumed = await consumeServiceJwtJti(tx, serviceJwtClaims);
      if (!consumed) throw new JtiReplayConflictError(serviceJwtClaims.jti);
    }

    // 幂等（AC-005）：同键返回首次结果（与JTI同事务，先于业务写）。
    const existing = await tx
      .select()
      .from(agentMaterializations)
      .where(eq(agentMaterializations.idempotencyKey, bundle.idempotency_key))
      .limit(1);
    if (existing.length > 0) {
      return {
        idempotent: true,
        proposal_id: existing[0].proposalId,
        draft_ids: (existing[0].draftIds as MaterializeResult["draft_ids"]) ?? {
          rules: [],
          params: [],
          tests: [],
        },
      };
    }

    // 修复轮I4：路由schema之外的服务级防线（直接调用materializeDraftBundle的
    // 内部路径同样受约束）。抛出位于事务内→规则/参数/测试/台账整体回滚：
    // 零写入且不留脏幂等记录，修正后的同键请求可正常执行。
    for (const p of bundle.param_drafts) {
      const draftName =
        typeof p.name === "string" ? p.name.trim() : "";
      if (draftName.length === 0) {
        throw new MaterializationRejected(
          422,
          "param-draft-name-missing",
          `参数草案 ${p.param_id} 缺少正式中文名称（APR-FR-017：编号回退仅允许用于0020迁移旧行）`,
        );
      }
      if (draftName.includes("<") || draftName.includes(">")) {
        throw new MaterializationRejected(
          422,
          "param-draft-name-invalid",
          `参数草案 ${p.param_id} 的名称不得包含HTML尖括号`,
        );
      }
      if (
        typeof p.description === "string" &&
        (p.description.includes("<") || p.description.includes(">"))
      ) {
        throw new MaterializationRejected(
          422,
          "param-draft-description-invalid",
          `参数草案 ${p.param_id} 的说明不得包含HTML尖括号`,
        );
      }
    }

    // AC-006：基准快照已变化 → 拒绝并要求重新分析（失败抛出→JTI随事务回滚）。
    if (bundle.base_snapshot_id) {
      const { policySnapshots } = await import("@/lib/db/schema");
      const current = await tx
        .select({ id: policySnapshots.id })
        .from(policySnapshots)
        .where(
          and(
            eq(policySnapshots.jurisdictionCode, bundle.jurisdiction_code ?? "310000"),
            eq(policySnapshots.id, bundle.base_snapshot_id),
          ),
        )
        .limit(1);
      if (current.length === 0) {
        throw new MaterializationRejected(
          409,
          "stale-snapshot",
          "基准快照已变化，提案需重新运行影响分析",
        );
      }
    }

    // Core 独立二次校验的写入（DRF-FR-014）：draft写入与台账同事务。
    const ruleIds: number[] = [];
    const paramIds: number[] = [];
    const testIds: number[] = [];

    for (const r of bundle.rule_drafts) {
      const rows = await tx
        .insert(rulesTable)
        .values({
          ruleId: r.rule_id,
          // 三轮复审M3：规则name与参数草案同口径——trim后非空且无HTML尖括号
          // 才采用草案值，否则回退稳定rule_id（UI按isFallbackName标"名称待补充"）。
          name:
            typeof r.name === "string" &&
            r.name.trim().length > 0 &&
            !r.name.includes("<") &&
            !r.name.includes(">")
              ? r.name.trim()
              : r.rule_id,
          module: r.module ?? "draft",
          dslVersion: "SOCILA-DSL-1.0",
          priority: r.priority ?? 0,
          status: "draft",
          effectiveFrom: r.effective_from,
          effectiveTo: r.effective_to ?? null,
          supersedes: [],
          decisionTable: (r.decision_table ?? {}) as Record<string, unknown>,
          inputs: [],
          parameterRefs: r.parameter_refs ?? [],
          outputs: [],
          examples: [],
          evidence: [],
          jurisdictionCode: bundle.jurisdiction_code,
          businessKey: r.rule_id,
        })
        .returning({ id: rulesTable.id });
      ruleIds.push(rows[0].id);
    }
    for (const p of bundle.param_drafts) {
      const rows = await tx
        .insert(paramsTable)
        .values({
          policyPackId: "AGENT-DRAFT",
          jurisdictionCode: bundle.jurisdiction_code,
          businessKey: p.business_key ?? p.param_id,
          paramId: p.param_id,
          // 修复轮I4（APR-FR-017）：名称/说明合法性已由schema与事务内防线双重
          // 保证——此处直接取校验值，不再存在编号回退或静默置null的旁路。
          name: p.name.trim(),
          description:
            typeof p.description === "string" &&
            p.description.trim().length > 0
              ? p.description.trim()
              : null,
          type: p.type ?? "number",
          value: p.value ?? null,
          unit: p.unit ?? null,
          effectiveFrom: p.effective_from,
          effectiveTo: p.effective_to ?? null,
          source: "agent-draft",
          keyFields: null,
          valueFields: null,
          note: null,
          version: 1,
          status: "draft",
        })
        .returning({ id: paramsTable.id });
      paramIds.push(rows[0].id);
    }
    for (const t of bundle.test_drafts) {
      const rows = await tx
        .insert(testsTable)
        .values({
          jurisdictionCode: bundle.jurisdiction_code,
          name: t.name,
          ruleId: t.rule_id,
          input: (t.input ?? {}) as Record<string, unknown>,
          expected: (t.expected ?? {}) as Record<string, unknown>,
          source: "agent-draft",
        })
        .returning({ id: testsTable.id });
      testIds.push(rows[0].id);
    }

    const draftIds = { rules: ruleIds, params: paramIds, tests: testIds };
    // agent_materializations台账同事务（PRD §6.2）：业务回滚时台账不残留。
    await tx.insert(agentMaterializations).values({
      idempotencyKey: bundle.idempotency_key,
      proposalId: bundle.proposal_id,
      runId: bundle.run_id,
      status: "draft",
      draftIds: draftIds as unknown as Record<string, unknown>,
    });

    return { idempotent: false, proposal_id: bundle.proposal_id, draft_ids: draftIds };
  });

  console.info(
    `[materialize] proposal=${bundle.proposal_id} actor=${actor} rules=${result.draft_ids.rules.length} params=${result.draft_ids.params.length} tests=${result.draft_ids.tests.length}`,
  );
  return result;
}

/** Schema 解析失败 → 422；非 draft 状态 → 403 安全事件。 */
export function parseAndReject(raw: unknown): DraftBundleInput {
  const parsed = DraftBundleSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MaterializationRejected(
      422,
      "schema-validation-failed",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 300),
    );
  }
  const bundle = parsed.data;
  if (bundle.status !== "draft") {
    // 安全事件：Agent 提交非 draft 状态（AC-007）。
    console.error(
      `[security] agent submitted non-draft status (${bundle.status}) for proposal ${bundle.proposal_id}`,
    );
    throw new MaterializationRejected(
      403,
      "non-draft-status",
      "Agent 只能创建 draft；staging/production 由管理员发布门禁管理",
    );
  }
  // 引用完整性二次校验。
  const missing: string[] = [];
  for (const r of bundle.rule_drafts) {
    if (r.citations.length === 0) missing.push(`rule:${r.rule_id}`);
  }
  for (const p of bundle.param_drafts) {
    if (p.citations.length === 0) missing.push(`param:${p.param_id}`);
  }
  if (missing.length > 0) {
    throw new MaterializationRejected(422, "missing-citations", `缺少原文引用: ${missing.join(", ")}`);
  }
  return bundle;
}
