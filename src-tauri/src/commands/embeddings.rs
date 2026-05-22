use tauri::State;

use crate::models::api::{EmbeddingWriteInput, PendingEmbeddingDocument};
use crate::state::app_state::AppState;

#[tauri::command]
pub fn list_pending_embeddings(
    limit: Option<i64>,
    state: State<'_, AppState>,
) -> Result<Vec<PendingEmbeddingDocument>, String> {
    state
        .db
        .list_pending_embeddings(limit.unwrap_or(24))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn store_embedding_batch(
    embeddings: Vec<EmbeddingWriteInput>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .db
        .upsert_embedding_vectors(embeddings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn rebuild_embeddings(state: State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .create_embedding_placeholders_for_search_documents()
        .map_err(|error| error.to_string())
}
