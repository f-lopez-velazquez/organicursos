use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use image::GenericImageView;
use rusqlite::params;
use tauri::AppHandle;
use walkdir::WalkDir;

use crate::db::Database;
use crate::indexing::fingerprint::fingerprint_file;
use crate::indexing::parser::{extract_text_resilient, TextExtractionStatus};
use crate::media::ffmpeg::generate_thumbnail;
use crate::media::ffprobe::probe_media;
use crate::utils::pathing::{file_stem_string, relative_string, sanitize_display_name};
use crate::utils::storage;

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "mov", "avi", "webm"];
const DOCUMENT_EXTENSIONS: &[&str] = &["pdf", "docx", "txt", "md", "html", "htm", "pptx"];
const SUBTITLE_EXTENSIONS: &[&str] = &["srt", "vtt"];
const ARCHIVE_EXTENSIONS: &[&str] = &["zip"];
const AUDIO_EXTENSIONS: &[&str] = &["wav", "mp3", "m4a", "aac", "ogg", "flac"];
const UNSUPPORTED_ARCHIVE_EXTENSIONS: &[&str] = &["rar", "7z", "tar", "gz", "bz2"];

#[derive(Clone)]
struct FileEntry {
    absolute: PathBuf,
    relative_to_library: String,
    extension: String,
}

pub async fn index_library(
    app: AppHandle,
    database: &Database,
    root_path: &str,
    job_id: &str,
) -> Result<()> {
    database.set_job_running(job_id, Some("Escaneando biblioteca"))?;
    let library_root = PathBuf::from(root_path);
    let library_id = ensure_library(database, root_path)?;

    let mut courses: HashMap<String, Vec<FileEntry>> = HashMap::new();
    let mut supported_files = 0usize;
    let mut unsupported_files = 0usize;
    let mut unsupported_archive_files = 0usize;
    let mut problematic_documents = 0usize;
    let mut timed_out_documents = 0usize;
    let mut skipped_large_documents = 0usize;
    let mut unsupported_examples = Vec::<String>::new();
    let mut scanned_files = 0usize;
    for entry in WalkDir::new(&library_root)
        .into_iter()
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.path().to_path_buf();
        scanned_files += 1;
        if scanned_files % 40 == 0 {
            let scan_progress = ((scanned_files as f64 / 600.0) * 4.0).clamp(0.5, 4.0);
            database.set_job_progress(
                job_id,
                scan_progress,
                Some(&format!(
                    "Escaneando carpetas y archivos... {} revisados",
                    scanned_files
                )),
            )?;
        }
        let extension = path
            .extension()
            .map(|value| value.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        if !is_supported(&extension) {
            unsupported_files += 1;
            if UNSUPPORTED_ARCHIVE_EXTENSIONS.contains(&extension.as_str()) {
                unsupported_archive_files += 1;
            }
            if !extension.is_empty() && !unsupported_examples.iter().any(|value| value == &extension) && unsupported_examples.len() < 4 {
                unsupported_examples.push(extension.clone());
            }
            continue;
        }
        supported_files += 1;

        let relative = relative_string(&library_root, &path);
        let course_key = relative.split('/').next().unwrap_or("").to_string();
        courses.entry(course_key).or_default().push(FileEntry {
            absolute: path,
            relative_to_library: relative,
            extension,
        });
    }
    let total_units = supported_files.max(1);
    let total_courses = courses.len().max(1);
    database.set_job_progress(
        job_id,
        5.0,
        Some(&format!(
            "Encontramos {} archivos utiles en {} cursos o carpetas. {} archivos no compatibles se omitiran.",
            supported_files, total_courses, unsupported_files
        )),
    )?;

    let mut processed_units = 0usize;
    let mut duplicate_files = 0usize;
    let mut last_reported_progress = 5i64;
    for (course_index, (course_key, entries)) in courses.into_iter().enumerate() {
        let course_root = if course_key.is_empty() {
            library_root.clone()
        } else {
            library_root.join(&course_key)
        };
        let course_id = upsert_course(database, library_id, &course_root, &course_key)?;
        let mut lesson_lookup: HashMap<(String, String), i64> = HashMap::new();
        let course_label = sanitize_display_name(
            course_root
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("Curso"),
        );

        let mut sorted_entries = entries.clone();
        sorted_entries.sort_by(|a, b| a.relative_to_library.cmp(&b.relative_to_library));

        for (position, entry) in sorted_entries.iter().enumerate() {
            if !VIDEO_EXTENSIONS.contains(&entry.extension.as_str()) {
                continue;
            }

            let stage_progress = 5.0 + (processed_units as f64 / total_units as f64 * 94.0);
            database.set_job_progress(
                job_id,
                stage_progress,
                Some(&format!("Analizando video: {}", sanitize_display_name(&file_stem_string(&entry.absolute)))),
            )?;

            let fingerprint = fingerprint_file(&entry.absolute)?;
            if is_duplicate_file_candidate(database, &entry.absolute, &fingerprint)? {
                duplicate_files += 1;
            }
            upsert_fingerprint(database, &entry.absolute, &entry.extension, &fingerprint)?;

            let section_relative = entry
                .absolute
                .strip_prefix(&course_root)
                .ok()
                .and_then(|path| path.parent())
                .map(|path| path.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|| ".".to_string());
            let section_title = if section_relative == "." {
                "General".to_string()
            } else {
                sanitize_display_name(&section_relative)
            };
            let section_id =
                upsert_section(database, course_id, &section_title, &section_relative)?;

            database.set_job_progress(
                job_id,
                stage_progress,
                Some(&format!("Leyendo duracion, formato y pistas de {}", course_label)),
            )?;
            let metadata = probe_media(&app, entry.absolute.to_string_lossy().as_ref())
                .await
                .unwrap_or_else(|_| crate::media::ffprobe::ProbeMetadata {
                    duration_seconds: None,
                    width: None,
                    height: None,
                    video_codec: None,
                    audio_codec: None,
                    container: None,
                    subtitle_tracks: vec![],
                    raw: serde_json::json!({}),
                });
            let normalized_media = serde_json::json!({
                "durationSeconds": metadata.duration_seconds,
                "width": metadata.width,
                "height": metadata.height,
                "videoCodec": metadata.video_codec,
                "audioCodec": metadata.audio_codec,
                "container": metadata.container,
                "subtitleTracks": metadata.subtitle_tracks,
            });

            let raw_stem = file_stem_string(&entry.absolute);
            let relative_to_course = relative_string(&course_root, &entry.absolute);
            let lesson_title = build_initial_lesson_title(
                &raw_stem,
                &section_title,
                &course_label,
                &relative_to_course,
                position,
            );
            let lesson_id = upsert_lesson(
                database,
                course_id,
                section_id,
                &lesson_title,
                &relative_to_course,
                entry.absolute.to_string_lossy().as_ref(),
                position as i64,
                metadata.duration_seconds,
                &normalized_media,
            )?;

            let thumbnail_path = thumbnail_path_for(&app, &fingerprint.partial_hash)?;
            database.set_job_progress(
                job_id,
                stage_progress,
                Some(&format!("Creando portada y miniatura de {}", lesson_title)),
            )?;
            let _ = generate_best_thumbnail(
                &app,
                entry.absolute.to_string_lossy().as_ref(),
                &thumbnail_path,
                metadata.duration_seconds,
            )
            .await;

            upsert_asset(
                database,
                Some(lesson_id),
                Some(course_id),
                "video",
                &lesson_title,
                entry.absolute.to_string_lossy().as_ref(),
                &relative_to_course,
                &entry.extension,
                fingerprint.file_size_bytes as i64,
                Some(normalized_media.clone()),
                None,
                Some(thumbnail_path.to_string_lossy().to_string()),
            )?;
            set_course_cover_path(
                database,
                course_id,
                thumbnail_path.to_string_lossy().as_ref(),
            )?;

            upsert_search_document(
                database,
                "lesson",
                lesson_id,
                Some(course_id),
                Some(lesson_id),
                &lesson_title,
                &format!("{} {}", lesson_title, section_title),
                "lesson-title",
                &fingerprint.partial_hash,
            )?;

            upsert_cover_candidate(
                database,
                course_id,
                "generated-local",
                Some(thumbnail_path.to_string_lossy().as_ref()),
                None,
                None,
                None,
            )?;

            lesson_lookup.insert(
                (
                    section_relative.clone(),
                    file_stem_string(&entry.absolute).to_lowercase(),
                ),
                lesson_id,
            );
            processed_units += 1;
            maybe_report_job_progress(
                database,
                job_id,
                &mut last_reported_progress,
                processed_units,
                total_units,
                &format!(
                    "Importando {} ({}/{})",
                    course_label,
                    course_index + 1,
                    total_courses
                ),
            )?;
        }

        for entry in sorted_entries {
            if VIDEO_EXTENSIONS.contains(&entry.extension.as_str()) {
                continue;
            }

            let relative_to_course = relative_string(&course_root, &entry.absolute);
            let section_relative = entry
                .absolute
                .strip_prefix(&course_root)
                .ok()
                .and_then(|path| path.parent())
                .map(|path| path.to_string_lossy().replace('\\', "/"))
                .unwrap_or_else(|| ".".to_string());
            let file_stem = file_stem_string(&entry.absolute).to_lowercase();
            let lesson_id = lesson_lookup
                .get(&(section_relative.clone(), file_stem))
                .copied();
            let title = sanitize_display_name(&file_stem_string(&entry.absolute));
            let fingerprint = fingerprint_file(&entry.absolute)?;
            if is_duplicate_file_candidate(database, &entry.absolute, &fingerprint)? {
                duplicate_files += 1;
            }
            upsert_fingerprint(database, &entry.absolute, &entry.extension, &fingerprint)?;

            let kind = if DOCUMENT_EXTENSIONS.contains(&entry.extension.as_str()) {
                if entry.extension == "pdf" {
                    "pdf"
                } else if entry.extension == "docx" {
                    "docx"
                } else if matches!(entry.extension.as_str(), "html" | "htm") {
                    "html"
                } else if entry.extension == "pptx" {
                    "presentation"
                } else {
                    "text"
                }
            } else if SUBTITLE_EXTENSIONS.contains(&entry.extension.as_str()) {
                "subtitle"
            } else if AUDIO_EXTENSIONS.contains(&entry.extension.as_str()) {
                "audio"
            } else if ARCHIVE_EXTENSIONS.contains(&entry.extension.as_str()) {
                "archive"
            } else {
                "other"
            };

            let stage_progress = 5.0 + (processed_units as f64 / total_units as f64 * 94.0);
            let stage_label = match kind {
                "subtitle" => format!("Extrayendo subtitulos de {}", title),
                "pdf" => format!("Leyendo PDF de apoyo: {}", title),
                "docx" | "text" | "html" | "presentation" => {
                    format!("Leyendo material de apoyo: {}", title)
                }
                "audio" => format!("Registrando audio de apoyo: {}", title),
                "archive" => format!("Registrando archivo comprimido: {}", title),
                _ => format!("Organizando material: {}", title),
            };
            database.set_job_progress(job_id, stage_progress, Some(&stage_label))?;

            let text = match extract_text_resilient(&entry.absolute) {
                TextExtractionStatus::Extracted(value) => value,
                TextExtractionStatus::TimedOut => {
                    timed_out_documents += 1;
                    problematic_documents += 1;
                    database.set_job_progress(
                        job_id,
                        stage_progress,
                        Some(&format!(
                            "Saltando un archivo pesado para no detener la importacion: {}",
                            title
                        )),
                    )?;
                    None
                }
                TextExtractionStatus::Failed => {
                    problematic_documents += 1;
                    None
                }
                TextExtractionStatus::SkippedLarge => {
                    skipped_large_documents += 1;
                    problematic_documents += 1;
                    database.set_job_progress(
                        job_id,
                        stage_progress,
                        Some(&format!(
                            "Registrando un material pesado sin leerlo completo: {}",
                            title
                        )),
                    )?;
                    None
                }
            };

            let asset_id = upsert_asset(
                database,
                lesson_id,
                Some(course_id),
                kind,
                &title,
                entry.absolute.to_string_lossy().as_ref(),
                &relative_to_course,
                &entry.extension,
                entry.absolute.metadata()?.len() as i64,
                None,
                text.clone(),
                None,
            )?;

            if let Some(extracted) = text {
                let entity_type = if lesson_id.is_some() && kind == "subtitle" {
                    "lesson"
                } else {
                    "asset"
                };
                let entity_id = lesson_id.unwrap_or(asset_id);
                upsert_search_document(
                    database,
                    entity_type,
                    entity_id,
                    Some(course_id),
                    lesson_id,
                    &title,
                    &extracted,
                    kind,
                    &fingerprint.partial_hash,
                )?;

                if kind == "subtitle" {
                    update_lesson_subtitles(database, lesson_id, &extracted)?;
                    maybe_refine_lesson_title(database, lesson_id, &title, &extracted)?;
                }
            }

            processed_units += 1;
            maybe_report_job_progress(
                database,
                job_id,
                &mut last_reported_progress,
                processed_units,
                total_units,
                &format!(
                    "Ordenando materiales de {} ({}/{})",
                    course_label,
                    course_index + 1,
                    total_courses
                ),
            )?;
        }

        refresh_course_aggregates(database, course_id)?;
    }

    database.set_job_progress(
        job_id,
        96.0,
        Some("Preparando la busqueda local y revisando nombres de las clases"),
    )?;
    database.create_embedding_placeholders_for_search_documents()?;
    database.set_job_progress(
        job_id,
        99.0,
        Some("Cerrando la importacion y guardando el resultado final"),
    )?;
    let unsupported_hint = if unsupported_files > 0 {
        let suffix = if unsupported_examples.is_empty() {
            String::new()
        } else {
            format!(" ({})", unsupported_examples.join(", "))
        };
        format!(" Se omitieron {unsupported_files} archivos no compatibles{suffix}.")
    } else {
        String::new()
    };
    let archive_hint = if unsupported_archive_files > 0 {
        format!(" {unsupported_archive_files} de ellos eran comprimidos no compatibles como RAR o 7Z.")
    } else {
        String::new()
    };
    let duplicate_hint = if duplicate_files > 0 {
        format!(" Detectamos {duplicate_files} archivos que parecen repetidos.")
    } else {
        String::new()
    };
    let problematic_hint = if problematic_documents > 0 {
        format!(" {problematic_documents} materiales tardaron demasiado o no se pudieron leer por completo.")
    } else {
        String::new()
    };
    let timeout_hint = if timed_out_documents > 0 {
        format!(" {timed_out_documents} de ellos se saltaron para no detener toda la importacion.")
    } else {
        String::new()
    };
    let large_hint = if skipped_large_documents > 0 {
        format!(
            " {skipped_large_documents} materiales pesados se registraron sin lectura completa para evitar bloqueos."
        )
    } else {
        String::new()
    };
    database.set_job_finished(
        job_id,
        "completed",
        Some(&format!(
            "Importacion terminada. Se organizaron {supported_files} archivos de {total_courses} cursos o carpetas.{unsupported_hint}{archive_hint}{duplicate_hint}{problematic_hint}{timeout_hint}{large_hint}"
        )),
        None,
    )?;
    Ok(())
}

fn maybe_report_job_progress(
    database: &Database,
    job_id: &str,
    last_reported_progress: &mut i64,
    processed_units: usize,
    total_units: usize,
    message: &str,
) -> Result<()> {
    let progress = 5.0 + (processed_units as f64 / total_units as f64 * 94.0);
    let rounded = progress.floor() as i64;
    if rounded > *last_reported_progress {
        *last_reported_progress = rounded;
        database.set_job_progress(job_id, progress, Some(message))?;
    }
    Ok(())
}

fn ensure_library(database: &Database, root_path: &str) -> Result<i64> {
    let connection = database.connection.lock();
    connection.execute(
        "INSERT INTO libraries(name, root_path, canonical_root_path) VALUES (?1, ?2, ?3)
         ON CONFLICT(root_path) DO UPDATE SET updated_at = CURRENT_TIMESTAMP",
        params![
            Path::new(root_path)
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| "Biblioteca".to_string()),
            root_path,
            root_path.replace('\\', "/")
        ],
    )?;
    let id = connection.query_row(
        "SELECT id FROM libraries WHERE root_path = ?1",
        params![root_path],
        |row| row.get(0),
    )?;
    Ok(id)
}

fn upsert_course(
    database: &Database,
    library_id: i64,
    course_root: &Path,
    course_key: &str,
) -> Result<i64> {
    let title = if course_key.is_empty() {
        sanitize_display_name(
            &course_root
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_else(|| "Curso".to_string()),
        )
    } else {
        sanitize_display_name(course_key)
    };

    let connection = database.connection.lock();
    let root = course_root.to_string_lossy().to_string();
    connection.execute(
        "INSERT INTO courses(library_id, root_path, canonical_root_path, title)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(root_path) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP",
        params![library_id, root, course_root.to_string_lossy().replace('\\', "/"), title],
    )?;
    let id = connection.query_row(
        "SELECT id FROM courses WHERE root_path = ?1",
        params![course_root.to_string_lossy().to_string()],
        |row| row.get(0),
    )?;
    Ok(id)
}

fn upsert_section(
    database: &Database,
    course_id: i64,
    title: &str,
    relative_path: &str,
) -> Result<i64> {
    let connection = database.connection.lock();
    connection.execute(
        "INSERT INTO course_sections(course_id, title, normalized_title, relative_path, position)
         VALUES (?1, ?2, ?3, ?4, (
            SELECT COALESCE(MAX(position) + 1, 0) FROM course_sections WHERE course_id = ?1
         ))
         ON CONFLICT(course_id, relative_path) DO UPDATE SET title = excluded.title, updated_at = CURRENT_TIMESTAMP",
        params![course_id, title, title.to_lowercase(), relative_path],
    )?;
    let id = connection.query_row(
        "SELECT id FROM course_sections WHERE course_id = ?1 AND relative_path = ?2",
        params![course_id, relative_path],
        |row| row.get(0),
    )?;
    Ok(id)
}

fn upsert_lesson(
    database: &Database,
    course_id: i64,
    section_id: i64,
    title: &str,
    relative_path: &str,
    absolute_path: &str,
    position: i64,
    duration_seconds: Option<i64>,
    metadata_json: &serde_json::Value,
) -> Result<i64> {
    let connection = database.connection.lock();
    connection.execute(
        "INSERT INTO lessons(
            course_id, section_id, title, clean_title, relative_path, absolute_path, file_stem, duration_seconds,
            media_metadata_json, position
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(absolute_path) DO UPDATE SET
            title = excluded.title,
            clean_title = excluded.clean_title,
            section_id = excluded.section_id,
            duration_seconds = excluded.duration_seconds,
            media_metadata_json = excluded.media_metadata_json,
            updated_at = CURRENT_TIMESTAMP",
        params![
            course_id,
            section_id,
            title,
            title.to_lowercase(),
            relative_path,
            absolute_path,
            title.to_lowercase(),
            duration_seconds,
            metadata_json.to_string(),
            position
        ],
    )?;
    let lesson_id = connection.query_row(
        "SELECT id FROM lessons WHERE absolute_path = ?1",
        params![absolute_path],
        |row| row.get(0),
    )?;
    Ok(lesson_id)
}

fn upsert_asset(
    database: &Database,
    lesson_id: Option<i64>,
    course_id: Option<i64>,
    asset_kind: &str,
    title: &str,
    absolute_path: &str,
    relative_path: &str,
    extension: &str,
    file_size_bytes: i64,
    metadata_json: Option<serde_json::Value>,
    extracted_text: Option<String>,
    thumbnail_path: Option<String>,
) -> Result<i64> {
    let connection = database.connection.lock();
    connection.execute(
        "INSERT INTO lesson_assets(
            lesson_id, course_id, asset_kind, title, absolute_path, relative_path, extension,
            file_size_bytes, metadata_json, extracted_text, thumbnail_path
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(absolute_path) DO UPDATE SET
            lesson_id = excluded.lesson_id,
            course_id = excluded.course_id,
            asset_kind = excluded.asset_kind,
            title = excluded.title,
            metadata_json = excluded.metadata_json,
            extracted_text = excluded.extracted_text,
            thumbnail_path = COALESCE(excluded.thumbnail_path, lesson_assets.thumbnail_path),
            updated_at = CURRENT_TIMESTAMP",
        params![
            lesson_id,
            course_id,
            asset_kind,
            title,
            absolute_path,
            relative_path,
            extension,
            file_size_bytes,
            metadata_json.map(|value| value.to_string()),
            extracted_text,
            thumbnail_path
        ],
    )?;
    let id = connection.query_row(
        "SELECT id FROM lesson_assets WHERE absolute_path = ?1",
        params![absolute_path],
        |row| row.get(0),
    )?;
    Ok(id)
}

fn upsert_search_document(
    database: &Database,
    entity_type: &str,
    entity_id: i64,
    course_id: Option<i64>,
    lesson_id: Option<i64>,
    title: &str,
    body: &str,
    source_kind: &str,
    content_hash: &str,
) -> Result<()> {
    let connection = database.connection.lock();
    connection.execute(
        "INSERT INTO search_documents(entity_type, entity_id, course_id, lesson_id, title, body, source_kind, content_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(entity_type, entity_id, source_kind) DO UPDATE SET
            title = excluded.title,
            body = excluded.body,
            content_hash = excluded.content_hash,
            updated_at = CURRENT_TIMESTAMP",
        params![entity_type, entity_id, course_id, lesson_id, title, body, source_kind, content_hash],
    )?;
    Ok(())
}

fn upsert_cover_candidate(
    database: &Database,
    course_id: i64,
    source: &str,
    local_path: Option<&str>,
    remote_url: Option<&str>,
    attribution: Option<&str>,
    score: Option<f64>,
) -> Result<()> {
    let connection = database.connection.lock();
    connection.execute(
        "INSERT INTO cover_candidates(course_id, source, local_path, remote_url, attribution, score)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![course_id, source, local_path, remote_url, attribution, score],
    )?;
    Ok(())
}

fn update_lesson_subtitles(database: &Database, lesson_id: Option<i64>, text: &str) -> Result<()> {
    if let Some(lesson_id) = lesson_id {
        let connection = database.connection.lock();
        connection.execute(
            "UPDATE lessons SET subtitles_text = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
            params![lesson_id, text],
        )?;
    }
    Ok(())
}

fn maybe_refine_lesson_title(
    database: &Database,
    lesson_id: Option<i64>,
    current_title: &str,
    subtitle_text: &str,
) -> Result<()> {
    let Some(lesson_id) = lesson_id else {
        return Ok(());
    };

    if !title_needs_refinement(current_title) {
        return Ok(());
    }

    let Some(inferred_title) = infer_title_from_text(subtitle_text) else {
        return Ok(());
    };

    let connection = database.connection.lock();
    connection.execute(
        "UPDATE lessons
         SET title = ?2,
             clean_title = lower(?2),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![lesson_id, inferred_title],
    )?;
    Ok(())
}

fn title_needs_refinement(title: &str) -> bool {
    let normalized = title.trim().to_ascii_lowercase();
    if normalized.is_empty() || normalized.len() < 8 {
        return true;
    }

    if normalized.contains('/') || normalized.contains('\\') {
        return true;
    }

    if normalized.chars().all(|character| !character.is_alphabetic()) {
        return true;
    }

    if normalized
        .chars()
        .all(|character| character.is_ascii_digit() || matches!(character, '_' | '-' | '.'))
    {
        return true;
    }

    let words = normalized
        .split_whitespace()
        .filter(|segment| segment.chars().any(|char| char.is_alphabetic()))
        .collect::<Vec<_>>();

    words.len() <= 2
        || words.iter().all(|word| {
            matches!(
                *word,
                "video"
                    | "videos"
                    | "clase"
                    | "leccion"
                    | "parte"
                    | "modulo"
                    | "recording"
                    | "notes"
                    | "tema"
                    | "sesion"
                    | "capitulo"
                    | "clip"
            )
        })
}

fn is_duplicate_file_candidate(
    database: &Database,
    absolute_path: &Path,
    fingerprint: &crate::indexing::fingerprint::Fingerprint,
) -> Result<bool> {
    let connection = database.connection.lock();
    let canonical_path = absolute_path.to_string_lossy().replace('\\', "/");
    let duplicates: i64 = connection.query_row(
        "SELECT COUNT(*)
         FROM file_fingerprints
         WHERE partial_hash = ?1
           AND file_size_bytes = ?2
           AND canonical_path <> ?3
           AND missing_since IS NULL",
        params![
            fingerprint.partial_hash,
            fingerprint.file_size_bytes as i64,
            canonical_path
        ],
        |row| row.get(0),
    )?;
    Ok(duplicates > 0)
}

fn build_initial_lesson_title(
    raw_stem: &str,
    section_title: &str,
    course_title: &str,
    relative_to_course: &str,
    position: usize,
) -> String {
    let clean_title = sanitize_display_name(raw_stem);
    if !title_needs_refinement(&clean_title) {
        return clean_title;
    }

    let topic = derive_topic_hint(section_title, course_title, relative_to_course);

    if topic_is_generic(&topic) {
        format!("Clase {:02}", position + 1)
    } else if position == 0 {
        format!("Introduccion a {topic}")
    } else {
        format!("Clase {:02} - {topic}", position + 1)
    }
}

fn derive_topic_hint(section_title: &str, course_title: &str, relative_to_course: &str) -> String {
    let path_candidates = relative_to_course
        .split('/')
        .rev()
        .skip(1)
        .map(sanitize_display_name)
        .filter(|segment| !segment.is_empty())
        .filter(|segment| !topic_is_generic(segment))
        .collect::<Vec<_>>();

    if let Some(candidate) = path_candidates.first() {
        return candidate.clone();
    }

    if !topic_is_generic(section_title) {
        return sanitize_display_name(section_title);
    }

    sanitize_display_name(course_title)
}

fn topic_is_generic(value: &str) -> bool {
    let normalized = value.trim().to_ascii_lowercase();
    normalized.is_empty()
        || normalized.chars().all(|character| character.is_ascii_digit())
        || normalized
            .chars()
            .all(|character| character.is_ascii_digit() || matches!(character, '_' | '-' | '.'))
        || matches!(
            normalized.as_str(),
            "general"
                | "curso"
                | "videos"
                | "video"
                | "video notes"
                | "video_notes"
                | "notes"
                | "recording"
                | "recordings"
                | "screenrecording"
                | "screen recording"
                | "clip"
                | "modulo"
                | "modulo 1"
                | "clases"
                | "lecciones"
                | "parte"
                | "sin clasificar"
        )
}

fn infer_title_from_text(text: &str) -> Option<String> {
    text.replace('\r', "\n")
        .split(['\n', '.', '!', '?'])
        .map(str::trim)
        .filter(|line| line.len() >= 18 && line.len() <= 90)
        .filter(|line| line.split_whitespace().count() >= 4)
        .filter(|line| !line.chars().all(|character| character.is_ascii_digit()))
        .filter(|line| {
            let lower = line.to_ascii_lowercase();
            !lower.contains("www.")
                && !lower.contains(".com")
                && !lower.starts_with("http")
                && !lower.contains("suscrib")
                && !lower.contains("instagram")
        })
        .find_map(|line| {
            let clean = sanitize_display_name(line);
            if clean.len() >= 12 { Some(clean) } else { None }
        })
}

fn upsert_fingerprint(
    database: &Database,
    absolute_path: &Path,
    extension: &str,
    fingerprint: &crate::indexing::fingerprint::Fingerprint,
) -> Result<()> {
    let connection = database.connection.lock();
    connection.execute(
        "INSERT INTO file_fingerprints(
            absolute_path, canonical_path, file_name, extension, file_size_bytes, modified_at,
            partial_hash, fingerprint_key, last_seen_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)
         ON CONFLICT(absolute_path) DO UPDATE SET
            canonical_path = excluded.canonical_path,
            file_size_bytes = excluded.file_size_bytes,
            modified_at = excluded.modified_at,
            partial_hash = excluded.partial_hash,
            fingerprint_key = excluded.fingerprint_key,
            last_seen_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP,
            missing_since = NULL",
        params![
            absolute_path.to_string_lossy().to_string(),
            absolute_path.to_string_lossy().replace('\\', "/"),
            absolute_path
                .file_name()
                .map(|value| value.to_string_lossy().to_string())
                .unwrap_or_default(),
            extension,
            fingerprint.file_size_bytes as i64,
            fingerprint.modified_at,
            fingerprint.partial_hash,
            fingerprint.fingerprint_key
        ],
    )?;
    Ok(())
}

fn refresh_course_aggregates(database: &Database, course_id: i64) -> Result<()> {
    let connection = database.connection.lock();
    connection.execute(
        "UPDATE courses
         SET lesson_count = (
             SELECT COUNT(*) FROM lessons WHERE course_id = ?1
         ),
             total_duration_seconds = (
             SELECT COALESCE(SUM(duration_seconds), 0) FROM lessons WHERE course_id = ?1
         ),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![course_id],
    )?;

    let (title, aggregated_body): (String, String) = connection.query_row(
        "SELECT c.title,
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
                ) AS aggregated_body
         FROM courses c
         WHERE c.id = ?1",
        params![course_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    drop(connection);

    let content_hash = blake3::hash(format!("{title}\n{aggregated_body}").as_bytes())
        .to_hex()
        .to_string();
    upsert_search_document(
        database,
        "course",
        course_id,
        Some(course_id),
        None,
        &title,
        &aggregated_body,
        "course-catalog",
        &content_hash,
    )?;
    Ok(())
}

fn set_course_cover_path(database: &Database, course_id: i64, cover_path: &str) -> Result<()> {
    let connection = database.connection.lock();
    connection.execute(
        "UPDATE courses
         SET cover_path = COALESCE(cover_path, ?2),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        params![course_id, cover_path],
    )?;
    Ok(())
}

fn thumbnail_path_for(app: &AppHandle, partial_hash: &str) -> Result<PathBuf> {
    let dir = storage::app_cache_dir(app)
        .context("no se pudo resolver el cache dir")?
        .join("thumbnails");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join(format!("{partial_hash}.jpg")))
}

async fn generate_best_thumbnail(
    app: &AppHandle,
    input_path: &str,
    output_path: &Path,
    duration_seconds: Option<i64>,
) -> Result<()> {
    let candidates = thumbnail_candidates(duration_seconds);
    let mut fallback_path: Option<PathBuf> = None;

    for (index, second_hint) in candidates.iter().enumerate() {
        let candidate_path = output_path.with_file_name(format!(
            "{}-candidate-{index}.jpg",
            output_path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("thumb")
        ));

        if generate_thumbnail(app, input_path, &candidate_path, *second_hint)
            .await
            .is_err()
        {
            continue;
        }

        if fallback_path.is_none() {
            fallback_path = Some(candidate_path.clone());
        }

        if is_visual_thumbnail_candidate(&candidate_path)? {
            if output_path.exists() {
                let _ = std::fs::remove_file(output_path);
            }
            std::fs::rename(&candidate_path, output_path)?;
            cleanup_thumbnail_candidates(output_path)?;
            return Ok(());
        }
    }

    if let Some(path) = fallback_path {
        if output_path.exists() {
            let _ = std::fs::remove_file(output_path);
        }
        std::fs::rename(path, output_path)?;
        cleanup_thumbnail_candidates(output_path)?;
    }

    Ok(())
}

fn thumbnail_candidates(duration_seconds: Option<i64>) -> Vec<i64> {
    let mut candidates = vec![0, 1, 2, 4, 7, 11];
    if let Some(duration) = duration_seconds {
        let richer_points = [duration / 10, duration / 5, duration / 3]
            .into_iter()
            .filter(|point| *point > 0)
            .collect::<Vec<_>>();
        candidates.extend(richer_points);
    }
    candidates.sort_unstable();
    candidates.dedup();
    candidates
}

fn cleanup_thumbnail_candidates(output_path: &Path) -> Result<()> {
    let parent = output_path.parent().context("sin carpeta de miniaturas")?;
    let stem = output_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or("thumb");

    for entry in std::fs::read_dir(parent)? {
        let entry = entry?;
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|file| file.to_str()) else {
            continue;
        };

        if name.starts_with(&format!("{stem}-candidate-")) {
            let _ = std::fs::remove_file(path);
        }
    }

    Ok(())
}

fn is_visual_thumbnail_candidate(path: &Path) -> Result<bool> {
    let image = image::open(path)?;
    let (width, height) = image.dimensions();
    if width == 0 || height == 0 {
        return Ok(false);
    }

    let sample_x = (width / 12).max(1);
    let sample_y = (height / 12).max(1);

    let mut min_luma = 255f32;
    let mut max_luma = 0f32;
    let mut total_luma = 0f32;
    let mut samples = 0f32;
    let mut bucket_hits = std::collections::HashSet::new();

    let mut y = 0;
    while y < height {
        let mut x = 0;
        while x < width {
            let pixel = image.get_pixel(x, y);
            let [r, g, b, _] = pixel.0;
            let luma = 0.2126 * f32::from(r) + 0.7152 * f32::from(g) + 0.0722 * f32::from(b);
            min_luma = min_luma.min(luma);
            max_luma = max_luma.max(luma);
            total_luma += luma;
            samples += 1.0;

            let bucket = (u16::from(r) / 32, u16::from(g) / 32, u16::from(b) / 32);
            bucket_hits.insert(bucket);
            x += sample_x;
        }
        y += sample_y;
    }

    let mean = if samples > 0.0 {
        total_luma / samples
    } else {
        0.0
    };
    let mut variance_acc = 0f32;

    let mut y = 0;
    while y < height {
        let mut x = 0;
        while x < width {
            let pixel = image.get_pixel(x, y);
            let [r, g, b, _] = pixel.0;
            let luma = 0.2126 * f32::from(r) + 0.7152 * f32::from(g) + 0.0722 * f32::from(b);
            variance_acc += (luma - mean).powi(2);
            x += sample_x;
        }
        y += sample_y;
    }

    let variance = if samples > 0.0 {
        variance_acc / samples
    } else {
        0.0
    };
    let dynamic_range = max_luma - min_luma;

    Ok(dynamic_range >= 18.0 && variance >= 120.0 && bucket_hits.len() >= 8)
}

fn is_supported(extension: &str) -> bool {
    VIDEO_EXTENSIONS.contains(&extension)
        || DOCUMENT_EXTENSIONS.contains(&extension)
        || SUBTITLE_EXTENSIONS.contains(&extension)
        || ARCHIVE_EXTENSIONS.contains(&extension)
        || AUDIO_EXTENSIONS.contains(&extension)
}
