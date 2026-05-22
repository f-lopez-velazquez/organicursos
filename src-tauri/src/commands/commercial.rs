use tauri::State;

use crate::models::api::{LicenseActivationInput, LicenseStatePayload, OperationalProfilePayload};
use crate::state::app_state::AppState;

#[tauri::command]
pub fn get_license_state(state: State<'_, AppState>) -> Result<LicenseStatePayload, String> {
    state
        .db
        .get_license_state()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn activate_license_token(
    input: LicenseActivationInput,
    state: State<'_, AppState>,
) -> Result<LicenseStatePayload, String> {
    state
        .db
        .activate_license_token(input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_license_activation(state: State<'_, AppState>) -> Result<LicenseStatePayload, String> {
    state
        .db
        .clear_license_activation()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn start_license_trial(state: State<'_, AppState>) -> Result<LicenseStatePayload, String> {
    state
        .db
        .start_license_trial()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_operational_profile(
    state: State<'_, AppState>,
) -> Result<OperationalProfilePayload, String> {
    state
        .db
        .get_operational_profile()
        .map_err(|error| error.to_string())
}
