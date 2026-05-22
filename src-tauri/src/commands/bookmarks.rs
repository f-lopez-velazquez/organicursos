use tauri::State;

use crate::models::api::{BookmarkMutationInput, BookmarkRecord};
use crate::state::app_state::AppState;

#[tauri::command]
pub fn create_bookmark(
    input: BookmarkMutationInput,
    state: State<'_, AppState>,
) -> Result<BookmarkRecord, String> {
    state
        .db
        .create_bookmark(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_bookmark(bookmark_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .delete_bookmark(bookmark_id)
        .map_err(|error| error.to_string())
}
