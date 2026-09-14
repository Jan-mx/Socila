/**
 * SHV2-FR-016 / SHV2-AC-013：Markdown案例库确定性生成与 --check 对账。
 *
 * 用法：
 *   node node_modules/tsx/dist/cli.mjs scripts/rcl-case-library-v2-doc.ts render --generated <generated-scenarios-v2.json> [--out-md <md>] [--out-manifest <json>]
 *   node node_modules/tsx/dist/cli.mjs scripts/rcl-case-library-v2-doc.ts --check [--md <md>] [--manifest <json>]
 *
 * - render：从 `rcl-case-library.ts generate-v2` 的产物构建manifest（无时间戳）并渲染Markdown，
 *   写入后立即自检（check）；任一不一致退出码2；
 * - --check：读取已提交的md与manifest，重算manifestHash、逐案例contentHash、计数与
 *   Markdown逐字节重渲染对账；任一不一致退出码2（手工修改必须失败）。
 * 本脚本不连接数据库、不读取环境变量中的连接串。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CASE_LIBRARY_DOC_PATH,
  CASE_LIBRARY_MANIFEST_PATH,
  buildCaseLibraryManifest,
  checkCaseLibraryMarkdown,
  renderCaseLibraryMarkdown,
  type CaseLibraryManifestV2,
} from "@/lib/case-governance/case-library-doc";
import type { GeneratedScenarioV2 } from "@/lib/case-governance/generator-v2";

const ROOT = process.cwd();

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}
function out(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function main(): number {
  const mdPath = path.resolve(ROOT, arg("--md") ?? arg("--out-md") ?? CASE_LIBRARY_DOC_PATH);
  const manifestPath = path.resolve(ROOT, arg("--manifest") ?? arg("--out-manifest") ?? CASE_LIBRARY_MANIFEST_PATH);

  if (hasFlag("--check")) {
    if (!existsSync(mdPath) || !existsSync(manifestPath)) {
      out({ ok: false, problems: [`文件缺失：${!existsSync(mdPath) ? mdPath : manifestPath}`] });
      return 2;
    }
    const markdown = readFileSync(mdPath, "utf8");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as CaseLibraryManifestV2;
    const result = checkCaseLibraryMarkdown({ markdown, manifest });
    out({
      mode: "check",
      ok: result.ok,
      caseCount: manifest.caseCount,
      manifestHash: manifest.manifestHash,
      problems: result.problems,
    });
    return result.ok ? 0 : 2;
  }

  const mode = process.argv[2];
  if (mode !== "render") {
    process.stderr.write("用法：rcl-case-library-v2-doc.ts render --generated <json> | --check\n");
    return 1;
  }
  const generatedPath = arg("--generated");
  if (!generatedPath || !existsSync(generatedPath)) {
    process.stderr.write(`render 需要 --generated <generated-scenarios-v2.json>（缺失：${generatedPath ?? "未提供"}）\n`);
    return 1;
  }
  const generated = JSON.parse(readFileSync(generatedPath, "utf8")) as { scenarios: GeneratedScenarioV2[] };
  if (!Array.isArray(generated.scenarios)) {
    process.stderr.write("生成产物缺少 scenarios 数组\n");
    return 1;
  }
  const manifest = buildCaseLibraryManifest(generated.scenarios);
  const markdown = renderCaseLibraryMarkdown(manifest);
  mkdirSync(path.dirname(mdPath), { recursive: true });
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  writeFileSync(mdPath, markdown, "utf8");
  const self = checkCaseLibraryMarkdown({
    markdown: readFileSync(mdPath, "utf8"),
    manifest: JSON.parse(readFileSync(manifestPath, "utf8")) as CaseLibraryManifestV2,
  });
  out({
    mode: "render",
    ok: self.ok,
    caseCount: manifest.caseCount,
    shanghaiCount: manifest.shanghaiCount,
    guangdongCount: manifest.guangdongCount,
    manifestHash: manifest.manifestHash,
    markdownBytes: Buffer.byteLength(markdown, "utf8"),
    mdPath: path.relative(ROOT, mdPath),
    manifestPath: path.relative(ROOT, manifestPath),
    problems: self.problems,
  });
  return self.ok ? 0 : 2;
}

process.exit(main());
