/**
 * searchPolicy 对话工具实现（SHV2-FR-031，WI-20260913-01任务4）。
 *
 * - 通过新签发的 Next→Agent 服务JWT调用 Agent 内部检索接口
 *   POST /internal/v1/rag/search（ADR-0005：服务JWT是网络之外的第二层身份证明）；
 * - 会话已确认地区一致性由调用方（experimental_context）与本模块双重校验；
 * - 每个命中附登录态归档原件下载路径 /api/rag/originals/<documentVersionId>；
 * - Agent不可用/鉴权失败/非2xx → 失败关闭（SEARCH_POLICY_UNAVAILABLE），
 *   绝不编造链接；不暴露MinIO地址、凭据或预签名URL。
 */

export interface SearchPolicyHit {
  chunkId: string;
  documentVersionId: string;
  text: string;
  parentText: string | null;
  path: string | null;
  score: number;
  sourceName: string;
  officialUrl: string | null;
  contentSha256: string;
  mime: string;
  /** 登录态归档原件下载路径（Web代理，非MinIO直链）。 */
  originalDownloadPath: string;
}

export type SearchPolicyResult =
  | { success: true; hits: SearchPolicyHit[]; noReliableHits: boolean }
  | { success: false; error: string; hits: SearchPolicyHit[]; noReliableHits: true };

export interface SearchPolicyToolContext {
  confirmedJurisdictionCode?: string;
  ownerUserId?: string;
}

/** 测试接缝：注入fetch替身（默认使用全局fetch）。 */
let injectedFetcher: typeof fetch | undefined;

export function __setSearchPolicyFetcherForTest(fetcher: typeof fetch | undefined): void {
  injectedFetcher = fetcher;
}

/** 测试接缝：重置模块级运行时（环境变量读取时机）。 */
export function resetSearchPolicyRuntimeForTest(): void {
  injectedFetcher = undefined;
}

function agentBaseUrl(): string {
  return (process.env.AGENT_INTERNAL_URL ?? "http://127.0.0.1:8100").replace(/\/+$/, "");
}

/** 组装来源链：官网原文URL + 登录态归档原件路径（两条链互补，不可互替）。 */
export function mapSearchHits(
  hits: Array<Omit<SearchPolicyHit, "originalDownloadPath">>,
): SearchPolicyHit[] {
  return hits.map((hit) => ({
    ...hit,
    originalDownloadPath: `/api/rag/originals/${hit.documentVersionId}`,
  }));
}

/**
 * searchPolicy 执行逻辑。抛错被捕获并转换为稳定失败结果（不抛出到模型流）。
 */
export async function executeSearchPolicy(
  params: { query: string; jurisdiction_code: string; as_of_date: string; top_k: number },
  context: SearchPolicyToolContext,
): Promise<SearchPolicyResult> {
  // JRP-NFR-008（同computePlan契约）：请求地区必须等于会话已确认地区。
  if (!context.confirmedJurisdictionCode) {
    return {
      success: false,
      error:
        "JURISDICTION_REQUIRED: 会话尚未确认规划地区，请先请用户选择地区后再检索政策原文",
      hits: [],
      noReliableHits: true,
    };
  }
  if (params.jurisdiction_code !== context.confirmedJurisdictionCode) {
    return {
      success: false,
      error:
        "JURISDICTION_CONTEXT_MISMATCH: 请求地区与会话已确认地区不一致，请先确认或切换地区",
      hits: [],
      noReliableHits: true,
    };
  }

  const fetcher = injectedFetcher ?? fetch;
  try {
    // 每次调用新签发短期服务JWT（TTL 300秒，HS256，固定Next身份）。
    const { getServiceJwt } = await import("@/lib/security/service-jwt-provider");
    const token = await getServiceJwt().signNextToken();
    const response = await fetcher(`${agentBaseUrl()}/internal/v1/rag/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: params.query,
        jurisdiction_code: params.jurisdiction_code,
        as_of_date: params.as_of_date,
        top_k: params.top_k,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return {
        success: false,
        error: `SEARCH_POLICY_UNAVAILABLE: 政策检索服务暂时不可用（${response.status}），请稍后重试或建议咨询12333`,
        hits: [],
        noReliableHits: true,
      };
    }
    const data = (await response.json()) as { hits?: Array<Omit<SearchPolicyHit, "originalDownloadPath">> };
    const hits = mapSearchHits(Array.isArray(data.hits) ? data.hits : []);
    return { success: true, hits, noReliableHits: hits.length === 0 };
  } catch {
    return {
      success: false,
      error: "SEARCH_POLICY_UNAVAILABLE: 政策检索服务暂时不可用，请稍后重试或建议咨询12333",
      hits: [],
      noReliableHits: true,
    };
  }
}
