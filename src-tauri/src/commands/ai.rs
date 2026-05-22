use std::fs;

use tauri::{AppHandle, State};

use crate::models::api::{
    CourseInsightWriteInput, GeneratedLessonTranscriptInput, PendingCourseAiDocument,
    PendingLessonTranscriptDocument, SimilarityCandidateInput,
};
use crate::state::app_state::AppState;
use crate::utils::storage;

#[tauri::command]
pub fn list_pending_course_ai_documents(
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<PendingCourseAiDocument>, String> {
    state
        .db
        .list_pending_course_ai_documents(limit.unwrap_or(18))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_course_ai_documents(
    state: State<'_, AppState>,
) -> Result<Vec<PendingCourseAiDocument>, String> {
    state
        .db
        .list_course_ai_documents()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_pending_lesson_transcript_documents(
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<PendingLessonTranscriptDocument>, String> {
    state
        .db
        .list_pending_lesson_transcript_documents(limit.unwrap_or(4))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn store_generated_lesson_transcript(
    app: AppHandle,
    input: GeneratedLessonTranscriptInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let subtitle_dir = storage::app_cache_dir(&app)
        .map_err(|error| error.to_string())?
        .join("generated-subtitles");
    fs::create_dir_all(&subtitle_dir).map_err(|error| error.to_string())?;

    let subtitle_path = subtitle_dir.join(format!(
        "lesson-{}-{}.vtt",
        input.lesson_id,
        &input.content_hash[..input.content_hash.len().min(12)]
    ));
    fs::write(&subtitle_path, input.subtitle_vtt).map_err(|error| error.to_string())?;

    state
        .db
        .store_generated_lesson_transcript(
            input.lesson_id,
            subtitle_path.to_string_lossy().as_ref(),
            &input.transcript_text,
            input.summary.as_deref(),
            &input.content_hash,
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn store_course_ai_insights(
    insights: Vec<CourseInsightWriteInput>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .upsert_course_insights(insights)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn replace_course_similarity_candidates(
    candidates: Vec<SimilarityCandidateInput>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .replace_similarity_candidates(candidates)
        .map_err(|error| error.to_string())
}
