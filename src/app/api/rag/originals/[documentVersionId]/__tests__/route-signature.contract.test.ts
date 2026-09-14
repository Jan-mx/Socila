/**
 * WI-20260914-01 CIG-FR-001（PMG-FR-020）：原件下载路由签名契约。
 *
 * CI #23 gates失败根因：route.ts以`RouteContext<"/api/rag/originals/[documentVersionId]">`
 * 声明第二参数，而`RouteContext`是`next build`写入`.next/types/routes.d.ts`的
 * 构建生成全局类型——干净checkout（无`.next`）下`npx tsc --noEmit`报
 * `TS2304: Cannot find name 'RouteContext'`。
 *
 * 契约：路由第二参数类型必须是显式对象`{ params: Promise<{ documentVersionId: string }> }`，
 * 不得引用任何构建生成的全局类型；行为契约（401/400/附件头/404/502）由同目录route.test.ts覆盖。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  join(fileURLToPath(new URL("..", import.meta.url)), "route.ts"),
  "utf8",
);

describe("GET /api/rag/originals/[documentVersionId] 路由签名契约（CIG-FR-001）", () => {
  it("不引用构建生成的全局RouteContext类型", () => {
    expect(routeSource).not.toMatch(/\bRouteContext\b/);
  });

  it("第二参数以显式Promise对象类型声明params", () => {
    const signature = routeSource.match(/export async function GET\(([\s\S]*?)\)\s*\{/);
    expect(signature, "必须导出async GET处理器").not.toBeNull();
    const paramsList = signature![1].replace(/\s+/g, " ");
    expect(paramsList).toMatch(
      /\{ params \}: \{ params: Promise<\{ documentVersionId: string \}> \}/,
    );
  });

  it("仍await params后做UUID校验（行为不变）", () => {
    expect(routeSource).toMatch(/const \{ documentVersionId \} = await params;/);
    expect(routeSource).toMatch(/UUID_PATTERN\.test\(documentVersionId\)/);
  });
});
