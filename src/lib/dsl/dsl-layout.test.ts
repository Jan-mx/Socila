/**
 * 通用协议与地区DSL目录布局契约（09-05 SDL-FR-001/002/005、SDL-NFR-001）。
 *
 * 目标结构（PRD §6）：
 *   dsl/protocol/socila_dsl_v1/   —— 通用Schema与发布工作流（地区无关）
 *   dsl/regions/shanghai_dsl_v1/  —— 上海规则、参数、规则集、示例与Manifest
 * 上海稳定业务标识（SHANGHAI_BASE、RS-SHANGHAI-PLAN-V1、P-SH-*）正确表达地域归属，
 * 予以保留（SDL-FR-005）。黄金资产（24规则/29参数）不因目录迁移漂移（SDL-NFR-001）。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGACY_BRAND_SUBSTRING,
  LEGACY_DSL_DIR_ID_FRAGMENT,
  LEGACY_DSL_DIR_ID_PATTERN,
  LEGACY_DSL_VERSION_PATTERN,
} from "@/lib/naming/socila-naming-contract";

const DSL_ROOT = path.join(process.cwd(), "dsl");
const PROTOCOL_DIR = path.join(DSL_ROOT, "protocol/socila_dsl_v1");
const REGION_DIR = path.join(DSL_ROOT, "regions/shanghai_dsl_v1");
const CN_DIR = path.join(DSL_ROOT, "regions/cn_dsl_v1");

interface RuleFileJson {
  dsl_version: string;
  rule_id: string;
}

interface ParamsPackJson {
  policy_pack_id: string;
  params: unknown[];
  tables: unknown[];
}

describe("通用协议目录 dsl/protocol/socila_dsl_v1（SDL-FR-002）", () => {
  it("Schema与发布工作流位于协议目录且使用Socila命名", () => {
    expect(existsSync(path.join(PROTOCOL_DIR, "README.md"))).toBe(true);
    expect(
      existsSync(path.join(PROTOCOL_DIR, "schema/socila_rule_dsl.schema.json")),
    ).toBe(true);
    expect(
      existsSync(path.join(PROTOCOL_DIR, "schema/socila_policy_params.schema.json")),
    ).toBe(true);
    expect(existsSync(path.join(PROTOCOL_DIR, "schema/user_profile.schema.json"))).toBe(true);
    expect(
      existsSync(path.join(PROTOCOL_DIR, "workflows/publish_workflow_default.json")),
    ).toBe(true);
  });

  it("规则Schema标题为Socila且dsl_version唯一规范值被钉死（SDL-FR-001）", () => {
    const schema = JSON.parse(
      readFileSync(
        path.join(PROTOCOL_DIR, "schema/socila_rule_dsl.schema.json"),
        "utf8",
      ),
    ) as {
      title: string;
      properties?: { dsl_version?: { const?: string; enum?: string[] } };
    };
    expect(schema.title).toMatch(/[Ss]ocila/);
    expect(schema.title).not.toMatch(new RegExp(LEGACY_BRAND_SUBSTRING));
    const dv = schema.properties?.dsl_version ?? {};
    expect(dv.const ?? dv.enum?.[0]).toBe("SOCILA-DSL-1.0");
  });

  it("协议目录不含旧格式标识", () => {
    for (const f of readdirSync(PROTOCOL_DIR, { recursive: true })) {
      const p = path.join(PROTOCOL_DIR, String(f));
      if (!p.endsWith(".json") && !p.endsWith(".md")) continue;
      const content = readFileSync(p, "utf8");
      expect(content).not.toMatch(LEGACY_DSL_VERSION_PATTERN);
      expect(content).not.toMatch(LEGACY_DSL_DIR_ID_PATTERN);
    }
  });
});

describe("上海地区目录 dsl/regions/shanghai_dsl_v1（SDL-FR-002/003）", () => {
  it("地区资产与Manifest位于地区目录", () => {
    expect(existsSync(path.join(REGION_DIR, "rules_manifest.json"))).toBe(true);
    expect(
      existsSync(path.join(REGION_DIR, "params/policy_params_shanghai_base.json")),
    ).toBe(true);
    expect(
      existsSync(path.join(REGION_DIR, "rule_sets/rule_set_shanghai_plan_v1.json")),
    ).toBe(true);
    expect(
      existsSync(path.join(REGION_DIR, "tests/rule_examples_as_tests.json")),
    ).toBe(true);
  });

  it("8条上海地方规则文件全部携带SOCILA-DSL-1.0且显式add（NRP-FR-007；16条国家规则迁入CN）", () => {
    const files = readdirSync(path.join(REGION_DIR, "rules")).filter((f) =>
      f.endsWith(".json"),
    );
    expect(files).toHaveLength(8);
    for (const f of files) {
      const rule = JSON.parse(
        readFileSync(path.join(REGION_DIR, "rules", f), "utf8"),
      ) as RuleFileJson & { operation?: string };
      expect(rule.dsl_version).toBe("SOCILA-DSL-1.0");
      expect(rule.operation).toBe("add");
    }
  });

  it("参数包SHANGHAI_BASE含27个参数（25标量+2表；国家表迁入CN、失业期限表为显式replace）", () => {
    const pack = JSON.parse(
      readFileSync(
        path.join(REGION_DIR, "params/policy_params_shanghai_base.json"),
        "utf8",
      ),
    ) as {
      policy_pack_id: string;
      params: Array<{ param_id: string; operation?: string }>;
      tables: Array<{
        param_id: string;
        operation?: string;
        target_business_key?: string;
      }>;
    };
    expect(pack.policy_pack_id).toBe("SHANGHAI_BASE");
    expect(pack.params.length + pack.tables.length).toBe(27);
    // 国家表已迁出。
    const ids = [...pack.params, ...pack.tables].map((p) => p.param_id);
    expect(ids).not.toContain("T-RETIREMENT-AGE-LOOKUP");
    expect(ids).not.toContain("T-MIN-PENSION-YEARS-BY-RETIRE-YEAR");
    // 上海失业金期限表是显式replace，目标=国家基线表键（NRP-AC-005）。
    const uiTable = pack.tables.find(
      (t) => t.param_id === "T-UNEMPLOYMENT-DURATION-BY-YEARS",
    );
    expect(uiTable?.operation).toBe("replace");
    expect(uiTable?.target_business_key).toBe("T-UNEMPLOYMENT-DURATION-BY-YEARS");
  });

  it("规则集RS-SHANGHAI-PLAN-V1覆盖24个业务键（16国家继承+8上海地方，NRP-FR-006）", () => {
    const ruleSet = JSON.parse(
      readFileSync(
        path.join(REGION_DIR, "rule_sets/rule_set_shanghai_plan_v1.json"),
        "utf8",
      ),
    ) as { rule_set_id: string; rules: string[]; operation?: string };
    expect(ruleSet.rule_set_id).toBe("RS-SHANGHAI-PLAN-V1");
    expect(ruleSet.operation).toBe("add");
    const shFiles = readdirSync(path.join(REGION_DIR, "rules"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    expect(ruleSet.rules).toHaveLength(24);
    for (const f of shFiles) expect(ruleSet.rules).toContain(f);
    const cnManifest = JSON.parse(
      readFileSync(path.join(CN_DIR, "rules_manifest.json"), "utf8"),
    ) as { rules: Array<{ rule_id: string }> };
    for (const cn of cnManifest.rules) expect(ruleSet.rules).toContain(cn.rule_id);
  });

  it(`旧目录dsl/${LEGACY_DSL_DIR_ID_FRAGMENT}已不存在`, () => {
    expect(existsSync(path.join(DSL_ROOT, LEGACY_DSL_DIR_ID_FRAGMENT))).toBe(false);
  });

  it("dsl/README.md描述协议/地区分层（SDL-FR-002）", () => {
    const readme = readFileSync(path.join(DSL_ROOT, "README.md"), "utf8");
    expect(readme).toContain("protocol");
    expect(readme).toContain("regions");
  });
});

describe("国家baseline目录 dsl/regions/cn_dsl_v1（NRP-FR-005/FR-007）", () => {
  it("CN地区资产与Manifest齐备且jurisdiction_code=CN", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(CN_DIR, "rules_manifest.json"), "utf8"),
    ) as {
      dsl_version: string;
      region_slug: string;
      jurisdiction_code: string;
      bundle_version: number;
      rules: Array<{ rule_id: string; file: string }>;
    };
    expect(manifest.dsl_version).toBe("SOCILA-DSL-1.0");
    expect(manifest.region_slug).toBe("cn");
    expect(manifest.jurisdiction_code).toBe("CN");
    expect(manifest.bundle_version).toBeGreaterThanOrEqual(1);
    expect(manifest.rules).toHaveLength(16);
    expect(existsSync(path.join(CN_DIR, "params/policy_params_cn_baseline.json"))).toBe(true);
    expect(existsSync(path.join(CN_DIR, "rule_sets/rule_set_cn_plan_v1.json"))).toBe(true);
    expect(existsSync(path.join(CN_DIR, "tests/rule_examples_as_tests.json"))).toBe(true);
  });

  it("16条国家规则全部显式baseline（NRP-FR-007：CN只能baseline）", () => {
    const files = readdirSync(path.join(CN_DIR, "rules")).filter((f) =>
      f.endsWith(".json"),
    );
    expect(files).toHaveLength(16);
    for (const f of files) {
      const rule = JSON.parse(
        readFileSync(path.join(CN_DIR, "rules", f), "utf8"),
      ) as RuleFileJson & { operation?: string; target_business_key?: string | null };
      expect(rule.dsl_version).toBe("SOCILA-DSL-1.0");
      expect(rule.operation).toBe("baseline");
      expect(rule.target_business_key ?? null).toBeNull();
    }
  });

  it("CN参数包CN-BASELINE全部参数显式baseline且含国家三表", () => {
    const pack = JSON.parse(
      readFileSync(
        path.join(CN_DIR, "params/policy_params_cn_baseline.json"),
        "utf8",
      ),
    ) as ParamsPackJson & {
      params: Array<{ param_id: string; operation?: string }>;
      tables: Array<{ param_id: string; operation?: string }>;
    };
    expect(pack.policy_pack_id).toBe("CN-BASELINE");
    const all = [...pack.params, ...pack.tables];
    expect(all.length).toBeGreaterThanOrEqual(6);
    for (const p of all) expect(p.operation).toBe("baseline");
    const ids = all.map((p) => p.param_id);
    expect(ids).toContain("T-RETIREMENT-AGE-LOOKUP");
    expect(ids).toContain("T-MIN-PENSION-YEARS-BY-RETIRE-YEAR");
    expect(ids).toContain("T-UNEMPLOYMENT-DURATION-BY-YEARS");
  });

  it("规则集RS-CN-PLAN-V1显式baseline并覆盖全部16条国家规则", () => {
    const ruleSet = JSON.parse(
      readFileSync(
        path.join(CN_DIR, "rule_sets/rule_set_cn_plan_v1.json"),
        "utf8",
      ),
    ) as { rule_set_id: string; rules: string[]; operation?: string };
    expect(ruleSet.rule_set_id).toBe("RS-CN-PLAN-V1");
    expect(ruleSet.operation).toBe("baseline");
    const files = readdirSync(path.join(CN_DIR, "rules"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""));
    expect([...ruleSet.rules].sort()).toEqual([...files].sort());
  });
});
