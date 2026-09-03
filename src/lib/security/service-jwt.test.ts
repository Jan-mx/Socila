/**
 * Core↔Agent 服务JWT（09-03 SJWT-FR-001～003/007/009、NFR-001～006、AC-004～010）：
 * 固定HS256协议、300秒TTL、30秒时钟偏差、current/previous双Secret轮换、
 * 统一SERVICE_AUTH_INVALID失败、零泄漏。
 *
 * SJWT-NFR-005：Clock/UUID全部注入，测试不依赖真实等待与真实时钟。
 */
import { describe, it, expect } from "vitest";
import { SignJWT, decodeProtectedHeader, type JWTHeaderParameters } from "jose";
import {
  AGENT_IDENTITY,
  NEXT_IDENTITY,
  SERVICE_JWT_CLOCK_SKEW_SECONDS,
  SERVICE_JWT_TTL_SECONDS,
  ServiceAuthInvalidError,
  ServiceJwt,
  extractBearerToken,
  validateServiceJwtSecrets,
  type ServiceJwtContext,
} from "./service-jwt";

/** 固定时钟（1760000000 = 2025-10-08T12:53:20Z）与固定UUID v4，全部确定性。 */
const FIXED_NOW = 1_760_000_000;
const FIXED_JTI = "0b7a1c2e-9f34-4d5a-b6c8-1e2f3a4b5c6d";
const ctx = (overrides?: Partial<ServiceJwtContext>): ServiceJwtContext => ({
  now: () => FIXED_NOW,
  uuid: () => FIXED_JTI,
  ...overrides,
});

const CURRENT = "test-current-secret-0123456789-abcdef-0123456789"; // 48 UTF-8 字节
const PREVIOUS = "test-previous-secret-0123456789-abcdef-0123456789"; // 48 UTF-8 字节

async function rawSign(
  claims: Record<string, unknown>,
  secret: string,
  header: JWTHeaderParameters = { alg: "HS256", typ: "JWT" },
): Promise<string> {
  // jose由Header.alg决定算法（无sign选项）：alg=none需手工构造（见AC-004用例）。
  return new SignJWT(claims)
    .setProtectedHeader(header)
    .sign(new TextEncoder().encode(secret));
}

describe("SJWT-FR-001/NFR-003/AC-010 配置校验", () => {
  it("current 缺失或空 → 启动失败", () => {
    expect(() => validateServiceJwtSecrets(undefined)).toThrow();
    expect(() => validateServiceJwtSecrets("")).toThrow();
    expect(() => validateServiceJwtSecrets(null, null)).toThrow();
  });

  it("current 少于32 UTF-8字节 → 启动失败", () => {
    expect(() => validateServiceJwtSecrets("a".repeat(31))).toThrow();
    // 32个ASCII字节恰好通过。
    expect(() => validateServiceJwtSecrets("a".repeat(32))).not.toThrow();
    // UTF-8多字节：16个CJK字符=48字节，通过；11个=33字节也通过。
    expect(() => validateServiceJwtSecrets("测".repeat(16))).not.toThrow();
  });

  it("previous 与 current 相同 → 启动失败", () => {
    expect(() => validateServiceJwtSecrets(CURRENT, CURRENT)).toThrow();
  });

  it("previous 提供但格式无效（过短）→ 启动失败", () => {
    expect(() => validateServiceJwtSecrets(CURRENT, "short")).toThrow();
    expect(() => validateServiceJwtSecrets(CURRENT, PREVIOUS)).not.toThrow();
  });

  it("NFR-006: 配置错误不得输出Secret内容", () => {
    let message = "";
    try {
      validateServiceJwtSecrets("x".repeat(10), "x".repeat(10));
    } catch (e) {
      message = String(e);
    }
    expect(message).not.toContain("x".repeat(10));
  });
});

describe("SJWT-FR-002/NFR-001 算法与Header", () => {
  it("签发的Header固定alg=HS256、typ=JWT", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const token = await svc.signNextToken();
    const header = decodeProtectedHeader(token);
    expect(header.alg).toBe("HS256");
    expect(header.typ).toBe("JWT");
  });

  it("AC-004: alg=none令牌 → 统一401", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    // jose拒绝签发alg=none——手工构造none令牌（空签名段）。
    const b64 = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW, exp: FIXED_NOW + 300 })}.`;
    await expect(svc.verifyNextToken(none)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("AC-004: 非HS256算法（HS512）→ 统一401（禁止算法协商）", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const hs512 = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW, exp: FIXED_NOW + 300 },
      CURRENT,
      { alg: "HS512", typ: "JWT" },
    );
    await expect(svc.verifyNextToken(hs512)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("AC-004: 缺失typ的Header → 统一401", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const noTyp = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW, exp: FIXED_NOW + 300 },
      CURRENT,
      { alg: "HS256" },
    );
    await expect(svc.verifyNextToken(noTyp)).rejects.toThrow(ServiceAuthInvalidError);
  });
});

describe("SJWT-FR-003/NFR-002 固定claims与期限", () => {
  it("签发claims：固定iss/aud/sub、注入jti、iat=now、exp=iat+300", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const token = await svc.signNextToken();
    const { claims } = await svc.verifyNextToken(token);
    expect(claims.iss).toBe(NEXT_IDENTITY.issuer);
    expect(claims.aud).toBe(NEXT_IDENTITY.audience);
    expect(claims.sub).toBe(NEXT_IDENTITY.subject);
    expect(claims.jti).toBe(FIXED_JTI);
    expect(claims.iat).toBe(FIXED_NOW);
    expect(claims.exp).toBe(FIXED_NOW + SERVICE_JWT_TTL_SECONDS);
  });

  it("Agent→Core方向签发固定Agent身份", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const token = await svc.signAgentToken();
    const { claims } = await svc.verifyAgentToken(token);
    expect(claims.iss).toBe(AGENT_IDENTITY.issuer);
    expect(claims.aud).toBe(AGENT_IDENTITY.audience);
    expect(claims.sub).toBe(AGENT_IDENTITY.subject);
  });

  it("AC-006: 缺失jti/iat/exp → 统一401", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const noJti = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, iat: FIXED_NOW, exp: FIXED_NOW + 300 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(noJti)).rejects.toThrow(ServiceAuthInvalidError);
    const noIat = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, exp: FIXED_NOW + 300 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(noIat)).rejects.toThrow(ServiceAuthInvalidError);
    const noExp = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW },
      CURRENT,
    );
    await expect(svc.verifyNextToken(noExp)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("AC-006: 非UUID v4的jti（v1/非法）→ 统一401", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const v1 = "9f1c8a2e-6b3d-11e9-a5c8-0242ac120002"; // version nibble = 1
    const bad = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: v1, iat: FIXED_NOW, exp: FIXED_NOW + 300 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(bad)).rejects.toThrow(ServiceAuthInvalidError);
    const notUuid = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: "not-a-uuid", iat: FIXED_NOW, exp: FIXED_NOW + 300 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(notUuid)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("AC-008: TTL大于300秒（exp=iat+600）→ 统一401", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const ttl600 = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW, exp: FIXED_NOW + 600 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(ttl600)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("AC-008: 已过期（exp早于now-30秒）→ 统一401", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const stale = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW - 400, exp: FIXED_NOW - 100 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(stale)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("AC-007: iat超前≤30秒通过、超出30秒拒绝（固定时钟偏差）", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const within = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW + SERVICE_JWT_CLOCK_SKEW_SECONDS - 1, exp: FIXED_NOW + SERVICE_JWT_CLOCK_SKEW_SECONDS - 1 + 300 },
      CURRENT,
    );
    const ok = await svc.verifyNextToken(within);
    expect(ok.claims.iat).toBe(FIXED_NOW + 29);
    const beyond = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW + SERVICE_JWT_CLOCK_SKEW_SECONDS + 1, exp: FIXED_NOW + SERVICE_JWT_CLOCK_SKEW_SECONDS + 1 + 300 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(beyond)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("时钟偏差内过期（exp=now-29秒）仍可通过", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const edge = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW - 329, exp: FIXED_NOW - 29 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(edge)).resolves.toBeDefined();
  });
});

describe("SJWT-FR-004/005 双向固定身份", () => {
  it("FR-004: Next→Agent令牌只有Next身份验证通过；Agent身份拒绝", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const nextToken = await svc.signNextToken();
    await expect(svc.verifyNextToken(nextToken)).resolves.toBeDefined();
    await expect(svc.verifyAgentToken(nextToken)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("FR-005: Agent→Core令牌只有Agent身份验证通过；Next身份拒绝", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const agentToken = await svc.signAgentToken();
    await expect(svc.verifyAgentToken(agentToken)).resolves.toBeDefined();
    await expect(svc.verifyNextToken(agentToken)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("AC-005: 错误issuer/audience/subject → 统一401", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const wrongIss = await rawSign(
      { iss: "someone-else", aud: NEXT_IDENTITY.audience, sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW, exp: FIXED_NOW + 300 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(wrongIss)).rejects.toThrow(ServiceAuthInvalidError);
    const wrongAud = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: "someone-else", sub: NEXT_IDENTITY.subject, jti: FIXED_JTI, iat: FIXED_NOW, exp: FIXED_NOW + 300 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(wrongAud)).rejects.toThrow(ServiceAuthInvalidError);
    const wrongSub = await rawSign(
      { iss: NEXT_IDENTITY.issuer, aud: NEXT_IDENTITY.audience, sub: "someone-else", jti: FIXED_JTI, iat: FIXED_NOW, exp: FIXED_NOW + 300 },
      CURRENT,
    );
    await expect(svc.verifyNextToken(wrongSub)).rejects.toThrow(ServiceAuthInvalidError);
  });
});

describe("SJWT-FR-007/AC-009 Secret轮换", () => {
  it("签发起始只使用current（previous永不用于签发）", async () => {
    const svc = new ServiceJwt({ current: CURRENT, previous: PREVIOUS }, ctx());
    const token = await svc.signNextToken();
    const currentOnly = new ServiceJwt({ current: CURRENT }, ctx());
    await expect(currentOnly.verifyNextToken(token)).resolves.toBeDefined();
    const previousOnly = new ServiceJwt({ current: PREVIOUS }, ctx());
    await expect(previousOnly.verifyNextToken(token)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("验证依次接受current、previous；previous缺失时不回退", async () => {
    const both = new ServiceJwt({ current: CURRENT, previous: PREVIOUS }, ctx());
    const withCurrent = new ServiceJwt({ current: CURRENT }, ctx());
    const withPrevious = new ServiceJwt({ current: PREVIOUS }, ctx());
    const newToken = await withCurrent.signNextToken();
    const oldToken = await withPrevious.signNextToken();
    const fresh = await both.verifyNextToken(newToken);
    expect(fresh.verifiedBy).toBe("current");
    const old = await both.verifyNextToken(oldToken);
    expect(old.verifiedBy).toBe("previous");
    // previous缺失：旧签名令牌直接失败（无回退尝试）。
    await expect(withCurrent.verifyNextToken(oldToken)).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("规范化claims不暴露使用current还是previous（字段结构一致）", async () => {
    const both = new ServiceJwt({ current: CURRENT, previous: PREVIOUS }, ctx());
    const withPrevious = new ServiceJwt({ current: PREVIOUS }, ctx());
    const oldToken = await withPrevious.signNextToken();
    const result = await both.verifyNextToken(oldToken);
    expect(Object.keys(result.claims).sort()).toEqual(["aud", "exp", "iat", "iss", "jti", "sub"]);
  });
});

describe("SJWT-FR-009/NFR-006 统一错误与零泄漏", () => {
  it("所有失败类别统一抛出ServiceAuthInvalidError且公开消息相同", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const failures: string[] = [
      await svc.signNextToken().then((t) => t.slice(0, -4) + "AAAA"), // 签名错误
      "not-a-jwt", // 格式错误
      "", // 空
    ];
    for (const bad of failures) {
      let caught: unknown;
      try {
        await svc.verifyNextToken(bad);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ServiceAuthInvalidError);
      expect(String((caught as Error).message)).toBe("SERVICE_AUTH_INVALID");
    }
  });

  it("NFR-006: 错误不得包含原始令牌或Secret", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    const token = await svc.signNextToken();
    let caught: unknown;
    try {
      await svc.verifyNextToken(token + "x");
    } catch (e) {
      caught = e;
    }
    const message = String((caught as Error).message);
    expect(message).toBe("SERVICE_AUTH_INVALID");
    expect(message).not.toContain(token);
    expect(message).not.toContain(CURRENT);
    // 内部category用于日志/指标，但不进入公开消息。
    expect((caught as ServiceAuthInvalidError).category).toBeTruthy();
  });
});

describe("FR-006 Bearer解析", () => {
  it("合法Bearer提取令牌（scheme大小写不敏感）", () => {
    expect(extractBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(extractBearerToken("bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("缺失/格式错误返回null（由调用方统一401）", () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken("")).toBeNull();
    expect(extractBearerToken("Basic abc")).toBeNull();
    expect(extractBearerToken("Bearer")).toBeNull();
    expect(extractBearerToken("Bearer ")).toBeNull();
    expect(extractBearerToken("Bearer a b")).toBeNull();
  });
});

describe("SJWT-NFR-004 失败关闭", () => {
  it("损坏的JWT（非两段base64url）不抛未捕获异常，统一401类别", async () => {
    const svc = new ServiceJwt({ current: CURRENT }, ctx());
    for (const bad of ["a.b", "....", "!!!.###.$$$", "eyJhbGciOi.eyJ9.sig"]) {
      let caught: unknown;
      try {
        await svc.verifyNextToken(bad);
      } catch (e) {
        caught = e;
      }
      expect(caught, bad).toBeInstanceOf(ServiceAuthInvalidError);
    }
  });
});
