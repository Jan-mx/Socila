/**
 * 步骤01.2 黄金快照回归（FND-FR-003 / FND-AC-002 的确定性证明）：
 * 1. 全新加载的规则/参数重复执行两次，完整输出（user/calc/plan/trace）零漂移；
 * 2. 输出与仓库中提交的基线快照一致——任何行为变化都会在 CI 红掉，
 *    修复规则后须显式重写基线并人工审阅 diff（禁止静默改期望）。
 *
 * 重新生成基线：WRITE_GOLDEN_SNAPSHOT=1 npx vitest run src/lib/engine/__tests__/golden-snapshot.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  buildGoldenSnapshot,
  canonicalJson,
  FIXED_AS_OF_DATE,
  type GoldenSnapshotCase,
} from "./golden-fixtures";

const SNAPSHOT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures/golden-snapshot.json",
);

describe("golden snapshot (plan/calc/trace determinism)", () => {
  it("repeated execution on freshly loaded rules/params produces zero drift", () => {
    const first = canonicalJson(buildGoldenSnapshot());
    const second = canonicalJson(buildGoldenSnapshot());
    expect(second).toBe(first);
  });

  it("actual outputs match the committed golden snapshot", () => {
    const currentCases = JSON.parse(
      canonicalJson(buildGoldenSnapshot()),
    ) as GoldenSnapshotCase[];

    if (process.env.WRITE_GOLDEN_SNAPSHOT === "1") {
      mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
      writeFileSync(
        SNAPSHOT_PATH,
        JSON.stringify(currentCases, null, 2) + "\n",
        "utf8",
      );
      console.warn(
        `[golden-snapshot] 基线已重写（基准日期 ${FIXED_AS_OF_DATE}，${currentCases.length} 条）——请人工审阅 diff 后再提交。`,
      );
      return;
    }

    const committedCases = JSON.parse(
      readFileSync(SNAPSHOT_PATH, "utf8"),
    ) as GoldenSnapshotCase[];

    expect(currentCases.map((c) => c.name)).toEqual(
      committedCases.map((c) => c.name),
    );
    for (let i = 0; i < currentCases.length; i++) {
      expect(currentCases[i], `case #${i} ${currentCases[i].name}`).toEqual(
        committedCases[i],
      );
    }
  });
});
