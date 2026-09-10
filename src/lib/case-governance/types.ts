/**
 * 案例库治理公共类型（RCL-FR-006/007/015/017）。
 */

export type CaseQualityStatus = "eligible" | "active" | "archive_candidate" | "quarantined";
export type ShowcaseQualityStatus = "selected" | "archive_candidate" | "quarantined";

export const SHANGHAI_JURISDICTION = "310000";
export const CURATION_ALGORITHM_VERSION = "RCL-GEN-1.0";

export type CaseArchiveBatchStatus =
  | "prepared"
  | "restore_verified"
  | "applying"
  | "applied"
  | "rolled_back";
