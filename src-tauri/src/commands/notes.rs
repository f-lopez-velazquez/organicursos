use tauri::State;

use crate::models::api::{NoteMutationInput, NoteRecord};
use crate::state::app_state::AppState;

#[tauri::command]
pub fn save_note(
    input: NoteMutationInput,
    state: State<'_, AppState>,
) -> Result<NoteRecord, String> {
    state
        .db
        .create_or_update_note(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_note(note_id: i64, state: State<'_, AppState>) -> Result<(), String> {
    state
        .db
        .delete_note(note_id)
        .map_err(|error| error.to_string())
}
