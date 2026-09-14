/**
 * 共享 plain-Node 环境加载器（09-03 CFG-FR-002）。
 *
 * 与 src/lib/env/load-environment.ts 完全同语义：
 * `.env.local` 优先、`.env` 回退、进程环境变量不覆盖（override:false）。
 * run-migrations.mjs、bootstrap-admin.mjs 等 plain Node 脚本统一经本模块
 * 读取配置，消除 `dotenv/config` 只读 `.env` 造成的宿主机/容器配置漂移。
 *
 * 用法（显式调用，无导入副作用）：
 *   import { loadEnvironment } from "./lib/load-environment.mjs";
 *   loadEnvironment();
 */
import { config } from "dotenv";
import { resolve } from "node:path";

export function loadEnvironment(cwd = process.cwd()) {
  config({ path: resolve(cwd, ".env.local"), override: false, quiet: true });
  config({ path: resolve(cwd, ".env"), override: false, quiet: true });
}
