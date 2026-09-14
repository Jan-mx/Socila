/**
 * 阶段01.4 契约样本与运行时校验测试（FND-FR-004～007 / FND-AC-005）。
 * 证明：错误码↔状态映射完整、ApiError/RequestContext/IdempotencyMetadata
 * 校验行为符合约定、幂等语义常量存在且 CONFLICT 落在 409。
 */
import { describe, it, expect } from "vitest";
import {
  API_ERROR_CODES,
  API_ERROR_STATUS,
  ApiErrorSchema,
  IdempotencyMetadataSchema,
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_SEMANTICS,
  RequestContextSchema,
  apiError,
  buildRequestContext,
  extractIdempotencyKey,
  getRequestId,
} from "../contracts";

describe("ApiError contract", () => {
  it("covers exactly the 10 mandated HTTP statuses", () => {
    expect(API_ERROR_CODES).toHaveLength(10);
    expect(Object.values(API_ERROR_STATUS).sort((a, b) => a - b)).toEqual([
      400, 401, 403, 404, 409, 413, 422, 429, 500, 503,
    ]);
  });

  it("builds a schema-valid error body with matching status", () => {
    const { status, body } = apiError(
      "VALIDATION_FAILED",
      "出生日期格式非法",
      "req-123",
      { field: "birthDate" },
    );
    expect(status).toBe(422);
    expect(ApiErrorSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      code: "VALIDATION_FAILED",
      message: "出生日期格式非法",
      requestId: "req-123",
      details: { field: "birthDate" },
    });
  });

  it("omits details when not provided", () => {
    const { body } = apiError("NOT_FOUND", "方案不存在", "req-1");
    expect("details" in body).toBe(false);
  });

  it("rejects an error body without requestId", () => {
    expect(
      ApiErrorSchema.safeParse({ code: "X", message: "m" }).success,
    ).toBe(false);
  });
});

describe("RequestContext contract", () => {
  it("reuses X-Request-Id when present and generates one otherwise", () => {
    const req = new Request("https://x/api", {
      headers: { "X-Request-Id": "incoming-1" },
    });
    expect(getRequestId(req)).toBe("incoming-1");
    expect(getRequestId(new Request("https://x/api"))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it("builds a valid context from identity and rejects unknown roles", () => {
    const req = new Request("https://x/api");
    const ctx = buildRequestContext(req, {
      source: "web",
      role: "user",
      actorId: "u1",
    });
    expect(RequestContextSchema.safeParse(ctx).success).toBe(true);
    expect(ctx.source).toBe("web");
    expect(RequestContextSchema.safeParse({ ...ctx, role: "root" }).success).toBe(
      false,
    );
    expect(
      RequestContextSchema.safeParse({ requestId: "r", source: "bot" })
        .success,
    ).toBe(false);
  });
});

describe("Idempotency contract (FND-AC-005)", () => {
  it("extracts the Idempotency-Key header, null when absent", () => {
    const withKey = new Request("https://x/api", {
      method: "POST",
      headers: { [IDEMPOTENCY_HEADER]: "op-42" },
    });
    expect(extractIdempotencyKey(withKey)).toBe("op-42");
    expect(
      extractIdempotencyKey(new Request("https://x/api", { method: "POST" })),
    ).toBeNull();
  });

  it("validates idempotency metadata shape", () => {
    expect(
      IdempotencyMetadataSchema.safeParse({
        key: "op-42",
        operation: "plan.compute",
        createdAt: "2026-01-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      IdempotencyMetadataSchema.safeParse({ key: "", operation: "x" }).success,
    ).toBe(false);
  });

  it("duplicate submissions resolve to first result or 409 only", () => {
    expect(IDEMPOTENCY_SEMANTICS).toBe("first-result-or-409");
    expect(API_ERROR_STATUS.CONFLICT).toBe(409);
  });
});
