/**
 * identity 基础设施：密码哈希与密码学端口适配（09-02 §7.1，AUTH-NFR-007）。
 *
 * bcrypt cost 12（§10.2）；dummy 哈希用于未知用户名的抗枚举比较
 * （AUTH-NFR-002）。dummy 哈希是任意固定串的 bcrypt 结果，不是 Secret。
 */
import bcrypt from "bcryptjs";

import type { PasswordHasher } from "../../application/ports";

const BCRYPT_COST = 12;

/** 固定 dummy 口令的 bcrypt 哈希：仅用于消耗与真实比较相同的时间，不对应任何账号。 */
const DUMMY_HASH = "$2b$12$JZtAwxs1NWX.D0qpKVSMqOnJeEEJfYwfQ6vGqJVIR3Ai6R.ZQAnYW";

export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_COST);
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  dummyHash(): string {
    return DUMMY_HASH;
  }
}
