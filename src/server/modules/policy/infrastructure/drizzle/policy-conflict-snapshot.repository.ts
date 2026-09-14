import { and, desc, eq, inArray } from "drizzle-orm";
import { db, type DbClient } from "@/lib/db";
import { policyConflicts, policySnapshotMembers, policySnapshots } from "@/lib/db/schema";
import type {
  PolicyConflictRepository,
  PolicySnapshotRepository,
} from "../../application/ports";

export class DrizzlePolicyConflictRepository implements PolicyConflictRepository {
  async insertConflicts(rows: (typeof policyConflicts.$inferInsert)[], tx?: DbClient) {
    if (rows.length === 0) return [];
    return (tx ?? db).insert(policyConflicts).values(rows).returning();
  }

  async listConflicts(filters?: { status?: string; jurisdictionCode?: string }) {
    const conditions = [];
    if (filters?.status) conditions.push(eq(policyConflicts.status, filters.status));
    if (filters?.jurisdictionCode)
      conditions.push(eq(policyConflicts.jurisdictionCode, filters.jurisdictionCode));
    return db
      .select()
      .from(policyConflicts)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(policyConflicts.createdAt));
  }

  async resolveConflict(
    id: number,
    decision: { status: "resolved" | "dismissed"; resolvedBy: string; resolution: unknown },
    tx?: DbClient,
  ) {
    const rows = await (tx ?? db)
      .update(policyConflicts)
      .set({
        status: decision.status,
        resolvedBy: decision.resolvedBy,
        resolution: decision.resolution,
        resolvedAt: new Date(),
      })
      .where(eq(policyConflicts.id, id))
      .returning();
    return rows[0] ?? null;
  }
}

export class DrizzlePolicySnapshotRepository implements PolicySnapshotRepository {
  async insertSnapshot(
    snapshot: {
      jurisdictionCode: string;
      asOfDate: string;
      resolvedPath: string;
      contentHash: string;
      createdBy: string;
    },
    members: Array<{
      entityType: "rule" | "param" | "rule_set";
      businessKey: string;
      payload: unknown;
      provenance: unknown;
    }>,
    tx?: DbClient,
  ) {
    const executor = tx ?? db;
    const snapshotRows = await executor
      .insert(policySnapshots)
      .values({
        jurisdictionCode: snapshot.jurisdictionCode,
        asOfDate: snapshot.asOfDate,
        resolvedPath: snapshot.resolvedPath,
        contentHash: snapshot.contentHash,
        createdBy: snapshot.createdBy,
      })
      .returning();
    const created = snapshotRows[0];
    if (members.length > 0) {
      await executor.insert(policySnapshotMembers).values(
        members.map((m) => ({
          snapshotId: created.id,
          entityType: m.entityType,
          businessKey: m.businessKey,
          payload: m.payload as Record<string, unknown>,
          provenance: m.provenance as Record<string, unknown>[],
        })),
      );
    }
    return created;
  }

  async getSnapshot(id: string) {
    const snapshotRows = await db
      .select()
      .from(policySnapshots)
      .where(eq(policySnapshots.id, id))
      .limit(1);
    const snapshot = snapshotRows[0];
    if (!snapshot) return null;
    const members = await db
      .select()
      .from(policySnapshotMembers)
      .where(eq(policySnapshotMembers.snapshotId, snapshot.id));
    return { snapshot, members };
  }

  async findLatest(jurisdictionCode: string, asOfDate: string) {
    const rows = await db
      .select()
      .from(policySnapshots)
      .where(
        and(
          eq(policySnapshots.jurisdictionCode, jurisdictionCode),
          eq(policySnapshots.asOfDate, asOfDate),
        ),
      )
      .orderBy(desc(policySnapshots.createdAt))
      .limit(1);
    return rows[0] ?? null;
  }

  async listSnapshotsContainingKey(businessKey: string) {
    const memberRows = await db
      .select({ snapshotId: policySnapshotMembers.snapshotId })
      .from(policySnapshotMembers)
      .where(eq(policySnapshotMembers.businessKey, businessKey));
    if (memberRows.length === 0) return [];
    const ids = [...new Set(memberRows.map((m) => m.snapshotId))];
    return db
      .select()
      .from(policySnapshots)
      .where(inArray(policySnapshots.id, ids));
  }
}
