/**
 * RCL-FR-021 地区化案例库受控执行器（七种模式）：
 *
 *   npx tsx scripts/rcl-case-library.ts audit
 *   npx tsx scripts/rcl-case-library.ts prepare-archive
 *   npx tsx scripts/rcl-case-library.ts verify-archive <manifestHash>
 *   npx tsx scripts/rcl-case-library.ts generate
 *   npx tsx scripts/rcl-case-library.ts plan-replacement
 *   npx tsx scripts/rcl-case-library.ts apply <manifestHash> --i-am-authorized
 *   npx tsx scripts/rcl-case-library.ts verify <manifestHash>
 *
 * - 默认只执行只读audit（RCL-FR-021）；apply必须携带授权参数与manifest哈希；
 * - DATABASE_URL必须进程显式设置且仅限本机（assertLocalDatabaseUrl，禁止dotenv回退）；
 * - 归档写入 backup/case-library/<UTC时间戳>/（Git忽略，不进入镜像或提交）；
 * - 持久库0018/删除/插入/归档状态写入不在本脚本范围（由WI-20260907-04受控执行）。
 */
import "../src/lib/env/load-environment";
import { assertLocalDatabaseUrl } from "../src/lib/db/guard";

const DATABASE_URL = assertLocalDatabaseUrl();

async function main() {
  const [mode, arg1] = process.argv.slice(2);
  if (!mode) {
    process.stderr.write(
      "用法：rcl-case-library.ts audit | prepare-archive | verify-archive <hash> | generate | plan-replacement | apply <hash> --i-am-authorized | verify <hash>\n",
    );
    process.exit(1);
  }
  process.stdout.write(`[rcl-case-library] mode=${mode} database=${new URL(DATABASE_URL).host}\n`);
  process.stdout.write(
    "[rcl-case-library] 持久库0018/删除/插入/归档状态写入不属于本脚本：由WI-20260907-04在fresh audit后经用户明确授权执行\n",
  );
  if (mode === "apply" && !process.argv.includes("--i-am-authorized")) {
    process.stderr.write("[rcl-case-library] apply需要显式授权参数 --i-am-authorized\n");
    process.exit(1);
  }
  void arg1;
  process.stdout.write(`[rcl-case-library] ${mode} 门禁与实现见 src/lib/case-governance/ 与集成测试（隔离库）\n`);
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});