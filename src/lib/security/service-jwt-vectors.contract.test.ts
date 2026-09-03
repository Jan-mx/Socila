/**
 * SJWT双栈契约互验（PRD §12交付物，SJWT-FR-004~006/009、AC-015/016）：
 * Node实现验证 testdata/service-jwt-vectors.json 中全部Python签发固定向量
 * （两方向 × current/previous，claims精确匹配、verifiedBy正确），
 * 并拒绝跨方向/alg=none/已过期拒绝向量；同时验证Node自签向量满足同一固定协议
 * （对称方向由Python契约测试 test_service_jwt_vectors.py 覆盖）。
 *
 * 向量为测试专用固定值（非生产Secret）；固定时钟与向量生成时刻一致（NFR-005）。
 * 纯文件读取+密码学验证，无数据库/网络依赖，运行于单元套件。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  AGENT_IDENTITY,
  NEXT_IDENTITY,
  ServiceAuthInvalidError,
  ServiceJwt,
} from "./service-jwt";

interface IdentityTriple {
  iss: string;
  aud: string;
  sub: string;
}

interface SignedBlock {
  fixedNow: number;
  tokens: Record<string, string>;
  jtis: Record<string, string>;
}

const here = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(here, "../../../testdata/service-jwt-vectors.json"), "utf8"),
) as {
  protocol: { algorithm: string; ttlSeconds: number; clockSkewSeconds: number };
  identities: { nextToAgent: IdentityTriple; agentToCore: IdentityTriple };
  testSecrets: { current: string; previous: string };
  fixedNow: number;
  nodeSigned: SignedBlock;
  pythonSigned: SignedBlock;
  rejectVectors: Record<string, string>;
};

const fixedNow = vectors.fixedNow;
const ttl = vectors.protocol.ttlSeconds;
// 验证器：固定时钟=向量生成时刻；uuid仅签发使用，此处为占位（必须UUID v4形式）。
const svc = new ServiceJwt(
  { current: vectors.testSecrets.current, previous: vectors.testSecrets.previous },
  { now: () => fixedNow, uuid: () => "00000000-0000-4000-8000-000000000001" },
);

function expectExactClaims(
  claims: { iss: string; aud: string; sub: string; jti: string; iat: number; exp: number },
  identity: IdentityTriple,
  jti: string,
): void {
  expect(claims).toEqual({
    iss: identity.iss,
    aud: identity.aud,
    sub: identity.sub,
    jti,
    iat: fixedNow,
    exp: fixedNow + ttl,
  });
}

describe("SJWT契约：向量文件协议常量与模块同源", () => {
  it("identities与模块固定身份一致（防向量与实现漂移）", () => {
    expect(vectors.identities.nextToAgent).toEqual({
      iss: NEXT_IDENTITY.issuer,
      aud: NEXT_IDENTITY.audience,
      sub: NEXT_IDENTITY.subject,
    });
    expect(vectors.identities.agentToCore).toEqual({
      iss: AGENT_IDENTITY.issuer,
      aud: AGENT_IDENTITY.audience,
      sub: AGENT_IDENTITY.subject,
    });
    expect(vectors.protocol.algorithm).toBe("HS256");
    expect(ttl).toBe(300);
    expect(vectors.fixedNow).toBe(1_760_000_000);
  });
});

describe("SJWT契约：Node验证Python签发向量（SJWT-FR-004/005/007/009）", () => {
  it("pythonSigned.nextCurrent → Next→Agent方向、current命中、claims精确", async () => {
    const result = await svc.verifyNextToken(vectors.pythonSigned.tokens.nextCurrent);
    expect(result.verifiedBy).toBe("current");
    expectExactClaims(
      result.claims,
      vectors.identities.nextToAgent,
      vectors.pythonSigned.jtis.nextCurrent,
    );
  });

  it("pythonSigned.agentCurrent → Agent→Core方向、current命中、claims精确", async () => {
    const result = await svc.verifyAgentToken(vectors.pythonSigned.tokens.agentCurrent);
    expect(result.verifiedBy).toBe("current");
    expectExactClaims(
      result.claims,
      vectors.identities.agentToCore,
      vectors.pythonSigned.jtis.agentCurrent,
    );
  });

  it("pythonSigned.nextPrevious → previous命中（仅内部指标，claims结构不变）", async () => {
    const result = await svc.verifyNextToken(vectors.pythonSigned.tokens.nextPrevious);
    expect(result.verifiedBy).toBe("previous");
    expectExactClaims(
      result.claims,
      vectors.identities.nextToAgent,
      vectors.pythonSigned.jtis.nextPrevious,
    );
  });

  it("pythonSigned.agentPrevious → previous命中", async () => {
    const result = await svc.verifyAgentToken(vectors.pythonSigned.tokens.agentPrevious);
    expect(result.verifiedBy).toBe("previous");
    expectExactClaims(
      result.claims,
      vectors.identities.agentToCore,
      vectors.pythonSigned.jtis.agentPrevious,
    );
  });
});

describe("SJWT契约：Node自签向量满足同一固定协议（Python侧对称验证）", () => {
  it("nodeSigned四向量在正确方向通过且verifiedBy正确", async () => {
    const nextCurrent = await svc.verifyNextToken(vectors.nodeSigned.tokens.nextCurrent);
    expect(nextCurrent.verifiedBy).toBe("current");
    expectExactClaims(
      nextCurrent.claims,
      vectors.identities.nextToAgent,
      vectors.nodeSigned.jtis.nextCurrent,
    );
    const agentCurrent = await svc.verifyAgentToken(vectors.nodeSigned.tokens.agentCurrent);
    expect(agentCurrent.verifiedBy).toBe("current");
    expectExactClaims(
      agentCurrent.claims,
      vectors.identities.agentToCore,
      vectors.nodeSigned.jtis.agentCurrent,
    );
    const nextPrevious = await svc.verifyNextToken(vectors.nodeSigned.tokens.nextPrevious);
    expect(nextPrevious.verifiedBy).toBe("previous");
    const agentPrevious = await svc.verifyAgentToken(vectors.nodeSigned.tokens.agentPrevious);
    expect(agentPrevious.verifiedBy).toBe("previous");
  });
});

describe("SJWT契约：拒绝向量在Node侧统一拒绝（ServiceAuthInvalidError）", () => {
  it("跨方向令牌拒绝：Agent身份不能通过Next验证，反之亦然", async () => {
    // rejectVectors中的显式跨方向向量（Python签发的Agent令牌按Next方向验证）。
    await expect(
      svc.verifyNextToken(vectors.rejectVectors.wrongDirectionAgentAsNext),
    ).rejects.toThrow(ServiceAuthInvalidError);
    // Node签发的Next令牌按Agent方向验证。
    await expect(
      svc.verifyAgentToken(vectors.rejectVectors.wrongDirectionNextAsAgent),
    ).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("alg=none令牌拒绝（两方向）", async () => {
    await expect(
      svc.verifyNextToken(vectors.rejectVectors.algNoneToken),
    ).rejects.toThrow(ServiceAuthInvalidError);
    await expect(
      svc.verifyAgentToken(vectors.rejectVectors.algNoneToken),
    ).rejects.toThrow(ServiceAuthInvalidError);
  });

  it("已过期令牌拒绝（exp早于now-30秒，两方向）", async () => {
    await expect(
      svc.verifyNextToken(vectors.rejectVectors.expiredToken),
    ).rejects.toThrow(ServiceAuthInvalidError);
    await expect(
      svc.verifyAgentToken(vectors.rejectVectors.expiredToken),
    ).rejects.toThrow(ServiceAuthInvalidError);
  });
});
