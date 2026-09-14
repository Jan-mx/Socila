/**
 * 政策引用完整性校验（NRP-FR-002/004、JRP-FR-007 激活门禁）。
 *
 * 从 `citation-contract.test.ts` 提取的可复用运行时校验：每条 evidence 必须——
 * 1) 指向仓库内存在的原件 artifact（original.html）与 meta.json；
 * 2) meta.json 的 sha256 与条目 content_sha256 一致；
 * 3) excerpt 经空白归一化后逐字出现在 extracted-text.txt 中（摘录=原文）；
 * 4) official_url 与 meta.json 记录一致。
 *
 * 激活门禁用本模块对候选快照成员逐条重验（JRP-AC-007：真实执行引用门禁，
 * 伪造 pass 不能绕过）；文件系统访问经端口注入以便单元测试与隔离演练。
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export interface EvidenceEntry {
  document_id?: string;
  jurisdiction_code?: string;
  official_url?: string;
  content_sha256?: string;
  artifact?: string;
  excerpt?: string;
  [key: string]: unknown;
}

export interface CitationVerificationResult {
  verified: boolean;
  errors: string[];
  checked: number;
}

export interface CitationVerifierDeps {
  /** 仓库根（默认 process.cwd()）。 */
  repoRoot?: string;
  /** 文件读取（测试注入）。 */
  readFile?: (p: string) => string;
  /** 文件存在性（测试注入）。 */
  exists?: (p: string) => boolean;
}

/** 空白归一化（与 citation-contract 一致）。 */
export function normalizeCitationText(text: string): string {
  return text.replace(/\s+/g, "");
}

/** 递归收集对象树中的全部 evidence 条目。 */
export function collectEvidenceEntries(
  value: unknown,
  out: EvidenceEntry[] = [],
): EvidenceEntry[] {
  if (Array.isArray(value)) {
    for (const v of value) collectEvidenceEntries(v, out);
    return out;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (
      typeof obj.document_id === "string" &&
      typeof obj.content_sha256 === "string" &&
      typeof obj.excerpt === "string"
    ) {
      out.push(obj as unknown as EvidenceEntry);
    }
    for (const v of Object.values(obj)) collectEvidenceEntries(v, out);
  }
  return out;
}

/**
 * 校验一批 evidence 条目全部可回溯到抓取原件且摘录逐字一致。
 * 任一条目不满足即 verified=false 并列出全部错误（fail-closed）。
 */
export function verifyEvidenceIntegrity(
  entries: EvidenceEntry[],
  deps: CitationVerifierDeps = {},
): CitationVerificationResult {
  const repoRoot = deps.repoRoot ?? process.cwd();
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const exists = deps.exists ?? ((p: string) => existsSync(p));

  const errors: string[] = [];
  let checked = 0;

  for (const e of entries) {
    const artifact = e.artifact;
    const documentId = e.document_id ?? "unknown";
    if (!artifact) {
      errors.push(`${documentId}: evidence 缺少 artifact 路径`);
      continue;
    }
    checked++;
    const metaPath = path.join(repoRoot, path.dirname(artifact), "meta.json");
    const originalPath = path.join(repoRoot, artifact);
    const extractedPath = path.join(
      repoRoot,
      path.dirname(artifact),
      "extracted-text.txt",
    );

    if (!exists(originalPath)) {
      errors.push(`${documentId}: 原件缺失 ${artifact}`);
    }
    if (!exists(metaPath)) {
      errors.push(`${documentId}: meta.json缺失`);
    } else {
      const meta = JSON.parse(readFile(metaPath)) as {
        docId?: string;
        sha256?: string;
        officialUrl?: string;
      };
      if (meta.docId !== e.document_id) {
        errors.push(`${documentId}: meta.docId 不一致`);
      }
      if (meta.sha256 !== e.content_sha256) {
        errors.push(`${documentId}: content_sha256 与 meta.json 不一致`);
      }
      if (e.official_url && e.official_url !== meta.officialUrl) {
        errors.push(`${documentId}: official_url 与 meta.json 不一致`);
      }
    }
    if (!exists(extractedPath)) {
      errors.push(`${documentId}: extracted-text 缺失`);
    } else if (e.excerpt) {
      const extracted = readFile(extractedPath);
      if (!normalizeCitationText(extracted).includes(normalizeCitationText(e.excerpt))) {
        errors.push(
          `${documentId}: 摘录未在原文中找到（防伪造引用）: ${e.excerpt.slice(0, 60)}…`,
        );
      }
    }
  }

  return { verified: errors.length === 0, errors, checked };
}