use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result};
use tauri::{AppHandle, Manager};

const PORTABLE_ENV: &str = "ORGANICURSOS_PORTABLE";
const PORTABLE_MARKER: &str = ".organicursos-portable";
const PORTABLE_ROOT_DIR: &str = "portable-data";

pub fn app_data_dir(app: &AppHandle) -> Result<PathBuf> {
    if let Some(portable_root) = portable_root(app)? {
        let data_dir = portable_root.join("data");
        fs::create_dir_all(&data_dir)?;
        return Ok(data_dir);
    }

    let data_dir = app
        .path()
        .app_data_dir()
        .context("no se pudo resolver el directorio de datos")?;
    fs::create_dir_all(&data_dir)?;
    Ok(data_dir)
}

pub fn app_cache_dir(app: &AppHandle) -> Result<PathBuf> {
    if let Some(portable_root) = portable_root(app)? {
        let cache_dir = portable_root.join("cache");
        fs::create_dir_all(&cache_dir)?;
        return Ok(cache_dir);
    }

    let cache_dir = app
        .path()
        .app_cache_dir()
        .context("no se pudo resolver el directorio de cache")?;
    fs::create_dir_all(&cache_dir)?;
    Ok(cache_dir)
}

pub fn portable_mode_enabled(app: &AppHandle) -> Result<bool> {
    Ok(portable_root(app)?.is_some())
}

fn portable_root(app: &AppHandle) -> Result<Option<PathBuf>> {
    let executable = std::env::current_exe().context("no se pudo resolver el ejecutable actual")?;
    let executable_dir = executable
        .parent()
        .map(PathBuf::from)
        .context("no se pudo resolver la carpeta del ejecutable")?;

    let marker_path = executable_dir.join(PORTABLE_MARKER);
    let env_enabled = std::env::var(PORTABLE_ENV)
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false);

    if env_enabled || marker_path.exists() {
        let portable_root = executable_dir.join(PORTABLE_ROOT_DIR);
        fs::create_dir_all(&portable_root)?;
        return Ok(Some(portable_root));
    }

    // Also honor an already existing sibling portable-data folder for portable bundles.
    let sibling_root = executable_dir.join(PORTABLE_ROOT_DIR);
    if sibling_root.exists() {
        fs::create_dir_all(&sibling_root)?;
        return Ok(Some(sibling_root));
    }

    let _ = app;
    Ok(None)
}
