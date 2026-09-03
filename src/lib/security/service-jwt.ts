/**
 * Core↔Agent 服务JWT（09-03 SJWT，ADR-0005）：固定HS256内部服务令牌。
 *
 * 协议常量（PRD §6.1）：
 * - 仅允许HS256；Header必须alg=HS256且typ=JWT（拒绝none/其他算法/缺失typ/算法混淆）。
 * - TTL固定300秒（exp=iat+300）；时钟偏差最多30秒。
 * - Next→Agent：iss=ssp-next-core、aud=policy-agent、sub=next-core。
 * - Agent→Core：iss=policy-agent、aud=ssp-next-core、sub=agent-runtime。
 *
 * 安全约束（NFR-001～006）：
 * - 验证显式固定算法列表，不按令牌Header动态选择算法。
 * - 验证依次尝试current、previous；签发只使用current；失败统一
 *   ServiceAuthInvalidError（公开消息恒为SERVICE_AUTH_INVALID，不区分失败原因，
 *   不暴露匹配了哪个Secret）；category仅供内部日志/指标。
 * - 异常与返回值不得包含原始令牌、Header、Secret或签名片段。
 * - Clock/UUID可注入（NFR-005），生产默认系统时钟与crypto.randomUUID。
 */
import { SignJWT, jwtVerify } from "jose";

export const SERVICE_JWT_TTL_SECONDS = 300;
export const SERVICE_JWT_CLOCK_SKEW_SECONDS = 30;

/** Next Core签发、FastAPI验证的固定身份（SJWT-FR-004）。 */
export const NEXT_IDENTITY = {
  issuer: "ssp-next-core",
  audience: "policy-agent",
  subject: "next-core",
} as const;

/** Agent签发、Next Core验证的固定身份（SJWT-FR-005）。 */
export const AGENT_IDENTITY = {
  issuer: "policy-agent",
  audience: "ssp-next-core",
  subject: "agent-runtime",
} as const;

export type ServiceJwtDirection = "next-to-agent" | "agent-to-core";

/** 规范化claims（SJWT §8.2）：只向业务层传递这些字段。 */
export interface ServiceJwtClaims {
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface ServiceJwtVerification {
  claims: ServiceJwtClaims;
  /** 仅内部指标使用（previous命中）；不得写入响应或客户端可见日志。 */
  verifiedBy: "current" | "previous";
}

/** 可注入边界（SJWT-NFR-005）：now为Unix秒（整数），uuid为UUID v4字符串。 */
export interface ServiceJwtContext {
  now: () => number;
  uuid: () => string;
}

/** 统一服务鉴权失败（SJWT-FR-009）：HTTP 401 SERVICE_AUTH_INVALID。 */
export class ServiceAuthInvalidError extends Error {
  constructor(public readonly category: string) {
    super("SERVICE_AUTH_INVALID");
    this.name = "ServiceAuthInvalidError";
  }
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IDENTITY_BY_DIRECTION: Record<ServiceJwtDirection, (typeof NEXT_IDENTITY | typeof AGENT_IDENTITY)> = {
  "next-to-agent": NEXT_IDENTITY,
  "agent-to-core": AGENT_IDENTITY,
};

function systemContext(): ServiceJwtContext {
  return {
    now: () => Math.floor(Date.now() / 1000),
    uuid: () => crypto.randomUUID(),
  };
}

/**
 * SJWT-FR-001/NFR-003/AC-010 配置校验：
 * current必填且不少于32 UTF-8字节；previous可选，提供时必须合法（不少于32字节）
 * 且不得与current相同。失败即启动失败路径（抛错，消息不含Secret内容）。
 */
export function validateServiceJwtSecrets(
  current: string | null | undefined,
  previous: string | null | undefined = undefined,
): void {
  if (typeof current !== "string" || current.length === 0) {
    throw new Error("AGENT_SERVICE_JWT_CURRENT is required");
  }
  if (new TextEncoder().encode(current).length < 32) {
    throw new Error("AGENT_SERVICE_JWT_CURRENT must be at least 32 UTF-8 bytes");
  }
  if (previous != null && previous !== "") {
    if (new TextEncoder().encode(previous).length < 32) {
      throw new Error("AGENT_SERVICE_JWT_PREVIOUS must be at least 32 UTF-8 bytes");
    }
    if (previous === current) {
      throw new Error("AGENT_SERVICE_JWT_PREVIOUS must differ from AGENT_SERVICE_JWT_CURRENT");
    }
  }
}

/** SJWT-FR-006：解析Authorization Bearer令牌；缺失或格式错误返回null。 */
export function extractBearerToken(authorization: string | null): string | null {
  if (typeof authorization !== "string") return null;
  const match = /^Bearer[ \t]+([^\s]+)$/i.exec(authorization);
  return match ? match[1] : null;
}

export class ServiceJwt {
  private readonly secrets: { current: string; previous?: string };
  private readonly ctx: ServiceJwtContext;

  constructor(
    secrets: { current: string; previous?: string | null },
    context?: ServiceJwtContext,
  ) {
    validateServiceJwtSecrets(secrets.current, secrets.previous);
    this.secrets = {
      current: secrets.current,
      previous: secrets.previous ?? undefined,
    };
    this.ctx = context ?? systemContext();
  }

  /** SJWT-FR-007：签发只使用current；jti每次新生成。 */
  async signNextToken(): Promise<string> {
    return this.sign("next-to-agent");
  }

  /** SJWT-FR-007：签发只使用current；jti每次新生成。 */
  async signAgentToken(): Promise<string> {
    return this.sign("agent-to-core");
  }

  async verifyNextToken(token: string): Promise<ServiceJwtVerification> {
    return this.verify(token, "next-to-agent");
  }

  async verifyAgentToken(token: string): Promise<ServiceJwtVerification> {
    return this.verify(token, "agent-to-core");
  }

  private async sign(direction: ServiceJwtDirection): Promise<string> {
    const identity = IDENTITY_BY_DIRECTION[direction];
    const iat = this.ctx.now();
    const jti = this.ctx.uuid();
    return new SignJWT({
      iss: identity.issuer,
      aud: identity.audience,
      sub: identity.subject,
      jti,
      iat,
      exp: iat + SERVICE_JWT_TTL_SECONDS,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .sign(new TextEncoder().encode(this.secrets.current));
  }

  /**
   * 验证顺序（SJWT §6.4）：固定Header→签名(current→previous)→固定claims→
   * jti UUID v4→TTL=300→时钟偏差。任一失败统一ServiceAuthInvalidError；
   * 返回的规范化claims与verifiedBy不改变对外响应（previous命中仅内部指标）。
   */
  private async verify(
    token: string,
    direction: ServiceJwtDirection,
  ): Promise<ServiceJwtVerification> {
    const identity = IDENTITY_BY_DIRECTION[direction];
    const candidates: Array<{ secret: string; source: "current" | "previous" }> = [
      { secret: this.secrets.current, source: "current" },
    ];
    if (this.secrets.previous) {
      candidates.push({ secret: this.secrets.previous, source: "previous" });
    }
    for (const { secret, source } of candidates) {
      const claims = await this.attemptVerify(token, secret, identity);
      if (claims) return { claims, verifiedBy: source };
    }
    throw new ServiceAuthInvalidError("verification-failed");
  }

  /** 单Secret尝试：成功返回规范化claims；任何失败返回null（由上层统一归类）。 */
  private async attemptVerify(
    token: string,
    secret: string,
    identity: { issuer: string; audience: string; subject: string },
  ): Promise<ServiceJwtClaims | null> {
    if (typeof token !== "string" || token.split(".").length !== 3) return null;
    // 固定Header检查（SJWT-FR-002）：在验签前拒绝none/其他算法/缺失typ。
    let header: { alg?: unknown; typ?: unknown };
    try {
      const [headerB64] = token.split(".");
      const decoded = Buffer.from(headerB64, "base64url").toString("utf8");
      const parsed: unknown = JSON.parse(decoded);
      if (typeof parsed !== "object" || parsed === null) return null;
      header = parsed as { alg?: unknown; typ?: unknown };
    } catch {
      return null;
    }
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    let payload: { [key: string]: unknown };
    try {
      // jose负责签名验证（显式HS256）与iss/aud/sub；exp/nbf期限经currentDate
      // 绑定注入时钟（SJWT-NFR-005），避免库内真实时钟绕过注入边界；
      // iat与固定TTL在下方用同一时钟手工校验。
      const verified = await jwtVerify(token, new TextEncoder().encode(secret), {
        algorithms: ["HS256"],
        issuer: identity.issuer,
        audience: identity.audience,
        subject: identity.subject,
        currentDate: new Date(this.ctx.now() * 1000),
        clockTolerance: SERVICE_JWT_CLOCK_SKEW_SECONDS,
      });
      payload = verified.payload as { [key: string]: unknown };
    } catch {
      return null;
    }

    const { jti, iat, exp } = payload as { jti?: unknown; iat?: unknown; exp?: unknown };
    if (
      typeof jti !== "string" ||
      !UUID_V4_RE.test(jti) ||
      typeof iat !== "number" ||
      !Number.isInteger(iat) ||
      typeof exp !== "number" ||
      !Number.isInteger(exp)
    ) {
      return null;
    }
    // SJWT-FR-003/NFR-002：TTL固定300秒，不允许额外放宽。
    if (exp - iat !== SERVICE_JWT_TTL_SECONDS) return null;
    const now = this.ctx.now();
    if (iat > now + SERVICE_JWT_CLOCK_SKEW_SECONDS) return null;
    if (exp < now - SERVICE_JWT_CLOCK_SKEW_SECONDS) return null;
    return {
      iss: identity.issuer,
      aud: identity.audience,
      sub: identity.subject,
      jti,
      iat,
      exp,
    };
  }
}
