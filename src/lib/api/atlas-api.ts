import { open } from "@tauri-apps/plugin-dialog";
import { productConfig } from "@/config/product";
import { invokeCommand, isTauriRuntime } from "@/lib/api/tauri";
import {
  mockCourseDetail,
  mockCourses,
  mockDashboard,
  mockLicenseState,
  mockLessonPayload,
  mockOperationalProfile,
  mockSearchResults,
  mockSettings,
} from "@/lib/api/mock-data";
import type {
  AppSettings,
  CoverCandidate,
  CourseCard,
  CourseDetail,
  DashboardSnapshot,
  IndexJob,
  Library,
  NewBookmarkInput,
  NewNoteInput,
  LessonPlayerPayload,
  LicenseState,
  Bookmark,
  Note,
  OperationalProfile,
  PendingCourseAiDocument,
  SearchQueryInput,
  SearchResult,
  StorageOverview,
} from "@/types/domain";

async function maybeMock<T>(factory: () => T): Promise<T> {
  if (!isTauriRuntime()) {
    return factory();
  }

  throw new Error("mock no disponible");
}

export const atlasApi = {
  async getDashboard(): Promise<DashboardSnapshot> {
    if (!isTauriRuntime()) {
      return maybeMock(() => mockDashboard);
    }
    return invokeCommand("get_dashboard_snapshot");
  },

  async listCourses(): Promise<CourseCard[]> {
    if (!isTauriRuntime()) {
      return maybeMock(() => mockCourses);
    }
    return invokeCommand("list_courses");
  },

  async listLibraries(): Promise<Library[]> {
    if (!isTauriRuntime()) {
      return [];
    }
    return invokeCommand("list_libraries");
  },

  async getCourse(courseId: number): Promise<CourseDetail> {
    if (!isTauriRuntime()) {
      return maybeMock(() => ({ ...mockCourseDetail, id: courseId }));
    }
    return invokeCommand("get_course_detail", { courseId });
  },

  async getLessonPlayerPayload(lessonId: number): Promise<LessonPlayerPayload> {
    if (!isTauriRuntime()) {
      return maybeMock(() => ({ ...mockLessonPayload, lesson: { ...mockLessonPayload.lesson, id: lessonId } }));
    }
    return invokeCommand("get_lesson_player_payload", { lessonId });
  },

  async saveLessonProgress(payload: {
    lessonId: number;
    currentTimeSeconds: number;
    speed: number;
    volume: number;
    completed: boolean;
  }) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("save_lesson_progress", { payload });
  },

  async search(input: SearchQueryInput): Promise<SearchResult[]> {
    if (!isTauriRuntime()) {
      return maybeMock(() => mockSearchResults);
    }
    return invokeCommand("search_library", { input: input as unknown as Record<string, unknown> });
  },

  async semanticSearch(vector: number[], limit = 10): Promise<SearchResult[]> {
    if (!isTauriRuntime()) {
      return [];
    }
    return invokeCommand("search_semantic", {
      input: {
        vector,
        limit,
      },
    });
  },

  async getSettings(): Promise<AppSettings> {
    if (!isTauriRuntime()) {
      return maybeMock(() => mockSettings);
    }
    return invokeCommand("get_settings");
  },

  async getLicenseState(): Promise<LicenseState> {
    if (!isTauriRuntime()) {
      return maybeMock(() => mockLicenseState);
    }
    return invokeCommand("get_license_state");
  },

  async activateLicenseToken(token: string): Promise<LicenseState> {
    if (!isTauriRuntime()) {
      return maybeMock(() => ({
        ...mockLicenseState,
        status: "active",
        edition: "Professional",
        activationMode: "signed-token",
        licenseId: "atlas-demo-001",
        licensedTo: "Equipo Demo",
        email: "cliente@organicursos.app",
        tokenLast4: token.slice(-4),
      }));
    }
    return invokeCommand("activate_license_token", { input: { token } });
  },

  async clearLicenseActivation(): Promise<LicenseState> {
    if (!isTauriRuntime()) {
      return maybeMock(() => ({ ...mockLicenseState, status: "community", edition: "Community" }));
    }
    return invokeCommand("clear_license_activation");
  },

  async startLicenseTrial(): Promise<LicenseState> {
    if (!isTauriRuntime()) {
      return maybeMock(() => mockLicenseState);
    }
    return invokeCommand("start_license_trial");
  },

  async getOperationalProfile(): Promise<OperationalProfile> {
    if (!isTauriRuntime()) {
      return maybeMock(() => mockOperationalProfile);
    }
    return invokeCommand("get_operational_profile");
  },

  async updateSettings(settings: Partial<AppSettings>) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("update_settings", { settings });
  },

  async listJobs(): Promise<IndexJob[]> {
    if (!isTauriRuntime()) {
      return [];
    }
    return invokeCommand("list_jobs");
  },

  async addLibraryFolder() {
    const folder = await open({
      directory: true,
      multiple: false,
      title: `Selecciona una carpeta para ${productConfig.name}`,
    });

    if (!folder || Array.isArray(folder)) {
      return null;
    }

    if (!isTauriRuntime()) {
      return folder;
    }

    await invokeCommand("add_library", { rootPath: folder });
    await invokeCommand("enqueue_index_library_job", { rootPath: folder });
    return folder;
  },

  async registerLibraryFolder(rootPath: string) {
    if (!isTauriRuntime()) {
      return rootPath;
    }

    await invokeCommand("add_library", { rootPath });
    await invokeCommand("enqueue_index_library_job", { rootPath });
    return rootPath;
  },

  async reindexLibrary(libraryId: number) {
    if (!isTauriRuntime()) {
      return null;
    }
    return invokeCommand<string>("enqueue_reindex_library_job", { libraryId });
  },

  async reindexAllLibraries() {
    if (!isTauriRuntime()) {
      return [];
    }
    return invokeCommand<string[]>("enqueue_reindex_all_libraries");
  },

  async rebuildEmbeddings() {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("rebuild_embeddings");
  },

  async listPendingEmbeddings(limit = 12) {
    if (!isTauriRuntime()) {
      return [];
    }
    return invokeCommand<
      Array<{
        embeddingId: number;
        entityType: string;
        entityId: number;
        courseId: number | null;
        contentHash: string;
        modelName: string;
        text: string;
      }>
    >("list_pending_embeddings", { limit });
  },

  async storeEmbeddingBatch(
    embeddings: Array<{
      embeddingId: number;
      courseId: number | null;
      entityType: string;
      modelName: string;
      excerpt: string;
      vector: number[];
    }>,
  ) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("store_embedding_batch", { embeddings });
  },

  async listPendingCourseAiDocuments(limit = 18): Promise<PendingCourseAiDocument[]> {
    if (!isTauriRuntime()) {
      return [];
    }
    return invokeCommand("list_pending_course_ai_documents", { limit });
  },

  async listCourseAiDocuments(): Promise<PendingCourseAiDocument[]> {
    if (!isTauriRuntime()) {
      return [];
    }
    return invokeCommand("list_course_ai_documents");
  },

  async listPendingLessonTranscriptDocuments(limit = 4) {
    if (!isTauriRuntime()) {
      return [] as Array<{
        lessonId: number;
        courseId: number;
        title: string;
        absolutePath: string;
        existingSubtitlePath: string | null;
        existingText: string | null;
        contentHash: string;
      }>;
    }
    return invokeCommand<
      Array<{
        lessonId: number;
        courseId: number;
        title: string;
        absolutePath: string;
        existingSubtitlePath: string | null;
        existingText: string | null;
        contentHash: string;
      }>
    >("list_pending_lesson_transcript_documents", { limit });
  },

  async storeGeneratedLessonTranscript(input: {
    lessonId: number;
    transcriptText: string;
    summary?: string | null;
    subtitleVtt: string;
    contentHash: string;
  }) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("store_generated_lesson_transcript", { input });
  },

  async storeCourseAiInsights(
    insights: Array<{
      courseId: number;
      inferredTitle?: string | null;
      inferredCategory?: string | null;
      inferredDifficulty?: string | null;
      suggestedDescription?: string | null;
      inferenceConfidence?: number | null;
      contentHash: string;
      modelName: string;
      evidenceJson?: Record<string, unknown> | null;
      tags: Array<{ name: string; confidence?: number | null }>;
    }>,
  ) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("store_course_ai_insights", { insights });
  },

  async replaceCourseSimilarityCandidates(
    candidates: Array<{
      courseId: number;
      relatedCourseId: number;
      similarity: number;
      relationKind: string;
      evidence?: string | null;
    }>,
  ) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("replace_course_similarity_candidates", { candidates });
  },

  async listCoverCandidates(courseId: number): Promise<CoverCandidate[]> {
    if (!isTauriRuntime()) {
      return [
        {
          id: 1,
          courseId,
          source: "generated-local",
          localPath: mockCourseDetail.coverPath,
          remoteUrl: null,
          attribution: null,
          score: 0.82,
          status: "selected",
          selectedAt: new Date().toISOString(),
        },
      ];
    }
    return invokeCommand("list_cover_candidates", { courseId });
  },

  async importLocalCover(courseId: number, sourcePath: string): Promise<CoverCandidate> {
    if (!isTauriRuntime()) {
      return {
        id: Date.now(),
        courseId,
        source: "manual-local",
        localPath: sourcePath,
        remoteUrl: null,
        attribution: null,
        score: 1,
        status: "approved",
        selectedAt: null,
      };
    }
    return invokeCommand("import_local_cover_candidate", {
      input: {
        courseId,
        sourcePath,
      },
    });
  },

  async cacheRemoteCoverCandidate(input: {
    courseId: number;
    remoteUrl: string;
    source: string;
    attribution?: string | null;
    score?: number | null;
  }): Promise<CoverCandidate> {
    if (!isTauriRuntime()) {
      return {
        id: Date.now(),
        courseId: input.courseId,
        source: input.source,
        localPath: null,
        remoteUrl: input.remoteUrl,
        attribution: input.attribution ?? null,
        score: input.score ?? null,
        status: "approved",
        selectedAt: null,
      };
    }
    return invokeCommand("cache_remote_cover_candidate", { input });
  },

  async selectCoverCandidate(candidateId: number) {
    if (!isTauriRuntime()) {
      return null;
    }
    return invokeCommand<string | null>("select_cover_candidate", {
      input: { candidateId },
    });
  },

  async getStorageOverview(): Promise<StorageOverview> {
    if (!isTauriRuntime()) {
      return {
        databaseBytes: 4_200_000,
        thumbnailCacheBytes: 88_000_000,
        importedCoverBytes: 12_000_000,
        appDataDir: "C:/OrganiCursos/data",
        cacheDir: "C:/OrganiCursos/cache",
        backupDir: "C:/OrganiCursos/data/backups",
        latestBackupPath: "C:/OrganiCursos/data/backups/automatico-ultimo.organi",
        latestBackupAt: new Date().toISOString(),
        latestBackupBytes: 4_200_000,
        backupCount: 3,
      };
    }
    return invokeCommand("get_storage_overview");
  },

  async exportBackup(destinationPath: string) {
    if (!isTauriRuntime()) {
      return { path: destinationPath, bytesWritten: 4_200_000 };
    }
    return invokeCommand<{ path: string; bytesWritten: number }>("export_backup_package", { destinationPath });
  },

  async importBackup(sourcePath: string) {
    if (!isTauriRuntime()) {
      return { path: sourcePath, bytesWritten: 4_200_000 };
    }
    return invokeCommand<{ path: string; bytesWritten: number }>("import_backup_package", { sourcePath });
  },

  async clearThumbnailCache() {
    if (!isTauriRuntime()) {
      return 0;
    }
    return invokeCommand<number>("clear_thumbnail_cache");
  },

  async createAutomaticBackup() {
    if (!isTauriRuntime()) {
      return {
        path: "C:/OrganiCursos/data/backups/automatico-ultimo.organi",
        bytesWritten: 4_200_000,
      };
    }
    return invokeCommand<{ path: string; bytesWritten: number }>("create_automatic_backup");
  },

  async resetAppToFactory() {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("reset_app_to_factory");
  },

  async toggleFavorite(courseId: number, isFavorite: boolean) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("toggle_course_favorite", {
      input: {
        courseId,
        isFavorite,
      },
    });
  },

  async saveNote(input: NewNoteInput & { noteId?: number }) {
    if (!isTauriRuntime()) {
      return {
        id: Date.now(),
        courseId: input.courseId ?? null,
        lessonId: input.lessonId ?? null,
        timestampSeconds: input.timestampSeconds ?? null,
        body: input.body,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies Note;
    }
    return invokeCommand<Note>("save_note", { input });
  },

  async deleteNote(noteId: number) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("delete_note", { noteId });
  },

  async createBookmark(input: NewBookmarkInput) {
    if (!isTauriRuntime()) {
      return {
        id: Date.now(),
        lessonId: input.lessonId,
        timestampSeconds: input.timestampSeconds,
        label: input.label ?? null,
        createdAt: new Date().toISOString(),
      } satisfies Bookmark;
    }
    return invokeCommand<Bookmark>("create_bookmark", { input });
  },

  async deleteBookmark(bookmarkId: number) {
    if (!isTauriRuntime()) {
      return;
    }
    await invokeCommand("delete_bookmark", { bookmarkId });
  },
};
