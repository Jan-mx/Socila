import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  date,
  uuid,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ─── Rules ──────────────────────────────────────────────────────────────────

export const rules = pgTable("rules", {
  id: serial("id").primaryKey(),
  ruleId: text("rule_id").notNull(),
  jurisdictionCode: text("jurisdiction_code"),
  businessKey: text("business_key"),
  name: text("name").notNull(),
  module: text("module").notNull(),
  dslVersion: text("dsl_version").notNull(),
  priority: integer("priority").notNull().default(0),
  status: text("status").notNull().default("draft"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  supersedes: jsonb("supersedes").default([]),
  inputs: jsonb("inputs").default([]),
  parameterRefs: jsonb("parameter_refs").default([]),
  decisionTable: jsonb("decision_table").notNull(),
  outputs: jsonb("outputs").default([]),
  examples: jsonb("examples").default([]),
  evidence: jsonb("evidence").default([]),
  notes: text("notes"),
  version: integer("version").notNull().default(1),
  // 显式overlay操作（NRP-FR-007）：CN只能baseline，地区不能baseline；
  // replace/restrict/exempt必须携带target_business_key（CHECK约束见migration 0012）。
  operation: text("operation").notNull().default("add"),
  targetBusinessKey: text("target_business_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Params ─────────────────────────────────────────────────────────────────

export const params = pgTable("params", {
  id: serial("id").primaryKey(),
  policyPackId: text("policy_pack_id").notNull(),
  jurisdictionCode: text("jurisdiction_code"),
  businessKey: text("business_key"),
  paramId: text("param_id").notNull(),
  type: text("type").notNull(),
  value: jsonb("value"),
  unit: text("unit"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  source: text("source"),
  keyFields: jsonb("key_fields"),
  valueFields: jsonb("value_fields"),
  rows: jsonb("rows"),
  note: text("note"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  // 显式overlay操作（NRP-FR-007），约束同rules（migration 0012）。
  operation: text("operation").notNull().default("add"),
  targetBusinessKey: text("target_business_key"),
  // 参数证据（NRP-FR-020，migration 0013）：document_id/artifact/
  // content_sha256/locator/excerpt等结构化引用。
  evidence: jsonb("evidence"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Policy Pack Versions ───────────────────────────────────────────────────

export const policyPackVersions = pgTable("policy_pack_versions", {
  id: serial("id").primaryKey(),
  policyPackId: text("policy_pack_id").notNull(),
  jurisdictionCode: text("jurisdiction_code"),
  packKind: text("pack_kind"),
  version: integer("version").notNull(),
  paramSnapshot: jsonb("param_snapshot"),
  status: text("status").notNull().default("draft"),
  effectiveFrom: date("effective_from").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Rule Sets ──────────────────────────────────────────────────────────────

export const ruleSets = pgTable("rule_sets", {
  id: serial("id").primaryKey(),
  ruleSetId: text("rule_set_id").notNull(),
  jurisdictionCode: text("jurisdiction_code"),
  description: text("description"),
  status: text("status").notNull().default("draft"),
  effectiveFrom: date("effective_from").notNull(),
  rules: jsonb("rules").notNull(),
  conflictResolution: jsonb("conflict_resolution"),
  version: integer("version").notNull().default(1),
  // 显式overlay操作（NRP-FR-007），约束同rules（migration 0012）。
  operation: text("operation").notNull().default("add"),
  targetBusinessKey: text("target_business_key"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Workflows ──────────────────────────────────────────────────────────────

export const workflows = pgTable("workflows", {
  id: serial("id").primaryKey(),
  workflowId: text("workflow_id").notNull(),
  name: text("name").notNull(),
  versionStr: text("version_str"),
  stages: jsonb("stages").notNull(),
  rollbackPolicy: jsonb("rollback_policy"),
  canary: jsonb("canary"),
  auditConfig: jsonb("audit_config"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Publishes ──────────────────────────────────────────────────────────────

export const publishes = pgTable("publishes", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  fromStage: text("from_stage").notNull(),
  toStage: text("to_stage").notNull(),
  actor: text("actor").notNull(),
  reason: text("reason"),
  gateResults: jsonb("gate_results"),
  diff: jsonb("diff"),
  // 地区身份（NRP-FR-021，migration 0013）：历史记录允许为空，新记录必须完整。
  jurisdictionCode: text("jurisdiction_code"),
  entityVersion: integer("entity_version"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Policy Import Batches（09-05 阶段E，NRP-FR-019）────────────────────────
// 受控物化批次审计：不含连接串、口令或完整URL（NRP-NFR-009）。

export const policyImportBatches = pgTable("policy_import_batches", {
  id: serial("id").primaryKey(),
  jurisdictionCode: text("jurisdiction_code").notNull(),
  manifestHash: text("manifest_hash").notNull(),
  sourceCommit: text("source_commit").notNull(),
  targetFingerprint: text("target_fingerprint").notNull(),
  status: text("status").notNull().default("prepared"),
  readiness: text("readiness").notNull(),
  blockingReasons: jsonb("blocking_reasons").notNull().default([]),
  entityCounts: jsonb("entity_counts").notNull().default({}),
  actor: text("actor").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const policyImportBatchMembers = pgTable("policy_import_batch_members", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id")
    .notNull()
    .references(() => policyImportBatches.id),
  entityType: text("entity_type").notNull(),
  entityRowId: integer("entity_row_id").notNull(),
  businessKey: text("business_key").notNull(),
  version: integer("version").notNull(),
  contentHash: text("content_hash").notNull(),
});

// ─── Plans ──────────────────────────────────────────────────────────────────

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userInput: jsonb("user_input").notNull(),
  calcResult: jsonb("calc_result"),
  planOutput: jsonb("plan_output"),
  trace: jsonb("trace"),
  ruleSetVersion: text("rule_set_version"),
  policyPackVersion: text("policy_pack_version"),
  conclusionLevel: text("conclusion_level"),
  asOfDate: date("as_of_date"),
  // 地区感知规划留痕（任务3 JRP-FR-009）：每次规划保存地区、继承链、活动快照与日期；
  // 历史 plan 无值保持 NULL，创建后不随活动快照切换变化。
  jurisdictionCode: text("jurisdiction_code"),
  resolvedJurisdictionPath: text("resolved_jurisdiction_path"),
  snapshotId: uuid("snapshot_id").references(() => policySnapshots.id),
  // 归属会话：保存时记录创建者的匿名 session，读取时据此校验归属（旧数据为 null = 不限制）。
  sessionId: text("session_id"),
  // 归属用户（CORE-FR-009）：认证用户出现后写入，优先于 sessionId 参与归属校验。
  ownerUserId: text("owner_user_id"),
  // 历史重放 hash（JRP-FR-014/028，migration 0017）：plan 保存执行时快照内容哈希，
  // 重放时按 snapshotId+hash+asOfDate 恢复并报告漂移。
  snapshotContentHash: text("snapshot_content_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Conversations ─────────────────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: text("session_id"),
  // 归属用户（CORE-FR-009）：认证用户出现后写入，优先于 sessionId 参与归属校验。
  ownerUserId: text("owner_user_id"),
  messages: jsonb("messages").notNull().default([]),
  userProfile: jsonb("user_profile").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Jurisdictions（阶段03 地区树，POL-FR-001）──────────────────────────────

export const jurisdictions = pgTable("jurisdictions", {
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  level: text("level").notNull(),
  parentCode: text("parent_code"),
  path: text("path").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Policy Conflicts & Snapshots（阶段03，POL-FR-008～010）─────────────────

export const policyConflicts = pgTable("policy_conflicts", {
  id: serial("id").primaryKey(),
  jurisdictionCode: text("jurisdiction_code").notNull(),
  businessKey: text("business_key").notNull(),
  kind: text("kind").notNull(),
  memberVersions: jsonb("member_versions").notNull(),
  status: text("status").notNull().default("open"),
  resolution: jsonb("resolution"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by"),
});

export const policySnapshots = pgTable("policy_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  jurisdictionCode: text("jurisdiction_code").notNull(),
  asOfDate: date("as_of_date").notNull(),
  resolvedPath: text("resolved_path").notNull(),
  contentHash: text("content_hash").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const policySnapshotMembers = pgTable("policy_snapshot_members", {
  id: serial("id").primaryKey(),
  snapshotId: uuid("snapshot_id").notNull(),
  entityType: text("entity_type").notNull(),
  businessKey: text("business_key").notNull(),
  payload: jsonb("payload").notNull(),
  provenance: jsonb("provenance").notNull(),
});

// ─── 地区规划发布记录（任务3 JRP-FR-005/006/007/024，migration 0015+0017）────
// 每地区可有多条区间记录（0017撤销0015的每地区唯一索引）；active 必须具有
// 非空快照、激活人、激活时间、闭合区间（effective_from）且同地区 active 区间
// 不重叠（0017 EXCLUDE 约束）。激活/切换/停用只允许经 publishing 应用用例，
// 禁止直接 SQL 修改状态。四川延期期间不创建本表记录。

export const jurisdictionPlanningReleases = pgTable(
  "jurisdiction_planning_releases",
  {
    id: serial("id").primaryKey(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    activeSnapshotId: uuid("active_snapshot_id").references(
      () => policySnapshots.id,
    ),
    status: text("status").notNull().default("inactive"),
    gateResults: jsonb("gate_results").notNull().default({}),
    activatedAt: timestamp("activated_at"),
    activatedBy: text("activated_by"),
    // JRP-FR-024：区间列（0017）。effective_from 非空闭合定义见迁移 CHECK；
    // effective_to 为 NULL 表示开放上界（2030窗口）。
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // 同一活动快照不得同时是多个地区的活动快照；NULL（inactive）不参与唯一。
    uniqueIndex("jurisdiction_planning_releases_active_snapshot_unique").on(
      table.activeSnapshotId,
    ),
  ],
);

// ─── 案例归档元数据（0016 CLG-FR-011/013，0018 RCL-FR-019/022）──────────────

export const caseArchiveBatches = pgTable("case_archive_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  status: text("status").notNull(),
  sourceCounts: jsonb("source_counts").notNull(),
  retainedCounts: jsonb("retained_counts").notNull(),
  deletedCounts: jsonb("deleted_counts").notNull(),
  tableHashes: jsonb("table_hashes").notNull().default({}),
  manifestHash: text("manifest_hash").notNull(),
  storagePath: text("storage_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  createdBy: text("created_by").notNull(),
});

export const caseArchiveEntries = pgTable("case_archive_entries", {
  id: serial("id").primaryKey(),
  archiveBatchId: uuid("archive_batch_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  caseUid: text("case_uid"),
  contentHash: text("content_hash").notNull(),
  archiveReason: text("archive_reason").notNull(),
});

// ─── Agent 物化台账（阶段06，DRF-FR-013）────────────────────────────────────

export const agentMaterializations = pgTable("agent_materializations", {
  idempotencyKey: text("idempotency_key").primaryKey(),
  proposalId: text("proposal_id").notNull(),
  runId: text("run_id").notNull(),
  status: text("status").notNull().default("draft"),
  draftIds: jsonb("draft_ids").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── 服务JWT重放表（09-03 SJWT-FR-008，PRD §7.1）────────────────────────────
// JTI唯一消费：与draft物化业务写同事务；仅存UUID与claims元数据，不存令牌/签名。

export const serviceJwtReplays = pgTable("service_jwt_replays", {
  jti: uuid("jti").primaryKey(),
  issuer: text("issuer").notNull(),
  subject: text("subject").notNull(),
  audience: text("audience").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Showcase Cases ────────────────────────────────────────────────────────

export const showcaseCases = pgTable("showcase_cases", {
  id: serial("id").primaryKey(),
  caseUid: text("case_uid"),
  title: text("title").notNull(),
  tags: jsonb("tags").notNull().default([]),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response").notNull(),
  inputData: jsonb("input_data"),
  expectedData: jsonb("expected_data"),
  category: text("category"),
  isPublished: boolean("is_published").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  // 0016 治理字段（CLG-FR-003）
  jurisdictionCode: text("jurisdiction_code"),
  sourceCaseUid: text("source_case_uid"),
  snapshotId: uuid("snapshot_id"),
  qualityScore: integer("quality_score"),
  qualityStatus: text("quality_status"),
  contentHash: text("content_hash"),
  curatedAt: timestamp("curated_at", { withTimezone: true, mode: "date" }),
  curatedBy: text("curated_by"),
  // 0018 重建字段（RCL-FR-007/015/016/017）
  scenarioKey: text("scenario_key"),
  generatorVersion: text("generator_version"),
  asOfDate: date("as_of_date"),
  snapshotHash: text("snapshot_hash"),
  coverageObligations: jsonb("coverage_obligations").default([]),
  evidence: jsonb("evidence").default([]),
  qualityBreakdown: jsonb("quality_breakdown"),
  multiLabels: jsonb("multi_labels").default([]),
  assertions: jsonb("assertions").default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Cases ──────────────────────────────────────────────────────────────────

export const cases = pgTable("cases", {
  id: serial("id").primaryKey(),
  caseUid: text("case_uid"),
  creator: text("creator"),
  postDate: text("post_date"),
  videoId: text("video_id"),
  topics: jsonb("topics"),
  caseText: text("case_text"),
  transcriptText: text("transcript_text"),
  tags: jsonb("tags"),
  isRegression: boolean("is_regression").notNull().default(false),
  sourceFile: text("source_file"),
  // 0016 治理字段（CLG-FR-002）
  jurisdictionCode: text("jurisdiction_code"),
  contentHash: text("content_hash"),
  qualityScore: integer("quality_score"),
  qualityStatus: text("quality_status"),
  governanceReason: text("governance_reason"),
  governedAt: timestamp("governed_at", { withTimezone: true, mode: "date" }),
  // 0018 重建字段（RCL-FR-006/007/015/017）
  scenarioKey: text("scenario_key"),
  generatorVersion: text("generator_version"),
  asOfDate: date("as_of_date"),
  snapshotHash: text("snapshot_hash"),
  coverageObligations: jsonb("coverage_obligations").default([]),
  evidence: jsonb("evidence").default([]),
  qualityBreakdown: jsonb("quality_breakdown"),
  multiLabels: jsonb("multi_labels").default([]),
  // RCL-FR-006/018/AC-011（2026-09-09复审P0修复）：cases 完整场景事实。
  input: jsonb("input").default({}),
  expected: jsonb("expected").default({}),
  assertions: jsonb("assertions").default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Tests ──────────────────────────────────────────────────────────────────

export const tests = pgTable("tests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  jurisdictionCode: text("jurisdiction_code"),
  ruleId: text("rule_id"),
  input: jsonb("input").notNull(),
  paramsOverride: jsonb("params_override"),
  expected: jsonb("expected").notNull(),
  source: text("source").notNull().default("manual"),
  // 0016 来源链（CLG-FR-004/RCL-FR-013）：每个新case一条地区回归test引用source_case_uid。
  sourceCaseUid: text("source_case_uid"),
  lastRunResult: jsonb("last_run_result"),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Users（09-02 用户与管理员双角色鉴权，AUTH-FR-001～013）──────────────────
// 固定双角色权限矩阵（非通用RBAC）：role 只允许 user/admin，直接保存在用户行上。

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 展示用原始用户名；唯一性由 normalized_username 承担。
    username: text("username").notNull(),
    // trim + NFKC + lowercase 后的规范形（AUTH-FR-001/§10.1）。
    normalizedUsername: text("normalized_username").notNull(),
    // bcrypt cost 12 哈希；任何出口（API/日志/Session）不得返回本列。
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("active"),
    // 安全状态变化（改密/重置/禁用/角色变更）时递增（AUTH-FR-007/008/009/010）。
    authVersion: integer("auth_version").notNull().default(1),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    // 临时密码到期时间；非临时密码状态为 NULL（§8.1）。
    temporaryPasswordExpiresAt: timestamp("temporary_password_expires_at", {
      withTimezone: true,
    }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("users_normalized_username_key").on(table.normalizedUsername),
    check(
      "users_role_check",
      sql`${table.role} IN ('user', 'admin')`,
    ),
    check(
      "users_status_check",
      sql`${table.status} IN ('active', 'disabled')`,
    ),
    check(
      "users_auth_version_check",
      sql`${table.authVersion} > 0`,
    ),
  ],
);

// ─── Auth Refresh Sessions（AUTH-FR-004，ADR-0007）──────────────────────────

export const authRefreshSessions = pgTable(
  "auth_refresh_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // 只保存 SHA-256(secret)，Secret 原文仅存于 NextAuth 加密 Cookie。
    currentTokenHash: text("current_token_hash").notNull(),
    // 并发刷新宽限（30秒）期间保留的前一哈希（§7.3）。
    previousTokenHash: text("previous_token_hash"),
    previousValidUntil: timestamp("previous_valid_until", { withTimezone: true }),
    rotationCounter: integer("rotation_counter").notNull().default(0),
    // 创建/刷新时的用户 authVersion；不匹配即失效。
    authVersion: integer("auth_version").notNull(),
    // 成功刷新后延长为 now+7天，不超过绝对期限。
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true })
      .notNull(),
    // 创建时固定 now+30天。
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true })
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // 稳定原因枚举（logout / password_changed / admin_action / reuse_detected /
    // expired / superseded），不保存 Secret。
    revokedReason: text("revoked_reason"),
  },
  (table) => [
    uniqueIndex("auth_refresh_sessions_current_token_hash_key").on(
      table.currentTokenHash,
    ),
    index("auth_refresh_sessions_user_id_idx").on(table.userId),
    check(
      "auth_refresh_sessions_rotation_counter_check",
      sql`${table.rotationCounter} >= 0`,
    ),
  ],
);

// ─── Auth Audit Events（AUTH-FR-011）───────────────────────────────────────

export const authAuditEvents = pgTable(
  "auth_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // 注册/系统操作可为 NULL（§8.3）。
    actorUserId: uuid("actor_user_id"),
    targetUserId: uuid("target_user_id"),
    eventType: text("event_type").notNull(),
    requestId: text("request_id"),
    // 只保存脱敏枚举与变更前后状态，禁止密码/Secret/IP。
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_audit_events_created_at_idx").on(table.createdAt),
    index("auth_audit_events_target_user_id_idx").on(table.targetUserId),
  ],
);
