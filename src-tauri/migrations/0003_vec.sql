CREATE VIRTUAL TABLE IF NOT EXISTS embeddings_vec
USING vec0(
  embedding_id INTEGER PRIMARY KEY,
  course_id INTEGER,
  entity_type TEXT,
  model_name TEXT,
  vector FLOAT[384],
  +excerpt TEXT
);
