use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::models::api::{
    CoverCandidateRecord, LocalCoverImportInput, RemoteCoverCacheInput, SelectCoverCandidateInput,
};
use crate::state::app_state::AppState;
use crate::utils::storage;

#[tauri::command]
pub fn list_cover_candidates(
    course_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<CoverCandidateRecord>, String> {
    state
        .db
        .list_cover_candidates(course_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_local_cover_candidate(
    app: AppHandle,
    input: LocalCoverImportInput,
    state: State<'_, AppState>,
) -> Result<CoverCandidateRecord, String> {
    let target = store_cover_file(&app, input.course_id, Path::new(&input.source_path), None)
        .map_err(|error| error.to_string())?;

    state
        .db
        .insert_cover_candidate(
            input.course_id,
            "manual-local",
            Some(target.to_string_lossy().as_ref()),
            None,
            None,
            Some(1.0),
            "approved",
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn cache_remote_cover_candidate(
    app: AppHandle,
    input: RemoteCoverCacheInput,
    state: State<'_, AppState>,
) -> Result<CoverCandidateRecord, String> {
    let client = reqwest::Client::builder()
        .user_agent("AtlasCourses/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(&input.remote_url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = response.bytes().await.map_err(|error| error.to_string())?;

    let extension = cover_extension(&content_type, &input.remote_url);
    let file_name = format!(
        "remote-{}-{}.{}",
        input.course_id,
        Uuid::new_v4(),
        extension
    );
    let target_dir = covers_dir(&app).map_err(|error| error.to_string())?;
    fs::create_dir_all(&target_dir).map_err(|error| error.to_string())?;
    let target = target_dir.join(file_name);
    fs::write(&target, bytes).map_err(|error| error.to_string())?;

    state
        .db
        .insert_cover_candidate(
            input.course_id,
            &input.source,
            Some(target.to_string_lossy().as_ref()),
            Some(&input.remote_url),
            input.attribution.as_deref(),
            input.score,
            "approved",
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn select_cover_candidate(
    input: SelectCoverCandidateInput,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    state
        .db
        .select_cover_candidate(input.candidate_id)
        .map_err(|error| error.to_string())
}

fn covers_dir(app: &AppHandle) -> anyhow::Result<PathBuf> {
    Ok(storage::app_data_dir(app)?.join("covers"))
}

fn store_cover_file(
    app: &AppHandle,
    course_id: i64,
    source_path: &Path,
    preferred_extension: Option<&str>,
) -> anyhow::Result<PathBuf> {
    let extension = preferred_extension
        .map(ToOwned::to_owned)
        .or_else(|| {
            source_path
                .extension()
                .map(|value| value.to_string_lossy().to_string())
        })
        .unwrap_or_else(|| "jpg".to_string());
    let target_dir = covers_dir(app)?;
    fs::create_dir_all(&target_dir)?;
    let target = target_dir.join(format!(
        "course-{course_id}-{}.{}",
        Uuid::new_v4(),
        extension
    ));
    fs::copy(source_path, &target)?;
    Ok(target)
}

fn cover_extension(content_type: &str, url: &str) -> String {
    if content_type.contains("png") {
        "png".to_string()
    } else if content_type.contains("webp") {
        "webp".to_string()
    } else if let Some(extension) = Path::new(url)
        .extension()
        .map(|value| value.to_string_lossy().to_lowercase())
        .filter(|extension| matches!(extension.as_str(), "jpg" | "jpeg" | "png" | "webp"))
    {
        extension
    } else {
        "jpg".to_string()
    }
}
