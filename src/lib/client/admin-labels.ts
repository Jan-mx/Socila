const STAGE_LABELS: Record<string, string> = {
  draft: "草稿",
  staging: "预发布",
  prod: "生产",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  staging: "预发布",
  published: "已发布",
  retired: "已停用",
};

const MODULE_LABELS: Record<string, string> = {
  normalization: "规范化",
  retirement: "退休",
  pension: "养老保险",
  medical_insurance: "医疗保险",
  unemployment: "失业保险",
  subsidy: "补贴",
  contribution: "缴费",
  plan: "方案",
  gate: "发布门禁",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  rule: "规则",
  param: "参数",
  rule_set: "规则集",
};

const TEST_SOURCE_LABELS: Record<string, string> = {
  example: "示例",
  regression: "回归",
  import: "导入",
};

const GATE_CHECK_LABELS: Record<string, string> = {
  schema: "结构校验",
  examples: "示例测试",
  regression: "回归测试",
  draft_to_staging: "草稿进入预发布",
  rule_exists: "规则存在性",
  transition: "阶段转换",
  value: "参数值校验",
};

function formatLabel(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value;
}

export function formatAdminStage(value: string): string {
  return formatLabel(STAGE_LABELS, value);
}

export function formatAdminStatus(value: string): string {
  return formatLabel(STATUS_LABELS, value);
}

export function formatAdminModule(value: string): string {
  return formatLabel(MODULE_LABELS, value);
}

export function formatAdminEntityType(value: string): string {
  return formatLabel(ENTITY_TYPE_LABELS, value);
}

export function formatAdminTestSource(value: string): string {
  return formatLabel(TEST_SOURCE_LABELS, value);
}

export function formatAdminGateCheck(value: string): string {
  return formatLabel(GATE_CHECK_LABELS, value);
}
