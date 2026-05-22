use tauri::{AppHandle, State};

use crate::media::{ffmpeg, subtitles};
use crate::models::api::{LessonPlayerPayload, SaveProgressInput};
use crate::state::app_state::AppState;

#[tauri::command]
pub async fn get_lesson_player_payload(
    app: AppHandle,
    lesson_id: i64,
    state: State<'_, AppState>,
) -> Result<LessonPlayerPayload, String> {
    let mut payload = state
        .db
        .get_lesson_player_payload(lesson_id)
        .map_err(|error| error.to_string())?;
    payload.lesson.subtitle_path = subtitles::prepare_subtitle_track(
        &app,
        payload.lesson.subtitle_path.as_deref(),
    )
    .map_err(|error| error.to_string())?;
    if let Some(playback_path) = ffmpeg::prepare_playback_source(
        &app,
        &payload.lesson.absolute_path,
        payload
            .lesson
            .media_info
            .as_ref()
            .and_then(|info| info.container.as_deref()),
    )
    .await
    .map_err(|error| error.to_string())?
    {
        payload.lesson.absolute_path = playback_path;
    }
    Ok(payload)
}

#[tauri::command]
pub fn save_lesson_progress(
    payload: SaveProgressInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .save_progress(payload)
        .map_err(|error| error.to_string())
}
