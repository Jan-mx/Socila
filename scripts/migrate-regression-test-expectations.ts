import "../src/lib/env/load-environment";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/lib/db";
import { tests } from "../src/lib/db/schema";

export function migrateLegacyRegressionExpected(
  expected: unknown,
): Record<string, unknown> | null {
  if (
    typeof expected !== "object" ||
    expected === null ||
    Array.isArray(expected)
  ) {
    return null;
  }

  const record = expected as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(record, "needs_agent")) {
    return null;
  }
  if (Object.keys(record).length !== 1) {
    throw new Error("Legacy regression expected must contain only needs_agent");
  }
  if (typeof record.needs_agent !== "boolean") {
    throw new Error("Legacy regression expected needs_agent must be a boolean");
  }

  return { calc: { needs_agent: record.needs_agent } };
}

export function assertLegacyRegressionCandidates(
  candidates: Array<{ id: number; expected: unknown }>,
): void {
  for (const candidate of candidates) {
    try {
      if (migrateLegacyRegressionExpected(candidate.expected) === null) {
        throw new Error("not a legacy expectation object");
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Regression test ${candidate.id} is not a valid legacy expectation: ${detail}`,
      );
    }
  }
}

export async function migrateRegressionTestExpectations(): Promise<number> {
  const candidates = await db
    .select({ id: tests.id, expected: tests.expected })
    .from(tests)
    .where(
      and(
        eq(tests.source, "regression"),
        sql`${tests.expected} ? 'needs_agent'`,
      ),
    );

  assertLegacyRegressionCandidates(candidates);

  if (candidates.length === 0) {
    console.log("Updated 0 regression test expectations.");
    return 0;
  }

  const updated = await db
    .update(tests)
    .set({
      expected: sql`jsonb_build_object('calc', jsonb_build_object('needs_agent', ${tests.expected} -> 'needs_agent'))`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tests.source, "regression"),
        inArray(
          tests.id,
          candidates.map((candidate) => candidate.id),
        ),
        sql`jsonb_typeof(${tests.expected}) = 'object'`,
        sql`jsonb_object_length(${tests.expected}) = 1`,
        sql`jsonb_typeof(${tests.expected} -> 'needs_agent') = 'boolean'`,
      ),
    )
    .returning({ id: tests.id });

  if (updated.length !== candidates.length) {
    throw new Error(
      `Expected to update ${candidates.length} regression tests, updated ${updated.length}`,
    );
  }

  console.log(`Updated ${updated.length} regression test expectations.`);
  return updated.length;
}

if (
  process.argv[1]
    ?.replaceAll("\\", "/")
    .endsWith("/scripts/migrate-regression-test-expectations.ts")
) {
  migrateRegressionTestExpectations().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
