/**
 * 地区DSL Manifest契约（09-05 SDL-FR-002/003/004、SDL-AC-001/002）。
 *
 * 通用Schema与发布工作流位于 dsl/protocol/socila_dsl_v1；地区资产位于
 * dsl/regions/<slug>_dsl_v1 并由 rules_manifest.json 声明 jurisdiction_code、
 * bundle_version 与资产相对路径。发现器验证Manifest与实际文件集合一致，
 * Seed从Manifest取得路径与地区代码——装载代码不得硬编码地区目录或行政区划。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_DSL_VERSION,
  discoverRegionDsl,
} from "@/lib/dsl/region-manifest";
import { LEGACY_DSL_VERSION_FRAGMENT } from "@/lib/naming/socila-naming-contract";

function makeTmpRoot(): string {
  const root = path.join(
    tmpdir(),
    `socila-region-manifest-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}

function writeRegion(
  root: string,
  slug: string,
  manifest: unknown,
  ruleIds: string[],
): string {
  const dir = path.join(root, `${slug}_dsl_v1`);
  mkdirSync(path.join(dir, "rules"), { recursive: true });
  mkdirSync(path.join(dir, "params"), { recursive: true });
  mkdirSync(path.join(dir, "rule_sets"), { recursive: true });
  mkdirSync(path.join(dir, "tests"), { recursive: true });
  writeFileSync(path.join(dir, "rules_manifest.json"), JSON.stringify(manifest, null, 2));
  for (const id of ruleIds) {
    writeFileSync(
      path.join(dir, "rules", `${id}.json`),
      JSON.stringify({ dsl_version: CANONICAL_DSL_VERSION, rule_id: id }),
    );
  }
  writeFileSync(path.join(dir, "params", "params.json"), JSON.stringify({ params: [] }));
  writeFileSync(path.join(dir, "rule_sets", "rs.json"), JSON.stringify({ rules: ruleIds }));
  writeFileSync(path.join(dir, "tests", "tests.json"), JSON.stringify({ tests: [] }));
  return dir;
}

function manifestOf(
  overrides: Partial<Record<string, unknown>> = {},
  ruleIds: string[] = ["R-1-A"],
): Record<string, unknown> {
  return {
    dsl_version: CANONICAL_DSL_VERSION,
    region_slug: "shanghai",
    jurisdiction_code: "310000",
    bundle_version: 1,
    params_file: "params/params.json",
    rule_set_file: "rule_sets/rs.json",
    tests_file: "tests/tests.json",
    rules: ruleIds.map((id) => ({ rule_id: id, file: `${id}.json` })),
    ...overrides,
  };
}

describe("CANONICAL_DSL_VERSION（SDL-FR-001 协议标识）", () => {
  it("唯一规范值为SOCILA-DSL-1.0", () => {
    expect(CANONICAL_DSL_VERSION).toBe("SOCILA-DSL-1.0");
  });
});

describe("discoverRegionDsl（SDL-FR-002/003/004）", () => {
  it("从仓库默认根发现国家与上海两地区（CN + 310000，NRP-FR-005）", () => {
    const regions = discoverRegionDsl();
    expect(regions).toHaveLength(2);

    const shanghai = regions.find((r) => r.manifest.region_slug === "shanghai")!;
    expect(shanghai).toBeTruthy();
    expect(shanghai.manifest.jurisdiction_code).toBe("310000");
    expect(shanghai.manifest.dsl_version).toBe(CANONICAL_DSL_VERSION);
    expect(shanghai.manifest.bundle_version).toBe(1);
    expect(shanghai.manifest.params_file).toBe("params/policy_params_shanghai_base.json");
    expect(shanghai.manifest.rule_set_file).toBe("rule_sets/rule_set_shanghai_plan_v1.json");
    expect(shanghai.manifest.tests_file).toBe("tests/rule_examples_as_tests.json");
    expect(shanghai.ruleFiles).toHaveLength(8);

    const cn = regions.find((r) => r.manifest.region_slug === "cn")!;
    expect(cn).toBeTruthy();
    expect(cn.manifest.jurisdiction_code).toBe("CN");
    expect(cn.manifest.dsl_version).toBe(CANONICAL_DSL_VERSION);
    expect(cn.ruleFiles).toHaveLength(16);
    expect(cn.manifest.params_file).toBe("params/policy_params_cn_baseline.json");
    expect(cn.manifest.rule_set_file).toBe("rule_sets/rule_set_cn_plan_v1.json");

    for (const f of [
      shanghai.paramsPath,
      shanghai.ruleSetPath,
      shanghai.testsPath,
      ...shanghai.ruleFiles.map((r) => r.absolutePath),
    ]) {
      expect(existsSync(f)).toBe(true);
    }
  });

  it("Manifest规则清单与rules目录文件集合双向一致（SDL-FR-004）", () => {
    const shanghai = discoverRegionDsl().find((r) => r.manifest.region_slug === "shanghai")!;
    const dirRuleIds = readdirSync(path.join(process.cwd(), "dsl/regions/shanghai_dsl_v1/rules"))
      .filter((f) => f.endsWith(".json"))
      .sort();

    expect(shanghai.ruleFiles.map((r) => r.fileName).sort()).toEqual(dirRuleIds);
    expect(shanghai.manifest.rules.map((r) => r.rule_id).sort()).toEqual(
      dirRuleIds.map((f) => f.replace(/\.json$/, "")),
    );
    // 每条manifest规则的file指向真实存在的文件且rule_id与文件内容一致。
    for (const entry of shanghai.manifest.rules) {
      const parsed = JSON.parse(
        readFileSync(
          path.join(shanghai.regionDir, "rules", entry.file),
          "utf8",
        ),
      ) as { rule_id: string; dsl_version: string };
      expect(parsed.rule_id).toBe(entry.rule_id);
      expect(parsed.dsl_version).toBe(CANONICAL_DSL_VERSION);
    }
  });

  it("拒绝未知dsl_version的Manifest（SDL-NFR-004 fail-fast）", () => {
    const root = makeTmpRoot();
    try {
      writeRegion(root, "shanghai", manifestOf({ dsl_version: LEGACY_DSL_VERSION_FRAGMENT }), ["R-1-A"]);
      expect(() => discoverRegionDsl({ regionsRoot: root, protocolRoot: root }))
        .toThrow(/dsl_version/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("拒绝Manifest清单中声明但磁盘缺失的规则文件", () => {
    const root = makeTmpRoot();
    try {
      const dir = writeRegion(root, "shanghai", manifestOf({}, ["R-1-A", "R-2-B"]), [
        "R-1-A",
        "R-2-B",
      ]);
      // 故意删除 R-2-B.json 制造不一致。
      rmSync(path.join(dir, "rules", "R-2-B.json"));
      expect(() => discoverRegionDsl({ regionsRoot: root, protocolRoot: root }))
        .toThrow(/R-2-B/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("拒绝rules目录中存在但Manifest未声明的规则文件", () => {
    const root = makeTmpRoot();
    try {
      const dir = writeRegion(root, "shanghai", manifestOf({}, ["R-1-A"]), ["R-1-A"]);
      writeFileSync(
        path.join(dir, "rules", "R-9-UNDECLARED.json"),
        JSON.stringify({ dsl_version: CANONICAL_DSL_VERSION, rule_id: "R-9-UNDECLARED" }),
      );
      expect(() => discoverRegionDsl({ regionsRoot: root, protocolRoot: root }))
        .toThrow(/R-9-UNDECLARED/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("拒绝Manifest引用越出地区目录的路径（路径穿越）", () => {
    const root = makeTmpRoot();
    try {
      writeRegion(
        root,
        "shanghai",
        manifestOf({ params_file: "../other/params.json" }),
        ["R-1-A"],
      );
      expect(() => discoverRegionDsl({ regionsRoot: root, protocolRoot: root }))
        .toThrow(/params_file|outside|越出|目录/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("未来地区Manifest无需修改上海常量即可被发现（SDL-AC-002）", () => {
    const root = makeTmpRoot();
    try {
      writeRegion(
        root,
        "shanghai",
        manifestOf({}, ["R-1-A"]),
        ["R-1-A"],
      );
      writeRegion(
        root,
        "guangdong",
        manifestOf(
          {
            region_slug: "guangdong",
            jurisdiction_code: "440000",
            bundle_version: 2,
          },
          ["R-GD-1"],
        ),
        ["R-GD-1"],
      );

      const regions = discoverRegionDsl({ regionsRoot: root, protocolRoot: root });
      expect(regions).toHaveLength(2);
      const bySlug = new Map(regions.map((r) => [r.manifest.region_slug, r]));
      expect(bySlug.get("shanghai")?.manifest.jurisdiction_code).toBe("310000");
      expect(bySlug.get("guangdong")?.manifest.jurisdiction_code).toBe("440000");
      expect(bySlug.get("guangdong")?.manifest.bundle_version).toBe(2);
      expect(bySlug.get("guangdong")?.ruleFiles).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
