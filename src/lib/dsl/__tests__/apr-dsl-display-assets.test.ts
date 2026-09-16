/**
 * APR-FR-003/010/011：当前版本化DSL资产必须逐项补齐人工中文名称与说明。
 * 名称不得由拆分英文编号生成（含中文汉字）；同一业务键的多个有效期窗口
 * 共享同一identity级名称；规则集文件必须携带正式name。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CJK = /[一-鿿豈-﫿]/;

interface EntryLike {
  param_id: string;
  name?: unknown;
  description?: unknown;
}

const REGIONS: Array<{
  dir: string;
  packFile: string;
  ruleSetFile: string;
}> = [
  {
    dir: "cn_dsl_v1",
    packFile: "params/policy_params_cn_baseline.json",
    ruleSetFile: "rule_sets/rule_set_cn_plan_v1.json",
  },
  {
    dir: "shanghai_dsl_v1",
    packFile: "params/policy_params_shanghai_base.json",
    ruleSetFile: "rule_sets/rule_set_shanghai_plan_v1.json",
  },
  {
    dir: "guangdong_dsl_v1",
    packFile: "params/policy_params_guangdong_base.json",
    ruleSetFile: "rule_sets/rule_set_guangdong_plan_v1.json",
  },
  {
    dir: "sichuan_dsl_v1",
    packFile: "params/policy_params_sichuan_base.json",
    ruleSetFile: "rule_sets/rule_set_sichuan_plan_v1.json",
  },
];

function readJson<T>(regionDir: string, rel: string): T {
  return JSON.parse(
    readFileSync(path.join(process.cwd(), "dsl/regions", regionDir, rel), "utf8"),
  ) as T;
}

describe("DSL规则集正式中文名称（APR-FR-003）", () => {
  for (const region of REGIONS) {
    it(`${region.ruleSetFile} 携带人工中文name`, () => {
      const file = readJson<{ rule_set_id: string; name?: unknown; description?: unknown }>(
        region.dir,
        region.ruleSetFile,
      );
      expect(typeof file.name).toBe("string");
      expect(String(file.name).trim().length).toBeGreaterThan(0);
      expect(String(file.name)).toMatch(CJK);
      expect(String(file.name)).not.toBe(file.rule_set_id);
    });
  }
});

describe("DSL参数逐项中文名称与说明（APR-FR-010/011）", () => {
  for (const region of REGIONS) {
    it(`${region.packFile} 全部条目具备name与description`, () => {
      const pack = readJson<{ params: EntryLike[]; tables: EntryLike[] }>(
        region.dir,
        region.packFile,
      );
      const entries = [...pack.params, ...pack.tables];
      expect(entries.length).toBeGreaterThan(0);
      const namesByParamId = new Map<string, Set<string>>();
      for (const entry of entries) {
        expect(typeof entry.name, entry.param_id).toBe("string");
        expect(String(entry.name).trim().length, entry.param_id).toBeGreaterThan(0);
        // 名称必须是人工中文命名，不是拆分英文编号（APR-FR-011）。
        expect(String(entry.name), entry.param_id).toMatch(CJK);
        expect(String(entry.name), entry.param_id).not.toBe(entry.param_id);
        expect(typeof entry.description, entry.param_id).toBe("string");
        expect(String(entry.description).trim().length, entry.param_id).toBeGreaterThan(0);
        const set = namesByParamId.get(entry.param_id) ?? new Set();
        set.add(String(entry.name));
        namesByParamId.set(entry.param_id, set);
      }
      // 同param_id多窗口共享同一名称（名称属于实体身份）。
      for (const [paramId, set] of namesByParamId) {
        expect(set.size, paramId).toBe(1);
      }
    });
  }
});
