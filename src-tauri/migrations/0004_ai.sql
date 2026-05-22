CREATE TABLE IF NOT EXISTS course_ai_metadata (
  course_id INTEGER PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  inferred_title TEXT,
  inferred_category TEXT,
  inferred_difficulty TEXT,
  suggested_description TEXT,
  inference_confidence REAL,
  model_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_similarity_candidates (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  related_course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  similarity REAL NOT NULL,
  relation_kind TEXT NOT NULL DEFAULT 'related',
  status TEXT NOT NULL DEFAULT 'suggested',
  evidence_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id, related_course_id),
  CHECK (course_id <> related_course_id)
);

CREATE INDEX IF NOT EXISTS idx_course_ai_metadata_model ON course_ai_metadata(model_name, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_similarity_related ON course_similarity_candidates(related_course_id, similarity DESC);
