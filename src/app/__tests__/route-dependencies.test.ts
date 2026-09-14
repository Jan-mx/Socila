/**
 * CORE-AC-001 自动化门禁：src/app 下任何 Route Handler / 服务端代码
 * 不得直接导入数据库实例（@/lib/db）或 Schema（@/lib/db/schema），
 * 也不得直接导入遗留集中查询入口（@/lib/db/queries）——
 * 数据访问只能经领域模块仓储/用例。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FORBIDDEN = ["@/lib/db/queries", "@/lib/db/schema", "@/lib/db"];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx)$/.test(entry)) yield full;
  }
}

describe("route handler dependency gate (CORE-AC-001)", () => {
  it("src/app never imports the db instance, schema, or legacy queries directly", () => {
    const violations: string[] = [];
    for (const file of walk(APP_DIR)) {
      const content = readFileSync(file, "utf8");
      for (const spec of FORBIDDEN) {
        if (content.includes(`from "${spec}"`)) {
          violations.push(
            `${path.relative(APP_DIR, file)} -> ${spec}`,
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
