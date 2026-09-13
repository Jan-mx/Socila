/**
 * WI-20260913-01任务4：searchPolicy 对话工具契约（SHV2-FR-031/AC-027）。
 *
 * - 工具输入校验 query/jurisdiction_code/as_of_date/top_k；
 * - 地区必须等于会话已确认地区（JRP-NFR-008同契约）；
 * - 通过新签发的Next→Agent服务JWT调用 /internal/v1/rag/search；
 * - 每个命中携带归档原件登录下载路径 /api/rag/originals/<documentVersionId>；
 * - 无可靠命中时显式失败说明，不得编造链接；Agent故障失败关闭。
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  executeSearchPolicy,
  mapSearchHits,
  resetSearchPolicyRuntimeForTest,
  __setSearchPolicyFetcherForTest,
  type SearchPolicyHit,
} from "../search-policy";
// Schema定义随工具契约放在tools.ts（与computePlan同位）。
import { searchPolicySchema } from "../tools";

const TEST_JWT_SECRET = "unit-test-service-jwt-secret-0123456789abcdef";

const agentHit = {
  chunkId: "c1",
  documentVersionId: "11111111-1111-4111-8111-111111111111",
  text: "失业保险金第1-12月标准为2340元每月",
  parentText: "上海市失业保险金支付标准",
  path: "/document/paragraph",
  score: 0.9,
  sourceName: "rsj.sh.gov.cn 官方政策原件",
  officialUrl: "https://rsj.sh.gov.cn/t1.html",
  contentSha256: "a".repeat(64),
  mime: "text/html",
};

afterEach(() => {
  __setSearchPolicyFetcherForTest(undefined);
  vi.unstubAllEnvs();
  resetSearchPolicyRuntimeForTest();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("searchPolicy 输入Schema契约", () => {
  it("合法输入通过（query/地区/日期/top_k）", () => {
    const parsed = searchPolicySchema.safeParse({
      query: "失业金标准是多少",
      jurisdiction_code: "310000",
      as_of_date: "2026-09-01",
      top_k: 5,
    });
    expect(parsed.success).toBe(true);
  });

  it("缺query、非法地区、非法日期、top_k越界均拒绝", () => {
    expect(
      searchPolicySchema.safeParse({ jurisdiction_code: "310000", as_of_date: "2026-09-01" }).success,
    ).toBe(false);
    expect(
      searchPolicySchema.safeParse({ query: "q", jurisdiction_code: "上海", as_of_date: "2026-09-01" }).success,
    ).toBe(false);
    expect(
      searchPolicySchema.safeParse({ query: "q", jurisdiction_code: "310000", as_of_date: "2026/09/01" }).success,
    ).toBe(false);
    expect(
      searchPolicySchema.safeParse({
        query: "q",
        jurisdiction_code: "310000",
        as_of_date: "2026-13-45",
      }).success,
    ).toBe(false);
    expect(
      searchPolicySchema.safeParse({
        query: "q",
        jurisdiction_code: "310000",
        as_of_date: "2026-09-01",
        top_k: 0,
      }).success,
    ).toBe(false);
  });
});

describe("searchPolicy 执行契约", () => {
  it("地区未确认或不一致时拒绝且不发起Agent调用", async () => {
    const fetcher = vi.fn();
    __setSearchPolicyFetcherForTest(fetcher as unknown as typeof fetch);
    const mismatch = await executeSearchPolicy(
      { query: "失业金", jurisdiction_code: "440000", as_of_date: "2026-09-01", top_k: 5 },
      { confirmedJurisdictionCode: "310000" },
    );
    if (mismatch.success) throw new Error("地区不一致必须失败");
    expect(mismatch.error).toContain("JURISDICTION");
    const unconfirmed = await executeSearchPolicy(
      { query: "失业金", jurisdiction_code: "310000", as_of_date: "2026-09-01", top_k: 5 },
      {},
    );
    expect(unconfirmed.success).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("携带新签发服务JWT调用Agent并把命中映射出归档原件下载路径", async () => {
    vi.stubEnv("AGENT_SERVICE_JWT_CURRENT", TEST_JWT_SECRET);
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Bearer .+/);
      expect(String(_input)).toContain("/internal/v1/rag/search");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        query: "失业金标准",
        jurisdiction_code: "310000",
        as_of_date: "2026-09-01",
        top_k: 5,
      });
      return jsonResponse({ hits: [agentHit], candidateCount: 1 });
    });
    __setSearchPolicyFetcherForTest(fetcher as unknown as typeof fetch);
    const result = await executeSearchPolicy(
      { query: "失业金标准", jurisdiction_code: "310000", as_of_date: "2026-09-01", top_k: 5 },
      { confirmedJurisdictionCode: "310000" },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.hits).toHaveLength(1);
      const hit = result.hits[0] as SearchPolicyHit;
      expect(hit.originalDownloadPath).toBe(
        `/api/rag/originals/${agentHit.documentVersionId}`,
      );
      expect(hit.officialUrl).toBe(agentHit.officialUrl);
      expect(hit.text).toContain("2340");
    }
  });

  it("无可靠命中时返回空hits并标记noReliableHits，不编造链接", async () => {
    vi.stubEnv("AGENT_SERVICE_JWT_CURRENT", TEST_JWT_SECRET);
    const fetcher = vi.fn(async () => jsonResponse({ hits: [], candidateCount: 0 }));
    __setSearchPolicyFetcherForTest(fetcher as unknown as typeof fetch);
    const result = await executeSearchPolicy(
      { query: "四川生育津贴", jurisdiction_code: "310000", as_of_date: "2026-09-01", top_k: 5 },
      { confirmedJurisdictionCode: "310000" },
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.hits).toEqual([]);
      expect(result.noReliableHits).toBe(true);
    }
  });

  it("Agent鉴权失败/内部错误时失败关闭，返回稳定错误", async () => {
    for (const status of [401, 502, 503]) {
      const fetcher = vi.fn(async () => jsonResponse({ error: "x" }, status));
      __setSearchPolicyFetcherForTest(fetcher as unknown as typeof fetch);
      const result = await executeSearchPolicy(
        { query: "q", jurisdiction_code: "310000", as_of_date: "2026-09-01", top_k: 5 },
        { confirmedJurisdictionCode: "310000" },
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("SEARCH_POLICY_UNAVAILABLE");
      }
    }
  });

  it("网络异常时失败关闭", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    __setSearchPolicyFetcherForTest(fetcher as unknown as typeof fetch);
    const result = await executeSearchPolicy(
      { query: "q", jurisdiction_code: "310000", as_of_date: "2026-09-01", top_k: 5 },
      { confirmedJurisdictionCode: "310000" },
    );
    expect(result.success).toBe(false);
  });
});

describe("mapSearchHits（来源链组装）", () => {
  it("为每个命中附加登录态归档原件路径并保留官网URL", () => {
    const mapped = mapSearchHits([agentHit, { ...agentHit, documentVersionId: "22222222-2222-4222-8222-222222222222" }]);
    expect(mapped[0].originalDownloadPath).toBe(`/api/rag/originals/${agentHit.documentVersionId}`);
    expect(mapped[1].originalDownloadPath).toBe("/api/rag/originals/22222222-2222-4222-8222-222222222222");
    expect(mapped[0].officialUrl).toBe(agentHit.officialUrl);
  });
});
