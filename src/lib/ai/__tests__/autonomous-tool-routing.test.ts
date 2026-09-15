/**
 * ATR（LLM自主工具路由与对话回答恢复，docs/prd/09-15-feature-llm-autonomous-tool-routing.md）。
 *
 * 契约：
 * - ATR-FR-001/005：身份介绍、寒暄、能力说明等普通对话由模型依据系统提示词直接回答，
 *   不被服务端知识库兜底语覆盖（PRD §2.2根因：输出正则把人设表达误判为政策事实，
 *   整段替换为固定兜底语）；
 * - ATR-FR-002/AC-003：全部工具注册且每次请求 toolChoice="auto"，不存在首步强制
 *   searchPolicy 的步骤配置；
 * - ATR-FR-006/AC-004：政策问题由模型在 auto 模式自主发起 searchPolicy，工具结果
 *   经多步循环进入最终回答且原样流式返回（ATR-FR-010）；
 * - ATR-FR-009：系统提示词不含静态"2025 政策要点"及动态政策数字；
 * - ATR-AC-006：实现中不存在输入/输出政策语义正则、政策文本缓存、来源放行判断与
 *   整段兜底替换（源码契约，防回归）；
 * - 服务端日期上下文注入保持不变（原 provenance 套件中的日期用例迁移至此）。
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";

import { createChatStream, formatServerDate } from "../agent";
import { buildContextPrompt, SYSTEM_PROMPT } from "../prompts";
import {
  resetSearchPolicyRuntimeForTest,
  __setSearchPolicyFetcherForTest,
} from "../search-policy";

// 混合工具场景：computePlan 的规则引擎用例依赖数据库（单元层零DB），
// 以固定结果替换该外部边界；工具自身的地区一致性校验仍真实执行。
vi.mock("@/server/modules/planning/application", () => ({
  createJurisdictionComputePlan: () => async () => ({
    planId: "plan-atr-mixed",
    needsAgent: false,
    questions: [],
    warnings: [],
    caveats: [],
    plan: {},
    calc: { pension: { gap_months: -24 } },
    meta: { as_of_date: "2026-09-15" },
  }),
}));

// ─── 本地 OpenAI 兼容 mock（记录请求体并按场景回复）────────────────────────────

/** PRD §2.2根因复现：人设表达自然带出"社保政策""相关规定"，旧输出正则误判为政策事实。 */
const PERSONA_REPLY =
  "您好！我是社保规划助手。我的职责是帮助您理解社保政策和相关规定。" +
  "需要了解具体政策时我会先检索官方原文。";

const MOCK_HIT = {
  chunkId: "c1",
  documentVersionId: "11111111-1111-4111-8111-111111111111",
  text: "失业保险金第1-12月标准为2340元每月",
  parentText: "上海市失业保险金支付标准",
  path: "/document/paragraph",
  score: 0.9,
  documentTitle: "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
  authority: "上海市人力资源和社会保障局",
  sourceName: "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
  officialUrl: "https://rsj.sh.gov.cn/t1.html",
  contentSha256: "a".repeat(64),
  mime: "text/html",
};

interface CapturedBody {
  tool_choice?: unknown;
  tools?: Array<{ function?: { name?: string } }>;
  messages?: Array<{
    role?: string;
    content?: unknown;
    tool_calls?: Array<{ id?: string; function?: { name?: string } }>;
    tool_call_id?: string;
  }>;
}

type MockToolHit = typeof MOCK_HIT & { originalDownloadPath: string };

function startMockOpenAI(): Promise<{
  server: Server;
  baseUrl: string;
  bodies: CapturedBody[];
  emittedToolCalls: string[];
}> {
  const bodies: CapturedBody[] = [];
  const emittedToolCalls: string[] = [];
  const server = createServer((req, res) => {
    if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const body = JSON.parse(raw) as CapturedBody;
      bodies.push(body);
      const id = `chatcmpl-atr-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      const writeChunk = (delta: unknown, finish: string | null) => {
        res.write(
          `data: ${JSON.stringify({
            id,
            object: "chat.completion.chunk",
            created,
            model: "atr-mock-model",
            choices: [{ index: 0, delta, finish_reason: finish }],
          })}\n\n`,
        );
      };

      const messages = Array.isArray(body.messages) ? body.messages : [];
      const lastUser = [...messages].reverse().find((m) => m?.role === "user");
      const lastUserText = typeof lastUser?.content === "string" ? lastUser.content : "";
      const lastUserIndex = lastUser ? messages.lastIndexOf(lastUser) : -1;
      const toolMessage = messages
        .slice(lastUserIndex + 1)
        .find((m) => m?.role === "tool");

      const sseHead = () => {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
      };
      const sseEnd = () => {
        res.write("data: [DONE]\n\n");
        res.end();
      };
      const replyText = (reply: string) => {
        sseHead();
        writeChunk({ role: "assistant", content: reply }, null);
        writeChunk({}, "stop");
        sseEnd();
      };
      const replyToolCalls = (
        calls: Array<{ name: string; args: Record<string, unknown> }>,
      ) => {
        sseHead();
        writeChunk(
          {
            role: "assistant",
            tool_calls: calls.map((c, i) => ({
              index: i,
              id: `call_atr_${created}_${i}`,
              type: "function",
              function: { name: c.name, arguments: "" },
            })),
          },
          null,
        );
        writeChunk(
          {
            tool_calls: calls.map((c, i) => ({
              index: i,
              function: { arguments: JSON.stringify(c.args) },
            })),
          },
          null,
        );
        writeChunk({}, "tool_calls");
        sseEnd();
        for (const c of calls) emittedToolCalls.push(c.name);
      };
      const policyCall = (query: string) => [
        {
          name: "searchPolicy",
          args: {
            query,
            jurisdiction_code: "310000",
            as_of_date: "2026-09-15",
            top_k: 5,
          },
        },
      ];

      // 场景1：身份问题 → 模型依据系统提示词直接回答人设（不调用工具）。
      if (lastUserText.includes("你是谁")) {
        replyText(PERSONA_REPLY);
        return;
      }

      // 场景2：寒暄 → 直接回答，零工具调用（ATR-AC-002）。
      if (lastUserText.includes("你好")) {
        replyText("你好！很高兴见到你，想聊社保的时候随时告诉我。");
        return;
      }

      // 场景3：能力询问 → 直接回答，零工具调用（ATR-AC-002）。
      if (lastUserText.includes("你能做什么")) {
        replyText(
          "我可以帮你制定社保规划：收集你的信息、用规则引擎计算方案，" +
            "并在需要时检索官方政策原文。",
        );
        return;
      }

      // 场景4：补充画像 → 允许updateProfile，不调用searchPolicy（ATR-AC-002）。
      if (!toolMessage && lastUserText.includes("记住我的信息")) {
        replyToolCalls([
          {
            name: "updateProfile",
            args: { basic: { gender: "female", birth_year: 1975, birth_month: 8 } },
          },
        ]);
        return;
      }

      // 场景5：混合来源 → 同轮调用updateProfile+computePlan+searchPolicy（ATR-AC-004）。
      if (!toolMessage && lastUserText.includes("帮我做规划并查政策")) {
        replyToolCalls([
          {
            name: "updateProfile",
            args: { basic: { gender: "female", birth_year: 1975, birth_month: 8 } },
          },
          {
            name: "computePlan",
            args: {
              jurisdiction_code: "310000",
              basic: { gender: "female", birth_year: 1975 },
            },
          },
          ...policyCall("上海失业保险金标准是多少"),
        ]);
        return;
      }

      // 场景6：政策问题第一轮 → 模型自主发起searchPolicy工具调用。
      if (!toolMessage) {
        const query = lastUserText.includes("生育津贴")
          ? "上海生育津贴标准是多少"
          : "上海失业保险金标准是多少";
        replyToolCalls(policyCall(query));
        return;
      }

      // 场景7：工具结果回传 → 模型基于各工具实际输出组合最终回答；
      // searchPolicy 失败时如实说明不可用（ATR-AC-005），不伪造来源。
      const assistantWithCalls = [...messages]
        .reverse()
        .find(
          (m) => m?.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0,
        );
      const nameById = new Map(
        ((assistantWithCalls?.tool_calls ?? []) as Array<{
          id?: string;
          function?: { name?: string };
        }>).map((tc) => [tc.id, tc.function?.name]),
      );
      const outputs = messages
        .slice(lastUserIndex + 1)
        .filter((m) => m?.role === "tool")
        .map((m) => {
          const content = (m as { content?: unknown }).content;
          let parsed: unknown;
          try {
            parsed = JSON.parse(typeof content === "string" ? content : "{}");
          } catch {
            parsed = {};
          }
          return {
            name: nameById.get((m as { tool_call_id?: string }).tool_call_id),
            body: parsed as Record<string, unknown>,
          };
        });
      const searchOut = outputs.find((o) => o.name === "searchPolicy")?.body;
      const profileOut = outputs.find((o) => o.name === "updateProfile")?.body;
      const planOut = outputs.find((o) => o.name === "computePlan")?.body;

      let reply: string;
      if (searchOut && searchOut.success === false) {
        reply = "政策检索服务暂时不可用，请稍后重试或咨询12333。";
      } else {
        const parts: string[] = [];
        if (profileOut && profileOut.updated === true) {
          const basic = (profileOut.profile as { basic?: Record<string, unknown> })?.basic ?? {};
          parts.push(
            `已记录：性别 ${String(basic.gender ?? "未知")}，出生 ${String(basic.birth_year ?? "?")}年${String(basic.birth_month ?? "?")}月。`,
          );
        }
        if (planOut && planOut.success === true) {
          const calc = planOut.calc as { pension?: { gap_months?: number } } | undefined;
          parts.push(`规划已完成，养老缺口 ${calc?.pension?.gap_months} 个月。`);
        }
        const hits = (searchOut?.hits as Array<MockToolHit> | undefined) ?? [];
        if (searchOut && searchOut.success === true && hits.length > 0) {
          const hit = hits[0];
          parts.push(
            `根据${hit.authority}发布的《${hit.documentTitle}》：${hit.text}` +
              `官网原文：${hit.officialUrl}；归档原件：${hit.originalDownloadPath}。`,
          );
        } else if (searchOut && searchOut.success === true) {
          parts.push("未在官方原文库中检索到可靠依据，请咨询12333。");
        }
        reply = parts.length > 0 ? parts.join("") : "你好，我是本地 mock。";
      }
      replyText(reply);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}/v1`,
        bodies,
        emittedToolCalls,
      });
    });
  });
}

let mock: Awaited<ReturnType<typeof startMockOpenAI>>;

beforeAll(async () => {
  mock = await startMockOpenAI();
  process.env.OPENAI_API_KEY = "atr-unit-test-key";
  process.env.OPENAI_MODEL = "atr-mock-model";
  process.env.OPENAI_URL = mock.baseUrl;
  process.env.AGENT_SERVICE_JWT_CURRENT =
    "atr-unit-test-service-jwt-secret-0123456789abcdef";
});

afterAll(() => {
  mock?.server.close();
});

beforeEach(() => {
  mock.bodies.length = 0;
  mock.emittedToolCalls.length = 0;
});

afterEach(() => {
  __setSearchPolicyFetcherForTest(undefined);
  resetSearchPolicyRuntimeForTest();
  vi.restoreAllMocks();
});

function ragHitResponse(): Response {
  return new Response(
    JSON.stringify({
      hits: [MOCK_HIT],
      candidateCount: 1,
      reliableHitCount: 1,
      noReliableHits: false,
      relevanceThreshold: 0.2,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function runChat(
  messages: ModelMessage[],
  context?: Parameters<typeof createChatStream>[1],
): Promise<string> {
  const result = createChatStream(messages, context);
  return result.text;
}

// ─── ATR-AC-001/ATR-FR-005：身份回答不被兜底语覆盖 ────────────────────────────

describe("身份与普通对话直接回答（ATR-AC-001/ATR-FR-005）", () => {
  it("“你是谁”返回系统提示词定义的角色，不被知识库兜底语整段替换", async () => {
    const text = await runChat([{ role: "user", content: "你是谁" }] as ModelMessage[], {
      confirmedJurisdictionCode: "310000",
      currentDate: "2026-09-15",
    });
    expect(text).toBe(PERSONA_REPLY);
    expect(text).not.toContain("未在官方原文库中检索到可靠依据");
  }, 30_000);

  it("本轮不调用searchPolicy（身份问题零工具调用）", async () => {
    await runChat([{ role: "user", content: "你是谁" }] as ModelMessage[], {
      confirmedJurisdictionCode: "310000",
      currentDate: "2026-09-15",
    });
    // 身份问题只产生一次模型请求：模型未发起任何工具调用，因此不存在工具结果回传的第二步。
    expect(mock.bodies).toHaveLength(1);
    // 全部工具仍对模型可见（不因问题类型裁减工具集），是否调用由模型自主决定。
    expect((mock.bodies[0].tools ?? []).length).toBe(4);
  }, 30_000);
});

// ─── ATR-FR-002/ATR-AC-003：全部工具注册且toolChoice=auto ────────────────────

describe("自动工具选择契约（ATR-FR-002/ATR-AC-003）", () => {
  it("政策问题下每个请求都携带全部工具且toolChoice为auto，无首步强制searchPolicy", async () => {
    __setSearchPolicyFetcherForTest((async () => ragHitResponse()) as unknown as typeof fetch);
    const text = await runChat(
      [{ role: "user", content: "上海失业保险金标准是多少？" }] as ModelMessage[],
      { confirmedJurisdictionCode: "310000", currentDate: "2026-09-15" },
    );

    expect(mock.bodies.length).toBeGreaterThanOrEqual(2);
    const expectedTools = new Set([
      "computePlan",
      "validateField",
      "updateProfile",
      "searchPolicy",
    ]);
    for (const body of mock.bodies) {
      expect(body.tool_choice).toBe("auto");
      const names = new Set(
        (body.tools ?? []).map((t) => t.function?.name).filter(Boolean) as string[],
      );
      expect(names).toEqual(expectedTools);
    }

    // ATR-AC-004：模型自主调用工具后，最终回答使用工具返回的真实机关、标题与双链。
    expect(text).toContain("上海市人力资源和社会保障局");
    expect(text).toContain("2340");
    expect(text).toContain(MOCK_HIT.officialUrl);
    expect(text).toContain(`/api/rag/originals/${MOCK_HIT.documentVersionId}`);
  }, 30_000);
});

// ─── ATR-FR-009：系统提示词无静态政策事实 ─────────────────────────────────────

describe("系统提示词契约（ATR-FR-001/009）", () => {
  it("仍定义社保规划助手角色与身份/寒暄直接回答规则", () => {
    expect(SYSTEM_PROMPT).toContain("社保规划助手");
    expect(SYSTEM_PROMPT).toMatch(/身份介绍|寒暄|能力说明/);
    expect(SYSTEM_PROMPT).toMatch(/不需要调用政策检索|无需调用.*检索|直接回答/);
  });

  it("不再包含静态“2025 政策要点”及动态政策数字（ATR-FR-009）", () => {
    expect(SYSTEM_PROMPT).not.toContain("2025 政策要点");
    expect(SYSTEM_PROMPT).not.toContain("2024 政策要点");
    for (const staticFact of [
      "60→63",
      "55→58",
      "50→55",
      "15年增至20年",
      "2039年达到",
      "男25年/女20年",
      "养老20%，医保10%",
      "最低基数缴费的50%",
      "近退休可延长至8年",
    ]) {
      expect(SYSTEM_PROMPT).not.toContain(staticFact);
    }
  });

  it("服务端日期注入与格式保持不变（原 provenance 套件用例迁移）", () => {
    expect(formatServerDate(new Date("2026-09-13T03:00:00.000Z"))).toBe("2026-09-13");
    const prompt = buildContextPrompt([], undefined, "2026-09-13");
    expect(prompt).toContain("当前服务器日期：2026-09-13");
    expect(prompt).toContain("不得猜测");
  });
});

// ─── ATR-AC-006：无隐藏来源门禁（源码契约，防回归）────────────────────────────

describe("无服务端强制路由与整段替换（ATR-AC-006源码契约）", () => {
  const agentSource = readFileSync(
    join(fileURLToPath(new URL("..", import.meta.url)), "agent.ts"),
    "utf8",
  );

  it("不存在首步强制工具选择（prepareStep）与文本缓存变换（experimental_transform）", () => {
    expect(agentSource).not.toMatch(/\bprepareStep\b/);
    expect(agentSource).not.toMatch(/experimental_transform/);
    expect(agentSource).toMatch(/toolChoice:\s*"auto"/);
  });

  it("不存在输入/输出政策语义正则与整段兜底替换链", () => {
    for (const removedSymbol of [
      "requiresPolicyProvenance",
      "getPolicySearchStep",
      "requiresPolicyOutputProvenance",
      "evaluatePolicyProvenance",
      "policyProvenanceTransform",
      "trustedPolicyHits",
      "SAFE_NO_POLICY_SOURCE_RESPONSE",
      "policySubject",
      "policyFact",
    ]) {
      expect(agentSource).not.toContain(removedSymbol);
    }
  });
});

// ─── 复审修复：提示词来源边界与残留静态政策事实（ATR-FR-001/007/009扩展）──────

describe("提示词来源边界（复审修复）", () => {
  it("规划数值与政策事实来源分工明确且不冲突", () => {
    // 旧表述把一切数值结论/政策细节都限定给computePlan，与searchPolicy来源冲突
    expect(SYSTEM_PROMPT).not.toContain("所有数值结论必须来自 computePlan");
    expect(SYSTEM_PROMPT).not.toContain("超出 computePlan 工具返回结果的政策细节");
    expect(SYSTEM_PROMPT).not.toContain("不得自行估算政策口径数字");
    // 明确分工：规划数值→computePlan；政策事实→searchPolicy
    expect(SYSTEM_PROMPT).toContain("仅来自 computePlan");
    expect(SYSTEM_PROMPT).toContain("仅来自 searchPolicy");
  });

  it("searchPolicy来源限制不扩大为整轮回答（同轮可组合画像与规划结果）", () => {
    expect(SYSTEM_PROMPT).toMatch(/只约束政策事实/);
    expect(SYSTEM_PROMPT).toContain("不排除同一轮");
    expect(SYSTEM_PROMPT).toMatch(/不得因此丢弃|不得丢弃/);
  });
});

describe("无残留静态政策事实（复审修复）", () => {
  it("系统提示词不含固定政策文件、发布日期、调整月份、政策年龄与弹性年限", () => {
    for (const banned of [
      "渐进式延迟法定退休年龄",
      "2024年9月",
      "每年7月调整",
      "50 岁退休",
      "50岁退休",
      "55 岁退休",
      "55岁退休",
      "提前最多3年",
      "最多3年",
    ]) {
      expect(SYSTEM_PROMPT).not.toContain(banned);
    }
  });

  it("画像上下文标签不再附带政策年龄", () => {
    const prompt = buildContextPrompt(
      [],
      { basic: { birth_year: 1975, gender: "female", female_retire_type: "worker50" } },
      "2026-09-15",
    );
    expect(prompt).toContain("worker50");
    expect(prompt).not.toMatch(/50\s*岁退休/);
    expect(prompt).not.toMatch(/55\s*岁退休/);
  });

  it("工具Schema描述与校验文案不附带政策年龄与弹性年限（源码契约）", () => {
    const toolsSource = readFileSync(
      join(fileURLToPath(new URL("..", import.meta.url)), "tools.ts"),
      "utf8",
    );
    for (const banned of ["50岁退休", "55岁退休", "50 岁退休", "55 岁退休", "提前最多3年", "最多3年"]) {
      expect(toolsSource).not.toContain(banned);
    }
  });
});

// ─── 复审修复：普通交流、画像更新、工具失败消费与混合来源（ATR-AC-002/004/005）──

describe("普通交流与画像更新（ATR-AC-002复审补强）", () => {
  const ctx = { confirmedJurisdictionCode: "310000", currentDate: "2026-09-15" };

  it("“你好”寒暄直接回答，零工具调用", async () => {
    const text = await runChat([{ role: "user", content: "你好" }] as ModelMessage[], ctx);
    expect(text).toContain("你好");
    expect(mock.bodies).toHaveLength(1);
    expect(mock.emittedToolCalls).toEqual([]);
    expect(mock.bodies[0].tool_choice).toBe("auto");
  }, 30_000);

  it("能力询问直接回答，不调用searchPolicy", async () => {
    const text = await runChat([{ role: "user", content: "你能做什么？" }] as ModelMessage[], ctx);
    expect(text).toContain("社保规划");
    expect(mock.emittedToolCalls).toEqual([]);
    expect(mock.bodies).toHaveLength(1);
  }, 30_000);

  it("补充画像时允许updateProfile且不调用searchPolicy", async () => {
    const searchFetcher = vi.fn();
    __setSearchPolicyFetcherForTest(searchFetcher as unknown as typeof fetch);
    const text = await runChat(
      [{ role: "user", content: "请记住我的信息：我是女的，1975年8月出生" }] as ModelMessage[],
      ctx,
    );
    expect(text).toContain("已记录");
    expect(text).toContain("female");
    expect(mock.emittedToolCalls).toEqual(["updateProfile"]);
    expect(searchFetcher).not.toHaveBeenCalled();
  }, 30_000);
});

describe("工具失败消费与混合来源（ATR-AC-004/005复审补强）", () => {
  const ctx = { confirmedJurisdictionCode: "310000", currentDate: "2026-09-15" };

  it("searchPolicy不可用时完成整个模型循环：最终回答说明检索不可用且无伪造来源", async () => {
    __setSearchPolicyFetcherForTest(
      (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch,
    );
    const text = await runChat(
      [{ role: "user", content: "上海失业保险金标准是多少？" }] as ModelMessage[],
      ctx,
    );
    expect(text).toContain("暂时不可用");
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toContain("/api/rag/originals/");
    expect(text).not.toContain("gov.cn");
    expect(text).not.toMatch(/〔\d{4}〕/);
    // 完整循环：首步工具调用请求 + 工具结果后的最终回答请求，且都保持auto
    expect(mock.bodies).toHaveLength(2);
    expect(mock.bodies[0].tool_choice).toBe("auto");
    expect(mock.bodies[1].tool_choice).toBe("auto");
  }, 30_000);

  it("混合工具回答同时保留画像、computePlan与searchPolicy结果", async () => {
    __setSearchPolicyFetcherForTest((async () => ragHitResponse()) as unknown as typeof fetch);
    const text = await runChat(
      [
        {
          role: "user",
          content: "我是女的，1975年8月出生，帮我做规划并查政策",
        },
      ] as ModelMessage[],
      ctx,
    );
    // 画像来自updateProfile结果
    expect(text).toContain("已记录");
    expect(text).toContain("female");
    expect(text).toContain("1975");
    // 规划数值来自computePlan结果
    expect(text).toContain("养老缺口 -24 个月");
    // 政策事实与双链来自searchPolicy命中
    expect(text).toContain("上海市人力资源和社会保障局");
    expect(text).toContain(MOCK_HIT.officialUrl);
    expect(text).toContain(`/api/rag/originals/${MOCK_HIT.documentVersionId}`);
    expect(mock.emittedToolCalls).toEqual(["updateProfile", "computePlan", "searchPolicy"]);
  }, 30_000);
});
