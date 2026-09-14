/**
 * identity application 端口（09-02 §7.1，AUTH-NFR-007）。
 *
 * bcrypt、随机数、时钟、SHA-256、HMAC 与持久化全部经端口注入；
 * 用户、刷新会话变更与审计事件由 TransactionRunner 保证同事务提交。
 */

export interface Clock {
  now(): Date;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
  /** 未知用户名也执行的 dummy bcrypt 比较（AUTH-NFR-002 抗枚举）。 */
  dummyHash(): string;
}

/** 刷新 Secret 32 字节 CSPRNG base64url；临时密码 20 位 base64url（§7.3/§10.2）。 */
export interface RandomGenerator {
  refreshSecret(): string;
  temporaryPassword(): string;
}

export interface TokenHasher {
  sha256Hex(value: string): string;
}

export interface HmacDeriver {
  derive(key: string, message: string): string;
}

export interface IdGenerator {
  uuid(): string;
}

export interface UserRecord {
  id: string;
  username: string;
  normalizedUsername: string;
  passwordHash: string;
  role: "user" | "admin";
  status: "active" | "disabled";
  authVersion: number;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPatch {
  passwordHash?: string;
  role?: "user" | "admin";
  status?: "active" | "disabled";
  authVersion?: number;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: Date | null;
  lastLoginAt?: Date | null;
}

export interface UserListQuery {
  qNormalized?: string;
  role?: "user" | "admin";
  status?: "active" | "disabled";
  cursorCreatedAt?: Date;
  cursorId?: string;
  limit: number;
}

export interface UserRepository {
  findByNormalizedUsername(normalized: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** SELECT ... FOR UPDATE：管理写操作在事务内锁定目标行。 */
  lockById(id: string): Promise<UserRecord | null>;
  createUser(data: {
    username: string;
    normalizedUsername: string;
    passwordHash: string;
    role: UserRecord["role"];
    status: UserRecord["status"];
  }): Promise<UserRecord>;
  update(id: string, patch: UserPatch): Promise<UserRecord>;
  listUsers(
    query: UserListQuery,
  ): Promise<{ items: UserRecord[]; nextCursor: string | null }>;
  /** 锁定全部 active admin 行并返回 id（最后管理员规则防并发，AUTH-AC-014）。 */
  lockActiveAdminIds(): Promise<string[]>;
}

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  currentTokenHash: string;
  previousTokenHash: string | null;
  previousValidUntil: Date | null;
  rotationCounter: number;
  authVersion: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
}

/** 稳定撤销原因枚举（§8.2）：不保存 Secret。 */
export type RefreshRevokeReason =
  | "logout"
  | "password_changed"
  | "admin_action"
  | "reuse_detected"
  | "expired"
  | "auth_version_changed";

export interface RefreshSessionRepository {
  create(data: {
    userId: string;
    tokenHash: string;
    authVersion: number;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }): Promise<RefreshSessionRecord>;
  findById(id: string): Promise<RefreshSessionRecord | null>;
  /** SELECT ... FOR UPDATE：同一刷新会话的并发刷新由行锁串行化（§7.3）。 */
  lockById(id: string): Promise<RefreshSessionRecord | null>;
  applyRotation(
    id: string,
    patch: {
      currentTokenHash: string;
      previousTokenHash: string | null;
      previousValidUntil: Date | null;
      rotationCounter: number;
      authVersion: number;
      idleExpiresAt: Date;
      lastUsedAt: Date;
    },
  ): Promise<void>;
  touch(id: string, lastUsedAt: Date): Promise<void>;
  revoke(id: string, reason: RefreshRevokeReason, at: Date): Promise<void>;
  revokeAllForUser(
    userId: string,
    reason: RefreshRevokeReason,
    at: Date,
  ): Promise<number>;
}

export interface AuditEventInput {
  actorUserId?: string | null;
  targetUserId?: string | null;
  eventType: string;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditEventRepository {
  append(event: AuditEventInput): Promise<void>;
}

export interface IdentityRepos {
  users: UserRepository;
  refreshSessions: RefreshSessionRepository;
  audit: AuditEventRepository;
}

export interface TransactionRunner {
  /** 在同一事务中执行；用户、刷新会话与审计变更必须同事务提交（§7.1）。 */
  run<T>(fn: (repos: IdentityRepos) => Promise<T>): Promise<T>;
}

export interface IdentityDeps {
  clock: Clock;
  hasher: PasswordHasher;
  random: RandomGenerator;
  tokenHasher: TokenHasher;
  hmac: HmacDeriver;
  ids: IdGenerator;
  repos: IdentityRepos;
  tx: TransactionRunner;
  /** HMAC 派生 pepper；必须与 NEXTAUTH_SECRET 不同（§12.2）。 */
  pepper: string;
}

/** 审计事件类型稳定枚举（AUTH-FR-011）。 */
export const AUTH_AUDIT_EVENTS = {
  userRegistered: "auth.user_registered",
  passwordChanged: "auth.password_changed",
  passwordResetByAdmin: "auth.password_reset_by_admin",
  userStatusChanged: "auth.user_status_changed",
  userRoleChanged: "auth.user_role_changed",
  sessionsRevoked: "auth.sessions_revoked",
  refreshReuseDetected: "auth.refresh_reuse_detected",
  refreshSessionRevoked: "auth.refresh_session_revoked",
} as const;
