/**
 * identity 依赖容器（09-02 §7.1）：进程级单例，组合密码学端口与 Drizzle 仓储。
 * AUTH_REFRESH_PEPPER 必须与 NEXTAUTH_SECRET 不同（§12.2）；首次使用时校验。
 */
import { db, withTransaction, type DbClient } from "@/lib/db";

import type {
  IdentityDeps,
  IdentityRepos,
  TransactionRunner,
} from "../application/ports";
import { BcryptPasswordHasher } from "./crypto/bcrypt-password-hasher";
import {
  NodeHmacDeriver,
  NodeIdGenerator,
  NodeRandomGenerator,
  NodeTokenHasher,
  SystemClock,
} from "./crypto/node-crypto-ports";
import { createDrizzleAuditEventRepository } from "./drizzle/drizzle-audit.repository";
import { createDrizzleRefreshSessionRepository } from "./drizzle/drizzle-refresh-session.repository";
import { createDrizzleUserRepository } from "./drizzle/drizzle-user.repository";

export function createDrizzleIdentityRepos(executor: DbClient): IdentityRepos {
  return {
    users: createDrizzleUserRepository(executor),
    refreshSessions: createDrizzleRefreshSessionRepository(executor),
    audit: createDrizzleAuditEventRepository(executor),
  };
}

const identityTx: TransactionRunner = {
  run<T>(fn: (repos: IdentityRepos) => Promise<T>): Promise<T> {
    return withTransaction((tx) => fn(createDrizzleIdentityRepos(tx)));
  },
};

let cachedDeps: IdentityDeps | null = null;

export function getIdentityDeps(): IdentityDeps {
  if (cachedDeps) return cachedDeps;

  const pepper = process.env.AUTH_REFRESH_PEPPER;
  if (!pepper) {
    throw new Error("AUTH_REFRESH_PEPPER environment variable is not set");
  }

  cachedDeps = {
    clock: new SystemClock(),
    hasher: new BcryptPasswordHasher(),
    random: new NodeRandomGenerator(),
    tokenHasher: new NodeTokenHasher(),
    hmac: new NodeHmacDeriver(),
    ids: new NodeIdGenerator(),
    repos: createDrizzleIdentityRepos(db),
    tx: identityTx,
    pepper,
  };
  return cachedDeps;
}

/** 测试与脚本使用：executor 为空时使用进程级 db 单例（默认连接 DATABASE_URL）。 */
export function createIdentityDepsFor(
  executor: DbClient | undefined,
  pepper: string,
): IdentityDeps {
  const resolvedExecutor = executor as DbClient;
  return {
    clock: new SystemClock(),
    hasher: new BcryptPasswordHasher(),
    random: new NodeRandomGenerator(),
    tokenHasher: new NodeTokenHasher(),
    hmac: new NodeHmacDeriver(),
    ids: new NodeIdGenerator(),
    repos: createDrizzleIdentityRepos(resolvedExecutor),
    tx: {
      run: (fn) => withTransaction((tx) => fn(createDrizzleIdentityRepos(tx))),
    },
    pepper,
  };
}
