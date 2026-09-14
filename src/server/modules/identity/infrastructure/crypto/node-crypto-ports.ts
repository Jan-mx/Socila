/**
 * identity 密码学端口 Node 实现（09-02，AUTH-NFR-007）。
 *
 * - 刷新 Secret：32 字节 CSPRNG → base64url（43 字符，§7.3）；
 * - 临时密码：20 位 base64url（§10.2，15 字节 → 恰好 20 字符）；
 * - 令牌哈希：SHA-256 hex；派生：HMAC-SHA256 base64url（ADR-0007）。
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";

import type {
  Clock,
  HmacDeriver,
  IdGenerator,
  RandomGenerator,
  TokenHasher,
} from "../../application/ports";

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class NodeIdGenerator implements IdGenerator {
  uuid(): string {
    return randomUUID();
  }
}

export class NodeRandomGenerator implements RandomGenerator {
  /** 32 字节 → base64url 43 字符。 */
  refreshSecret(): string {
    return randomBytes(32).toString("base64url");
  }

  /** 15 字节 → base64url 20 字符（20 位临时密码，§10.2）。 */
  temporaryPassword(): string {
    return randomBytes(15).toString("base64url");
  }
}

export class NodeTokenHasher implements TokenHasher {
  sha256Hex(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}

export class NodeHmacDeriver implements HmacDeriver {
  derive(key: string, message: string): string {
    return createHmac("sha256", key).update(message, "utf8").digest("base64url");
  }
}
