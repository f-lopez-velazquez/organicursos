use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use parking_lot::Mutex;
use tauri::AppHandle;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

use crate::db::Database;
use crate::utils::storage;

const EXPORT_DATABASE_NAME: &str = "organicursos.db";
const LEGACY_EXPORT_DATABASE_NAME: &str = "atlas-courses.db";
const EXPORT_MANIFEST_NAME: &str = "manifest.json";
const AUTO_BACKUP_EXTENSION: &str = "organi";
const AUTO_BACKUP_LATEST_NAME: &str = "automatico-ultimo.organi";
const AUTO_BACKUP_ROTATION_PREFIX: &str = "automatico-";
const AUTO_BACKUP_ROTATION_LIMIT: usize = 8;
const AUTO_BACKUP_SNAPSHOT_INTERVAL_MINUTES: i64 = 60;
const APP_TABLES: &[&str] = &[
    "course_similarity_candidates",
    "course_ai_metadata",
    "watch_history",
    "jobs",
    "cover_candidates",
    "embeddings",
    "search_documents",
    "course_tags",
    "tags",
    "bookmarks",
    "notes",
    "lesson_progress",
    "lesson_assets",
    "lessons",
    "course_sections",
    "courses",
    "libraries",
    "file_fingerprints",
    "app_settings",
];
static AUTO_BACKUP_MUTEX: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

pub fn export_backup_package(
    app: &AppHandle,
    database: &Database,
    destination_path: &Path,
) -> Result<u64> {
    if let Some(parent) = destination_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let snapshot_dir = storage::app_cache_dir(app)?.join("exports");
    fs::create_dir_all(&snapshot_dir)?;
    let snapshot_path = snapshot_dir.join(format!("snapshot-{}.db", Uuid::new_v4()));
    {
        let connection = database.connection.lock();
        connection.execute(
            "VACUUM INTO ?1",
            rusqlite::params![snapshot_path.to_string_lossy().to_string()],
        )?;
    }

    let file = File::create(destination_path)?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    writer.start_file(EXPORT_DATABASE_NAME, options)?;
    let mut db_file = File::open(&snapshot_path)?;
    std::io::copy(&mut db_file, &mut writer)?;

    let manifest = serde_json::json!({
        "product": "OrganiCursos",
        "version": env!("CARGO_PKG_VERSION"),
        "exportedAt": chrono::Utc::now().to_rfc3339(),
    });
    writer.start_file(EXPORT_MANIFEST_NAME, options)?;
    writer.write_all(manifest.to_string().as_bytes())?;

    let covers_dir = storage::app_data_dir(app)?.join("covers");
    if covers_dir.exists() {
        add_directory_to_zip(&mut writer, &covers_dir, "covers", options)?;
    }

    writer.finish()?;
    let _ = fs::remove_file(&snapshot_path);
    Ok(fs::metadata(destination_path)?.len())
}

pub fn import_backup_package(
    app: &AppHandle,
    database: &Database,
    source_path: &Path,
) -> Result<u64> {
    let cache_dir = storage::app_cache_dir(app)?.join("imports");
    fs::create_dir_all(&cache_dir)?;
    let temp_dir = cache_dir.join(Uuid::new_v4().to_string());
    fs::create_dir_all(&temp_dir)?;

    let file = File::open(source_path)?;
    let mut archive = ZipArchive::new(file)?;
    let mut imported_db_path: Option<PathBuf> = None;
    let imported_covers_dir = temp_dir.join("covers");

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let name = entry.name().replace('\\', "/");
        let output_path = temp_dir.join(&name);
        if entry.is_dir() {
            fs::create_dir_all(&output_path)?;
            continue;
        }

        if let Some(parent) = output_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut output = File::create(&output_path)?;
        std::io::copy(&mut entry, &mut output)?;

        if name == EXPORT_DATABASE_NAME || name == LEGACY_EXPORT_DATABASE_NAME {
            imported_db_path = Some(output_path);
        }
    }

    let imported_db_path = imported_db_path.context("el paquete no contiene organicursos.db")?;
    restore_database_from_file(database, &imported_db_path)?;

    let app_covers_dir = storage::app_data_dir(app)?.join("covers");
    if imported_covers_dir.exists() {
        if app_covers_dir.exists() {
            fs::remove_dir_all(&app_covers_dir)?;
        }
        copy_directory_recursive(&imported_covers_dir, &app_covers_dir)?;
    }

    let bytes = fs::metadata(source_path)?.len();
    let _ = fs::remove_dir_all(&temp_dir);
    Ok(bytes)
}

pub fn create_automatic_backup(app: &AppHandle, database: &Database) -> Result<(PathBuf, u64)> {
    let _guard = AUTO_BACKUP_MUTEX.lock();

    let backup_dir = automatic_backup_dir(app)?;
    fs::create_dir_all(&backup_dir)?;

    let latest_path = backup_dir.join(AUTO_BACKUP_LATEST_NAME);
    let bytes_written = export_backup_package(app, database, &latest_path)?;

    if should_create_snapshot(&backup_dir)? {
        let snapshot_name = format!(
            "{}{}.{}",
            AUTO_BACKUP_ROTATION_PREFIX,
            Utc::now().format("%Y%m%d-%H%M%S"),
            AUTO_BACKUP_EXTENSION
        );
        let snapshot_path = backup_dir.join(snapshot_name);
        let _ = fs::copy(&latest_path, &snapshot_path);
        trim_snapshot_history(&backup_dir)?;
    }

    Ok((latest_path, bytes_written))
}

pub fn compute_storage_overview(
    app: &AppHandle,
    database: &Database,
) -> Result<(u64, u64, u64, String, String, String, Option<String>, Option<String>, u64, u64)> {
    let app_data_dir = storage::app_data_dir(app)?;
    let cache_dir = storage::app_cache_dir(app)?;
    let thumbnail_cache = cache_dir.join("thumbnails");
    let covers_dir = app_data_dir.join("covers");
    let backup_dir = automatic_backup_dir(app)?;
    fs::create_dir_all(&backup_dir)?;
    let latest_backup = latest_backup_info(&backup_dir)?;

    Ok((
        fs::metadata(&database.path)
            .map(|value| value.len())
            .unwrap_or(0),
        directory_size(&thumbnail_cache)?,
        directory_size(&covers_dir)?,
        app_data_dir.to_string_lossy().to_string(),
        cache_dir.to_string_lossy().to_string(),
        backup_dir.to_string_lossy().to_string(),
        latest_backup
            .as_ref()
            .map(|value| value.path.to_string_lossy().to_string()),
        latest_backup.as_ref().map(|value| value.modified_at.to_rfc3339()),
        latest_backup.as_ref().map(|value| value.bytes).unwrap_or(0),
        count_backup_packages(&backup_dir)?,
    ))
}

pub fn clear_thumbnail_cache(app: &AppHandle) -> Result<u64> {
    let thumbnail_dir = storage::app_cache_dir(app)?.join("thumbnails");
    let bytes = directory_size(&thumbnail_dir)?;
    if thumbnail_dir.exists() {
        fs::remove_dir_all(&thumbnail_dir)?;
    }
    fs::create_dir_all(&thumbnail_dir)?;
    Ok(bytes)
}

pub fn reset_to_factory(app: &AppHandle, database: &Database) -> Result<()> {
    let app_data_dir = storage::app_data_dir(app)?;
    let cache_dir = storage::app_cache_dir(app)?;
    let backup_dir = automatic_backup_dir(app)?;
    let covers_dir = app_data_dir.join("covers");

    {
        let connection = database.connection.lock();
        let transaction = connection.unchecked_transaction()?;
        transaction.execute_batch("PRAGMA foreign_keys = OFF;")?;
        transaction.execute_batch("DELETE FROM search_documents_fts;")?;
        if database.vector_enabled {
            let _ = transaction.execute("DELETE FROM embeddings_vec", []);
        }

        for table in APP_TABLES {
            transaction.execute(&format!("DELETE FROM {table}"), [])?;
        }

        insert_default_app_settings(&transaction)?;
        transaction.execute_batch(
            "INSERT INTO search_documents_fts(search_documents_fts) VALUES('rebuild');
             PRAGMA foreign_keys = ON;",
        )?;
        transaction.commit()?;
    }

    if covers_dir.exists() {
        fs::remove_dir_all(&covers_dir)?;
    }

    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir)?;
    }
    fs::create_dir_all(&cache_dir)?;

    if backup_dir.exists() {
        fs::remove_dir_all(&backup_dir)?;
    }
    fs::create_dir_all(&backup_dir)?;

    Ok(())
}

fn restore_database_from_file(database: &Database, source_path: &Path) -> Result<()> {
    let connection = database.connection.lock();
    let mut attach_sql = String::from("ATTACH DATABASE '");
    attach_sql.push_str(&source_path.to_string_lossy().replace('\'', "''"));
    attach_sql.push_str("' AS incoming");
    connection.execute_batch(&attach_sql)?;

    let transaction = connection.unchecked_transaction()?;
    transaction.execute_batch("PRAGMA foreign_keys = OFF;")?;
    transaction.execute_batch("DELETE FROM search_documents_fts;")?;
    if database.vector_enabled {
        let _ = transaction.execute("DELETE FROM embeddings_vec", []);
    }

    for table in APP_TABLES {
        transaction.execute(&format!("DELETE FROM {table}"), [])?;
    }

    for table in APP_TABLES.iter().rev() {
        transaction.execute(
            &format!("INSERT INTO main.{0} SELECT * FROM incoming.{0}", table),
            [],
        )?;
    }

    if database.vector_enabled {
        let _ = transaction.execute(
            "INSERT INTO embeddings_vec SELECT * FROM incoming.embeddings_vec",
            [],
        );
    }

    transaction.execute_batch(
        "INSERT INTO search_documents_fts(search_documents_fts) VALUES('rebuild');
         PRAGMA foreign_keys = ON;",
    )?;
    transaction.commit()?;
    connection.execute_batch("DETACH DATABASE incoming")?;
    Ok(())
}

fn add_directory_to_zip(
    writer: &mut ZipWriter<File>,
    source_dir: &Path,
    prefix: &str,
    options: SimpleFileOptions,
) -> Result<()> {
    for entry in walkdir::WalkDir::new(source_dir)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let relative = path.strip_prefix(source_dir)?;
        let zip_path = format!("{prefix}/{}", relative.to_string_lossy().replace('\\', "/"));
        writer.start_file(zip_path, options)?;
        let mut file = File::open(path)?;
        std::io::copy(&mut file, writer)?;
    }
    Ok(())
}

fn insert_default_app_settings(connection: &rusqlite::Transaction<'_>) -> Result<()> {
    let defaults = [
        ("locale", "\"es-MX\""),
        ("completionThresholdPercent", "92"),
        ("internetEnrichmentEnabled", "false"),
        ("offlineModeEnabled", "true"),
        ("thumbnailQuality", "\"balanced\""),
        ("modelName", "\"Xenova/all-MiniLM-L6-v2\""),
        ("coverEnrichmentProvider", "\"openverse\""),
        ("cardDensity", "\"comfortable\""),
        ("reducedMotion", "false"),
        ("aiProcessingEnabled", "false"),
        ("lowResourceMode", "false"),
        ("releaseChannel", "\"stable\""),
        ("licenseTrialDays", "14"),
    ];

    for (key, value_json) in defaults {
        connection.execute(
            "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
            rusqlite::params![key, value_json],
        )?;
    }

    Ok(())
}

fn copy_directory_recursive(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for entry in walkdir::WalkDir::new(from)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        let source = entry.path();
        let relative = source.strip_prefix(from)?;
        let target = to.join(relative);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(source, &target)?;
        }
    }
    Ok(())
}

fn directory_size(path: &Path) -> Result<u64> {
    if !path.exists() {
        return Ok(0);
    }

    let mut total = 0_u64;
    for entry in walkdir::WalkDir::new(path)
        .into_iter()
        .filter_map(|entry| entry.ok())
    {
        if entry.file_type().is_file() {
            total = total.saturating_add(entry.metadata()?.len());
        }
    }
    Ok(total)
}

fn automatic_backup_dir(app: &AppHandle) -> Result<PathBuf> {
    Ok(storage::app_data_dir(app)?.join("backups"))
}

fn should_create_snapshot(backup_dir: &Path) -> Result<bool> {
    let latest_snapshot = list_backup_packages(backup_dir)?
        .into_iter()
        .filter(|entry| entry.path.file_name().and_then(|value| value.to_str()) != Some(AUTO_BACKUP_LATEST_NAME))
        .max_by_key(|entry| entry.modified_at);

    let Some(latest_snapshot) = latest_snapshot else {
        return Ok(true);
    };

    Ok(Utc::now().signed_duration_since(latest_snapshot.modified_at).num_minutes()
        >= AUTO_BACKUP_SNAPSHOT_INTERVAL_MINUTES)
}

fn trim_snapshot_history(backup_dir: &Path) -> Result<()> {
    let mut snapshots: Vec<_> = list_backup_packages(backup_dir)?
        .into_iter()
        .filter(|entry| entry.path.file_name().and_then(|value| value.to_str()) != Some(AUTO_BACKUP_LATEST_NAME))
        .collect();

    snapshots.sort_by_key(|entry| entry.modified_at);
    while snapshots.len() > AUTO_BACKUP_ROTATION_LIMIT {
        if let Some(entry) = snapshots.first() {
            let _ = fs::remove_file(&entry.path);
        }
        snapshots.remove(0);
    }

    Ok(())
}

fn latest_backup_info(backup_dir: &Path) -> Result<Option<BackupFileInfo>> {
    let mut packages = list_backup_packages(backup_dir)?;
    packages.sort_by_key(|entry| entry.modified_at);
    Ok(packages.pop())
}

fn count_backup_packages(backup_dir: &Path) -> Result<u64> {
    Ok(list_backup_packages(backup_dir)?.len() as u64)
}

fn list_backup_packages(backup_dir: &Path) -> Result<Vec<BackupFileInfo>> {
    if !backup_dir.exists() {
        return Ok(Vec::new());
    }

    let mut packages = Vec::new();
    for entry in fs::read_dir(backup_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());
        if extension.as_deref() != Some(AUTO_BACKUP_EXTENSION) {
            continue;
        }
        let metadata = entry.metadata()?;
        let modified_at: DateTime<Utc> = metadata
            .modified()
            .map(DateTime::<Utc>::from)
            .unwrap_or_else(|_| Utc::now());
        packages.push(BackupFileInfo {
            path,
            modified_at,
            bytes: metadata.len(),
        });
    }
    Ok(packages)
}

struct BackupFileInfo {
    path: PathBuf,
    modified_at: DateTime<Utc>,
    bytes: u64,
}
