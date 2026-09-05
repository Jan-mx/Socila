import "@/lib/env/load-environment";
import { assertLocalDatabaseUrl } from "@/lib/db/guard";

import { discoverRegionDsl } from "@/lib/dsl/region-manifest";
import { seedRules } from "./seed-rules";
import { seedParams } from "./seed-params";
import { seedMisc } from "./seed-misc";
import { seedPublishWorkflow } from "./seed-workflow";
import { importCases, importRegressionTests } from "@/lib/import/excel-import";

async function main() {
  console.log("=== Socila Seed Runner ===");

  try {
    // 门禁：seed 默认只允许本地库，防止 dotenv 回退误写远程生产库。
    const guardedUrl = assertLocalDatabaseUrl();
    console.log(`Database host guard: OK (${new URL(guardedUrl).hostname})`);

    // SDL-FR-004：地区与资产路径经地区Manifest发现，装载代码不硬编码地区。
    const regions = discoverRegionDsl();
    console.log(
      `Discovered regions: ${regions.map((r) => `${r.manifest.region_slug}(${r.manifest.jurisdiction_code})`).join(", ")}`,
    );

    // 协议级发布工作流：地区无关，只装载一次（复审纠正——不在地区循环内重复更新）。
    await seedPublishWorkflow();

    for (const region of regions) {
      // Phase 1: Rules
      await seedRules(region);

      // Phase 2: Params
      await seedParams(region);

      // Phase 3: Rule sets and example tests
      await seedMisc(region);
    }

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
