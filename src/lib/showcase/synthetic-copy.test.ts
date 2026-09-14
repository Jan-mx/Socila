/**
 * SHV2-FR-013 / SHV2-AC-010 / SHV2-AC-012：合成披露文案契约与API字段契约（单元层）。
 *
 * - API装饰：RCL-GEN-*记录固定caseNature=synthetic并输出结构化policySources；非RCL/人工
 *   案例为human_curated且原字段一律保留、不伪造来源；V1不完整evidence（仅documentId+locator）
 *   不得升格为PolicySource；既有字段向后兼容（SHV2-NFR-005）；
 * - 公开案例页/首页/导航/卡片不得出现“真实咨询记录/真实社保规划案例/真实咨询样本/真实案例”，
 *   公开页使用“合成政策案例”；详情含计算日期/风险提示/政策依据且外链安全属性；
 * - 管理后台使用“合成案例文档”，V1空正文显示“待生成V2案例文档”，不再使用“案例原文”，
 *   并展示输入/期望/断言/生成器版本/快照/政策来源；
 * - 公开与管理路由经装饰器返回新增字段（mock仓储，零数据库）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { decorateShowcaseCase, toPolicySources, type PolicySource } from "./case-nature";

const listShowcaseCases = vi.fn();
const searchCases = vi.fn();
vi.mock("@/server/modules/planning/application", () => ({
  planningReads: {
    listShowcaseCases: (...args: unknown[]) => listShowcaseCases(...args),
    searchCases: (...args: unknown[]) => searchCases(...args),
  },
}));

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

const STRUCTURED_EVIDENCE = {
  document_id: "DOC-SH-UI-BENEFIT-2026",
  jurisdiction_code: "310000",
  title: "关于调整本市失业保险金标准的通知（沪人社规〔2026〕7号）",
  authority: "上海市人力资源和社会保障局",
  official_url: "https://rsj.sh.gov.cn/tshbx_17729/20260702/t0035_1442080.html",
  fetched_at: "2026-09-11T00:00:00.000Z",
  content_sha256: "a".repeat(64),
  artifact: "docs/x/original.html",
  parse_version: "extracted-text-v1",
  locator: { type: "article", reference: "第一条" },
  excerpt: "失业保险金第1-12个月为每月2340元",
};

describe("SHV2-FR-013/014 API装饰器：caseNature与policySources", () => {
  it("RCL-GEN-2.0记录→synthetic并输出完整PolicySource；既有字段全部保留", () => {
    const row = {
      id: 7,
      caseUid: "RPC-310000-SH-X-V2",
      title: "标题",
      tags: ["上海"],
      userMessage: "问",
      aiResponse: "答",
      category: "失业",
      generatorVersion: "RCL-GEN-2.0",
      evidence: [STRUCTURED_EVIDENCE],
      asOfDate: "2026-09-01",
    };
    const out = decorateShowcaseCase(row);
    expect(out.caseNature).toBe("synthetic");
    expect(out.policySources).toHaveLength(1);
    const p: PolicySource = out.policySources[0];
    expect(p).toEqual({
      documentId: "DOC-SH-UI-BENEFIT-2026",
      title: STRUCTURED_EVIDENCE.title,
      authority: STRUCTURED_EVIDENCE.authority,
      officialUrl: STRUCTURED_EVIDENCE.official_url,
      locator: { type: "article", reference: "第一条" },
      excerpt: STRUCTURED_EVIDENCE.excerpt,
      contentSha256: "a".repeat(64),
    });
    for (const k of Object.keys(row)) {
      expect((out as Record<string, unknown>)[k]).toEqual((row as Record<string, unknown>)[k]);
    }
  });

  it("RCL-GEN-1.0（V1）记录→synthetic，但不完整evidence不得升格为PolicySource", () => {
    const out = decorateShowcaseCase({
      id: 1,
      generatorVersion: "RCL-GEN-1.0",
      evidence: [{ documentId: "DOC-SH-POLICY-2025", locator: "正文" }],
    });
    expect(out.caseNature).toBe("synthetic");
    expect(out.policySources).toEqual([]);
  });

  it("非RCL/人工维护记录→human_curated，来源为空且内容不被改写", () => {
    const row = { id: 2, title: "人工案例", userMessage: "原问题", aiResponse: "原回答", generatorVersion: null, evidence: null };
    const out = decorateShowcaseCase(row);
    expect(out.caseNature).toBe("human_curated");
    expect(out.policySources).toEqual([]);
    expect(out.title).toBe("人工案例");
    expect(out.userMessage).toBe("原问题");
    expect(out.aiResponse).toBe("原回答");
  });

  it("toPolicySources：接受snake_case DSL evidence与camelCase PolicySource；缺字段或非64位hex的条目被丢弃", () => {
    const camel = {
      documentId: "DOC-GD-MINIMUM-WAGE-2026",
      title: "t",
      authority: "a",
      officialUrl: "https://www.gd.gov.cn/x",
      locator: { type: "body", reference: "正文" },
      excerpt: "e",
      contentSha256: "b".repeat(64),
    };
    const out = toPolicySources([
      STRUCTURED_EVIDENCE,
      camel,
      { ...STRUCTURED_EVIDENCE, content_sha256: "zz" },
      { ...STRUCTURED_EVIDENCE, excerpt: "" },
      { documentId: "X", locator: "正文" },
      "junk",
      null,
    ]);
    expect(out.map((p) => p.documentId)).toEqual(["DOC-SH-UI-BENEFIT-2026", "DOC-GD-MINIMUM-WAGE-2026"]);
    expect(toPolicySources(undefined)).toEqual([]);
    expect(toPolicySources("not-json")).toEqual([]);
  });
});

describe("SHV2-AC-012 公开与管理路由返回新增字段（向后兼容）", () => {
  it("GET /api/showcase-cases：每条附带caseNature/policySources且原字段不变", async () => {
    listShowcaseCases.mockResolvedValueOnce([
      { id: 1, title: "A", userMessage: "q1", aiResponse: "a1", tags: [], generatorVersion: "RCL-GEN-2.0", evidence: [STRUCTURED_EVIDENCE] },
      { id: 2, title: "B", userMessage: "q2", aiResponse: "a2", tags: [], generatorVersion: null, evidence: null },
    ]);
    const { GET } = await import("@/app/api/showcase-cases/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cases: Array<Record<string, unknown>> };
    expect(body.cases).toHaveLength(2);
    expect(body.cases[0]).toMatchObject({ id: 1, title: "A", userMessage: "q1", aiResponse: "a1", caseNature: "synthetic" });
    expect((body.cases[0].policySources as unknown[]).length).toBe(1);
    expect(body.cases[1]).toMatchObject({ id: 2, title: "B", caseNature: "human_curated", policySources: [] });
  });

  it("GET /api/admin/cases：rows附带caseNature/policySources，分页字段保持", async () => {
    searchCases.mockResolvedValueOnce({
      rows: [
        { id: 10, caseUid: "RPC-310000-K-V2", caseText: "文档", generatorVersion: "RCL-GEN-2.0", evidence: [STRUCTURED_EVIDENCE], qualityStatus: "active" },
        { id: 11, caseUid: "MANUAL-1", caseText: "人工", generatorVersion: null, evidence: null, qualityStatus: "active" },
      ],
      total: 2,
    });
    const { GET } = await import("@/app/api/admin/cases/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest("http://localhost/api/admin/cases?page=1&pageSize=50"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { cases: Array<Record<string, unknown>>; total: number; page: number; pageSize: number };
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.cases[0]).toMatchObject({ id: 10, caseUid: "RPC-310000-K-V2", caseNature: "synthetic" });
    expect((body.cases[0].policySources as unknown[]).length).toBe(1);
    expect(body.cases[1]).toMatchObject({ id: 11, caseNature: "human_curated", policySources: [] });
  });
});

describe("SHV2-AC-010 公开页面合成披露文案", () => {
  const BANNED = /真实咨询记录|真实社保规划案例|真实咨询样本|真实案例/;

  it("公开案例页使用“合成政策案例”且不含真实表述", () => {
    const page = read("src/app/(client)/cases/page.tsx");
    expect(page).toContain("合成政策案例");
    expect(page).not.toMatch(BANNED);
  });

  it("首页、导航、卡片与聊天工具卡不含“真实案例”表述", () => {
    for (const f of [
      "src/app/(client)/page.tsx",
      "src/components/layout/MarketingNav.tsx",
      "src/app/(client)/cases/CaseGrid.tsx",
      "src/components/chat/ToolResultCard.tsx",
    ]) {
      expect(read(f), f).not.toMatch(BANNED);
    }
  });

  it("卡片显示地区/能力/人物条件/问题；详情含计算日期、风险提示、政策依据与安全外链", () => {
    const grid = read("src/app/(client)/cases/CaseGrid.tsx");
    for (const token of ["计算日期", "风险提示", "政策依据", "人物条件", 'rel="noopener noreferrer"', 'target="_blank"', "policySources", "regionLabel"]) {
      expect(grid, token).toContain(token);
    }
    expect(grid).toContain("合成");
  });
});

describe("SHV2-AC-012 管理后台文案与结构化字段", () => {
  it("“案例原文”改为“合成案例文档”；V1空正文显示“待生成V2案例文档”；不在页面层虚构case_text", () => {
    const admin = read("src/app/admin/cases/page.tsx");
    expect(admin).toContain("合成案例文档");
    expect(admin).toContain("待生成V2案例文档");
    expect(admin).not.toContain("案例原文");
    for (const field of ["input", "expected", "assertions", "generatorVersion", "snapshotHash", "policySources", "caseNature"]) {
      expect(admin, field).toContain(field);
    }
  });
});
