use tauri::State;

use crate::models::api::{SearchInput, SearchResult, SemanticSearchInput};
use crate::state::app_state::AppState;

#[tauri::command]
pub fn search_library(
    input: SearchInput,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    state
        .db
        .search_library_filtered(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_semantic(
    input: SemanticSearchInput,
    state: State<'_, AppState>,
) -> Result<Vec<SearchResult>, String> {
    state
        .db
        .search_semantic(input)
        .map_err(|error| error.to_string())
}
