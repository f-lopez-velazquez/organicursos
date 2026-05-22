use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRecord {
    pub id: i64,
    pub name: String,
    pub root_path: String,
    pub is_offline_only: bool,
    pub is_available: bool,
    pub availability_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseCard {
    pub id: i64,
    pub title: String,
    pub subtitle: Option<String>,
    pub cover_path: Option<String>,
    pub category: Option<String>,
    pub difficulty: Option<String>,
    pub inferred_title: Option<String>,
    pub inferred_category: Option<String>,
    pub inferred_difficulty: Option<String>,
    pub suggested_description: Option<String>,
    pub inference_confidence: Option<f64>,
    pub lesson_count: i64,
    pub total_duration_seconds: i64,
    pub progress_percent: f64,
    pub last_viewed_at: Option<String>,
    pub is_favorite: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseSection {
    pub id: i64,
    pub course_id: i64,
    pub title: String,
    pub position: i64,
    pub lessons: Vec<LessonSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseDetail {
    #[serde(flatten)]
    pub card: CourseCard,
    pub description: Option<String>,
    pub tags: Vec<String>,
    pub ai_tags: Vec<TagSuggestion>,
    pub similar_courses: Vec<CourseSimilarityRecord>,
    pub sections: Vec<CourseSection>,
    pub assets: Vec<LessonAssetRecord>,
    pub notes: Vec<NoteRecord>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub duration_seconds: Option<i64>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub container: Option<String>,
    pub subtitle_tracks: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonSummary {
    pub id: i64,
    pub course_id: i64,
    pub section_id: Option<i64>,
    pub title: String,
    pub relative_path: String,
    pub absolute_path: String,
    pub duration_seconds: Option<i64>,
    pub progress_seconds: i64,
    pub progress_percent: f64,
    pub speed: f64,
    pub volume: f64,
    pub last_viewed_at: Option<String>,
    pub completed: bool,
    pub subtitle_path: Option<String>,
    pub thumbnail_path: Option<String>,
    pub media_info: Option<MediaInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonAssetRecord {
    pub id: i64,
    pub lesson_id: Option<i64>,
    pub course_id: Option<i64>,
    pub asset_kind: String,
    pub title: String,
    pub absolute_path: String,
    pub relative_path: String,
    pub extension: String,
    pub file_size_bytes: i64,
    pub extracted_text_preview: Option<String>,
    pub extracted_text: Option<String>,
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteRecord {
    pub id: i64,
    pub course_id: Option<i64>,
    pub lesson_id: Option<i64>,
    pub timestamp_seconds: Option<i64>,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkRecord {
    pub id: i64,
    pub lesson_id: i64,
    pub timestamp_seconds: i64,
    pub label: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LessonPlayerPayload {
    pub lesson: LessonSummary,
    pub notes: Vec<NoteRecord>,
    pub bookmarks: Vec<BookmarkRecord>,
    pub assets: Vec<LessonAssetRecord>,
    pub lesson_summary: Option<String>,
    pub lesson_transcript_preview: Option<String>,
    pub lesson_highlights: Vec<String>,
    pub next_lesson_id: Option<i64>,
    pub previous_lesson_id: Option<i64>,
    pub course_title: String,
    pub section_title: Option<String>,
    pub completion_threshold_percent: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub courses: i64,
    pub lessons: i64,
    pub hours_watched: i64,
    pub active_libraries: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSnapshot {
    pub continue_watching: Vec<LessonSummary>,
    pub recent_courses: Vec<CourseCard>,
    pub recently_viewed: Vec<LessonSummary>,
    pub recently_added: Vec<LessonSummary>,
    pub favorite_courses: Vec<CourseCard>,
    pub stats: DashboardStats,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSuggestion {
    pub name: String,
    pub confidence: Option<f64>,
    pub source: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseSimilarityRecord {
    pub course_id: i64,
    pub related_course_id: i64,
    pub similarity: f64,
    pub relation_kind: String,
    pub status: String,
    pub evidence: Option<String>,
    pub related_course: CourseCard,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingCourseAiDocument {
    pub course_id: i64,
    pub title: String,
    pub current_category: Option<String>,
    pub current_difficulty: Option<String>,
    pub existing_description: Option<String>,
    pub content_hash: String,
    pub text: String,
    pub lesson_count: i64,
    pub total_duration_seconds: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingLessonTranscriptDocument {
    pub lesson_id: i64,
    pub course_id: i64,
    pub title: String,
    pub absolute_path: String,
    pub existing_subtitle_path: Option<String>,
    pub existing_text: Option<String>,
    pub content_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub entity_type: String,
    pub entity_id: i64,
    pub title: String,
    pub snippet: String,
    pub score: f64,
    pub lexical_score: f64,
    pub semantic_score: f64,
    pub course_id: Option<i64>,
    pub lesson_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchInput {
    pub query: String,
    pub mode: Option<String>,
    pub limit: Option<i64>,
    pub filters: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMutationInput {
    pub note_id: Option<i64>,
    pub course_id: Option<i64>,
    pub lesson_id: Option<i64>,
    pub timestamp_seconds: Option<i64>,
    pub body: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkMutationInput {
    pub lesson_id: i64,
    pub timestamp_seconds: i64,
    pub label: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToggleFavoriteInput {
    pub course_id: i64,
    pub is_favorite: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticSearchInput {
    pub vector: Vec<f32>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveProgressInput {
    pub lesson_id: i64,
    pub current_time_seconds: i64,
    pub speed: f64,
    pub volume: f64,
    pub completed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsPayload {
    pub locale: String,
    pub completion_threshold_percent: i64,
    pub internet_enrichment_enabled: bool,
    pub offline_mode_enabled: bool,
    pub thumbnail_quality: String,
    pub model_name: String,
    pub cover_enrichment_provider: String,
    pub card_density: String,
    pub reduced_motion: bool,
    pub ai_processing_enabled: bool,
    pub low_resource_mode: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsInput {
    pub locale: Option<String>,
    pub completion_threshold_percent: Option<i64>,
    pub internet_enrichment_enabled: Option<bool>,
    pub offline_mode_enabled: Option<bool>,
    pub thumbnail_quality: Option<String>,
    pub model_name: Option<String>,
    pub cover_enrichment_provider: Option<String>,
    pub card_density: Option<String>,
    pub reduced_motion: Option<bool>,
    pub ai_processing_enabled: Option<bool>,
    pub low_resource_mode: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub target: Option<String>,
    pub message: Option<String>,
    pub progress: f64,
    pub created_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingEmbeddingDocument {
    pub embedding_id: i64,
    pub entity_type: String,
    pub entity_id: i64,
    pub course_id: Option<i64>,
    pub content_hash: String,
    pub model_name: String,
    pub text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingWriteInput {
    pub embedding_id: i64,
    pub course_id: Option<i64>,
    pub entity_type: String,
    pub model_name: String,
    pub excerpt: String,
    pub vector: Vec<f32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverCandidateRecord {
    pub id: i64,
    pub course_id: i64,
    pub source: String,
    pub local_path: Option<String>,
    pub remote_url: Option<String>,
    pub attribution: Option<String>,
    pub score: Option<f64>,
    pub status: String,
    pub selected_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteCoverCacheInput {
    pub course_id: i64,
    pub remote_url: String,
    pub source: String,
    pub attribution: Option<String>,
    pub score: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCoverImportInput {
    pub course_id: i64,
    pub source_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectCoverCandidateInput {
    pub candidate_id: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageOverview {
    pub database_bytes: u64,
    pub thumbnail_cache_bytes: u64,
    pub imported_cover_bytes: u64,
    pub app_data_dir: String,
    pub cache_dir: String,
    pub backup_dir: String,
    pub latest_backup_path: Option<String>,
    pub latest_backup_at: Option<String>,
    pub latest_backup_bytes: u64,
    pub backup_count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOperationResult {
    pub path: String,
    pub bytes_written: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatePayload {
    pub edition: String,
    pub status: String,
    pub activation_mode: String,
    pub license_id: Option<String>,
    pub licensed_to: Option<String>,
    pub email: Option<String>,
    pub company: Option<String>,
    pub issued_at: Option<String>,
    pub expires_at: Option<String>,
    pub activated_at: Option<String>,
    pub trial_started_at: Option<String>,
    pub trial_ends_at: Option<String>,
    pub trial_days_remaining: Option<i64>,
    pub grace_message: Option<String>,
    pub features: Vec<String>,
    pub public_key_configured: bool,
    pub can_start_trial: bool,
    pub token_last4: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseActivationInput {
    pub token: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationalProfilePayload {
    pub product_name: String,
    pub version: String,
    pub identifier: String,
    pub platform: String,
    pub arch: String,
    pub app_data_dir: String,
    pub cache_dir: String,
    pub database_path: String,
    pub vector_enabled: bool,
    pub license_public_key_configured: bool,
    pub portable_mode: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagSuggestionInput {
    pub name: String,
    pub confidence: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CourseInsightWriteInput {
    pub course_id: i64,
    pub inferred_title: Option<String>,
    pub inferred_category: Option<String>,
    pub inferred_difficulty: Option<String>,
    pub suggested_description: Option<String>,
    pub inference_confidence: Option<f64>,
    pub content_hash: String,
    pub model_name: String,
    pub evidence_json: Option<serde_json::Value>,
    pub tags: Vec<TagSuggestionInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimilarityCandidateInput {
    pub course_id: i64,
    pub related_course_id: i64,
    pub similarity: f64,
    pub relation_kind: String,
    pub evidence: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedLessonTranscriptInput {
    pub lesson_id: i64,
    pub transcript_text: String,
    pub summary: Option<String>,
    pub subtitle_vtt: String,
    pub content_hash: String,
}
