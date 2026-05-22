use tauri::State;

use crate::models::api::{AppSettingsPayload, UpdateSettingsInput};
use crate::state::app_state::AppState;

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettingsPayload, String> {
    state.db.get_settings().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_settings(
    settings: UpdateSettingsInput,
    state: State<'_, AppState>,
) -> Result<AppSettingsPayload, String> {
    state
        .db
        .update_settings(settings)
        .map_err(|error| error.to_string())
}
