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

  if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let stream = true;
      try {
        const parsed = JSON.parse(body || "{}");
        stream = parsed.stream !== false;
      } catch {
        stream = true;
      }
      const id = `chatcmpl-e2e-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

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
