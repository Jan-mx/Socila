CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
-- RAG schema（步骤05.1/05.5）：来源、抓取、文档版本、Chunk、Embedding、校对、检索审计。
CREATE SCHEMA IF NOT EXISTS rag;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.sources (
  id serial PRIMARY KEY,
  jurisdiction_code text NOT NULL,
  name text NOT NULL,
  entry_url text NOT NULL,
  domain text NOT NULL,
  adapter text NOT NULL DEFAULT 'generic',
  frequency text NOT NULL DEFAULT 'weekly',
  enabled boolean NOT NULL DEFAULT true,
  owner text,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.fetches (
  id serial PRIMARY KEY,
  source_id integer NOT NULL REFERENCES rag.sources(id),
  url text NOT NULL,
  final_url text,
  status integer,
  content_hash text,
  object_key text,
  mime text,
  response_headers jsonb,
  redirects integer,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash text NOT NULL UNIQUE,
  source_id integer NOT NULL REFERENCES rag.sources(id),
  mime text NOT NULL,
  object_key text NOT NULL,
  status text NOT NULL DEFAULT 'discovered'
    CHECK (status IN ('discovered','downloaded','parsed','needs_correction','indexed','failed')),
  pipeline_version text,
  page_count integer,
  effective_from date,
  effective_to date,
  jurisdiction_code text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.document_trees (
  document_version_id uuid PRIMARY KEY REFERENCES rag.document_versions(id),
  tree jsonb NOT NULL,
  markdown text NOT NULL,
  pipeline_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.chunks (
  id text PRIMARY KEY,
  document_version_id uuid NOT NULL REFERENCES rag.document_versions(id),
  parent_chunk_id text,
  path text NOT NULL,
  text text NOT NULL,
  token_count integer NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.embeddings (
  chunk_id text PRIMARY KEY REFERENCES rag.chunks(id),
  model text NOT NULL,
  dimensions integer NOT NULL,
  index_version text NOT NULL,
  embedding vector
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.corrections (
  id serial PRIMARY KEY,
  document_version_id uuid NOT NULL REFERENCES rag.document_versions(id),
  page integer,
  original_text text,
  corrected_text text NOT NULL,
  corrected_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.retrieval_audit (
  id serial PRIMARY KEY,
  query text NOT NULL,
  jurisdiction_code text,
  as_of_date date,
  filters jsonb,
  top_k integer,
  candidate_count integer,
  result_ids jsonb,
  index_version text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
