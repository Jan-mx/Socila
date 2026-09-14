/**
 * OpenAI 兼容 mock（09-02 Chromium E2E 专用）。
 *
 * 只实现 /v1/chat/completions 的流式（SSE）与非流式最小响应，
 * 返回固定文本，不访问任何外部服务。
 */
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 8787);

function sseChunk(id, created, content, finishReason) {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model: "e2e-mock-model",
    choices: [
      {
        index: 0,
        delta: content === null ? {} : { content },
        finish_reason: finishReason,
      },
    ],
  };
}

const server = createServer((req, res) => {
  // 请求日志（PMG-FR-002）：404 或 5xx 会直接出现在 E2E 服务日志中，
  // 用于验证“服务日志不得出现 mock 404 或未处理 AI API 错误”。
  res.on("finish", () => {
    const status = res.statusCode;
    if (status >= 400) {
      console.log(`mock-openai: ${req.method} ${req.url} -> ${status}`);
    }
  });

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── WI-20260913-01任务4：mock Agent内部RAG API（E2E专用；接受任意Bearer）──────
  const MOCK_DOC_VERSION_ID = "a1b2c3d4-0000-4000-8000-000000003100";
  const MOCK_OFFICIAL_URL = "https://rsj.sh.gov.cn/e2e-mock-policy-2340";
  const MOCK_HIT_TEXT = "失业保险金第1-12月标准为2340元每月，第13-24月为1872元每月。";

  if (req.method === "POST" && req.url?.endsWith("/internal/v1/rag/search")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      const auth = req.headers.authorization ?? "";
      if (!auth.startsWith("Bearer ") || auth.length < 20) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "SERVICE_AUTH_INVALID" }));
        return;
      }
      let query = "";
      try {
        query = String(JSON.parse(body).query ?? "");
      } catch {
        query = "";
      }
      // “生育津贴”触发空命中场景：无可靠命中必须显式返回，不得编造。
      const hits =
        query.includes("生育津贴")
          ? []
          : [
              {
                chunkId: `${MOCK_DOC_VERSION_ID}:p0:e2e`,
                documentVersionId: MOCK_DOC_VERSION_ID,
                text: MOCK_HIT_TEXT,
                parentText: "上海市失业保险金支付标准",
                path: "/document/paragraph",
                score: 0.93,
                documentTitle: "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
                authority: "上海市人力资源和社会保障局",
                sourceName: "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
                officialUrl: MOCK_OFFICIAL_URL,
                contentSha256: "e".repeat(64),
                mime: "text/html",
              },
            ];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        hits,
        candidateCount: hits.length,
        reliableHitCount: hits.length,
        noReliableHits: hits.length === 0,
        relevanceThreshold: 0.2,
      }));
    });
    return;
  }

  const originalMatch = req.method === "GET" && req.url?.match(/\/internal\/v1\/rag\/documents\/([0-9a-f-]+)\/original$/);
  if (originalMatch) {
    const auth = req.headers.authorization ?? "";
    if (!auth.startsWith("Bearer ") || auth.length < 20) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "SERVICE_AUTH_INVALID" }));
      return;
    }
    if (originalMatch[1] !== MOCK_DOC_VERSION_ID) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "DOCUMENT_NOT_FOUND" }));
      return;
    }
    const bytes = Buffer.from(`e2e-mock-original-bytes:${MOCK_HIT_TEXT}`, "utf8");
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="original-${MOCK_DOC_VERSION_ID}.html"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    });
    res.end(bytes);
    return;
  }

  if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let stream = true;
      let messages = [];
      try {
        const parsed = JSON.parse(body || "{}");
        stream = parsed.stream !== false;
        messages = Array.isArray(parsed.messages) ? parsed.messages : [];
      } catch {
        stream = true;
      }
      const id = `chatcmpl-e2e-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      // ── WI-20260913-01任务4：searchPolicy工具调用编排（SHV2-AC-027 E2E）──────
      // 触发词“失业保险金标准”→第一轮发起searchPolicy工具调用；
      // “生育津贴”触发词命中空场景→工具返回空hits后如实说明不编造来源；
      // 第二轮（messages含tool结果）→把命中中的官网URL与归档原件下载路径写进回复。
      const lastUser = [...messages].reverse().find((m) => m?.role === "user");
      const lastUserText = typeof lastUser?.content === "string"
        ? lastUser.content
        : Array.isArray(lastUser?.content)
          ? lastUser.content.map((p) => (typeof p?.text === "string" ? p.text : "")).join("")
          : "";
      // 只取“最后一条user消息之后”的tool结果：多轮对话中历史消息里的旧tool结果
      // 不应把新一轮问题误判为“工具已执行”。
      const lastUserIndex = messages.lastIndexOf(lastUser);
      const toolMessage = messages.slice(lastUserIndex + 1).find((m) => m?.role === "tool");

      // 负向模型A：明知是政策事实问题却跳过工具并直接输出数字/伪造URL。
      // 服务端来源门禁必须缓存并替换整段文本，不能让首个token泄漏到浏览器。
      if (!toolMessage && lastUserText.includes("跳过检索负向测试")) {
        const unsafeReply =
          "上海失业保险金标准为9999元。官网原文：https://example.com/invented-policy";
        if (stream) {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          res.write(`data: ${JSON.stringify(sseChunk(id, created, unsafeReply, null))}\n\n`);
          res.write(`data: ${JSON.stringify(sseChunk(id, created, null, "stop"))}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({
            id, object: "chat.completion", created, model: "e2e-mock-model",
            choices: [{ index: 0, message: { role: "assistant", content: unsafeReply }, finish_reason: "stop" }],
          }));
        }
        return;
      }

      const searchTrigger = lastUserText.includes("失业保险金标准")
        ? "上海市失业保险金标准是多少"
        : lastUserText.includes("生育津贴")
          ? "上海生育津贴标准是多少"
          : null;

      if (!toolMessage && searchTrigger !== null) {
        const systemText = messages
          .filter((m) => m?.role === "system")
          .map((m) => String(m?.content ?? ""))
          .join("\n");
        const injectedDate = systemText.match(/当前服务器日期：(\d{4}-\d{2}-\d{2})/)?.[1]
          ?? new Date().toISOString().slice(0, 10);
        const toolCallArguments = JSON.stringify({
          query: searchTrigger,
          jurisdiction_code: "310000",
          as_of_date: injectedDate,
          top_k: 5,
        });
        if (stream) {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          res.write(
            `data: ${JSON.stringify({
              id,
              object: "chat.completion.chunk",
              created,
              model: "e2e-mock-model",
              choices: [
                {
                  index: 0,
                  delta: {
                    role: "assistant",
                    tool_calls: [
                      {
                        index: 0,
                        id: `call_e2e_${created}`,
                        type: "function",
                        function: { name: "searchPolicy", arguments: "" },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            })}\n\n`,
          );
          res.write(
            `data: ${JSON.stringify({
              id,
              object: "chat.completion.chunk",
              created,
              model: "e2e-mock-model",
              choices: [
                {
                  index: 0,
                  delta: { tool_calls: [{ index: 0, function: { arguments: toolCallArguments } }] },
                  finish_reason: null,
                },
              ],
            })}\n\n`,
          );
          res.write(
            `data: ${JSON.stringify({
              id,
              object: "chat.completion.chunk",
              created,
              model: "e2e-mock-model",
              choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
            })}\n\n`,
          );
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              id,
              object: "chat.completion",
              created,
              model: "e2e-mock-model",
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                      {
                        id: `call_e2e_${created}`,
                        type: "function",
                        function: { name: "searchPolicy", arguments: toolCallArguments },
                      },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            }),
          );
        }
        return;
      }

      if (toolMessage) {
        // 工具结果已回传：解析命中并把官网与归档原件链接写进最终回复。
        let toolOutput = {};
        const rawContent = typeof toolMessage.content === "string" ? toolMessage.content : "";
        try {
          toolOutput = JSON.parse(rawContent);
        } catch {
          toolOutput = {};
        }
        const hits = Array.isArray(toolOutput?.hits) ? toolOutput.hits : [];
        let reply;
        if (toolOutput?.success && hits.length > 0) {
          const hit = hits[0];
          reply = lastUserText.includes("伪造链接负向测试")
            ? "上海失业金标准为9999元。官网原文：https://example.com/fake；归档原件：/api/rag/originals/22222222-2222-4222-8222-222222222222"
            : `根据${hit.authority}发布的《${hit.documentTitle}》：${hit.text}官网原文：${hit.officialUrl}；` +
              `归档原件：${hit.originalDownloadPath}（登录后可下载）。`;
        } else if (toolOutput?.success) {
          reply = "未在官方原文库中检索到可靠依据，请咨询12333或当地社保窗口。";
        } else {
          reply = "政策检索服务暂时不可用，请稍后重试。";
        }
        if (stream) {
          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          });
          res.write(`data: ${JSON.stringify(sseChunk(id, created, reply, null))}\n\n`);
          res.write(`data: ${JSON.stringify(sseChunk(id, created, null, "stop"))}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              id,
              object: "chat.completion",
              created,
              model: "e2e-mock-model",
              choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
            }),
          );
        }
        return;
      }

      if (!stream) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id,
            object: "chat.completion",
            created,
            model: "e2e-mock-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "你好，我是本地 mock。" },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          }),
        );
        return;
      }

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify(sseChunk(id, created, "你好", null))}\n\n`);
      res.write(
        `data: ${JSON.stringify(sseChunk(id, created, "，我是本地 mock 回复。", null))}\n\n`,
      );
      res.write(`data: ${JSON.stringify(sseChunk(id, created, null, "stop"))}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { message: "not found" } }));
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-openai listening on http://127.0.0.1:${port}`);
});
