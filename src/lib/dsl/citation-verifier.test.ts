/**
 * SHV2 引用反例（PRD §15 引用反例行）：缺原件、SHA错误、URL错误、摘录不存在
 * 必须稳定失败（fail-closed），且错误信息可定位到document_id。
 * 验证器已存在，本文件为验证先行的专门反例覆盖（TESTING.md“验证先行”条款）。
 */
import { describe, it, expect } from "vitest";
import { verifyEvidenceIntegrity, type EvidenceEntry } from "./citation-verifier";

const ARTIFACT = "docs/evidence/310000/DOC-X/original.html";
const META = "docs/evidence/310000/DOC-X/meta.json";
const TEXT = "docs/evidence/310000/DOC-X/extracted-text.txt";

function fs(files: Record<string, string>) {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/repo\//, "");
  return {
    repoRoot: "/repo",
    exists: (p: string) => norm(p) in files,
    readFile: (p: string) => {
      const key = norm(p);
      if (!(key in files)) throw new Error(`missing ${key}`);
      return files[key];
    },
  };
}

const goodMeta = JSON.stringify({
  docId: "DOC-X",
  sha256: "a".repeat(64),
  officialUrl: "https://rsj.sh.gov.cn/x.html",
});

const entry: EvidenceEntry = {
  document_id: "DOC-X",
  jurisdiction_code: "310000",
  official_url: "https://rsj.sh.gov.cn/x.html",
  content_sha256: "a".repeat(64),
  artifact: ARTIFACT,
  excerpt: "自2026年7月1日起执行",
};

describe("引用验证器反例（SHV2 §15）", () => {
  it("完整证据通过", () => {
    const r = verifyEvidenceIntegrity([entry], fs({ [ARTIFACT]: "<html/>", [META]: goodMeta, [TEXT]: "本通知自2026年7月1日起执行。" }));
    expect(r).toEqual({ verified: true, errors: [], checked: 1 });
  });

  it("缺原件→失败并指明document_id", () => {
    const r = verifyEvidenceIntegrity([entry], fs({ [META]: goodMeta, [TEXT]: "自2026年7月1日起执行" }));
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.startsWith("DOC-X") && /原件缺失/.test(e))).toBe(true);
  });

  it("SHA错误→失败", () => {
    const r = verifyEvidenceIntegrity(
      [{ ...entry, content_sha256: "b".repeat(64) }],
      fs({ [ARTIFACT]: "<html/>", [META]: goodMeta, [TEXT]: "自2026年7月1日起执行" }),
    );
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => /content_sha256/.test(e))).toBe(true);
  });

  it("URL错误→失败", () => {
    const r = verifyEvidenceIntegrity(
      [{ ...entry, official_url: "https://rsj.sh.gov.cn/other.html" }],
      fs({ [ARTIFACT]: "<html/>", [META]: goodMeta, [TEXT]: "自2026年7月1日起执行" }),
    );
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => /official_url/.test(e))).toBe(true);
  });

  it("摘录不存在于原文→失败（防伪造引用）", () => {
    const r = verifyEvidenceIntegrity(
      [{ ...entry, excerpt: "这段话不在原文里" }],
      fs({ [ARTIFACT]: "<html/>", [META]: goodMeta, [TEXT]: "自2026年7月1日起执行" }),
    );
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => /摘录未在原文中找到/.test(e))).toBe(true);
  });

  it("缺extracted-text/meta.json→失败", () => {
    const r = verifyEvidenceIntegrity([entry], fs({ [ARTIFACT]: "<html/>" }));
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => /meta.json缺失/.test(e))).toBe(true);
    expect(r.errors.some((e) => /extracted-text 缺失/.test(e))).toBe(true);
  });
});
