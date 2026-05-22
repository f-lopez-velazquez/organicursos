use std::path::Path;

use anyhow::{anyhow, Result};
use chrono::{Duration, Utc};
use rusqlite::{
    params, params_from_iter, types::Value as SqlValue, Connection, OptionalExtension, Row,
};
use serde_json::Value;

use crate::license::{
    parse_timestamp, public_key_configured, token_last4, verify_license_token, LicenseClaims,
};
use crate::utils::pathing::sanitize_display_name;
use crate::models::api::{
    AppSettingsPayload, BookmarkMutationInput, BookmarkRecord, CourseCard, CourseDetail,
    CourseInsightWriteInput, CourseSection, CourseSimilarityRecord, CoverCandidateRecord,
    DashboardSnapshot, DashboardStats, JobRecord, LessonAssetRecord, LessonPlayerPayload,
    LessonSummary, LibraryRecord, LicenseActivationInput, LicenseStatePayload, MediaInfo,
    NoteMutationInput, NoteRecord, OperationalProfilePayload, PendingCourseAiDocument,
    PendingEmbeddingDocument, PendingLessonTranscriptDocument, SaveProgressInput, SearchInput,
    SearchResult, SemanticSearchInput, SimilarityCandidateInput, TagSuggestion,
    ToggleFavoriteInput, UpdateSettingsInput,
};

use super::Database;

impl Database {
    pub fn add_library(&self, root_path: &str) -> Result<()> {
        ensure_directory_available(root_path)?;
        let canonical = root_path.replace('\\', "/");
        let name = std::path::Path::new(root_path)
            .file_name()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "Biblioteca".to_string());

        let connection = self.connection.lock();
        connection.execute(
            "INSERT INTO libraries(name, root_path, canonical_root_path) VALUES (?1, ?2, ?3)
             ON CONFLICT(root_path) DO UPDATE SET updated_at = CURRENT_TIMESTAMP",
            params![name, root_path, canonical],
        )?;
        Ok(())
    }

    pub fn list_courses(&self) -> Result<Vec<CourseCard>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT c.id, c.title, c.subtitle, c.cover_path,
                    COALESCE(c.category, cam.inferred_category) AS category,
                    COALESCE(c.difficulty, cam.inferred_difficulty) AS difficulty,
                    cam.inferred_title, cam.inferred_category, cam.inferred_difficulty,
                    cam.suggested_description, cam.inference_confidence,
                    c.lesson_count, c.total_duration_seconds,
                    COALESCE(lp.progress_percent, 0) AS progress_percent,
                    c.last_viewed_at, c.is_favorite
             FROM courses c
             LEFT JOIN course_ai_metadata cam ON cam.course_id = c.id
             LEFT JOIN (
               SELECT course_id, AVG(COALESCE(lp.percent_complete, 0)) AS progress_percent
               FROM lessons l
               LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
               GROUP BY course_id
             ) lp ON lp.course_id = c.id
             ORDER BY COALESCE(c.last_viewed_at, c.updated_at) DESC, c.title ASC",
        )?;

        let rows = statement.query_map([], map_course_card)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn list_libraries(&self) -> Result<Vec<LibraryRecord>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT id, name, root_path, is_offline_only, created_at, updated_at
             FROM libraries
             ORDER BY updated_at DESC, name ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(LibraryRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                root_path: row.get(2)?,
                is_offline_only: row.get::<_, i64>(3)? == 1,
                is_available: false,
                availability_message: None,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        let mut libraries = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        for library in &mut libraries {
            let (is_available, availability_message) = describe_directory_availability(&library.root_path);
            library.is_available = is_available;
            library.availability_message = availability_message;
        }
        Ok(libraries)
    }

    pub fn get_library_root_path(&self, library_id: i64) -> Result<String> {
        let connection = self.connection.lock();
        let root_path = connection.query_row(
            "SELECT root_path FROM libraries WHERE id = ?1",
            params![library_id],
            |row| row.get(0),
        )?;
        Ok(root_path)
    }

    pub fn get_all_library_root_paths(&self) -> Result<Vec<String>> {
        let connection = self.connection.lock();
        let mut statement = connection
            .prepare("SELECT root_path FROM libraries ORDER BY updated_at DESC, id DESC")?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn get_course_detail(&self, course_id: i64) -> Result<CourseDetail> {
        let card = {
            let connection = self.connection.lock();
            connection.query_row(
                "SELECT c.id, c.title, c.subtitle, c.cover_path,
                        COALESCE(c.category, cam.inferred_category) AS category,
                        COALESCE(c.difficulty, cam.inferred_difficulty) AS difficulty,
                        cam.inferred_title, cam.inferred_category, cam.inferred_difficulty,
                        cam.suggested_description, cam.inference_confidence,
                        c.lesson_count, c.total_duration_seconds,
                        COALESCE(lp.progress_percent, 0) AS progress_percent,
                        c.last_viewed_at, c.is_favorite
                 FROM courses c
                 LEFT JOIN course_ai_metadata cam ON cam.course_id = c.id
                 LEFT JOIN (
                   SELECT course_id, AVG(COALESCE(lp.percent_complete, 0)) AS progress_percent
                   FROM lessons l
                   LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
                   GROUP BY course_id
                 ) lp ON lp.course_id = c.id
                 WHERE c.id = ?1",
                params![course_id],
                map_course_card,
            )?
        };

        let (description, tags, ai_tags, similar_courses) = {
            let connection = self.connection.lock();
            let description: Option<String> = connection
                .query_row(
                    "SELECT description FROM courses WHERE id = ?1",
                    params![course_id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();

            let tags = {
                let mut statement = connection.prepare(
                    "SELECT t.name
                     FROM course_tags ct
                     INNER JOIN tags t ON t.id = ct.tag_id
                     WHERE ct.course_id = ?1
                     ORDER BY t.name ASC",
                )?;
                let rows = statement
                    .query_map(params![course_id], |row| row.get::<_, String>(0))?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                rows
            };

            let ai_tags = {
                let mut statement = connection.prepare(
                    "SELECT t.name, ct.confidence, ct.source
                     FROM course_tags ct
                     INNER JOIN tags t ON t.id = ct.tag_id
                     WHERE ct.course_id = ?1
                     ORDER BY COALESCE(ct.confidence, 0) DESC, t.name ASC",
                )?;
                let rows = statement
                    .query_map(params![course_id], map_tag_suggestion)?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                rows
            };

            let similar_courses = {
                let mut statement = connection.prepare(
                    "SELECT ?1 AS current_course_id,
                            CASE
                              WHEN sc.course_id = ?1 THEN sc.related_course_id
                              ELSE sc.course_id
                            END AS related_course_id,
                            sc.similarity, sc.relation_kind, sc.status, sc.evidence_json,
                            rc.id, rc.title, rc.subtitle, rc.cover_path,
                            COALESCE(rc.category, rcam.inferred_category) AS category,
                            COALESCE(rc.difficulty, rcam.inferred_difficulty) AS difficulty,
                            rcam.inferred_title, rcam.inferred_category, rcam.inferred_difficulty,
                            rcam.suggested_description, rcam.inference_confidence,
                            rc.lesson_count, rc.total_duration_seconds,
                            COALESCE(rp.progress_percent, 0) AS progress_percent,
                            rc.last_viewed_at, rc.is_favorite
                     FROM course_similarity_candidates sc
                     INNER JOIN courses rc ON rc.id = CASE
                        WHEN sc.course_id = ?1 THEN sc.related_course_id
                        ELSE sc.course_id
                     END
                     LEFT JOIN course_ai_metadata rcam ON rcam.course_id = rc.id
                     LEFT JOIN (
                        SELECT course_id, AVG(COALESCE(lp.percent_complete, 0)) AS progress_percent
                        FROM lessons l
                        LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
                        GROUP BY course_id
                     ) rp ON rp.course_id = rc.id
                     WHERE sc.course_id = ?1 OR sc.related_course_id = ?1
                     ORDER BY sc.similarity DESC
                     LIMIT 6",
                )?;
                let rows = statement
                    .query_map(params![course_id], map_course_similarity)?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                rows
            };

            (description, tags, ai_tags, similar_courses)
        };

        let sections = self.list_sections_for_course(course_id)?;
        let assets = self.list_assets_for_course(course_id)?;
        let notes = self.list_notes_for_course(course_id)?;

        Ok(CourseDetail {
            card,
            description,
            tags,
            ai_tags,
            similar_courses,
            sections,
            assets,
            notes,
        })
    }

    pub fn get_lesson_player_payload(&self, lesson_id: i64) -> Result<LessonPlayerPayload> {
        let lesson = self.get_lesson(lesson_id)?;
        ensure_file_available(&lesson.absolute_path).map_err(|_| {
            anyhow!(
                "El archivo principal de esta clase no esta disponible. Revisa si el disco externo sigue conectado con la misma ruta y vuelve a intentarlo."
            )
        })?;
        let connection = self.connection.lock();

        let notes = {
            let mut statement = connection.prepare(
                "SELECT id, course_id, lesson_id, timestamp_seconds, body, created_at, updated_at
                 FROM notes
                 WHERE lesson_id = ?1
                 ORDER BY COALESCE(timestamp_seconds, 0), created_at",
            )?;
            let rows = statement
                .query_map(params![lesson_id], map_note)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        let bookmarks = {
            let mut statement = connection.prepare(
                "SELECT id, lesson_id, timestamp_seconds, label, created_at
                 FROM bookmarks
                 WHERE lesson_id = ?1
                 ORDER BY timestamp_seconds ASC",
            )?;
            let rows = statement
                .query_map(params![lesson_id], map_bookmark)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        let assets = {
            let mut statement = connection.prepare(
                "SELECT id, lesson_id, course_id, asset_kind, title, absolute_path, relative_path,
                        extension, file_size_bytes, extracted_text, thumbnail_path
                 FROM lesson_assets
                 WHERE lesson_id = ?1
                 ORDER BY CASE asset_kind
                    WHEN 'subtitle' THEN 0
                    WHEN 'pdf' THEN 1
                    WHEN 'docx' THEN 2
                    WHEN 'text' THEN 3
                    WHEN 'archive' THEN 4
                    ELSE 5
                 END, title ASC",
            )?;
            let rows = statement
                .query_map(params![lesson_id], map_lesson_asset)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        let (course_title, section_title): (String, Option<String>) = connection.query_row(
            "SELECT c.title, s.title
             FROM lessons l
             INNER JOIN courses c ON c.id = l.course_id
             LEFT JOIN course_sections s ON s.id = l.section_id
             WHERE l.id = ?1",
            params![lesson_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let completion_threshold_percent: i64 = connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'completionThresholdPercent'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .and_then(|raw| serde_json::from_str::<i64>(&raw).ok())
            .unwrap_or(92);

        let next_lesson_id = connection
            .query_row(
                "SELECT id FROM lessons WHERE course_id = ?1 AND position > (
                    SELECT position FROM lessons WHERE id = ?2
                 ) ORDER BY position ASC LIMIT 1",
                params![lesson.course_id, lesson_id],
                |row| row.get(0),
            )
            .optional()?;

        let previous_lesson_id = connection
            .query_row(
                "SELECT id FROM lessons WHERE course_id = ?1 AND position < (
                    SELECT position FROM lessons WHERE id = ?2
                 ) ORDER BY position DESC LIMIT 1",
                params![lesson.course_id, lesson_id],
                |row| row.get(0),
            )
            .optional()?;

        let persisted_summary: Option<String> = connection
            .query_row(
                "SELECT summary FROM lessons WHERE id = ?1",
                params![lesson_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();

        let lesson_text: Option<String> = connection
            .query_row(
                "SELECT COALESCE(NULLIF(trim(transcript_text), ''), NULLIF(trim(subtitles_text), ''))
                 FROM lessons
                 WHERE id = ?1",
                params![lesson_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten()
            .or_else(|| {
                connection
                    .query_row(
                        "SELECT group_concat(extracted_text, char(10))
                         FROM lesson_assets
                         WHERE lesson_id = ?1
                           AND extracted_text IS NOT NULL
                           AND length(trim(extracted_text)) > 0",
                        params![lesson_id],
                        |row| row.get(0),
                    )
                    .optional()
                    .ok()
                    .flatten()
                    .flatten()
            });

        let lesson_summary = persisted_summary.or_else(|| {
            build_lesson_summary(
                &lesson.title,
                section_title.as_deref(),
                lesson_text.as_deref(),
                &assets,
            )
        });
        let lesson_transcript_preview = lesson_text
            .as_deref()
            .and_then(build_text_preview);
        let lesson_highlights = build_text_highlights(lesson_text.as_deref(), &assets);

        Ok(LessonPlayerPayload {
            lesson,
            notes,
            bookmarks,
            assets,
            lesson_summary,
            lesson_transcript_preview,
            lesson_highlights,
            next_lesson_id,
            previous_lesson_id,
            course_title,
            section_title,
            completion_threshold_percent,
        })
    }

    pub fn save_progress(&self, payload: SaveProgressInput) -> Result<()> {
        let connection = self.connection.lock();
        let duration: Option<i64> = connection
            .query_row(
                "SELECT duration_seconds FROM lessons WHERE id = ?1",
                params![payload.lesson_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();

        let percent = duration
            .filter(|value| *value > 0)
            .map(|value| (payload.current_time_seconds as f64 / value as f64 * 100.0).min(100.0))
            .unwrap_or(0.0);

        let threshold_percent: i64 = connection
            .query_row(
                "SELECT value_json FROM app_settings WHERE key = 'completionThresholdPercent'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .and_then(|raw| serde_json::from_str::<i64>(&raw).ok())
            .unwrap_or(92);
        let completed = payload.completed || percent >= threshold_percent as f64;

        connection.execute(
            "INSERT INTO lesson_progress(
                lesson_id, current_time_seconds, percent_complete, playback_speed, volume, completed, last_accessed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
             ON CONFLICT(lesson_id) DO UPDATE SET
                current_time_seconds = excluded.current_time_seconds,
                percent_complete = excluded.percent_complete,
                playback_speed = excluded.playback_speed,
                volume = excluded.volume,
                completed = excluded.completed,
                last_accessed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP",
            params![
                payload.lesson_id,
                payload.current_time_seconds,
                percent,
                payload.speed,
                payload.volume,
                completed
            ],
        )?;

        connection.execute(
            "UPDATE courses
             SET last_viewed_at = CURRENT_TIMESTAMP
             WHERE id = (SELECT course_id FROM lessons WHERE id = ?1)",
            params![payload.lesson_id],
        )?;

        connection.execute(
            "INSERT INTO watch_history(lesson_id, watched_from_seconds, watched_to_seconds, session_ended_at)
             VALUES (?1, 0, ?2, CURRENT_TIMESTAMP)",
            params![payload.lesson_id, payload.current_time_seconds],
        )?;
        Ok(())
    }

    pub fn get_dashboard_snapshot(&self) -> Result<DashboardSnapshot> {
        let continue_watching = {
            let connection = self.connection.lock();
            let mut statement = connection.prepare(
                "SELECT l.id, l.course_id, l.section_id, l.title, l.relative_path, l.absolute_path,
                        l.duration_seconds, l.media_metadata_json,
                        COALESCE(lp.current_time_seconds, 0), COALESCE(lp.percent_complete, 0),
                        COALESCE(lp.playback_speed, 1.0), COALESCE(lp.volume, 1.0), lp.last_accessed_at, COALESCE(lp.completed, 0),
                        (SELECT absolute_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'subtitle' LIMIT 1),
                        (SELECT thumbnail_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'video' LIMIT 1)
                 FROM lessons l
                 INNER JOIN lesson_progress lp ON lp.lesson_id = l.id
                 WHERE lp.completed = 0
                 ORDER BY lp.last_accessed_at DESC
                 LIMIT 8",
            )?;
            let rows = statement
                .query_map([], map_lesson_summary)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        let recently_viewed = {
            let connection = self.connection.lock();
            let mut statement = connection.prepare(
                "SELECT l.id, l.course_id, l.section_id, l.title, l.relative_path, l.absolute_path,
                        l.duration_seconds, l.media_metadata_json,
                        COALESCE(lp.current_time_seconds, 0), COALESCE(lp.percent_complete, 0),
                        COALESCE(lp.playback_speed, 1.0), COALESCE(lp.volume, 1.0), lp.last_accessed_at, COALESCE(lp.completed, 0),
                        (SELECT absolute_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'subtitle' LIMIT 1),
                        (SELECT thumbnail_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'video' LIMIT 1)
                 FROM lessons l
                 INNER JOIN lesson_progress lp ON lp.lesson_id = l.id
                 ORDER BY lp.last_accessed_at DESC
                 LIMIT 8",
            )?;
            let rows = statement
                .query_map([], map_lesson_summary)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        let recently_added = {
            let connection = self.connection.lock();
            let mut statement = connection.prepare(
                "SELECT l.id, l.course_id, l.section_id, l.title, l.relative_path, l.absolute_path,
                        l.duration_seconds, l.media_metadata_json,
                        COALESCE(lp.current_time_seconds, 0), COALESCE(lp.percent_complete, 0),
                        COALESCE(lp.playback_speed, 1.0), COALESCE(lp.volume, 1.0), lp.last_accessed_at, COALESCE(lp.completed, 0),
                        (SELECT absolute_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'subtitle' LIMIT 1),
                        (SELECT thumbnail_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'video' LIMIT 1)
                 FROM lessons l
                 LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
                 ORDER BY l.created_at DESC
                 LIMIT 8",
            )?;
            let rows = statement
                .query_map([], map_lesson_summary)?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            rows
        };

        let recent_courses = self.list_courses()?.into_iter().take(6).collect::<Vec<_>>();
        let favorite_courses = self
            .list_courses()?
            .into_iter()
            .filter(|course| course.is_favorite)
            .take(6)
            .collect::<Vec<_>>();

        let connection = self.connection.lock();
        let stats = DashboardStats {
            courses: connection.query_row("SELECT COUNT(*) FROM courses", [], |row| row.get(0))?,
            lessons: connection.query_row("SELECT COUNT(*) FROM lessons", [], |row| row.get(0))?,
            hours_watched: connection.query_row(
                "SELECT COALESCE(CAST(SUM(watched_to_seconds) / 3600 AS INTEGER), 0) FROM watch_history",
                [],
                |row| row.get(0),
            )?,
            active_libraries: connection.query_row("SELECT COUNT(*) FROM libraries", [], |row| row.get(0))?,
        };

        Ok(DashboardSnapshot {
            continue_watching,
            recent_courses,
            recently_viewed,
            recently_added,
            favorite_courses,
            stats,
        })
    }

    pub fn search_library_filtered(&self, input: SearchInput) -> Result<Vec<SearchResult>> {
        let connection = self.connection.lock();
        let limit = input.limit.unwrap_or(20);
        let mut sql = String::from(
            "SELECT d.entity_type, d.entity_id, d.title,
                    snippet(search_documents_fts, 1, '<mark>', '</mark>', ' ... ', 18) AS snippet,
                    bm25(search_documents_fts) AS lexical_score,
                    d.course_id, d.lesson_id
             FROM search_documents_fts
             INNER JOIN search_documents d ON d.id = search_documents_fts.rowid
             LEFT JOIN courses c ON c.id = d.course_id
             LEFT JOIN course_ai_metadata cam ON cam.course_id = c.id
             LEFT JOIN lessons l ON l.id = d.lesson_id
             LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
             LEFT JOIN lesson_assets la ON la.id = CASE WHEN d.entity_type = 'asset' THEN d.entity_id ELSE NULL END
             WHERE search_documents_fts MATCH ?",
        );
        let mut query_params = vec![SqlValue::Text(input.query)];

        if let Some(filters) = input.filters.and_then(|value| value.as_object().cloned()) {
            if let Some(category) = filters
                .get("category")
                .and_then(|value| value.as_str())
                .filter(|value| !value.is_empty())
            {
                sql.push_str(" AND COALESCE(c.category, cam.inferred_category) = ?");
                query_params.push(SqlValue::Text(category.to_string()));
            }
            if let Some(difficulty) = filters
                .get("difficulty")
                .and_then(|value| value.as_str())
                .filter(|value| !value.is_empty())
            {
                sql.push_str(" AND COALESCE(c.difficulty, cam.inferred_difficulty) = ?");
                query_params.push(SqlValue::Text(difficulty.to_string()));
            }
            if filters
                .get("favoriteOnly")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
            {
                sql.push_str(" AND c.is_favorite = 1");
            }
            if let Some(entity_type) = filters
                .get("entityType")
                .and_then(|value| value.as_str())
                .filter(|value| !value.is_empty())
            {
                sql.push_str(" AND d.entity_type = ?");
                query_params.push(SqlValue::Text(entity_type.to_string()));
            }
            if let Some(file_type) = filters
                .get("fileType")
                .and_then(|value| value.as_str())
                .filter(|value| !value.is_empty())
            {
                sql.push_str(" AND (la.asset_kind = ? OR d.source_kind = ?)");
                query_params.push(SqlValue::Text(file_type.to_string()));
                query_params.push(SqlValue::Text(file_type.to_string()));
            }
            if let Some(progress_state) = filters
                .get("progressState")
                .and_then(|value| value.as_str())
            {
                match progress_state {
                    "new" => sql.push_str(" AND COALESCE(lp.percent_complete, 0) = 0"),
                    "in_progress" => {
                        sql.push_str(" AND COALESCE(lp.percent_complete, 0) > 0 AND COALESCE(lp.completed, 0) = 0")
                    }
                    "completed" => sql.push_str(" AND COALESCE(lp.completed, 0) = 1"),
                    _ => {}
                }
            }
            if let Some(min_duration) = filters
                .get("minDurationSeconds")
                .and_then(|value| value.as_i64())
            {
                sql.push_str(" AND COALESCE(l.duration_seconds, 0) >= ?");
                query_params.push(SqlValue::Integer(min_duration));
            }
            if let Some(max_duration) = filters
                .get("maxDurationSeconds")
                .and_then(|value| value.as_i64())
            {
                sql.push_str(" AND COALESCE(l.duration_seconds, 0) <= ?");
                query_params.push(SqlValue::Integer(max_duration));
            }
        }

        sql.push_str(" ORDER BY bm25(search_documents_fts) LIMIT ?");
        query_params.push(SqlValue::Integer(limit));

        let mut statement = connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(query_params), |row| {
            let lexical_score: f64 = row.get(4)?;
            Ok(SearchResult {
                entity_type: row.get(0)?,
                entity_id: row.get(1)?,
                title: row.get(2)?,
                snippet: row.get(3)?,
                score: 1.0 - lexical_score.min(0.99),
                lexical_score: 1.0 - lexical_score.min(0.99),
                semantic_score: 0.0,
                course_id: row.get(5)?,
                lesson_id: row.get(6)?,
            })
        })?;

        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn create_or_update_note(&self, input: NoteMutationInput) -> Result<NoteRecord> {
        let connection = self.connection.lock();
        let note_id = if let Some(note_id) = input.note_id {
            connection.execute(
                "UPDATE notes
                 SET body = ?2, timestamp_seconds = ?3, updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1",
                params![note_id, input.body, input.timestamp_seconds],
            )?;
            note_id
        } else {
            connection.execute(
                "INSERT INTO notes(course_id, lesson_id, timestamp_seconds, body)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    input.course_id,
                    input.lesson_id,
                    input.timestamp_seconds,
                    input.body
                ],
            )?;
            connection.last_insert_rowid()
        };

        connection
            .query_row(
                "SELECT id, course_id, lesson_id, timestamp_seconds, body, created_at, updated_at
                 FROM notes WHERE id = ?1",
                params![note_id],
                map_note,
            )
            .map_err(Into::into)
    }

    pub fn delete_note(&self, note_id: i64) -> Result<()> {
        let connection = self.connection.lock();
        connection.execute("DELETE FROM notes WHERE id = ?1", params![note_id])?;
        Ok(())
    }

    pub fn create_bookmark(&self, input: BookmarkMutationInput) -> Result<BookmarkRecord> {
        let connection = self.connection.lock();
        connection.execute(
            "INSERT INTO bookmarks(lesson_id, timestamp_seconds, label) VALUES (?1, ?2, ?3)",
            params![input.lesson_id, input.timestamp_seconds, input.label],
        )?;
        let bookmark_id = connection.last_insert_rowid();
        connection
            .query_row(
                "SELECT id, lesson_id, timestamp_seconds, label, created_at
                 FROM bookmarks WHERE id = ?1",
                params![bookmark_id],
                map_bookmark,
            )
            .map_err(Into::into)
    }

    pub fn delete_bookmark(&self, bookmark_id: i64) -> Result<()> {
        let connection = self.connection.lock();
        connection.execute("DELETE FROM bookmarks WHERE id = ?1", params![bookmark_id])?;
        Ok(())
    }

    pub fn toggle_course_favorite(&self, input: ToggleFavoriteInput) -> Result<()> {
        let connection = self.connection.lock();
        connection.execute(
            "UPDATE courses SET is_favorite = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![input.course_id, input.is_favorite],
        )?;
        Ok(())
    }

    pub fn list_cover_candidates(&self, course_id: i64) -> Result<Vec<CoverCandidateRecord>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT id, course_id, source, local_path, remote_url, attribution, score, status, selected_at
             FROM cover_candidates
             WHERE course_id = ?1
             ORDER BY CASE status WHEN 'selected' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, COALESCE(score, 0) DESC, created_at DESC",
        )?;
        let rows = statement.query_map(params![course_id], map_cover_candidate)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn insert_cover_candidate(
        &self,
        course_id: i64,
        source: &str,
        local_path: Option<&str>,
        remote_url: Option<&str>,
        attribution: Option<&str>,
        score: Option<f64>,
        status: &str,
    ) -> Result<CoverCandidateRecord> {
        let connection = self.connection.lock();
        connection.execute(
            "INSERT INTO cover_candidates(course_id, source, local_path, remote_url, attribution, score, status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![course_id, source, local_path, remote_url, attribution, score, status],
        )?;
        let candidate_id = connection.last_insert_rowid();
        connection
            .query_row(
                "SELECT id, course_id, source, local_path, remote_url, attribution, score, status, selected_at
                 FROM cover_candidates WHERE id = ?1",
                params![candidate_id],
                map_cover_candidate,
            )
            .map_err(Into::into)
    }

    pub fn select_cover_candidate(&self, candidate_id: i64) -> Result<Option<String>> {
        let connection = self.connection.lock();
        let target: Option<(i64, Option<String>)> = connection
            .query_row(
                "SELECT course_id, local_path FROM cover_candidates WHERE id = ?1",
                params![candidate_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;

        let Some((course_id, local_path)) = target else {
            return Ok(None);
        };

        connection.execute(
            "UPDATE cover_candidates
             SET status = CASE WHEN id = ?1 THEN 'selected' ELSE 'suggested' END,
                 selected_at = CASE WHEN id = ?1 THEN CURRENT_TIMESTAMP ELSE selected_at END
             WHERE course_id = ?2",
            params![candidate_id, course_id],
        )?;
        if let Some(path) = local_path.clone() {
            connection.execute(
                "UPDATE courses SET cover_path = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
                params![course_id, path],
            )?;
        }

        Ok(local_path)
    }

    pub fn search_semantic(&self, input: SemanticSearchInput) -> Result<Vec<SearchResult>> {
        if !self.vector_enabled {
            return Ok(Vec::new());
        }

        let connection = self.connection.lock();
        let query_vector = serde_json::to_string(&input.vector)?;
        let mut statement = connection.prepare(
            "SELECT sd.entity_type, sd.entity_id, sd.title, substr(COALESCE(ev.excerpt, sd.body), 1, 240),
                    COALESCE(1.0 - ev.distance, 0.0) AS semantic_score, sd.course_id, sd.lesson_id
             FROM (
               SELECT embedding_id, distance, excerpt
               FROM embeddings_vec
               WHERE vector MATCH ?1 AND k = ?2
             ) ev
             INNER JOIN embeddings e ON e.id = ev.embedding_id
             INNER JOIN search_documents sd ON sd.entity_type = e.entity_type AND sd.entity_id = e.entity_id
             ORDER BY ev.distance ASC",
        )?;
        let rows =
            statement.query_map(params![query_vector, input.limit.unwrap_or(10)], |row| {
                let semantic_score: f64 = row.get(4)?;
                Ok(SearchResult {
                    entity_type: row.get(0)?,
                    entity_id: row.get(1)?,
                    title: row.get(2)?,
                    snippet: row.get(3)?,
                    score: semantic_score,
                    lexical_score: 0.0,
                    semantic_score,
                    course_id: row.get(5)?,
                    lesson_id: row.get(6)?,
                })
            })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn list_jobs(&self) -> Result<Vec<JobRecord>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT id, kind, status, target, message, progress, created_at, started_at, finished_at
             FROM jobs
             ORDER BY created_at DESC
             LIMIT 30",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(JobRecord {
                id: row.get(0)?,
                kind: row.get(1)?,
                status: row.get(2)?,
                target: row.get(3)?,
                message: row.get(4)?,
                progress: row.get(5)?,
                created_at: row.get(6)?,
                started_at: row.get(7)?,
                finished_at: row.get(8)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn get_settings(&self) -> Result<AppSettingsPayload> {
        let connection = self.connection.lock();
        let get_value = |key: &str| -> Result<Value> {
            let value: Option<String> = connection
                .query_row(
                    "SELECT value_json FROM app_settings WHERE key = ?1",
                    params![key],
                    |row| row.get(0),
                )
                .optional()?;
            match value {
                Some(val) => Ok(serde_json::from_str(&val)?),
                None => Ok(Value::Null),
            }
        };

        Ok(AppSettingsPayload {
            locale: get_value("locale")?.as_str().unwrap_or("es-MX").to_string(),
            completion_threshold_percent: get_value("completionThresholdPercent")?
                .as_i64()
                .unwrap_or(92),
            internet_enrichment_enabled: get_value("internetEnrichmentEnabled")?
                .as_bool()
                .unwrap_or(false),
            offline_mode_enabled: get_value("offlineModeEnabled")?.as_bool().unwrap_or(true),
            thumbnail_quality: get_value("thumbnailQuality")?
                .as_str()
                .unwrap_or("balanced")
                .to_string(),
            model_name: get_value("modelName")?
                .as_str()
                .unwrap_or("Xenova/all-MiniLM-L6-v2")
                .to_string(),
            cover_enrichment_provider: get_value("coverEnrichmentProvider")?
                .as_str()
                .unwrap_or("openverse")
                .to_string(),
            card_density: get_value("cardDensity")?
                .as_str()
                .unwrap_or("comfortable")
                .to_string(),
            reduced_motion: get_value("reducedMotion")?.as_bool().unwrap_or(false),
            ai_processing_enabled: get_value("aiProcessingEnabled")?.as_bool().unwrap_or(false),
            low_resource_mode: get_value("lowResourceMode")?.as_bool().unwrap_or(false),
        })
    }

    pub fn update_settings(&self, input: UpdateSettingsInput) -> Result<AppSettingsPayload> {
        let connection = self.connection.lock();
        let updates = vec![
            ("locale", input.locale.map(Value::String)),
            (
                "completionThresholdPercent",
                input.completion_threshold_percent.map(Value::from),
            ),
            (
                "internetEnrichmentEnabled",
                input.internet_enrichment_enabled.map(Value::from),
            ),
            (
                "offlineModeEnabled",
                input.offline_mode_enabled.map(Value::from),
            ),
            (
                "thumbnailQuality",
                input.thumbnail_quality.map(Value::String),
            ),
            ("modelName", input.model_name.map(Value::String)),
            (
                "coverEnrichmentProvider",
                input.cover_enrichment_provider.map(Value::String),
            ),
            ("cardDensity", input.card_density.map(Value::String)),
            ("reducedMotion", input.reduced_motion.map(Value::from)),
            ("aiProcessingEnabled", input.ai_processing_enabled.map(Value::from)),
            ("lowResourceMode", input.low_resource_mode.map(Value::from)),
        ];

        for (key, value) in updates
            .into_iter()
            .filter_map(|(key, value)| value.map(|value| (key, value)))
        {
            connection.execute(
                "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
                params![key, serde_json::to_string(&value)?],
            )?;
        }

        drop(connection);
        self.get_settings()
    }

    pub fn get_license_state(&self) -> Result<LicenseStatePayload> {
        let connection = self.connection.lock();
        let public_key_ready = public_key_configured();
        let trial_days = get_setting_json(&connection, "licenseTrialDays")?
            .and_then(|value| value.as_i64())
            .unwrap_or(14);

        let activated_at = get_setting_json(&connection, "licenseActivatedAt")?
            .and_then(|value| value.as_str().map(str::to_string));
        let activation_mode = get_setting_json(&connection, "licenseActivationMode")?
            .and_then(|value| value.as_str().map(str::to_string))
            .unwrap_or_else(|| "community".to_string());
        let token_last4 = get_setting_json(&connection, "licenseTokenLast4")?
            .and_then(|value| value.as_str().map(str::to_string));
        let trial_started_at = get_setting_json(&connection, "trialStartedAt")?
            .and_then(|value| value.as_str().map(str::to_string));
        let trial_ends_at = get_setting_json(&connection, "trialEndsAt")?
            .and_then(|value| value.as_str().map(str::to_string));
        let now = Utc::now();

        if let Some(payload) = get_setting_json(&connection, "licensePayload")? {
            let claims: LicenseClaims = serde_json::from_value(payload)?;
            let not_before = claims
                .not_before
                .as_deref()
                .map(|value| parse_timestamp(value, "notBefore"))
                .transpose()?;
            let expires_at = claims
                .expires_at
                .as_deref()
                .map(|value| parse_timestamp(value, "expiresAt"))
                .transpose()?;
            let status = if let Some(not_before) = not_before {
                if now < not_before {
                    "pending".to_string()
                } else if expires_at.is_some_and(|expires_at| now > expires_at) {
                    "expired".to_string()
                } else {
                    "active".to_string()
                }
            } else if expires_at.is_some_and(|expires_at| now > expires_at) {
                "expired".to_string()
            } else {
                "active".to_string()
            };

            let grace_message = if status == "expired" {
                Some("La licencia expiro. La aplicacion sigue en modo local, pero debes renovar la activacion profesional.".to_string())
            } else if status == "pending" {
                Some(
                    "La licencia esta emitida pero aun no entra en vigencia segun notBefore."
                        .to_string(),
                )
            } else {
                None
            };

            return Ok(LicenseStatePayload {
                edition: edition_label_from_tier(&claims.tier),
                status,
                activation_mode,
                license_id: Some(claims.license_id),
                licensed_to: Some(claims.licensed_to),
                email: Some(claims.email),
                company: claims.company,
                issued_at: Some(claims.issued_at),
                expires_at: claims.expires_at,
                activated_at,
                trial_started_at: trial_started_at.clone(),
                trial_ends_at: trial_ends_at.clone(),
                trial_days_remaining: None,
                grace_message,
                features: features_for_tier(&claims.tier, &claims.features),
                public_key_configured: public_key_ready,
                can_start_trial: trial_started_at.is_none(),
                token_last4,
            });
        }

        if let (Some(started_at), Some(ends_at)) = (trial_started_at.clone(), trial_ends_at.clone())
        {
            let ends_at_dt = parse_timestamp(&ends_at, "trialEndsAt")?;
            let status = if now <= ends_at_dt {
                "trial"
            } else {
                "community"
            };
            let trial_days_remaining = if now <= ends_at_dt {
                let remaining = ends_at_dt - now;
                Some((remaining.num_hours() / 24) + i64::from(remaining.num_hours() % 24 != 0))
            } else {
                Some(0)
            };

            return Ok(LicenseStatePayload {
                edition: if status == "trial" {
                    "Professional Trial".to_string()
                } else {
                    "Community".to_string()
                },
                status: status.to_string(),
                activation_mode: "trial".to_string(),
                license_id: None,
                licensed_to: None,
                email: None,
                company: None,
                issued_at: Some(started_at.clone()),
                expires_at: Some(ends_at.clone()),
                activated_at: Some(started_at.clone()),
                trial_started_at: Some(started_at),
                trial_ends_at: Some(ends_at.clone()),
                trial_days_remaining,
                grace_message: if status == "community" {
                    Some("La prueba profesional termino. Puedes seguir usando OrganiCursos en modo Community o activar una licencia firmada.".to_string())
                } else {
                    Some(format!("Prueba profesional activa por {trial_days} dias con operacion completamente local."))
                },
                features: features_for_tier("professional", &[]),
                public_key_configured: public_key_ready,
                can_start_trial: false,
                token_last4: None,
            });
        }

        Ok(LicenseStatePayload {
            edition: "Community".to_string(),
            status: "community".to_string(),
            activation_mode: "community".to_string(),
            license_id: None,
            licensed_to: None,
            email: None,
            company: None,
            issued_at: None,
            expires_at: None,
            activated_at: None,
            trial_started_at: None,
            trial_ends_at: None,
            trial_days_remaining: None,
            grace_message: Some("Modo Community activo. Puedes iniciar una prueba local o activar una licencia profesional firmada.".to_string()),
            features: features_for_tier("community", &[]),
            public_key_configured: public_key_ready,
            can_start_trial: true,
            token_last4: None,
        })
    }

    pub fn activate_license_token(
        &self,
        input: LicenseActivationInput,
    ) -> Result<LicenseStatePayload> {
        let claims = verify_license_token(&input.token)?;
        let connection = self.connection.lock();
        let now = Utc::now().to_rfc3339();

        upsert_setting_json(
            &connection,
            "licensePayload",
            &serde_json::to_value(&claims)?,
        )?;
        upsert_setting_json(&connection, "licenseActivatedAt", &Value::String(now))?;
        upsert_setting_json(
            &connection,
            "licenseActivationMode",
            &Value::String("signed-token".to_string()),
        )?;
        upsert_setting_json(
            &connection,
            "licenseTokenLast4",
            &Value::String(token_last4(&input.token).unwrap_or_else(|| "0000".to_string())),
        )?;
        delete_setting(&connection, "trialStartedAt")?;
        delete_setting(&connection, "trialEndsAt")?;
        drop(connection);
        self.get_license_state()
    }

    pub fn clear_license_activation(&self) -> Result<LicenseStatePayload> {
        let connection = self.connection.lock();
        for key in [
            "licensePayload",
            "licenseActivatedAt",
            "licenseActivationMode",
            "licenseTokenLast4",
            "trialStartedAt",
            "trialEndsAt",
        ] {
            delete_setting(&connection, key)?;
        }
        drop(connection);
        self.get_license_state()
    }

    pub fn start_license_trial(&self) -> Result<LicenseStatePayload> {
        let connection = self.connection.lock();
        if get_setting_json(&connection, "licensePayload")?.is_some() {
            return Err(anyhow!(
                "Ya existe una licencia firmada activa o registrada en este equipo."
            ));
        }
        if get_setting_json(&connection, "trialStartedAt")?.is_some() {
            return Err(anyhow!(
                "La prueba profesional ya fue iniciada en este equipo."
            ));
        }

        let trial_days = get_setting_json(&connection, "licenseTrialDays")?
            .and_then(|value| value.as_i64())
            .unwrap_or(14);
        let now = Utc::now();
        let ends_at = now + Duration::days(trial_days);

        upsert_setting_json(
            &connection,
            "trialStartedAt",
            &Value::String(now.to_rfc3339()),
        )?;
        upsert_setting_json(
            &connection,
            "trialEndsAt",
            &Value::String(ends_at.to_rfc3339()),
        )?;
        upsert_setting_json(
            &connection,
            "licenseActivationMode",
            &Value::String("trial".to_string()),
        )?;
        drop(connection);
        self.get_license_state()
    }

    pub fn get_operational_profile(&self) -> Result<OperationalProfilePayload> {
        Ok(OperationalProfilePayload {
            product_name: "OrganiCursos".to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            identifier: "mx.web.zolvek.organicursos".to_string(),
            platform: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            app_data_dir: self.app_data_dir.to_string_lossy().to_string(),
            cache_dir: self.cache_dir.to_string_lossy().to_string(),
            database_path: self.path.to_string_lossy().to_string(),
            vector_enabled: self.vector_enabled,
            license_public_key_configured: public_key_configured(),
            portable_mode: self.portable_mode,
        })
    }

    pub fn list_pending_embeddings(&self, limit: i64) -> Result<Vec<PendingEmbeddingDocument>> {
        let connection = self.connection.lock();
        let model_name: String = connection.query_row(
            "SELECT value_json FROM app_settings WHERE key = 'modelName'",
            [],
            |row| row.get(0),
        )?;
        let normalized_model: String = serde_json::from_str(&model_name)?;

        let mut statement = connection.prepare(
            "SELECT e.id, e.entity_type, e.entity_id, e.course_id, e.content_hash, e.model_name,
                    sd.title || char(10) || sd.body AS text
             FROM embeddings e
             INNER JOIN search_documents sd ON sd.entity_type = e.entity_type AND sd.entity_id = e.entity_id
             LEFT JOIN embeddings_vec ev ON ev.embedding_id = e.id
             WHERE e.model_name = ?1 AND ev.embedding_id IS NULL
             LIMIT ?2",
        )?;

        let rows = statement.query_map(params![normalized_model, limit], |row| {
            Ok(PendingEmbeddingDocument {
                embedding_id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_id: row.get(2)?,
                course_id: row.get(3)?,
                content_hash: row.get(4)?,
                model_name: row.get(5)?,
                text: row.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn upsert_embedding_vectors(
        &self,
        payloads: Vec<crate::models::api::EmbeddingWriteInput>,
    ) -> Result<()> {
        if !self.vector_enabled {
            return Ok(());
        }

        let connection = self.connection.lock();
        let transaction = connection.unchecked_transaction()?;

        for payload in payloads {
            let vector_json = serde_json::to_string(&payload.vector)?;
            transaction.execute(
                "INSERT OR REPLACE INTO embeddings_vec(embedding_id, course_id, entity_type, model_name, vector, excerpt)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    payload.embedding_id,
                    payload.course_id,
                    payload.entity_type,
                    payload.model_name,
                    vector_json,
                    payload.excerpt
                ],
            )?;
        }

        transaction.commit()?;
        Ok(())
    }

    pub fn queue_job(
        &self,
        id: &str,
        kind: &str,
        target: Option<&str>,
        payload_json: Option<&str>,
    ) -> Result<()> {
        let connection = self.connection.lock();
        connection.execute(
            "INSERT INTO jobs(id, kind, status, target, payload_json) VALUES (?1, ?2, 'queued', ?3, ?4)",
            params![id, kind, target, payload_json],
        )?;
        Ok(())
    }

    pub fn find_active_job_for_target(
        &self,
        kind: &str,
        target: &str,
    ) -> Result<Option<String>> {
        let connection = self.connection.lock();
        connection
            .query_row(
                "SELECT id
                 FROM jobs
                 WHERE kind = ?1
                   AND target = ?2
                   AND status IN ('queued', 'running')
                 ORDER BY created_at DESC
                 LIMIT 1",
                params![kind, target],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn set_job_running(&self, id: &str, message: Option<&str>) -> Result<()> {
        let connection = self.connection.lock();
        connection.execute(
            "UPDATE jobs
             SET status = 'running',
                 message = ?2,
                 progress = CASE WHEN progress > 0 THEN progress ELSE 0 END,
                 started_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![id, message],
        )?;
        Ok(())
    }

    pub fn set_job_progress(&self, id: &str, progress: f64, message: Option<&str>) -> Result<()> {
        let connection = self.connection.lock();
        connection.execute(
            "UPDATE jobs
             SET status = 'running',
                 progress = ?2,
                 message = COALESCE(?3, message)
             WHERE id = ?1",
            params![id, progress.clamp(0.0, 100.0), message],
        )?;
        Ok(())
    }

    pub fn set_job_finished(
        &self,
        id: &str,
        status: &str,
        message: Option<&str>,
        error: Option<&str>,
    ) -> Result<()> {
        let connection = self.connection.lock();
        connection.execute(
            "UPDATE jobs
             SET status = ?2,
                 message = ?3,
                 error_text = ?4,
                 progress = CASE WHEN ?2 = 'completed' THEN 100 ELSE progress END,
                 finished_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![id, status, message, error],
        )?;
        Ok(())
    }

    pub fn create_embedding_placeholders_for_search_documents(&self) -> Result<()> {
        let settings = self.get_settings()?;
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT c.id,
                    c.title,
                    trim(
                      COALESCE(c.subtitle || char(10), '') ||
                      COALESCE(c.description || char(10), '') ||
                      COALESCE((
                        SELECT group_concat(s.title, char(10))
                        FROM course_sections s
                        WHERE s.course_id = c.id
                      ), '') || char(10) ||
                      COALESCE((
                        SELECT group_concat(l.title, char(10))
                        FROM lessons l
                        WHERE l.course_id = c.id
                      ), '') || char(10) ||
                      COALESCE((
                        SELECT group_concat(substr(a.extracted_text, 1, 360), char(10))
                        FROM lesson_assets a
                        WHERE a.course_id = c.id AND a.extracted_text IS NOT NULL
                      ), '') || char(10) ||
                      COALESCE((
                        SELECT group_concat(substr(l.subtitles_text, 1, 360), char(10))
                        FROM lessons l
                        WHERE l.course_id = c.id AND l.subtitles_text IS NOT NULL
                      ), '')
                    ) AS body
             FROM courses c",
        )?;
        let course_rows = statement
            .query_map([], |row| {
                let course_id: i64 = row.get(0)?;
                let title: String = row.get(1)?;
                let body: String = row.get(2)?;
                Ok((course_id, title, body))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        for (course_id, title, body) in course_rows {
            let content_hash = blake3::hash(format!("{title}\n{body}").as_bytes())
                .to_hex()
                .to_string();
            connection.execute(
                "INSERT INTO search_documents(entity_type, entity_id, course_id, lesson_id, title, body, source_kind, content_hash)
                 VALUES ('course', ?1, ?1, NULL, ?2, ?3, 'course-catalog', ?4)
                 ON CONFLICT(entity_type, entity_id, source_kind) DO UPDATE SET
                    title = excluded.title,
                    body = excluded.body,
                    content_hash = excluded.content_hash,
                    updated_at = CURRENT_TIMESTAMP",
                params![course_id, title, body, content_hash],
            )?;
        }

        connection.execute(
            "INSERT OR IGNORE INTO embeddings(entity_type, entity_id, course_id, chunk_index, model_name, dimensions, content_hash)
             SELECT entity_type, entity_id, course_id, 0, ?1, 384, content_hash
             FROM search_documents",
            params![settings.model_name],
        )?;
        Ok(())
    }

    pub fn list_pending_course_ai_documents(
        &self,
        limit: i64,
    ) -> Result<Vec<PendingCourseAiDocument>> {
        let settings = self.get_settings()?;
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT c.id,
                    c.title,
                    COALESCE(c.category, cam.inferred_category) AS current_category,
                    COALESCE(c.difficulty, cam.inferred_difficulty) AS current_difficulty,
                    COALESCE(c.description, cam.suggested_description) AS existing_description,
                    sd.content_hash,
                    trim(sd.title || char(10) || sd.body) AS text,
                    c.lesson_count,
                    c.total_duration_seconds
             FROM courses c
             INNER JOIN search_documents sd
                ON sd.entity_type = 'course' AND sd.entity_id = c.id AND sd.source_kind = 'course-catalog'
             LEFT JOIN course_ai_metadata cam ON cam.course_id = c.id
             WHERE cam.course_id IS NULL
                OR cam.content_hash <> sd.content_hash
                OR cam.model_name <> ?1
             ORDER BY c.updated_at DESC
             LIMIT ?2",
        )?;
        let rows = statement.query_map(params![settings.model_name, limit], |row| {
            map_pending_course_ai_document(row)
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn list_course_ai_documents(&self) -> Result<Vec<PendingCourseAiDocument>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT c.id,
                    c.title,
                    COALESCE(c.category, cam.inferred_category) AS current_category,
                    COALESCE(c.difficulty, cam.inferred_difficulty) AS current_difficulty,
                    COALESCE(c.description, cam.suggested_description) AS existing_description,
                    sd.content_hash,
                    trim(sd.title || char(10) || sd.body) AS text,
                    c.lesson_count,
                    c.total_duration_seconds
             FROM courses c
             INNER JOIN search_documents sd
                ON sd.entity_type = 'course' AND sd.entity_id = c.id AND sd.source_kind = 'course-catalog'
             LEFT JOIN course_ai_metadata cam ON cam.course_id = c.id
             ORDER BY c.updated_at DESC",
        )?;
        let rows = statement.query_map([], map_pending_course_ai_document)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn list_pending_lesson_transcript_documents(
        &self,
        limit: i64,
    ) -> Result<Vec<PendingLessonTranscriptDocument>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT l.id,
                    l.course_id,
                    l.title,
                    l.absolute_path,
                    (
                        SELECT absolute_path
                        FROM lesson_assets
                        WHERE lesson_id = l.id AND asset_kind = 'subtitle'
                        ORDER BY updated_at DESC
                        LIMIT 1
                    ) AS existing_subtitle_path,
                    COALESCE(
                        NULLIF(trim(l.transcript_text), ''),
                        NULLIF(trim(l.subtitles_text), ''),
                        (
                            SELECT NULLIF(trim(extracted_text), '')
                            FROM lesson_assets
                            WHERE lesson_id = l.id
                              AND asset_kind = 'subtitle'
                            ORDER BY updated_at DESC
                            LIMIT 1
                        )
                    ) AS existing_text,
                    lower(hex(randomblob(16)))
             FROM lessons l
             WHERE (
                    COALESCE(length(trim(l.transcript_text)), 0) = 0
                    OR COALESCE(length(trim(l.summary)), 0) = 0
                    OR (
                        COALESCE(length(trim(l.subtitles_text)), 0) > 0
                        AND (
                            l.title IS NULL
                            OR length(trim(l.title)) = 0
                            OR lower(trim(l.title)) LIKE '%/%'
                            OR lower(trim(l.title)) LIKE 'video%'
                            OR lower(trim(l.title)) LIKE 'videos%'
                            OR lower(trim(l.title)) LIKE 'clase%'
                            OR lower(trim(l.title)) LIKE 'leccion%'
                            OR lower(trim(l.title)) LIKE 'parte%'
                            OR lower(trim(l.title)) LIKE 'modulo%'
                            OR lower(trim(l.title)) LIKE 'recording%'
                            OR lower(trim(l.title)) LIKE '%notes%'
                        )
                    )
                )
             ORDER BY l.updated_at DESC, l.id DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit], |row| {
            Ok(PendingLessonTranscriptDocument {
                lesson_id: row.get(0)?,
                course_id: row.get(1)?,
                title: row.get(2)?,
                absolute_path: row.get(3)?,
                existing_subtitle_path: row.get(4)?,
                existing_text: row.get(5)?,
                content_hash: row.get(6)?,
            })
        })?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    pub fn store_generated_lesson_transcript(
        &self,
        lesson_id: i64,
        subtitle_path: &str,
        transcript_text: &str,
        summary: Option<&str>,
        content_hash: &str,
    ) -> Result<()> {
        let connection = self.connection.lock();
        let transaction = connection.unchecked_transaction()?;

        let (course_id, lesson_title): (i64, String) = transaction.query_row(
            "SELECT course_id, title FROM lessons WHERE id = ?1",
            params![lesson_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let inferred_title = infer_title_from_transcript(&lesson_title, transcript_text);
        let effective_title = inferred_title.as_deref().unwrap_or(&lesson_title);

        transaction.execute(
            "UPDATE lessons
             SET transcript_text = ?2,
                 subtitles_text = COALESCE(NULLIF(trim(subtitles_text), ''), ?2),
                 summary = COALESCE(?3, summary),
                 title = COALESCE(?4, title),
                 clean_title = lower(COALESCE(?4, title)),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![lesson_id, transcript_text, summary, inferred_title],
        )?;

        transaction.execute(
            "INSERT INTO lesson_assets(
                lesson_id, course_id, asset_kind, title, absolute_path, relative_path, extension,
                file_size_bytes, metadata_json, extracted_text, thumbnail_path
             ) VALUES (?1, ?2, 'subtitle', ?3, ?4, ?5, 'vtt', 0, NULL, ?6, NULL)
             ON CONFLICT(absolute_path) DO UPDATE SET
                lesson_id = excluded.lesson_id,
                course_id = excluded.course_id,
                asset_kind = 'subtitle',
                title = excluded.title,
                relative_path = excluded.relative_path,
                extracted_text = excluded.extracted_text,
                updated_at = CURRENT_TIMESTAMP",
            params![
                lesson_id,
                course_id,
                format!("{} - Subtitulos", effective_title),
                subtitle_path,
                format!("Subtitulos generados/{}.vtt", sanitize_display_name(effective_title)),
                transcript_text
            ],
        )?;

        transaction.execute(
            "INSERT INTO search_documents(entity_type, entity_id, course_id, lesson_id, title, body, source_kind, content_hash)
             VALUES ('lesson', ?1, ?2, ?1, ?3, ?4, 'generated-transcript', ?5)
             ON CONFLICT(entity_type, entity_id, source_kind) DO UPDATE SET
                title = excluded.title,
                body = excluded.body,
                content_hash = excluded.content_hash,
                updated_at = CURRENT_TIMESTAMP",
            params![lesson_id, course_id, effective_title, transcript_text, content_hash],
        )?;

        transaction.commit()?;
        Ok(())
    }

    pub fn upsert_course_insights(&self, insights: Vec<CourseInsightWriteInput>) -> Result<()> {
        let connection = self.connection.lock();
        let transaction = connection.unchecked_transaction()?;

        for insight in insights {
            transaction.execute(
                "INSERT INTO course_ai_metadata(
                    course_id, inferred_title, inferred_category, inferred_difficulty,
                    suggested_description, inference_confidence, model_name, content_hash, evidence_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
                 ON CONFLICT(course_id) DO UPDATE SET
                    inferred_title = excluded.inferred_title,
                    inferred_category = excluded.inferred_category,
                    inferred_difficulty = excluded.inferred_difficulty,
                    suggested_description = excluded.suggested_description,
                    inference_confidence = excluded.inference_confidence,
                    model_name = excluded.model_name,
                    content_hash = excluded.content_hash,
                    evidence_json = excluded.evidence_json,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    insight.course_id,
                    insight.inferred_title,
                    insight.inferred_category,
                    insight.inferred_difficulty,
                    insight.suggested_description,
                    insight.inference_confidence,
                    insight.model_name,
                    insight.content_hash,
                    insight.evidence_json.map(|value| value.to_string()),
                ],
            )?;

            transaction.execute(
                "DELETE FROM course_tags WHERE course_id = ?1 AND source = 'ai'",
                params![insight.course_id],
            )?;

            for tag in insight.tags {
                transaction.execute(
                    "INSERT OR IGNORE INTO tags(name, kind) VALUES (?1, 'system')",
                    params![tag.name],
                )?;
                transaction.execute(
                    "INSERT INTO course_tags(course_id, tag_id, source, confidence)
                     VALUES (
                        ?1,
                        (SELECT id FROM tags WHERE name = ?2),
                        'ai',
                        ?3
                     )
                     ON CONFLICT(course_id, tag_id) DO UPDATE SET
                        source = 'ai',
                        confidence = excluded.confidence,
                        created_at = course_tags.created_at",
                    params![insight.course_id, tag.name, tag.confidence],
                )?;
            }
        }

        transaction.commit()?;
        Ok(())
    }

    pub fn replace_similarity_candidates(
        &self,
        candidates: Vec<SimilarityCandidateInput>,
    ) -> Result<()> {
        let connection = self.connection.lock();
        let transaction = connection.unchecked_transaction()?;
        transaction.execute(
            "DELETE FROM course_similarity_candidates WHERE status = 'suggested'",
            [],
        )?;

        for candidate in candidates {
            let left = candidate.course_id.min(candidate.related_course_id);
            let right = candidate.course_id.max(candidate.related_course_id);
            if left == right {
                continue;
            }

            transaction.execute(
                "INSERT INTO course_similarity_candidates(
                    course_id, related_course_id, similarity, relation_kind, status, evidence_json
                 ) VALUES (?1, ?2, ?3, ?4, 'suggested', ?5)
                 ON CONFLICT(course_id, related_course_id) DO UPDATE SET
                    similarity = excluded.similarity,
                    relation_kind = excluded.relation_kind,
                    status = 'suggested',
                    evidence_json = excluded.evidence_json,
                    updated_at = CURRENT_TIMESTAMP",
                params![
                    left,
                    right,
                    candidate.similarity,
                    candidate.relation_kind,
                    candidate.evidence
                ],
            )?;
        }

        transaction.commit()?;
        Ok(())
    }

    fn list_sections_for_course(&self, course_id: i64) -> Result<Vec<CourseSection>> {
        let (section_rows, orphan_lessons) = {
            let connection = self.connection.lock();
            let mut statement = connection.prepare(
                "SELECT id, course_id, title, position
                 FROM course_sections
                 WHERE course_id = ?1
                 ORDER BY position ASC, title ASC",
            )?;

            let section_rows = statement
                .query_map(params![course_id], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, i64>(3)?,
                    ))
                })?
                .collect::<std::result::Result<Vec<_>, _>>()?;

            let orphan_lessons = {
                let mut statement = connection.prepare(
                    "SELECT l.id, l.course_id, l.section_id, l.title, l.relative_path, l.absolute_path,
                            l.duration_seconds, l.media_metadata_json,
                            COALESCE(lp.current_time_seconds, 0), COALESCE(lp.percent_complete, 0),
                            COALESCE(lp.playback_speed, 1.0), COALESCE(lp.volume, 1.0), lp.last_accessed_at, COALESCE(lp.completed, 0),
                            (SELECT absolute_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'subtitle' LIMIT 1),
                            (SELECT thumbnail_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'video' LIMIT 1)
                     FROM lessons l
                     LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
                     WHERE l.course_id = ?1 AND l.section_id IS NULL
                     ORDER BY l.position ASC, l.title ASC",
                )?;
                let rows = statement
                    .query_map(params![course_id], map_lesson_summary)?
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                rows
            };

            (section_rows, orphan_lessons)
        };

        let mut sections = Vec::new();
        for (id, course_id, title, position) in section_rows {
            sections.push(CourseSection {
                id,
                course_id,
                title,
                position,
                lessons: self.list_lessons_for_section(id)?,
            });
        }

        if !orphan_lessons.is_empty() {
            sections.insert(
                0,
                CourseSection {
                    id: -course_id,
                    course_id,
                    title: "Contenido principal".to_string(),
                    position: -1,
                    lessons: orphan_lessons,
                },
            );
        }

        Ok(sections)
    }

    fn list_lessons_for_section(&self, section_id: i64) -> Result<Vec<LessonSummary>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
                "SELECT l.id, l.course_id, l.section_id, l.title, l.relative_path, l.absolute_path,
                    l.duration_seconds, l.media_metadata_json,
                    COALESCE(lp.current_time_seconds, 0), COALESCE(lp.percent_complete, 0),
                    COALESCE(lp.playback_speed, 1.0), COALESCE(lp.volume, 1.0), lp.last_accessed_at, COALESCE(lp.completed, 0),
                    (SELECT absolute_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'subtitle' LIMIT 1),
                    (SELECT thumbnail_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'video' LIMIT 1)
             FROM lessons l
             LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
             WHERE l.section_id = ?1
             ORDER BY l.position ASC, l.title ASC",
        )?;
        let rows = statement.query_map(params![section_id], map_lesson_summary)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn list_assets_for_course(&self, course_id: i64) -> Result<Vec<LessonAssetRecord>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT a.id, a.lesson_id, a.course_id, a.asset_kind, a.title, a.absolute_path, a.relative_path,
                    a.extension, a.file_size_bytes, a.extracted_text, a.thumbnail_path
             FROM lesson_assets a
             WHERE a.course_id = ?1 AND a.asset_kind <> 'video'
             ORDER BY CASE a.asset_kind
                WHEN 'pdf' THEN 0
                WHEN 'docx' THEN 1
                WHEN 'text' THEN 2
                WHEN 'subtitle' THEN 3
                WHEN 'archive' THEN 4
                ELSE 5
             END, a.relative_path ASC, a.title ASC",
        )?;
        let rows = statement.query_map(params![course_id], map_lesson_asset)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }

    fn get_lesson(&self, lesson_id: i64) -> Result<LessonSummary> {
        let connection = self.connection.lock();
        Ok(connection.query_row(
            "SELECT l.id, l.course_id, l.section_id, l.title, l.relative_path, l.absolute_path,
                    l.duration_seconds, l.media_metadata_json,
                    COALESCE(lp.current_time_seconds, 0), COALESCE(lp.percent_complete, 0),
                    COALESCE(lp.playback_speed, 1.0), COALESCE(lp.volume, 1.0), lp.last_accessed_at, COALESCE(lp.completed, 0),
                    (SELECT absolute_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'subtitle' LIMIT 1),
                    (SELECT thumbnail_path FROM lesson_assets WHERE lesson_id = l.id AND asset_kind = 'video' LIMIT 1)
             FROM lessons l
             LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
             WHERE l.id = ?1",
            params![lesson_id],
            map_lesson_summary,
        )?)
    }

    fn list_notes_for_course(&self, course_id: i64) -> Result<Vec<NoteRecord>> {
        let connection = self.connection.lock();
        let mut statement = connection.prepare(
            "SELECT id, course_id, lesson_id, timestamp_seconds, body, created_at, updated_at
             FROM notes
             WHERE course_id = ?1
             ORDER BY created_at DESC",
        )?;
        let rows = statement.query_map(params![course_id], map_note)?;
        Ok(rows.collect::<std::result::Result<Vec<_>, _>>()?)
    }
}

fn map_course_card(row: &Row<'_>) -> rusqlite::Result<CourseCard> {
    Ok(CourseCard {
        id: row.get(0)?,
        title: row.get(1)?,
        subtitle: row.get(2)?,
        cover_path: row.get(3)?,
        category: row.get(4)?,
        difficulty: row.get(5)?,
        inferred_title: row.get(6)?,
        inferred_category: row.get(7)?,
        inferred_difficulty: row.get(8)?,
        suggested_description: row.get(9)?,
        inference_confidence: row.get(10)?,
        lesson_count: row.get(11)?,
        total_duration_seconds: row.get(12)?,
        progress_percent: row.get(13)?,
        last_viewed_at: row.get(14)?,
        is_favorite: row.get::<_, i64>(15)? == 1,
    })
}

fn map_tag_suggestion(row: &Row<'_>) -> rusqlite::Result<TagSuggestion> {
    Ok(TagSuggestion {
        name: row.get(0)?,
        confidence: row.get(1)?,
        source: row.get(2)?,
    })
}

fn map_course_similarity(row: &Row<'_>) -> rusqlite::Result<CourseSimilarityRecord> {
    Ok(CourseSimilarityRecord {
        course_id: row.get(0)?,
        related_course_id: row.get(1)?,
        similarity: row.get(2)?,
        relation_kind: row.get(3)?,
        status: row.get(4)?,
        evidence: row.get(5)?,
        related_course: CourseCard {
            id: row.get(6)?,
            title: row.get(7)?,
            subtitle: row.get(8)?,
            cover_path: row.get(9)?,
            category: row.get(10)?,
            difficulty: row.get(11)?,
            inferred_title: row.get(12)?,
            inferred_category: row.get(13)?,
            inferred_difficulty: row.get(14)?,
            suggested_description: row.get(15)?,
            inference_confidence: row.get(16)?,
            lesson_count: row.get(17)?,
            total_duration_seconds: row.get(18)?,
            progress_percent: row.get(19)?,
            last_viewed_at: row.get(20)?,
            is_favorite: row.get::<_, i64>(21)? == 1,
        },
    })
}

fn map_lesson_summary(row: &Row<'_>) -> rusqlite::Result<LessonSummary> {
    let media_info = row
        .get::<_, Option<String>>(7)?
        .and_then(|raw| serde_json::from_str::<MediaInfo>(&raw).ok());
    Ok(LessonSummary {
        id: row.get(0)?,
        course_id: row.get(1)?,
        section_id: row.get(2)?,
        title: row.get(3)?,
        relative_path: row.get(4)?,
        absolute_path: row.get(5)?,
        duration_seconds: row.get(6)?,
        progress_seconds: row.get(8)?,
        progress_percent: row.get(9)?,
        speed: row.get(10)?,
        volume: row.get(11)?,
        last_viewed_at: row.get(12)?,
        completed: row.get::<_, i64>(13)? == 1,
        subtitle_path: row.get(14)?,
        thumbnail_path: row.get(15)?,
        media_info,
    })
}

fn ensure_directory_available(path: &str) -> Result<()> {
    let value = Path::new(path);
    let metadata = value.metadata().map_err(|_| {
        anyhow!(
            "La carpeta seleccionada no esta disponible. Verifica que el disco externo siga conectado y montado en la misma ruta."
        )
    })?;

    if !metadata.is_dir() {
        return Err(anyhow!(
            "La ruta seleccionada no es una carpeta valida para biblioteca."
        ));
    }

    Ok(())
}

fn ensure_file_available(path: &str) -> Result<()> {
    let value = Path::new(path);
    let metadata = value.metadata().map_err(|_| {
        anyhow!(
            "El archivo solicitado no esta disponible. Revisa si el disco externo sigue conectado."
        )
    })?;

    if !metadata.is_file() {
        return Err(anyhow!(
            "La ruta del contenido ya no apunta a un archivo valido."
        ));
    }

    Ok(())
}

fn describe_directory_availability(path: &str) -> (bool, Option<String>) {
    let value = Path::new(path);
    match value.metadata() {
        Ok(metadata) if metadata.is_dir() => (true, None),
        Ok(_) => (
            false,
            Some("La ruta existe, pero ya no es una carpeta valida.".to_string()),
        ),
        Err(_) => (
            false,
            Some(
                "No esta disponible ahora mismo. Si usas un disco externo, conectalo con la misma ruta antes de reindexar o abrir clases."
                    .to_string(),
            ),
        ),
    }
}

fn map_lesson_asset(row: &Row<'_>) -> rusqlite::Result<LessonAssetRecord> {
    let extracted_text = row.get::<_, Option<String>>(9)?;
    let preview = extracted_text
        .clone()
        .map(|text| text.chars().take(180).collect::<String>());
    Ok(LessonAssetRecord {
        id: row.get(0)?,
        lesson_id: row.get(1)?,
        course_id: row.get(2)?,
        asset_kind: row.get(3)?,
        title: row.get(4)?,
        absolute_path: row.get(5)?,
        relative_path: row.get(6)?,
        extension: row.get(7)?,
        file_size_bytes: row.get(8)?,
        extracted_text_preview: preview,
        extracted_text,
        thumbnail_path: row.get(10)?,
    })
}

fn map_note(row: &Row<'_>) -> rusqlite::Result<NoteRecord> {
    Ok(NoteRecord {
        id: row.get(0)?,
        course_id: row.get(1)?,
        lesson_id: row.get(2)?,
        timestamp_seconds: row.get(3)?,
        body: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn normalize_copy(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clamp_chars(text: &str, max_chars: usize) -> String {
    let mut collected = String::new();
    for ch in text.chars().take(max_chars) {
        collected.push(ch);
    }
    collected.trim().to_string()
}

fn sentence_case(text: &str) -> String {
    let mut chars = text.chars();
    if let Some(first) = chars.next() {
        format!(
            "{}{}",
            first.to_uppercase().collect::<String>(),
            chars.collect::<String>()
        )
    } else {
        String::new()
    }
}

fn lower_sentence_start(text: &str) -> String {
    let mut chars = text.chars();
    if let Some(first) = chars.next() {
        format!(
            "{}{}",
            first.to_lowercase().collect::<String>(),
            chars.collect::<String>()
        )
    } else {
        String::new()
    }
}

fn sentence_candidates(text: &str) -> Vec<String> {
    text.split(['.', '!', '?', '\n'])
        .map(normalize_copy)
        .filter(|chunk| chunk.len() >= 28)
        .collect()
}

fn distinct_summary_candidates(text: &str) -> Vec<String> {
    let mut seen = Vec::<String>::new();
    sentence_candidates(text)
        .into_iter()
        .filter(|chunk| chunk.len() >= 42)
        .filter(|chunk| {
            let normalized = chunk.to_lowercase();
            let already_seen = seen.iter().any(|value| value == &normalized);
            if !already_seen {
                seen.push(normalized);
            }
            !already_seen
        })
        .collect()
}

fn build_text_preview(text: &str) -> Option<String> {
    let normalized = normalize_copy(text);
    if normalized.is_empty() {
        return None;
    }
    Some(clamp_chars(&normalized, 420))
}

fn build_text_highlights(text: Option<&str>, assets: &[LessonAssetRecord]) -> Vec<String> {
    if let Some(text) = text {
        let candidates = sentence_candidates(text);
        let highlights = candidates
            .into_iter()
            .filter(|chunk| chunk.len() <= 180)
            .take(3)
            .collect::<Vec<_>>();
        if !highlights.is_empty() {
            return highlights;
        }
    }

    assets
        .iter()
        .filter_map(|asset| {
            asset
                .extracted_text_preview
                .as_deref()
                .or(Some(asset.title.as_str()))
                .map(normalize_copy)
        })
        .filter(|chunk| !chunk.is_empty())
        .take(3)
        .collect()
}

fn build_lesson_summary(
    lesson_title: &str,
    section_title: Option<&str>,
    lesson_text: Option<&str>,
    assets: &[LessonAssetRecord],
) -> Option<String> {
    if let Some(text) = lesson_text {
        let candidates = distinct_summary_candidates(text);
        if let Some(primary) = candidates.first() {
            let summary = if let Some(secondary) = candidates
                .get(1)
                .filter(|secondary| normalize_copy(secondary).to_lowercase() != normalize_copy(primary).to_lowercase())
            {
                format!(
                    "Esta clase aborda {}. Despues profundiza en {}.",
                    lower_sentence_start(&clamp_chars(primary, 140)),
                    lower_sentence_start(&clamp_chars(secondary, 120))
                )
            } else {
                format!(
                    "Esta clase aborda {}.",
                    lower_sentence_start(&clamp_chars(primary, 170))
                )
            };

            let context_prefix = section_title
                .map(|section| format!("{}: ", sentence_case(section)))
                .unwrap_or_default();
            return Some(format!("{}{}", context_prefix, summary));
        }
    }

    let support_line = assets
        .iter()
        .find_map(|asset| asset.extracted_text_preview.clone())
        .or_else(|| assets.first().map(|asset| asset.title.clone()));

    support_line.map(|line| {
        let support = clamp_chars(&normalize_copy(&line), 120);
        let normalized_lesson = normalize_copy(lesson_title).to_lowercase();
        let normalized_support = normalize_copy(&support).to_lowercase();
        let section_prefix = section_title
            .map(|section| format!("{}: ", sentence_case(section)))
            .unwrap_or_default();
        if normalized_support == normalized_lesson
            || normalized_support.contains(&normalized_lesson)
            || normalized_lesson.contains(&normalized_support)
        {
            format!(
                "{}Esta clase presenta los puntos clave de {} para que puedas retomarlos con claridad.",
                section_prefix,
                lower_sentence_start(&clamp_chars(&normalize_copy(lesson_title), 120)),
            )
        } else {
            format!(
                "{}Esta clase presenta {} y se apoya en material sobre {}.",
                section_prefix,
                lower_sentence_start(&clamp_chars(&normalize_copy(lesson_title), 120)),
                lower_sentence_start(&support)
            )
        }
    })
}

fn title_needs_refinement_for_transcript(title: &str) -> bool {
    let normalized = title.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized.len() < 10 {
        return true;
    }

    if normalized.contains('/') || normalized.contains('\\') {
        return true;
    }

    if normalized
        .chars()
        .all(|character| character.is_ascii_digit() || matches!(character, '_' | '-' | '.'))
    {
        return true;
    }

    let alpha_words = normalized
        .split_whitespace()
        .filter(|segment| segment.chars().any(|character| character.is_alphabetic()))
        .collect::<Vec<_>>();

    alpha_words.len() <= 2
        || alpha_words.iter().all(|segment| {
            matches!(
                *segment,
                "video"
                    | "videos"
                    | "notes"
                    | "recording"
                    | "clase"
                    | "leccion"
                    | "parte"
                    | "modulo"
                    | "tema"
                    | "sesion"
                    | "clip"
            )
        })
}

fn infer_title_from_transcript(current_title: &str, transcript_text: &str) -> Option<String> {
    if !title_needs_refinement_for_transcript(current_title) {
        return None;
    }

    transcript_text
        .replace('\r', "\n")
        .split(['\n', '.', '!', '?'])
        .map(normalize_copy)
        .filter(|line| line.len() >= 18 && line.len() <= 96)
        .filter(|line| line.split_whitespace().count() >= 4)
        .filter(|line| {
            let lower = line.to_ascii_lowercase();
            !lower.contains("suscribe")
                && !lower.contains("instagram")
                && !lower.contains("whatsapp")
                && !lower.contains("facebook")
                && !lower.starts_with("http")
                && !lower.contains("www.")
        })
        .map(|line| sanitize_display_name(&line))
        .find(|line| line.len() >= 12)
}

fn map_bookmark(row: &Row<'_>) -> rusqlite::Result<BookmarkRecord> {
    Ok(BookmarkRecord {
        id: row.get(0)?,
        lesson_id: row.get(1)?,
        timestamp_seconds: row.get(2)?,
        label: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn map_pending_course_ai_document(row: &Row<'_>) -> rusqlite::Result<PendingCourseAiDocument> {
    Ok(PendingCourseAiDocument {
        course_id: row.get(0)?,
        title: row.get(1)?,
        current_category: row.get(2)?,
        current_difficulty: row.get(3)?,
        existing_description: row.get(4)?,
        content_hash: row.get(5)?,
        text: row.get(6)?,
        lesson_count: row.get(7)?,
        total_duration_seconds: row.get(8)?,
    })
}

fn map_cover_candidate(row: &Row<'_>) -> rusqlite::Result<CoverCandidateRecord> {
    Ok(CoverCandidateRecord {
        id: row.get(0)?,
        course_id: row.get(1)?,
        source: row.get(2)?,
        local_path: row.get(3)?,
        remote_url: row.get(4)?,
        attribution: row.get(5)?,
        score: row.get(6)?,
        status: row.get(7)?,
        selected_at: row.get(8)?,
    })
}

fn get_setting_json(connection: &Connection, key: &str) -> Result<Option<Value>> {
    let raw = connection
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()?;

    raw.map(|raw| serde_json::from_str(&raw).map_err(Into::into))
        .transpose()
}

fn upsert_setting_json(connection: &Connection, key: &str, value: &Value) -> Result<()> {
    connection.execute(
        "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP",
        params![key, serde_json::to_string(value)?],
    )?;
    Ok(())
}

fn delete_setting(connection: &Connection, key: &str) -> Result<()> {
    connection.execute("DELETE FROM app_settings WHERE key = ?1", params![key])?;
    Ok(())
}

fn edition_label_from_tier(tier: &str) -> String {
    match tier {
        "professional" => "Professional".to_string(),
        "team" => "Team".to_string(),
        "enterprise" => "Enterprise".to_string(),
        _ => "Community".to_string(),
    }
}

fn features_for_tier(tier: &str, claims_features: &[String]) -> Vec<String> {
    if !claims_features.is_empty() {
        return claims_features.to_vec();
    }

    match tier {
        "professional" => vec![
            "Reindexacion IA local completa".to_string(),
            "Enriquecimiento remoto opt-in".to_string(),
            "Exportacion e importacion de respaldos".to_string(),
            "Soporte prioritario por correo".to_string(),
        ],
        "team" => vec![
            "Licencias multi-equipo".to_string(),
            "Reindexacion IA local completa".to_string(),
            "Enriquecimiento remoto opt-in".to_string(),
            "Playbooks de despliegue".to_string(),
        ],
        "enterprise" => vec![
            "Despliegue administrado".to_string(),
            "Licenciamiento por volumen".to_string(),
            "Playbooks de soporte".to_string(),
            "Canal de versiones acordado".to_string(),
        ],
        _ => vec![
            "Biblioteca local-first".to_string(),
            "Progreso exacto".to_string(),
            "Busqueda textual y semantica local".to_string(),
            "Privacidad y operacion offline".to_string(),
        ],
    }
}
