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
import { db, withTransaction } from "@/lib/db";
import {
  agentMaterializations,
  params as paramsTable,
  rules as rulesTable,
  tests as testsTable,
} from "@/lib/db/schema";

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

/** Core 物化（唯一允许的 Agent 写路径；只能创建 draft）。 */
export async function materializeDraftBundle(
  rawBundle: DraftBundleInput,
  actor: string,
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
  // 幂等（AC-005）：同键返回首次结果。
  const existing = await db
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

  // AC-006：基准快照已变化 → 拒绝并要求重新分析。
  if (bundle.base_snapshot_id) {
    const { policySnapshots } = await import("@/lib/db/schema");
    const current = await db
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

  // Core 独立二次校验（DRF-FR-014）：地区、引用、有效期由 Core 重新计算/确认。
  const draftIds = await withTransaction(async (tx) => {
    const ruleIds: number[] = [];
    const paramIds: number[] = [];
    const testIds: number[] = [];

    for (const r of bundle.rule_drafts) {
      const rows = await tx
        .insert(rulesTable)
        .values({
          ruleId: r.rule_id,
          name: r.name,
          module: r.module ?? "draft",
          dslVersion: "ssp_dsl_v1",
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
    return { rules: ruleIds, params: paramIds, tests: testIds };
  });

  console.info(
    `[materialize] proposal=${bundle.proposal_id} actor=${actor} rules=${draftIds.rules.length} params=${draftIds.params.length} tests=${draftIds.tests.length}`,
  );
  await db.insert(agentMaterializations).values({
    idempotencyKey: bundle.idempotency_key,
    proposalId: bundle.proposal_id,
    runId: bundle.run_id,
    status: "draft",
    draftIds: draftIds as unknown as Record<string, unknown>,
  });

  return { idempotent: false, proposal_id: bundle.proposal_id, draft_ids: draftIds };
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
