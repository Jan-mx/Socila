import "@/lib/env/load-environment";
import { assertLocalDatabaseUrl } from "@/lib/db/guard";

import { seedRules } from "./seed-rules";
import { seedParams } from "./seed-params";
import { seedMisc } from "./seed-misc";
import { importCases, importRegressionTests } from "@/lib/import/excel-import";

async function main() {
  console.log("=== SSP Seed Runner ===");

  try {
    // 门禁：seed 默认只允许本地库，防止 dotenv 回退误写远程生产库。
    const guardedUrl = assertLocalDatabaseUrl();
    console.log(`Database host guard: OK (${new URL(guardedUrl).hostname})`);

    // Phase 1: Rules
    await seedRules();

    // Phase 2: Params
    await seedParams();

    // Phase 3: Rule sets, workflows, example tests
    await seedMisc();

    // Phase 4: Excel imports (cases + regression tests)
    await importCases();
    await importRegressionTests();

    console.log("=== Seed complete ===");
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  }
}

main();
