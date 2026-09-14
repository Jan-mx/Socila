/**
 * RCL演练PostgreSQL环境解析（WI-20260914-01 CIG-FR-005）。
 *
 * RCL受控CLI集成测试与`scripts/e2e-rcl-setup.ts`需要在数据库容器内执行
 * pg_dump/pg_restore/psql（真实归档与恢复对账）。本模块把"容器在哪、以谁连接、
 * 连哪个库"收敛为单一前置解析：
 * - 容器ID/名称只来自`RCL_DRILL_PG_CONTAINER`（GitHub Actions传入
 *   `${{ job.services.postgres.id }}`；本机传入任务专属演练容器），没有默认值；
 * - 用户名、数据库名、端口只来自实际数据库URL，不假设管理用户叫`postgres`；
 * - 任一缺失立即抛出`DrillPgEnvError`并指明缺失项，避免后续undefined或计数级联失败。
 */

export interface DrillPgEnv {
  /** docker容器ID或名称。 */
  container: string;
  /** 数据库URL中的登录用户（容器内psql/pg_dump/pg_restore的-U）。 */
  username: string;
  /** 数据库URL路径中的库名（psql默认连接库、pg_dump目标）。 */
  database: string;
  host: string;
  port: number;
}

export class DrillPgEnvError extends Error {
  constructor(
    public readonly code: "CONTAINER_MISSING" | "DATABASE_URL_MISSING" | "DATABASE_URL_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "DrillPgEnvError";
  }
}

export const DRILL_PG_CONTAINER_VAR = "RCL_DRILL_PG_CONTAINER";
const POSTGRES_DEFAULT_PORT = 5432;

export function resolveDrillPgEnv(input: {
  container: string | undefined;
  databaseUrl: string | undefined;
  /** 数据库URL来源变量名，仅用于错误消息（如SOCILA_TEST_DATABASE_URL）。 */
  databaseUrlVar: string;
}): DrillPgEnv {
  const container = (input.container ?? "").trim();
  if (!container) {
    throw new DrillPgEnvError(
      "CONTAINER_MISSING",
      `${DRILL_PG_CONTAINER_VAR} 未设置：RCL演练需要显式提供PostgreSQL容器ID/名称（GitHub Actions传入 job.services.postgres.id；本机传入任务专属演练容器）`,
    );
  }
  if (!input.databaseUrl) {
    throw new DrillPgEnvError(
      "DATABASE_URL_MISSING",
      `${input.databaseUrlVar} 未设置：RCL演练需要实际数据库URL以读取用户名、数据库名和端口`,
    );
  }
  let url: URL;
  try {
    url = new URL(input.databaseUrl);
  } catch {
    throw new DrillPgEnvError("DATABASE_URL_INVALID", `${input.databaseUrlVar} 不是合法URL`);
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new DrillPgEnvError(
      "DATABASE_URL_INVALID",
      `${input.databaseUrlVar} 协议必须是 postgresql:// 或 postgres://（实际 ${url.protocol}）`,
    );
  }
  const username = decodeURIComponent(url.username);
  if (!username) {
    throw new DrillPgEnvError(
      "DATABASE_URL_INVALID",
      `${input.databaseUrlVar} 缺少用户名：容器内psql/pg_dump/pg_restore以URL用户连接，不假设管理用户`,
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) {
    throw new DrillPgEnvError(
      "DATABASE_URL_INVALID",
      `${input.databaseUrlVar} 缺少数据库名（路径为空）`,
    );
  }
  const port = url.port ? Number(url.port) : POSTGRES_DEFAULT_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new DrillPgEnvError("DATABASE_URL_INVALID", `${input.databaseUrlVar} 端口非法：${url.port}`);
  }
  return { container, username, database, host: url.hostname, port };
}

/** `docker exec <容器> psql -U <url用户> -d <库> -v ON_ERROR_STOP=1 -c <sql>` 参数。 */
export function dockerPsqlArgs(env: DrillPgEnv, sqlText: string, database: string = env.database): string[] {
  return ["exec", env.container, "psql", "-U", env.username, "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sqlText];
}

/** `docker exec -i <容器> pg_restore -U <url用户> -d <目标库> --clean --if-exists` 参数（dump经stdin）。 */
export function dockerPgRestoreArgs(env: DrillPgEnv, targetDatabase: string): string[] {
  return ["exec", "-i", env.container, "pg_restore", "-U", env.username, "-d", targetDatabase, "--clean", "--if-exists"];
}
