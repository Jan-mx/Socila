-- 步骤05.8/05.9：中文全文检索（jieba 分词 + simple 配置 tsvector）。
ALTER TABLE rag.chunks ADD COLUMN IF NOT EXISTS fts tsvector;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS rag_chunks_fts_idx ON rag.chunks USING gin(fts);
