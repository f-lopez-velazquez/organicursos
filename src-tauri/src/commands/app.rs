use tauri::State;

use crate::models::api::{DashboardSnapshot, JobRecord};
use crate::state::app_state::AppState;

#[tauri::command]
pub fn get_dashboard_snapshot(state: State<'_, AppState>) -> Result<DashboardSnapshot, String> {
    state
        .db
        .get_dashboard_snapshot()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_jobs(state: State<'_, AppState>) -> Result<Vec<JobRecord>, String> {
    state.db.list_jobs().map_err(|error| error.to_string())
}
