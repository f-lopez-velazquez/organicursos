use std::path::Path;

use tauri::{AppHandle, State};

use crate::indexing::service::index_library;
use crate::jobs::queue::create_job;
use crate::models::api::{CourseCard, CourseDetail, LibraryRecord, ToggleFavoriteInput};
use crate::state::app_state::AppState;

fn spawn_index_job(
    app: AppHandle,
    root_path: String,
    state: &AppState,
    kind: &str,
) -> Result<String, String> {
    ensure_library_root_available(&root_path)?;
    let db = state.db.clone();
    if let Some(existing_id) = db
        .find_active_job_for_target(kind, &root_path)
        .map_err(|error| error.to_string())?
    {
        return Ok(existing_id);
    }
    let job_id =
        create_job(&db, kind, Some(&root_path), None).map_err(|error| error.to_string())?;
    let job_id_for_task = job_id.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(error) = index_library(app, &db, &root_path, &job_id_for_task).await {
            let _ = db.set_job_finished(
                &job_id_for_task,
                "failed",
                Some("Indexacion fallida"),
                Some(&error.to_string()),
            );
        }
    });

    Ok(job_id)
}

fn ensure_library_root_available(root_path: &str) -> Result<(), String> {
    let path = Path::new(root_path);
    let metadata = path.metadata().map_err(|_| {
        "La biblioteca no esta disponible. Verifica que el disco externo siga conectado y montado en la misma ruta.".to_string()
    })?;

    if !metadata.is_dir() {
        return Err("La ruta registrada ya no corresponde a una carpeta valida.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn add_library(root_path: String, state: State<'_, AppState>) -> Result<(), String> {
    ensure_library_root_available(&root_path)?;
    state
        .db
        .add_library(&root_path)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn enqueue_index_library_job(
    app: AppHandle,
    root_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    spawn_index_job(app, root_path, &state, "index_library")
}

#[tauri::command]
pub fn list_libraries(state: State<'_, AppState>) -> Result<Vec<LibraryRecord>, String> {
    state.db.list_libraries().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn enqueue_reindex_library_job(
    app: AppHandle,
    library_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let root_path = state
        .db
        .get_library_root_path(library_id)
        .map_err(|error| error.to_string())?;
    spawn_index_job(app, root_path, &state, "reindex_library")
}

#[tauri::command]
pub async fn enqueue_reindex_all_libraries(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let root_paths = state
        .db
        .get_all_library_root_paths()
        .map_err(|error| error.to_string())?;

    if root_paths.is_empty() {
        return Err("No hay bibliotecas registradas para reindexar.".to_string());
    }

    let available_paths = root_paths
        .into_iter()
        .filter(|root_path| ensure_library_root_available(root_path).is_ok())
        .collect::<Vec<_>>();

    if available_paths.is_empty() {
        return Err(
            "Ninguna biblioteca esta disponible ahora mismo. Si usas un disco externo, vuelve a conectarlo antes de reindexar."
                .to_string(),
        );
    }

    available_paths
        .into_iter()
        .map(|root_path| spawn_index_job(app.clone(), root_path, &state, "reindex_library"))
        .collect()
}

#[tauri::command]
pub fn list_courses(state: State<'_, AppState>) -> Result<Vec<CourseCard>, String> {
    state.db.list_courses().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_course_detail(
    course_id: i64,
    state: State<'_, AppState>,
) -> Result<CourseDetail, String> {
    state
        .db
        .get_course_detail(course_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn toggle_course_favorite(
    input: ToggleFavoriteInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .toggle_course_favorite(input)
        .map_err(|error| error.to_string())
}
