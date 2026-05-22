mod commands;
mod db;
mod export;
mod indexing;
mod jobs;
mod license;
mod media;
mod models;
mod search;
mod state;
mod utils;
mod watchers;

use tauri::Manager;

use crate::db::Database;
use crate::state::app_state::AppState;
use crate::utils::media_server::MediaServer;

pub fn run() {
    let media_server = MediaServer::start().expect("no se pudo iniciar el servidor local de medios");
    let media_base_url =
        serde_json::to_string(media_server.base_url()).expect("no se pudo serializar la url de medios");

    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_target(false)
        .compact()
        .init();

    tauri::Builder::default()
        .append_invoke_initialization_script(format!(
            "window.__ORGANICURSOS_MEDIA_BASE__ = {media_base_url};"
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let database = Database::open(app.handle())?;
            app.manage(AppState::new(database));
            app.manage(media_server);
            watchers::start_watchers();
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai::list_pending_course_ai_documents,
            commands::ai::list_course_ai_documents,
            commands::ai::list_pending_lesson_transcript_documents,
            commands::ai::store_generated_lesson_transcript,
            commands::ai::store_course_ai_insights,
            commands::ai::replace_course_similarity_candidates,
            commands::app::get_dashboard_snapshot,
            commands::app::list_jobs,
            commands::library::add_library,
            commands::library::enqueue_index_library_job,
            commands::library::list_libraries,
            commands::library::enqueue_reindex_library_job,
            commands::library::enqueue_reindex_all_libraries,
            commands::library::list_courses,
            commands::library::get_course_detail,
            commands::library::toggle_course_favorite,
            commands::notes::save_note,
            commands::notes::delete_note,
            commands::bookmarks::create_bookmark,
            commands::bookmarks::delete_bookmark,
            commands::commercial::get_license_state,
            commands::commercial::activate_license_token,
            commands::commercial::clear_license_activation,
            commands::commercial::start_license_trial,
            commands::commercial::get_operational_profile,
            commands::covers::list_cover_candidates,
            commands::covers::import_local_cover_candidate,
            commands::covers::cache_remote_cover_candidate,
            commands::covers::select_cover_candidate,
            commands::player::get_lesson_player_payload,
            commands::player::save_lesson_progress,
            commands::search::search_library,
            commands::search::search_semantic,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::maintenance::get_storage_overview,
            commands::maintenance::export_backup_package,
            commands::maintenance::import_backup_package,
            commands::maintenance::clear_thumbnail_cache,
            commands::maintenance::create_automatic_backup,
            commands::maintenance::reset_app_to_factory,
            commands::system::open_target,
            commands::embeddings::list_pending_embeddings,
            commands::embeddings::store_embedding_batch,
            commands::embeddings::rebuild_embeddings
        ])
        .run(tauri::generate_context!())
        .expect("error while running OrganiCursos");
}
