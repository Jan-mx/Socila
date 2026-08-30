CREATE TABLE "cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_uid" text,
	"creator" text,
	"post_date" text,
	"video_id" text,
	"topics" jsonb,
	"case_text" text,
	"transcript_text" text,
	"tags" jsonb,
	"is_regression" boolean DEFAULT false NOT NULL,
	"source_file" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_profile" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "params" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_pack_id" text NOT NULL,
	"param_id" text NOT NULL,
	"type" text NOT NULL,
	"value" jsonb,
	"unit" text,
	"effective_from" date NOT NULL,
	"source" text,
	"key_fields" jsonb,
	"value_fields" jsonb,
	"rows" jsonb,
	"note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_input" jsonb NOT NULL,
	"calc_result" jsonb,
	"plan_output" jsonb,
	"trace" jsonb,
	"rule_set_version" text,
	"policy_pack_version" text,
	"conclusion_level" text,
	"as_of_date" date,
	"session_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_pack_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_pack_id" text NOT NULL,
	"version" integer NOT NULL,
	"param_snapshot" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publishes" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"from_stage" text NOT NULL,
	"to_stage" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text,
	"gate_results" jsonb,
	"diff" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_set_id" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"rules" jsonb NOT NULL,
	"conflict_resolution" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" text NOT NULL,
	"name" text NOT NULL,
	"module" text NOT NULL,
	"dsl_version" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"supersedes" jsonb DEFAULT '[]'::jsonb,
	"inputs" jsonb DEFAULT '[]'::jsonb,
	"parameter_refs" jsonb DEFAULT '[]'::jsonb,
	"decision_table" jsonb NOT NULL,
	"outputs" jsonb DEFAULT '[]'::jsonb,
	"examples" jsonb DEFAULT '[]'::jsonb,
	"evidence" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "showcase_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_uid" text,
	"title" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"user_message" text NOT NULL,
	"ai_response" text NOT NULL,
	"input_data" jsonb,
	"expected_data" jsonb,
	"category" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tests" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rule_id" text,
	"input" jsonb NOT NULL,
	"params_override" jsonb,
	"expected" jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"last_run_result" jsonb,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_id" text NOT NULL,
	"name" text NOT NULL,
	"version_str" text,
	"stages" jsonb NOT NULL,
	"rollback_policy" jsonb,
	"canary" jsonb,
	"audit_config" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
