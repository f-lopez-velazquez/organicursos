use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::export;
use crate::models::api::{BackupOperationResult, StorageOverview};
use crate::state::app_state::AppState;

#[tauri::command]
pub fn get_storage_overview(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<StorageOverview, String> {
    let (
        database_bytes,
        thumbnail_cache_bytes,
        imported_cover_bytes,
        app_data_dir,
        cache_dir,
        backup_dir,
        latest_backup_path,
        latest_backup_at,
        latest_backup_bytes,
        backup_count,
    ) =
        export::compute_storage_overview(&app, &state.db).map_err(|error| error.to_string())?;
    Ok(StorageOverview {
        database_bytes,
        thumbnail_cache_bytes,
        imported_cover_bytes,
        app_data_dir,
        cache_dir,
        backup_dir,
        latest_backup_path,
        latest_backup_at,
        latest_backup_bytes,
        backup_count,
    })
}

#[tauri::command]
pub fn export_backup_package(
    app: AppHandle,
    destination_path: String,
    state: State<'_, AppState>,
) -> Result<BackupOperationResult, String> {
    let path = PathBuf::from(&destination_path);
    let bytes_written =
        export::export_backup_package(&app, &state.db, &path).map_err(|error| error.to_string())?;
    Ok(BackupOperationResult {
        path: destination_path,
        bytes_written,
    })
}

#[tauri::command]
pub fn import_backup_package(
    app: AppHandle,
    source_path: String,
    state: State<'_, AppState>,
) -> Result<BackupOperationResult, String> {
    let path = PathBuf::from(&source_path);
    let bytes_written =
        export::import_backup_package(&app, &state.db, &path).map_err(|error| error.to_string())?;
    Ok(BackupOperationResult {
        path: source_path,
        bytes_written,
    })
}

#[tauri::command]
pub fn clear_thumbnail_cache(app: AppHandle) -> Result<u64, String> {
    export::clear_thumbnail_cache(&app).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_automatic_backup(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<BackupOperationResult, String> {
    let (path, bytes_written) =
        export::create_automatic_backup(&app, &state.db).map_err(|error| error.to_string())?;
    Ok(BackupOperationResult {
        path: path.to_string_lossy().to_string(),
        bytes_written,
    })
}

#[tauri::command]
pub fn reset_app_to_factory(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    export::reset_to_factory(&app, &state.db).map_err(|error| error.to_string())
}
