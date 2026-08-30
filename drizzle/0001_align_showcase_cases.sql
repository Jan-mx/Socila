-- BLOCKER-001 显式对账 migration（步骤02.3；记录见
-- docs/refactor/policy-ops-agent/reports/stage-01/01.3-对账阻塞记录.md）。
-- 目的：把线上库 showcase_cases 的物理结构对齐到声明式 Schema（schema.ts 为权威）。
-- 空库/演练库执行时全部为 no-op（IF EXISTS 保护），清单哈希不变；
-- 对生产 Neon 的执行属生产迁移，统一留待阶段07并在用户授权 + transcript_text
-- 存量数据导出保全后进行。
ALTER TABLE "showcase_cases" DROP COLUMN IF EXISTS "transcript_text";
ALTER TABLE "showcase_cases" ALTER COLUMN "ai_response" SET NOT NULL;
ALTER TABLE "showcase_cases" ALTER COLUMN "user_message" SET NOT NULL;
ALTER TABLE "showcase_cases" ALTER COLUMN "case_uid" DROP NOT NULL;
DROP INDEX IF EXISTS "showcase_cases_case_uid_unique";
ALTER TABLE "showcase_cases" ALTER COLUMN "is_published" SET DEFAULT true;
