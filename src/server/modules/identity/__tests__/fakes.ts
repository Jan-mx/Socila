/**
 * application 用例测试的可注入替身（AUTH-NFR-007）。
 * 时钟/随机数/哈希/HMAC/事务全部确定性实现，无 sleep、无数据库。
 */
import type {
  AuditEventRepository,
  Clock,
  HmacDeriver,
  IdGenerator,
  PasswordHasher,
  RandomGenerator,
  RefreshSessionRecord,
  RefreshSessionRepository,
  TokenHasher,
  TransactionRunner,
  UserPatch,
  UserRecord,
  UserRepository,
  IdentityDeps,
  IdentityRepos,
} from "../application/ports";

export class FakeClock implements Clock {
  private currentMs = new Date("2026-09-02T00:00:00.000Z").getTime();
  now(): Date {
    return new Date(this.currentMs);
  }
  advance(ms: number): void {
    this.currentMs += ms;
  }
}

export class FakePasswordHasher implements PasswordHasher {
  hashed: string[] = [];
  compared: Array<[string, string]> = [];
  readonly dummyHashValue = "bcrypted:dummy-password-not-a-secret";
  async hash(password: string): Promise<string> {
    this.hashed.push(password);
    return `bcrypted:${password}`;
  }
  async compare(password: string, hash: string): Promise<boolean> {
    this.compared.push([password, hash]);
    return hash === `bcrypted:${password}`;
  }
  dummyHash(): string {
    return this.dummyHashValue;
  }
}

export class FakeRandomGenerator implements RandomGenerator {
  private counter = 0;
  refreshSecret(): string {
    this.counter += 1;
    const base = `secret-${this.counter}`;
    return base + "a".repeat(43 - base.length);
  }
  temporaryPassword(): string {
    this.counter += 1;
    const base = `temp-${this.counter}`;
    return base + "T".repeat(20 - base.length);
  }
}

export class FakeTokenHasher implements TokenHasher {
  sha256Hex(value: string): string {
    return `sha256:${value}`;
  }
}

export class FakeHmacDeriver implements HmacDeriver {
  derive(key: string, message: string): string {
    return `hmac:${key}:${message}`;
  }
}

export class FakeIdGenerator implements IdGenerator {
  private counter = 0;
  uuid(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}

export class FakeUserRepository implements UserRepository {
  inserted: Array<Record<string, unknown>> = [];
  updated: Array<{ id: string; patch: UserPatch }> = [];
  concurrentDuplicate = false;
  private rows = new Map<string, UserRecord>();
  private seq = 0;

  private makeRecord(data: {
    username: string;
    normalizedUsername: string;
    passwordHash: string;
    role: UserRecord["role"];
    status: UserRecord["status"];
  }): UserRecord {
    this.seq += 1;
    const now = new Date(0);
    return {
      id: `user-${this.seq}`,
      username: data.username,
      normalizedUsername: data.normalizedUsername,
      passwordHash: data.passwordHash,
      role: data.role,
      status: data.status,
      authVersion: 1,
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  async findByNormalizedUsername(normalized: string): Promise<UserRecord | null> {
    for (const row of this.rows.values()) {
      if (row.normalizedUsername === normalized) return row;
    }
    return null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async lockById(id: string): Promise<UserRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async createUser(data: {
    username: string;
    normalizedUsername: string;
    passwordHash: string;
    role: UserRecord["role"];
    status: UserRecord["status"];
  }): Promise<UserRecord> {
    this.inserted.push({ ...data });
    if (
      this.concurrentDuplicate ||
      (await this.findByNormalizedUsername(data.normalizedUsername))
    ) {
      const err = new Error("duplicate key value violates unique constraint");
      (err as Error & { code?: string }).code = "23505";
      throw err;
    }
    const record = this.makeRecord(data);
    this.rows.set(record.id, record);
    return record;
  }

  async update(id: string, patch: UserPatch): Promise<UserRecord> {
    const current = this.rows.get(id);
    if (!current) throw new Error(`unknown user ${id}`);
    this.updated.push({ id, patch });
    const next: UserRecord = { ...current, ...patch };
    this.rows.set(id, next);
    return next;
  }

  async listUsers(query: {
    qNormalized?: string;
    role?: UserRecord["role"];
    status?: UserRecord["status"];
    cursorCreatedAt?: Date;
    cursorId?: string;
    limit: number;
  }): Promise<{ items: UserRecord[]; nextCursor: string | null }> {
    let items = [...this.rows.values()];
    if (query.qNormalized) {
      items = items.filter((u) => u.normalizedUsername.includes(query.qNormalized!));
    }
    if (query.role) items = items.filter((u) => u.role === query.role);
    if (query.status) items = items.filter((u) => u.status === query.status);
    items.sort((a, b) => {
      const byDate = a.createdAt.getTime() - b.createdAt.getTime();
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });
    if (query.cursorCreatedAt && query.cursorId) {
      items = items.filter((u) => {
        const byDate = u.createdAt.getTime() - query.cursorCreatedAt!.getTime();
        if (byDate !== 0) return byDate > 0;
        return u.id.localeCompare(query.cursorId!) > 0;
      });
    }
    const page = items.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page,
      nextCursor: last && items.length > page.length ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }

  async lockActiveAdminIds(): Promise<string[]> {
    return [...this.rows.values()]
      .filter((u) => u.role === "admin" && u.status === "active")
      .map((u) => u.id);
  }

  byUsername(username: string): UserRecord | null {
    for (const row of this.rows.values()) {
      if (row.username === username) return row;
    }
    return null;
  }

  byId(id: string): UserRecord | null {
    return this.rows.get(id) ?? null;
  }
}

export class FakeRefreshSessionRepository implements RefreshSessionRepository {
  created: Array<Record<string, unknown>> = [];
  revokedForUser: Record<string, { reason: string; count: number }> = {};
  private rows = new Map<string, RefreshSessionRecord>();

  async create(data: {
    userId: string;
    tokenHash: string;
    authVersion: number;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
  }): Promise<RefreshSessionRecord> {
    const now = new Date(0);
    const record: RefreshSessionRecord = {
      id: `session-${this.rows.size + 1}`,
      userId: data.userId,
      currentTokenHash: data.tokenHash,
      previousTokenHash: null,
      previousValidUntil: null,
      rotationCounter: 0,
      authVersion: data.authVersion,
      idleExpiresAt: data.idleExpiresAt,
      absoluteExpiresAt: data.absoluteExpiresAt,
      lastUsedAt: now,
      createdAt: now,
      revokedAt: null,
      revokedReason: null,
    };
    this.created.push({ ...data });
    this.rows.set(record.id, record);
    return record;
  }

  async findById(id: string): Promise<RefreshSessionRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async lockById(id: string): Promise<RefreshSessionRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async applyRotation(
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
  ): Promise<void> {
    const current = this.rows.get(id);
    if (!current) throw new Error(`unknown session ${id}`);
    this.rows.set(id, { ...current, ...patch });
  }

  async touch(id: string, lastUsedAt: Date): Promise<void> {
    const current = this.rows.get(id);
    if (!current) throw new Error(`unknown session ${id}`);
    this.rows.set(id, { ...current, lastUsedAt });
  }

  async revoke(id: string, reason: string, at?: Date): Promise<void> {
    const current = this.rows.get(id);
    if (!current || current.revokedAt) return;
    this.rows.set(id, { ...current, revokedAt: at ?? new Date(0), revokedReason: reason });
  }

  async revokeAllForUser(
    userId: string,
    reason: string,
    at: Date,
  ): Promise<number> {
    let count = 0;
    for (const [id, row] of this.rows.entries()) {
      if (row.userId === userId && !row.revokedAt) {
        this.rows.set(id, { ...row, revokedAt: at, revokedReason: reason });
        count += 1;
      }
    }
    this.revokedForUser[userId] = {
      reason,
      count: (this.revokedForUser[userId]?.count ?? 0) + count,
    };
    return count;
  }

  byId(id: string): RefreshSessionRecord | null {
    return this.rows.get(id) ?? null;
  }
}

export class FakeAuditEventRepository implements AuditEventRepository {
  appended: Array<{
    actorUserId: string | null;
    targetUserId: string | null;
    eventType: string;
    requestId: string | null;
    metadata: Record<string, unknown>;
  }> = [];

  async append(event: {
    actorUserId?: string | null;
    targetUserId?: string | null;
    eventType: string;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    this.appended.push({
      actorUserId: event.actorUserId ?? null,
      targetUserId: event.targetUserId ?? null,
      eventType: event.eventType,
      requestId: event.requestId ?? null,
      metadata: event.metadata ?? {},
    });
  }
}

export interface FakeDeps extends IdentityDeps {
  clock: FakeClock;
  hasher: FakePasswordHasher;
  random: FakeRandomGenerator;
  tokenHasher: FakeTokenHasher;
  hmac: FakeHmacDeriver;
  ids: FakeIdGenerator;
  userRepo: FakeUserRepository;
  refreshRepo: FakeRefreshSessionRepository;
  audit: FakeAuditEventRepository;
}

export function createFakeDeps(pepper = "test-pepper"): FakeDeps {
  const clock = new FakeClock();
  const hasher = new FakePasswordHasher();
  const random = new FakeRandomGenerator();
  const tokenHasher = new FakeTokenHasher();
  const hmac = new FakeHmacDeriver();
  const ids = new FakeIdGenerator();
  const userRepo = new FakeUserRepository();
  const refreshRepo = new FakeRefreshSessionRepository();
  const audit = new FakeAuditEventRepository();

  const repos: IdentityRepos = { users: userRepo, refreshSessions: refreshRepo, audit };
  const tx: TransactionRunner = {
    run<T>(fn: (txRepos: IdentityRepos) => Promise<T>): Promise<T> {
      return fn(repos);
    },
  };

  return {
    clock,
    hasher,
    random,
    tokenHasher,
    hmac,
    ids,
    repos,
    tx,
    pepper,
    userRepo,
    refreshRepo,
    audit,
  };
}
