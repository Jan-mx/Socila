/**
 * 案例库治理公共类型（CLG-FR-002/003/006/008/013，09-05-feature-case-library-governance）。
 */

export type CaseQualityStatus = "eligible" | "active" | "archive_candidate" | "quarantined";
export type ShowcaseQualityStatus = "selected" | "archive_candidate" | "quarantined";
export type EmploymentStatus = "employed" | "flexible" | "unemployed";
export type BirthYearBand = "before_1970" | "1970_1979" | "from_1980";

export const SHANGHAI_JURISDICTION = "310000";
export const CURATION_ALGORITHM_VERSION = "CLG-CURATION-1.0";

/** 评分/策展/资格共用的展示案例候选（去标识化字段，不携带原始正文进入报告）。 */
export interface ShowcaseCandidateRecord {
  /** 展示案例UID（保留-01后缀）。 */
  caseUid: string;
  /** 归一化后的来源案例UID（去除末尾两位序号）。 */
  sourceCaseUid: string;
  gender: string;
  birthYear: number;
  /** employed/flexible/unemployed；unknown等视为不明确。 */
  employmentStatus: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  /** 来源转录长度（用于>=100字符门槛）。 */
  transcriptLength: number;
  sourceFile: string | null;
  /** 案例原始正文（仅用于占位符/身份泄漏检查，绝不写入日志、报告或Git）。 */
  caseText: string | null;
  /** 公开文本（userMessage + aiResponse）。 */
  publicText: string;
  /** 需要从公开文本中排除的身份token（creator、videoId等）。 */
  identityTokens: string[];
  /** 候选快照重放比较结果；null表示未执行重放（不参与资格判定）。 */
  replay: ReplayComparison | null;
  /** 评分总分（策展排序键），由调用方在评分后写入。 */
  qualityScore?: number;
}

export interface ReplayComparison {
  match: boolean;
  differences: string[];
}

/** 逐项评分明细：四维权重固定为40/30/20/10（CLG-FR-006）。 */
export interface ScoreBreakdown {
  inputCompleteness: number;
  expectedCompleteness: number;
  sourceEvidence: number;
  snapshotReplay: number;
  total: number;
  /** 逐项原因；任何扣分或满分都有对应说明（禁止只有总分）。 */
  reasons: string[];
}

export interface EligibilityCheck {
  eligible: boolean;
  reasons: string[];
}

export interface SelectionEntry {
  caseUid: string;
  qualityScore: number;
  layer: {
    gender: string;
    birthYearBand: BirthYearBand;
    employmentStatus: EmploymentStatus;
  };
  reason: string;
}

export interface SwapRecord {
  out: string;
  in: string;
  reason: string;
}

export interface CurationReport {
  ok: boolean;
  /** 最终36条顺序（CLG-NFR-002：重复运行完全一致）。 */
  selected: string[];
  entries: SelectionEntry[];
  swaps: SwapRecord[];
  quotas: Record<string, number>;
  /** 无法满足时列出未满足约束。 */
  violations: string[];
  algorithmVersion: string;
}

export interface GovernanceManifestInput {
  algorithmVersion: string;
  caseUids: string[];
  regressionCaseUids: Set<string>;
  showcaseRows: Array<{ caseUid: string; sourceCaseUid: string }>;
  /** 策展选中的36条展示UID（audit后确定，用于计算删除集合）。 */
  curatedShowcaseUids: string[];
  testCount: number;
  regressionTestCount: number;
  exampleTestCount: number;
}

export interface GovernanceManifest {
  algorithmVersion: string;
  sourceCounts: {
    cases: number;
    regressionCases: number;
    showcaseCases: number;
    showcaseSourceCases: number;
    tests: number;
    regressionTests: number;
    exampleTests: number;
  };
  retainedCaseUids: string[];
  deletedCaseUids: string[];
  deletedShowcaseUids: string[];
  retainedCounts: { cases: number; showcaseCases: number; tests: number };
  deletedCounts: { cases: number; showcaseCases: number };
  manifestHash: string;
  createdAt: string;
}

export type CaseArchiveBatchStatus = "prepared" | "restore_verified" | "applied" | "rolled_back";
