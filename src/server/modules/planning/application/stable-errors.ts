/**
 * 任务3（JRP §8.4）地区感知规划稳定错误。
 *
 * 每个错误携带稳定错误码；路由层据此映射固定 HTTP 状态与响应体。
 * 错误响应不得泄露候选规则、数据库或内部版本细节（JRP §8.4）。
 */

export class JurisdictionRequiredError extends Error {
  constructor() {
    super("JURISDICTION_REQUIRED");
    this.name = "JurisdictionRequiredError";
  }
}

export class InvalidInputError extends Error {
  constructor() {
    super("INVALID_INPUT");
    this.name = "InvalidInputError";
  }
}

export class JurisdictionInvalidError extends Error {
  constructor() {
    super("JURISDICTION_INVALID");
    this.name = "JurisdictionInvalidError";
  }
}

export class JurisdictionUnsupportedError extends Error {
  constructor() {
    super("JURISDICTION_UNSUPPORTED");
    this.name = "JurisdictionUnsupportedError";
  }
}

export class PolicySnapshotUnavailableError extends Error {
  constructor() {
    super("POLICY_SNAPSHOT_UNAVAILABLE");
    this.name = "PolicySnapshotUnavailableError";
  }
}

export class PolicyConflictError extends Error {
  constructor() {
    super("POLICY_CONFLICT");
    this.name = "PolicyConflictError";
  }
}

export class JurisdictionContextMismatchError extends Error {
  constructor() {
    super("JURISDICTION_CONTEXT_MISMATCH");
    this.name = "JurisdictionContextMismatchError";
  }
}

export class PolicyStoreUnavailableError extends Error {
  constructor() {
    super("POLICY_STORE_UNAVAILABLE");
    this.name = "PolicyStoreUnavailableError";
  }
}

/** 稳定错误 → HTTP 状态映射（JRP §8.4 错误表）。 */
export const JURISDICTION_ERROR_STATUS: Record<string, number> = {
  JURISDICTION_REQUIRED: 400,
  INVALID_INPUT: 400,
  JURISDICTION_INVALID: 422,
  JURISDICTION_UNSUPPORTED: 422,
  POLICY_SNAPSHOT_UNAVAILABLE: 409,
  POLICY_CONFLICT: 409,
  JURISDICTION_CONTEXT_MISMATCH: 409,
  POLICY_STORE_UNAVAILABLE: 503,
};
