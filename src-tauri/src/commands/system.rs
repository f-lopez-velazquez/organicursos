use tauri::AppHandle;
#[allow(deprecated)]
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub fn open_target(app: AppHandle, target: String) -> Result<(), String> {
    #[allow(deprecated)]
    app.shell()
        .open(target, None)
        .map_err(|error| error.to_string())
}
