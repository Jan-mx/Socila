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
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  // 归属会话：保存时记录创建者的匿名 session，读取时据此校验归属（旧数据为 null = 不限制）。
  sessionId: text("session_id"),
  // 归属用户（CORE-FR-009）：认证用户出现后写入，优先于 sessionId 参与归属校验。
  ownerUserId: text("owner_user_id"),
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
