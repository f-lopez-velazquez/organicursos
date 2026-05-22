pub mod repositories;

use std::path::PathBuf;

use anyhow::Result;
use parking_lot::Mutex;
use rusqlite::{Connection, OpenFlags};
use tauri::{AppHandle, Manager};

use crate::utils::storage;

pub struct Database {
    pub path: PathBuf,
    pub app_data_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub connection: Mutex<Connection>,
    pub vector_enabled: bool,
    pub portable_mode: bool,
}

impl Database {
    pub fn open(app: &AppHandle) -> Result<Self> {
        let app_data_dir = storage::app_data_dir(app)?;
        let cache_dir = storage::app_cache_dir(app)?;
        let portable_mode = storage::portable_mode_enabled(app)?;

        let path = app_data_dir.join("atlas-courses.db");
        let connection = Connection::open_with_flags(
            &path,
            OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
        )?;
        connection.pragma_update(None, "foreign_keys", "ON")?;

        run_migrations(&connection)?;
        recover_incomplete_jobs(&connection)?;

        let vector_enabled = load_sqlite_vec(app, &connection).unwrap_or(false);

        Ok(Self {
            path,
            app_data_dir,
            cache_dir,
            connection: Mutex::new(connection),
            vector_enabled,
            portable_mode,
        })
    }
}

fn run_migrations(connection: &Connection) -> Result<()> {
    let migrations = [
        include_str!("../../migrations/0001_init.sql"),
        include_str!("../../migrations/0002_search.sql"),
        include_str!("../../migrations/0004_ai.sql"),
        include_str!("../../migrations/0005_settings.sql"),
        include_str!("../../migrations/0006_commercial.sql"),
    ];

    for migration in migrations {
        connection.execute_batch(migration)?;
    }

    Ok(())
}

fn recover_incomplete_jobs(connection: &Connection) -> Result<()> {
    connection.execute(
        "UPDATE jobs
         SET status = 'cancelled',
             message = CASE
               WHEN status = 'running' THEN 'Proceso interrumpido en una sesion anterior'
               ELSE 'Trabajo pendiente reiniciado en una nueva sesion'
             END,
             finished_at = CURRENT_TIMESTAMP
         WHERE status IN ('queued', 'running')",
        [],
    )?;
    Ok(())
}

fn load_sqlite_vec(app: &AppHandle, connection: &Connection) -> Result<bool> {
    let candidates = sqlite_vec_candidates(app)?;
    for candidate in candidates {
        if candidate.exists() {
            unsafe {
                connection.load_extension_enable()?;
                if connection
                    .load_extension(candidate.to_string_lossy().as_ref(), None)
                    .is_ok()
                {
                    connection.execute_batch(include_str!("../../migrations/0003_vec.sql"))?;
                    connection.load_extension_disable()?;
                    return Ok(true);
                }
                connection.load_extension_disable()?;
            }
        }
    }

    Ok(false)
}

fn sqlite_vec_candidates(app: &AppHandle) -> Result<Vec<PathBuf>> {
    let resolver = app.path();
    let resource_dir = resolver
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let base = resource_dir.join("sqlite-vec");
    let mut candidates = Vec::new();
    if cfg!(target_os = "windows") {
        candidates.push(base.join("vec0.dll"));
        candidates.push(base.join("sqlite_vec.dll"));
    } else if cfg!(target_os = "macos") {
        candidates.push(base.join("vec0.dylib"));
        candidates.push(base.join("sqlite_vec.dylib"));
    } else {
        candidates.push(base.join("vec0.so"));
        candidates.push(base.join("sqlite_vec.so"));
    }

    Ok(candidates)
}
