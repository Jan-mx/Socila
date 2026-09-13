/**
 * SHV2-FR-013/014 / SHV2-AC-012：案例性质与结构化政策来源（API契约，浏览器安全）。
 *
 * - `caseNature`：RCL生成器产出（generator_version以`RCL-GEN-`开头）固定为`synthetic`；
 *   其余（人工维护/历史导入）为`human_curated`，其内容不被强制重写（SHV2-NFR-005）。
 * - `policySources`：只透传形状完整的结构化来源（documentId/title/authority/officialUrl/
 *   locator{type,reference}/excerpt/contentSha256=64位小写hex）；V1不完整evidence
 *   （仅documentId+locator）不得升格为PolicySource（不伪造来源）。
 * - 既有字段一律原样保留（向后兼容）。
 */

export type CaseNature = "synthetic" | "human_curated";

export interface PolicySource {
  documentId: string;
  title: string;
  authority: string;
  officialUrl: string;
  locator: {
    type: string;
    reference: string;
  };
  excerpt: string;
  contentSha256: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function toPolicySource(entry: unknown): PolicySource | null {
  if (entry === null || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const documentId = e.documentId ?? e.document_id;
  const officialUrl = e.officialUrl ?? e.official_url;
  const contentSha256 = e.contentSha256 ?? e.content_sha256;
  const locatorRaw = e.locator;
  if (
    !nonEmptyString(documentId) ||
    !nonEmptyString(e.title) ||
    !nonEmptyString(e.authority) ||
    !nonEmptyString(officialUrl) ||
    !nonEmptyString(e.excerpt) ||
    !nonEmptyString(contentSha256) ||
    !SHA256_HEX.test(contentSha256) ||
    locatorRaw === null ||
    typeof locatorRaw !== "object"
  ) {
    return null;
  }
  const locator = locatorRaw as Record<string, unknown>;
  if (!nonEmptyString(locator.type) || !nonEmptyString(locator.reference)) return null;
  if (!/^https:\/\//.test(officialUrl)) return null;
  return {
    documentId,
    title: e.title as string,
    authority: e.authority as string,
    officialUrl,
    locator: { type: locator.type, reference: locator.reference },
    excerpt: e.excerpt as string,
    contentSha256,
  };
}

/** 结构化来源提取：数组或JSON字符串；不完整条目静默丢弃（不伪造）。 */
export function toPolicySources(evidence: unknown): PolicySource[] {
  let list: unknown = evidence;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  const out: PolicySource[] = [];
  for (const entry of list) {
    const p = toPolicySource(entry);
    if (p) out.push(p);
  }
  return out;
}

export function classifyCaseNature(generatorVersion: unknown): CaseNature {
  return typeof generatorVersion === "string" && generatorVersion.startsWith("RCL-GEN-")
    ? "synthetic"
    : "human_curated";
}

/** 为公开/管理API行附加caseNature与policySources；不修改既有字段。 */
export function decorateShowcaseCase<T extends Record<string, unknown>>(
  row: T,
): T & { caseNature: CaseNature; policySources: PolicySource[] } {
  const generatorVersion = row.generatorVersion ?? row.generator_version;
  return {
    ...row,
    caseNature: classifyCaseNature(generatorVersion),
    policySources: toPolicySources(row.evidence),
  };
}
