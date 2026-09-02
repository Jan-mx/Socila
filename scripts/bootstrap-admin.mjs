/**
 * Jan 管理员幂等引导脚本（09-02 AUTH-FR-012，§11.2，AUTH-AC-018）。
 *
 * 读取现有 ADMIN_USERNAME 与 ADMIN_PASSWORD_HASH：
 * - 数据库无该规范化用户名 → 创建 role=admin、status=active 用户；
 * - 已是 admin → no-op（幂等）；
 * - 已是普通 user → 失败退出（不覆盖密码或角色，需人工决策）。
 *
 * 安全约束：不输出明文密码、哈希或数据库连接串；默认只允许本地库
 * （与 run-migrations.mjs 同门禁）；引导成功后运行时登录完全走数据库。
 *
 * 用法：DATABASE_URL=postgresql://... ADMIN_USERNAME=Jan ADMIN_PASSWORD_HASH=$2b$... \
 *       node scripts/bootstrap-admin.mjs
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[bootstrap-admin] DATABASE_URL is required");
  process.exit(1);
}

// 门禁：引导默认只允许本地库，防止 dotenv 回退误连远程生产库。
{
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error("[bootstrap-admin] DATABASE_URL is not a valid URL");
    process.exit(1);
  }
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!isLocal && process.env.ALLOW_REMOTE_DATABASE !== "1") {
    console.error(
      `[bootstrap-admin] DATABASE_URL 指向非本机主机 (${host})。引导默认只允许本地库；` +
        `确需远程（生产首次开通，需用户单独授权）请显式设置 ALLOW_REMOTE_DATABASE=1。`,
    );
    process.exit(1);
  }
}

const username = process.env.ADMIN_USERNAME;
const passwordHash = process.env.ADMIN_PASSWORD_HASH;

if (!username || !passwordHash) {
  console.error(
    "[bootstrap-admin] ADMIN_USERNAME and ADMIN_PASSWORD_HASH are required",
  );
  process.exit(1);
}

// bcrypt cost 12 哈希格式校验（§10.2）；只检查形态，不输出内容。
const BCRYPT_HASH_RE = /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/;
if (!BCRYPT_HASH_RE.test(passwordHash)) {
  console.error(
    "[bootstrap-admin] ADMIN_PASSWORD_HASH 必须是 bcrypt cost 12 哈希（$2a/$2b/$2y$12$...）",
  );
  process.exit(1);
}

// 与 identity domain username.ts 一致：trim + NFKC + lowercase（引导不经保留名检查）。
function normalizeUsername(raw) {
  return String(raw).trim().normalize("NFKC").toLowerCase();
}

const normalized = normalizeUsername(username);
if (normalized.length < 3 || normalized.length > 32) {
  console.error("[bootstrap-admin] ADMIN_USERNAME 规范化后长度必须在 3-32 之间");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT id, role, status FROM users WHERE normalized_username = $1 FOR UPDATE",
      [normalized],
    );

    if (existing.rowCount > 0) {
      const row = existing.rows[0];
      if (row.role === "admin") {
        // 幂等：已是 admin（含被禁用的历史管理员）→ no-op
        await client.query("COMMIT");
        console.log(
          `[bootstrap-admin] admin already present (status=${row.status}); no-op`,
        );
        process.exit(0);
      }
      // 同名普通用户冲突：失败，不提升、不覆盖（§13）
      await client.query("ROLLBACK");
      console.error(
        "[bootstrap-admin] normalized username already exists as a regular user; " +
          "refusing to promote or overwrite. Resolve manually.",
      );
      process.exit(1);
    }

    await client.query(
      `INSERT INTO users (username, normalized_username, password_hash, role, status)
       VALUES ($1, $2, $3, 'admin', 'active')`,
      [String(username).trim().normalize("NFKC"), normalized, passwordHash],
    );
    await client.query("COMMIT");
    console.log(
      `[bootstrap-admin] admin user created (normalized_username=${normalized})`,
    );
    process.exit(0);
  } finally {
    client.release();
  }
} catch (err) {
  console.error(
    "[bootstrap-admin] bootstrap failed:",
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
} finally {
  await pool.end();
}
