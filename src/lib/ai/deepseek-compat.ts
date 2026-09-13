/**
 * DeepSeek Chat Completions 兼容适配器（UAT修复，2026-09-14探测矩阵实证）。
 *
 * 生产探测矩阵（脱敏，账号真实API）：
 * - deepseek-v4.1-flash：/models未列出，真实请求400（账号不支持），禁止使用；
 * - deepseek-flash与deepseek-v4-flash（当前别名）行为一致：
 *   默认thinking下强制tool_choice→400 "Thinking mode does not support this tool_choice"；
 *   显式thinking={type:"disabled"}→200并正确返回searchPolicy工具调用；
 *   tool_choice="auto"与普通对话在默认thinking下均200。
 *
 * 因此按固定决策规则：保留实际可用模型，仅在DeepSeek Chat Completions请求携带
 * 显式tool_choice（对象形式，如首步强制searchPolicy）时注入thinking={type:"disabled"}；
 * 普通对话与tool_choice="auto"继续使用默认thinking；首步强制searchPolicy来源门禁不变。
 *
 * 适配器约束：
 * - 仅匹配DeepSeek模型（模型ID含deepseek）与/chat/completions端点；
 * - 仅修改JSON请求体（非JSON body原样转发）；
 * - 仅在存在显式tool_choice时关闭thinking；
 * - 其他Provider、普通请求和调用形态原样转发；
 * - 不记录Authorization或完整请求正文（日志零输出）。
 */

const CHAT_COMPLETIONS_PATH = "/chat/completions";
const DEEPSEEK_MODEL_PATTERN = /deepseek/i;

/** 显式tool_choice：对象形式（{type:"function",...}/{type:"tool",...}）；"auto"/"none"/缺失不算。
 * 注：字符串"required"同样属DeepSeek thinking拒绝的强制模式，但当前代码库唯一强制
 * 路径是对象形式（getPolicySearchStep的{type:"tool"}），如未来引入required需同步此处。 */
export function isExplicitToolChoice(toolChoice: unknown): boolean {
  return typeof toolChoice === "object" && toolChoice !== null;
}

/** 判断已解析的JSON请求体是否需要DeepSeek thinking兼容注入。 */
function needsThinkingDisabled(body: unknown): body is { thinking?: unknown } & Record<string, unknown> {
  if (typeof body !== "object" || body === null) return false;
  const candidate = body as Record<string, unknown>;
  if (typeof candidate.model !== "string" || !DEEPSEEK_MODEL_PATTERN.test(candidate.model)) {
    return false;
  }
  return isExplicitToolChoice(candidate.tool_choice);
}

/**
 * 包装fetch：对DeepSeek /chat/completions且携带显式tool_choice的JSON请求
 * 注入thinking={type:"disabled"}后转发；其余一切原样转发给底层fetch。
 */
export function withDeepSeekCompat(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (typeof input !== "string" || !input.includes(CHAT_COMPLETIONS_PATH) || !init) {
      return baseFetch(input, init);
    }
    const rawBody = init.body;
    if (typeof rawBody !== "string") {
      // 流式/二进制/Request等形态不解析、不修改，原样转发。
      return baseFetch(input, init);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return baseFetch(input, init);
    }
    if (!needsThinkingDisabled(parsed)) {
      return baseFetch(input, init);
    }
    if (
      (parsed.thinking as { type?: unknown } | undefined)?.type === "disabled"
    ) {
      return baseFetch(input, init);
    }
    const patched = { ...parsed, thinking: { type: "disabled" } };
    const headers = new Headers(init.headers ?? undefined);
    headers.delete("content-length");
    return baseFetch(input, {
      ...init,
      headers,
      body: JSON.stringify(patched),
    });
  };
}
