import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function listTypeScriptFiles(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const child = join(path, entry);
    return statSync(child).isDirectory()
      ? listTypeScriptFiles(child)
      : child.endsWith(".ts")
        ? [child]
        : [];
  });
}

const userVisibleErrorFiles = [
  ...listTypeScriptFiles(resolve(process.cwd(), "src/app/api/admin")),
  ...listTypeScriptFiles(resolve(process.cwd(), "src/app/api/plan")),
  resolve(process.cwd(), "src/lib/admin/publish-service.ts"),
];

const knownEnglishErrorPrefix =
  /\b(?:Failed|Invalid|Missing|Unknown|Unsupported|Only|No regression|Rule not|Param not|Plan not|Regression run failed)\b/;

describe("user-visible API copy", () => {
  it.each(userVisibleErrorFiles)("uses Chinese errors in %s", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(knownEnglishErrorPrefix);
  });
});
