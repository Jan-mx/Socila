import "@/lib/env/load-environment";

import { seedRules } from "./seed-rules";
import { seedParams } from "./seed-params";
import { seedMisc } from "./seed-misc";
import { importCases, importRegressionTests } from "@/lib/import/excel-import";

async function main() {
  console.log("=== SSP Seed Runner ===");

  try {
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
