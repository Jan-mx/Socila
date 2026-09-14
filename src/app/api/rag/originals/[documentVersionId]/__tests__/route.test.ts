/**
 * WI-20260913-01任务4：登录态原件下载代理路由契约（SHV2-FR-031/AC-026/027）。
 *
 * - 未登录（匿名）一律拒绝；
 * - 已登录用户经新签发的Next→Agent服务JWT代理Agent原件流；
 * - 未知版本→404；Agent其他失败→502失败关闭（不透传MinIO信息）；
 * - 成功响应带attachment/nosniff/private no-store并转发对象字节。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

const requireActorMock = vi.fn();
const getServiceJwtMock = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/auth/require-actor", () => ({
  requireActor: (...args: unknown[]) => requireActorMock(...args),
}));
vi.mock("@/lib/security/service-jwt-provider", () => ({
  getServiceJwt: (...args: unknown[]) => getServiceJwtMock(...args),
}));

const HTML = "<html><body>original-bytes</body></html>".replace(
  "original-bytes",
  "上海市失业保险金支付标准",
);

describe("GET /api/rag/originals/[documentVersionId]", () => {
  let GET: typeof import("../route").GET;

  beforeEach(async () => {
    vi.resetModules();
    ({ GET } = await import("../route"));
    getServiceJwtMock.mockReturnValue({
      signNextToken: async () => "signed-next-token",
    });
    fetchMock.mockImplementation(async () => {
      return new Response(HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AGENT_INTERNAL_URL", "http://agent:8100");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("未登录拒绝且不发起Agent调用", async () => {
    requireActorMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), { status: 401 }),
    });
    const response = await GET(
      new Request("http://localhost/api/rag/originals/11111111-1111-4111-8111-111111111111") as unknown as NextRequest,
      { params: Promise.resolve({ documentVersionId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("非法版本ID（非UUID）400且不发起Agent调用", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: { userId: "u1", username: "jan", role: "user", authVersion: 1, mustChangePassword: false },
    });
    const response = await GET(new Request("http://localhost/api/rag/originals/..%2Fetc") as unknown as NextRequest, {
      params: Promise.resolve({ documentVersionId: "../../etc" }),
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("已登录用户代理Agent原件流并返回附件安全头", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: { userId: "u1", username: "jan", role: "user", authVersion: 1, mustChangePassword: false },
    });
    const response = await GET(
      new Request("http://localhost/api/rag/originals/11111111-1111-4111-8111-111111111111") as unknown as NextRequest,
      { params: Promise.resolve({ documentVersionId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("上海市失业保险金支付标准");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "http://agent:8100/internal/v1/rag/documents/11111111-1111-4111-8111-111111111111/original",
    );
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer signed-next-token",
    });
  });

  it("Agent 404（未知版本）映射404；其他Agent失败映射502失败关闭", async () => {
    requireActorMock.mockResolvedValue({
      ok: true,
      actor: { userId: "u1", username: "jan", role: "user", authVersion: 1, mustChangePassword: false },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "DOCUMENT_NOT_FOUND" }), { status: 404 }),
    );
    const notFound = await GET(
      new Request("http://localhost/api/rag/originals/11111111-1111-4111-8111-111111111111") as unknown as NextRequest,
      { params: Promise.resolve({ documentVersionId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(notFound.status).toBe(404);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "OBJECT_SHA_DRIFT" }), { status: 502 }),
    );
    const drift = await GET(
      new Request("http://localhost/api/rag/originals/11111111-1111-4111-8111-111111111111") as unknown as NextRequest,
      { params: Promise.resolve({ documentVersionId: "11111111-1111-4111-8111-111111111111" }) },
    );
    expect(drift.status).toBe(502);
    const body = (await drift.json()) as { error?: string };
    expect(body.error).toBe("ORIGINAL_FETCH_FAILED");
  });
});
