import fs from "fs";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { protocolWorkflowPath } from "@/lib/dsl/region-manifest";

interface WorkflowFile {
  workflow_id: string;
  name: string;
  version: string;
  stages: unknown[];
  rollback_policy?: unknown;
  canary?: unknown;
  audit?: unknown;
}

/**
 * 装载协议级发布工作流（SDL-FR-002：地区无关资产）。
 * 复审纠正：与地区Seed职责分离，生产Seed只调用一次——不在地区循环内
 * 重复更新同一全局workflow行。
 */
export async function seedPublishWorkflow() {
  const workflowRaw = fs.readFileSync(protocolWorkflowPath(), "utf-8");
  const workflow: WorkflowFile = JSON.parse(workflowRaw);

  console.log(`Seeding workflow: ${workflow.workflow_id}...`);

  const existingWorkflow = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.workflowId, workflow.workflow_id))
    .limit(1);

  const workflowData = {
    workflowId: workflow.workflow_id,
    name: workflow.name,
    versionStr: workflow.version,
    stages: workflow.stages,
    rollbackPolicy: workflow.rollback_policy ?? null,
    canary: workflow.canary ?? null,
    auditConfig: workflow.audit ?? null,
  };

  if (existingWorkflow.length > 0) {
    await db
      .update(workflows)
      .set({ ...workflowData, updatedAt: new Date() })
      .where(eq(workflows.workflowId, workflow.workflow_id));
    console.log(`  Updated workflow: ${workflow.workflow_id}`);
  } else {
    await db.insert(workflows).values(workflowData);
    console.log(`  Inserted workflow: ${workflow.workflow_id}`);
  }
}
