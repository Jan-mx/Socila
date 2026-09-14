/**
 * NRP-FR-017 环境回退防护：本模块在物化CLI中最先导入。
 * 若检测到进程环境中没有DATABASE_URL，直接终止——绝不读取.env.local/.env回退
 * （即使文件存在也不读）。这是显式目标要求的运行时兜底。
 */
declare global {
  var __socilaMaterializeEnvChecked: boolean | undefined;
}

if (!globalThis.__socilaMaterializeEnvChecked) {
  globalThis.__socilaMaterializeEnvChecked = true;
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim().length === 0) {
    console.error(
      "[materialize-env] DATABASE_URL 未在进程环境中显式设置；阶段E物化不读取.env.local/.env回退（NRP-FR-017/NRP-NFR-009）。",
    );
    process.exit(1);
  }
}

export {};
