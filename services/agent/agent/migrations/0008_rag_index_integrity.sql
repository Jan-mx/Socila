ALTER TABLE rag.document_versions ADD COLUMN IF NOT EXISTS document_id text;
--> statement-breakpoint
ALTER TABLE rag.document_versions ADD COLUMN IF NOT EXISTS title text;
--> statement-breakpoint
ALTER TABLE rag.document_versions ADD COLUMN IF NOT EXISTS authority text;
--> statement-breakpoint
ALTER TABLE rag.document_versions ADD COLUMN IF NOT EXISTS official_url text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS rag.index_receipts (
  document_version_id uuid PRIMARY KEY REFERENCES rag.document_versions(id) ON DELETE CASCADE,
  structural_hash text NOT NULL CHECK (structural_hash ~ '^[0-9a-f]{64}$'),
  vector_hash text NOT NULL CHECK (vector_hash ~ '^[0-9a-f]{64}$'),
  embedding_count integer NOT NULL CHECK (embedding_count > 0),
  model text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions = 1024),
  index_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
