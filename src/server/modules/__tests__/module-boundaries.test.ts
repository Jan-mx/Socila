/**
 * 步骤02.1 模块边界扫描（CORE-FR-001～003）。
 *
 * 扫描 src/server/modules 下全部源文件的 import 说明符：
 * 1. 所有层禁止 next/*、react、react-dom、@ai-sdk/*、ai —— 领域模块与框架解耦；
 * 2. domain/ 层额外禁止 drizzle-orm、pg 与 src/lib/db —— 领域纯净性。
 * 依赖规则全文见 src/server/modules/README.md。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const MODULES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx)$/i;

/** 所有层禁止的导入前缀/精确名。 */
const FORBIDDEN_ALL: Array<{ pattern: string; match: (spec: string) => boolean }> =
  [
    { pattern: "next/*", match: (s) => s === "next" || s.startsWith("next/") },
    { pattern: "react", match: (s) => s === "react" || s.startsWith("react/") },
    { pattern: "react-dom", match: (s) => s.startsWith("react-dom") },
    { pattern: "@ai-sdk/*", match: (s) => s.startsWith("@ai-sdk/") },
    { pattern: "ai", match: (s) => s === "ai" || s.startsWith("ai/") },
  ];

/** domain 层额外禁止：数据库与驱动。 */
const FORBIDDEN_DOMAIN = [
  { pattern: "drizzle-orm", match: (s: string) => s.startsWith("drizzle-orm") },
  { pattern: "pg", match: (s: string) => s === "pg" || s.startsWith("pg/") },
];

/** import/export ... from "x"、import "x"、import("x")、require("x")。 */
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walkFiles(full);
    else if (SOURCE_EXT.test(entry)) yield full;
  }
}

function isBareModulePath(spec: string): boolean {
  return spec.startsWith("@/lib/db") || /(^|\.)lib\/db/.test(spec);
}

describe("module boundaries (src/server/modules)", () => {
  const files = [...walkFiles(MODULES_DIR)];

  it("discovers the nine module skeletons", () => {
    const modules = readdirSync(MODULES_DIR).filter(
      (d) => d !== "__tests__" && statSync(path.join(MODULES_DIR, d)).isDirectory(),
    );
    expect(modules.sort()).toEqual([
      "agent-integration",
      "audit",
      "conversation",
      "identity",
      "jurisdiction",
      "planning",
      "policy",
      "publishing",
      "rules",
    ]);
  });

  it("forbids framework and AI SDK imports in every layer", () => {
    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const m of content.matchAll(IMPORT_RE)) {
        const spec = m[1];
        for (const rule of FORBIDDEN_ALL) {
          if (rule.match(spec)) {
            violations.push(
              `${path.relative(MODULES_DIR, file)} -> ${spec} (rule: ${rule.pattern})`,
            );
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("forbids database imports in domain layers", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(MODULES_DIR, file).replace(/\\/g, "/");
      if (!rel.includes("/domain/")) continue;
      const content = readFileSync(file, "utf8");
      for (const m of content.matchAll(IMPORT_RE)) {
        const spec = m[1];
        for (const rule of FORBIDDEN_DOMAIN) {
          if (rule.match(spec)) {
            violations.push(`${rel} -> ${spec} (rule: ${rule.pattern})`);
          }
        }
        if (isBareModulePath(spec) || spec.includes("lib/db")) {
          violations.push(`${rel} -> ${spec} (rule: src/lib/db)`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
