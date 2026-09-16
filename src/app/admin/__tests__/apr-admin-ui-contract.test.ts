/**
 * APR-FR-001/002/005/012/014/015/016 + APR-NFR-003：管理端页面源码契约。
 *
 * 项目无React组件渲染测试基础设施（无jsdom/testing-library先例），
 * 沿用仓库既有"源码契约测试防回归"模式（见 service-jwt-startup-runtime-contract）。
 * 断言页面结构关键事实：重复入口删除、原行为保留、精确实体身份、
 * 名称主展示、客户端不重排成员、发布分组与历史名称真实性、可访问性属性。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, "src", rel), "utf8");

describe("APR-FR-001/002：规则管理页面删除重复规则集标签页且原行为保留", () => {
  const src = read("app/admin/rules/page.tsx");

  it("不再包含规则集标签页/重复请求/编辑状态与组件（APR-FR-001）", () => {
    expect(src).not.toContain("RuleSetsTab");
    expect(src).not.toContain("/api/admin/rule-sets");
    expect(src).not.toContain('label: "规则集"');
    expect(src).not.toContain("Tabs");
    expect(src).not.toContain("moveUp");
    expect(src).not.toContain("editRules");
  });

  it("规则列表原有行为保留：搜索/筛选/地区横幅/行跳转详情（APR-FR-002）", () => {
    expect(src).toContain("RegionCoverageBanner");
    expect(src).toContain("搜索规则编号或名称...");
    expect(src).toContain('params.set("module", mod)');
    expect(src).toContain('params.set("status", status)');
    expect(src).toContain('params.set("jurisdiction_code", jur)');
    expect(src).toContain("/api/admin/rules?");
    expect(src).toContain("/admin/rules/");
  });
});

describe("APR-FR-004～009：独立规则集页面", () => {
  const src = read("app/admin/rule-sets/page.tsx");

  it("详情与更新携带rule_set_id+jurisdiction_code+version精确实体身份（APR-FR-006）", () => {
    expect(src).toContain("jurisdiction_code=");
    expect(src).toContain("version=");
  });

  it("成员来自服务器解析的members并按数组顺序渲染，客户端不排序（APR-FR-005）", () => {
    expect(src).toContain("members");
    expect(src).not.toMatch(/\.sort\(/);
    expect(src).not.toMatch(/members\.map[\s\S]*?localeCompare/);
  });

  it("中文名称为主展示并处理名称缺失（APR-FR-004）", () => {
    expect(src).toContain("assetDisplayName");
    expect(src).toContain("NAME_UNAVAILABLE_LABEL");
  });

  it("成员可展开只读详情（APR-FR-008）", () => {
    expect(src).toContain("aria-expanded");
  });

  it("搜索选择器添加规则（APR-FR-009）", () => {
    expect(src).toContain("/candidates");
    expect(src).toContain("aria-label");
  });

  it("调整顺序前提示影响计算结果（APR-FR-005）", () => {
    expect(src).toMatch(/confirm\s*\(/);
    expect(src).toContain("影响计算结果");
  });
});

describe("APR-FR-012：参数管理页面", () => {
  const src = read("app/admin/params/page.tsx");

  it("名称为主、编号为辅（APR-FR-012/AC-008）", () => {
    expect(src).toContain("assetDisplayName");
    expect(src).toContain("p.paramId");
    expect(src).toContain("p.name");
  });

  it("展开显示说明/来源/证据/引用规则，编号仍用于编辑与API（APR-FR-012）", () => {
    expect(src).toContain("aria-expanded");
    expect(src).toContain("referencedByRules");
    expect(src).toContain("/api/admin/params/");
  });
});

describe("APR-FR-013～016：发布中心页面", () => {
  const src = read("app/admin/publish/page.tsx");

  it("阶段内按规则集/规则/参数分组且可折叠（APR-FR-014）", () => {
    expect(src).toContain("groupPipelineEntities");
    expect(src).toContain("aria-expanded");
    expect(src).toContain("formatAdminEntityType");
  });

  it("卡片以中文名称为主，操作仍使用编号身份（APR-FR-015/AC-010）", () => {
    expect(src).toContain("displayName");
    expect(src).toContain("entity_id: entityId");
  });

  it("历史显示解析名称，缺失时显示名称不可用（APR-FR-016/AC-011）", () => {
    expect(src).toContain("NAME_UNAVAILABLE_LABEL");
  });
});
