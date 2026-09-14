/**
 * WI任务2缺口调查：官方政策原件采集脚本（NRP-FR-001/002）。
 *
 * 用法：
 *   node scripts/capture-official-page.mjs <docId> <jurisdiction> <url> [url2 ...]
 *
 * 行为：
 * - 只允许官方来源白名单域名（docs/refactor/policy-ops-agent/sources/official-source-registry.md）；
 *   重定向后的最终域名同样必须命中白名单，否则拒绝抓取（防SSRF/越权来源）；
 * - 优先Playwright无头Chromium（渲染DOM）；部分站点拦截Chromium TLS指纹时自动回退
 *   curl（浏览器UA直连，保存服务器原始HTML）；fetchMethod如实记录；
 * - 保存 original.html、http-headers.txt、extracted-text.txt、meta.json（不含凭据）；
 * - 正文过短视为命中验证码/反爬：退出并提示转人工上传，不绕过站点控制。
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const NL = String.fromCharCode(10);
const ALLOWED_HOSTS = new Set([
  "www.gov.cn",
  "www.mohrss.gov.cn",
  "www.nhsa.gov.cn",
  "www.shanghai.gov.cn",
  "rsj.sh.gov.cn",
  "ybj.sh.gov.cn",
  "www.gd.gov.cn",
  "hrss.gd.gov.cn",
  "hsa.gd.gov.cn",
  "www.sc.gov.cn",
  "rst.sc.gov.cn",
  "ylbzj.sc.gov.cn",
]);

const EVIDENCE_ROOT = path.join(
  process.cwd(),
  "docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence",
);

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function assertAllowedHost(rawUrl) {
  const u = new URL(rawUrl);
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error(`[capture] 非http(s)协议：${u.protocol}`);
  }
  if (!ALLOWED_HOSTS.has(u.hostname)) {
    throw new Error(`[capture] 域名不在官方来源白名单：${u.hostname}`);
  }
  return u;
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, NL)
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/(\r?\n\s*){2,}/g, NL)
    .trim();
}

function persist(dir, docId, rawUrl, finalUrl, status, headers, body, method) {
  const text = htmlToText(body);
  if (text.length < 200) {
    throw new Error(`正文过短（${text.length}字符）——疑似验证码/反爬，转人工处理`);
  }
  const sha = createHash("sha256").update(body, "utf8").digest("hex");
  writeFileSync(path.join(dir, "original.html"), body, "utf8");
  writeFileSync(
    path.join(dir, "http-headers.txt"),
    Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join(NL),
    "utf8",
  );
  writeFileSync(path.join(dir, "extracted-text.txt"), text, "utf8");
  const title = (body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "").trim();
  writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        docId,
        title,
        officialUrl: rawUrl,
        finalUrl,
        httpStatus: status,
        fetchedAt: new Date().toISOString(),
        fetchMethod: method,
        sha256: sha,
        byteSize: Buffer.byteLength(body, "utf8"),
      },
      null,
      2,
    ) + NL,
    "utf8",
  );
  console.log(
    `[capture] ${docId} <- ${finalUrl} status=${status} sha256=${sha} bytes=${Buffer.byteLength(body, "utf8")} (${method})`,
  );
}

async function captureWithCurl(dir, docId, rawUrl) {
  const res = await fetch(rawUrl, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "zh-CN,zh;q=0.9",
    },
    redirect: "follow",
  });
  const finalUrl = res.url;
  assertAllowedHost(finalUrl);
  const body = await res.text();
  persist(dir, docId, rawUrl, finalUrl, res.status, Object.fromEntries(res.headers.entries()), body, "curl-browser-ua");
}

async function chromiumLaunch() {
  try {
    const { chromium } = await import("playwright");
    return await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
  } catch (err) {
    console.error(`[capture] Chromium不可用（${err.message.split(NL)[0]}），直接使用curl。`);
    return null;
  }
}

async function main() {
  const [docId, jurisdiction, ...urls] = process.argv.slice(2);
  if (!docId || !jurisdiction || urls.length === 0) {
    console.error(
      "[capture] 用法：node scripts/capture-official-page.mjs <docId> <jurisdiction> <url> [...]",
    );
    process.exit(1);
  }
  for (const u of urls) assertAllowedHost(u);

  const dir = path.join(EVIDENCE_ROOT, jurisdiction, docId);
  mkdirSync(dir, { recursive: true });

  const browser = await chromiumLaunch();
  for (const rawUrl of urls) {
    assertAllowedHost(rawUrl);
    let done = false;
    if (browser) {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        const resp = await page.goto(rawUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        const finalUrl = page.url();
        assertAllowedHost(finalUrl);
        await page.waitForTimeout(1500);
        const body = await page.content();
        persist(dir, docId, rawUrl, finalUrl, resp?.status() ?? 0, resp?.headers() ?? {}, body, "playwright-chromium-headless");
        done = true;
      } catch (err) {
        console.error(`[capture] ${docId} Chromium失败（${err.message.split(NL)[0]}），回退curl…`);
      }
      await context.close();
    }
    if (!done) {
      try {
        await captureWithCurl(dir, docId, rawUrl);
      } catch (err) {
        console.error(`[capture] ${docId} 抓取失败：${err.message}`);
        await browser?.close();
        process.exit(3);
      }
    }
  }
  await browser?.close();
}

main();
