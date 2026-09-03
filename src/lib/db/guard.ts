/**
 * 本地脚本数据库门禁（事故防御：2026-08-30 seed 曾因环境文件回退误连远程生产库）。
 *
 * 面向开发/运维脚本（seed、showcase 生成等）：DATABASE_URL 指向非本机主机时拒绝执行，
 * 除非显式设置 ALLOW_REMOTE_DATABASE=1（09-03 CFG-FR-009：仅 Compose migrate 服务
 * 持有该例外，用于容器内部 DNS 主机）。应用运行时（生产部署到远程库）不经过本门禁。
 */
export function assertLocalDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("[db-guard] DATABASE_URL is not set");
  }
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("[db-guard] DATABASE_URL is not a valid URL");
  }
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (!isLocal && process.env.ALLOW_REMOTE_DATABASE !== "1") {
    throw new Error(
      `[db-guard] DATABASE_URL 指向非本机主机 (${host})。脚本默认只允许本地库；` +
        `确需远程请显式设置 ALLOW_REMOTE_DATABASE=1。`,
    );
  }
  return url;
}
