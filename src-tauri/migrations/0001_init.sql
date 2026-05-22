PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  canonical_root_path TEXT NOT NULL UNIQUE,
  is_offline_only INTEGER NOT NULL DEFAULT 1,
  scan_rules_json TEXT NOT NULL DEFAULT '{}',
  last_scanned_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  root_path TEXT NOT NULL UNIQUE,
  canonical_root_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,
  category TEXT,
  difficulty TEXT,
  inferred_title TEXT,
  inferred_category TEXT,
  inferred_difficulty TEXT,
  inference_confidence REAL,
  cover_path TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  total_duration_seconds INTEGER NOT NULL DEFAULT 0,
  lesson_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  normalized_title TEXT,
  relative_path TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(course_id, relative_path)
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id INTEGER REFERENCES course_sections(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  clean_title TEXT,
  relative_path TEXT NOT NULL,
  absolute_path TEXT NOT NULL UNIQUE,
  file_stem TEXT NOT NULL,
  duration_seconds INTEGER,
  media_metadata_json TEXT,
  subtitles_text TEXT,
  transcript_text TEXT,
  summary TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  last_detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lesson_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  asset_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  absolute_path TEXT NOT NULL UNIQUE,
  relative_path TEXT NOT NULL,
  extension TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  extracted_text TEXT,
  thumbnail_path TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  current_time_seconds INTEGER NOT NULL DEFAULT 0,
  percent_complete REAL NOT NULL DEFAULT 0,
  playback_speed REAL NOT NULL DEFAULT 1.0,
  volume REAL NOT NULL DEFAULT 1.0,
  completed INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  timestamp_seconds INTEGER,
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  timestamp_seconds INTEGER NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'system',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_tags (
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'suggested',
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id, tag_id)
);

CREATE TABLE IF NOT EXISTS search_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id INTEGER REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'es',
  source_kind TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id, source_kind)
);

CREATE TABLE IF NOT EXISTS embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  model_name TEXT NOT NULL,
  model_revision TEXT,
  dimensions INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id, chunk_index, model_name)
);

CREATE TABLE IF NOT EXISTS cover_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  local_path TEXT,
  remote_url TEXT,
  attribution TEXT,
  score REAL,
  status TEXT NOT NULL DEFAULT 'suggested',
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  selected_at TEXT
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  target TEXT,
  payload_json TEXT,
  message TEXT,
  error_text TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS watch_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  watched_from_seconds INTEGER NOT NULL DEFAULT 0,
  watched_to_seconds INTEGER NOT NULL DEFAULT 0,
  session_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  session_ended_at TEXT,
  device_name TEXT
);

CREATE TABLE IF NOT EXISTS file_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  absolute_path TEXT NOT NULL UNIQUE,
  canonical_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  extension TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  modified_at TEXT NOT NULL,
  partial_hash TEXT,
  media_duration_seconds INTEGER,
  fingerprint_key TEXT NOT NULL UNIQUE,
  inode_hint TEXT,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  missing_since TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_library_id ON courses(library_id);
CREATE INDEX IF NOT EXISTS idx_sections_course_id ON course_sections(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_course_id ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_section_id ON lessons(section_id);
CREATE INDEX IF NOT EXISTS idx_lesson_assets_lesson_id ON lesson_assets(lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_assets_course_id ON lesson_assets(course_id);
CREATE INDEX IF NOT EXISTS idx_progress_last_accessed ON lesson_progress(last_accessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookmarks_lesson_id ON bookmarks(lesson_id);
CREATE INDEX IF NOT EXISTS idx_search_documents_entity ON search_documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_cover_candidates_course_id ON cover_candidates(course_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at ON jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_fingerprints_canonical_path ON file_fingerprints(canonical_path);

INSERT OR IGNORE INTO app_settings(key, value_json)
VALUES
  ('locale', '"es-MX"'),
  ('completionThresholdPercent', '92'),
  ('internetEnrichmentEnabled', 'false'),
  ('offlineModeEnabled', 'true'),
  ('thumbnailQuality', '"balanced"'),
  ('modelName', '"Xenova/all-MiniLM-L6-v2"');
