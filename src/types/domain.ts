export type JobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type ProgressState = "new" | "in_progress" | "completed";
export type AssetKind =
  | "video"
  | "pdf"
  | "docx"
  | "text"
  | "subtitle"
  | "archive"
  | "audio"
  | "html"
  | "presentation"
  | "other";
export type SearchMode = "hybrid" | "text" | "semantic";

export interface MediaInfo {
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
  subtitleTracks: string[];
}

export interface Library {
  id: number;
  name: string;
  rootPath: string;
  isOfflineOnly: boolean;
  isAvailable: boolean;
  availabilityMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseCard {
  id: number;
  title: string;
  subtitle: string | null;
  coverPath: string | null;
  category: string | null;
  difficulty: string | null;
  inferredTitle: string | null;
  inferredCategory: string | null;
  inferredDifficulty: string | null;
  suggestedDescription: string | null;
  inferenceConfidence: number | null;
  lessonCount: number;
  totalDurationSeconds: number;
  progressPercent: number;
  lastViewedAt: string | null;
  isFavorite: boolean;
}

export interface CourseDetail extends CourseCard {
  description: string | null;
  tags: string[];
  aiTags: TagSuggestion[];
  similarCourses: CourseSimilarity[];
  sections: CourseSection[];
  assets: LessonAsset[];
  notes: Note[];
}

export interface TagSuggestion {
  name: string;
  confidence: number | null;
  source: string;
}

export interface CourseSimilarity {
  courseId: number;
  relatedCourseId: number;
  similarity: number;
  relationKind: string;
  status: string;
  evidence: string | null;
  relatedCourse: CourseCard;
}

export interface CourseSection {
  id: number;
  courseId: number;
  title: string;
  position: number;
  lessons: LessonSummary[];
}

export interface LessonSummary {
  id: number;
  courseId: number;
  sectionId: number | null;
  title: string;
  relativePath: string;
  absolutePath: string;
  durationSeconds: number | null;
  progressSeconds: number;
  progressPercent: number;
  speed: number;
  volume: number;
  lastViewedAt: string | null;
  completed: boolean;
  subtitlePath: string | null;
  thumbnailPath: string | null;
  mediaInfo: MediaInfo | null;
}

export interface LessonAsset {
  id: number;
  lessonId: number | null;
  courseId: number | null;
  assetKind: AssetKind;
  title: string;
  absolutePath: string;
  relativePath: string;
  extension: string;
  fileSizeBytes: number;
  extractedTextPreview: string | null;
  extractedText?: string | null;
  thumbnailPath: string | null;
}

export interface LessonPlayerPayload {
  lesson: LessonSummary;
  notes: Note[];
  bookmarks: Bookmark[];
  assets: LessonAsset[];
  lessonSummary: string | null;
  lessonTranscriptPreview: string | null;
  lessonHighlights: string[];
  nextLessonId: number | null;
  previousLessonId: number | null;
  courseTitle: string;
  sectionTitle: string | null;
  completionThresholdPercent: number;
}

export interface Note {
  id: number;
  courseId: number | null;
  lessonId: number | null;
  timestampSeconds: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bookmark {
  id: number;
  lessonId: number;
  timestampSeconds: number;
  label: string | null;
  createdAt: string;
}

export interface NewNoteInput {
  courseId?: number | null;
  lessonId?: number | null;
  timestampSeconds?: number | null;
  body: string;
}

export interface NewBookmarkInput {
  lessonId: number;
  timestampSeconds: number;
  label?: string | null;
}

export interface DashboardSnapshot {
  continueWatching: LessonSummary[];
  recentCourses: CourseCard[];
  recentlyViewed: LessonSummary[];
  recentlyAdded: LessonSummary[];
  favoriteCourses: CourseCard[];
  stats: {
    courses: number;
    lessons: number;
    hoursWatched: number;
    activeLibraries: number;
  };
}

export interface SearchResult {
  entityType: "course" | "lesson" | "asset" | "note";
  entityId: number;
  title: string;
  snippet: string;
  score: number;
  lexicalScore: number;
  semanticScore: number;
  courseId: number | null;
  lessonId: number | null;
}

export interface SearchQueryInput {
  query: string;
  mode: SearchMode;
  limit?: number;
  filters?: {
    category?: string;
    difficulty?: string;
    progressState?: "new" | "in_progress" | "completed";
    favoriteOnly?: boolean;
    entityType?: "course" | "lesson" | "asset" | "note";
    fileType?: string;
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
  };
}

export interface AppSettings {
  locale: string;
  completionThresholdPercent: number;
  internetEnrichmentEnabled: boolean;
  offlineModeEnabled: boolean;
  thumbnailQuality: "balanced" | "high";
  modelName: string;
  coverEnrichmentProvider: string;
  cardDensity: "comfortable" | "compact";
  reducedMotion: boolean;
  aiProcessingEnabled: boolean;
  lowResourceMode: boolean;
}

export interface LicenseState {
  edition: string;
  status: "community" | "trial" | "active" | "expired" | "pending";
  activationMode: string;
  licenseId: string | null;
  licensedTo: string | null;
  email: string | null;
  company: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  activatedAt: string | null;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialDaysRemaining: number | null;
  graceMessage: string | null;
  features: string[];
  publicKeyConfigured: boolean;
  canStartTrial: boolean;
  tokenLast4: string | null;
}

export interface OperationalProfile {
  productName: string;
  version: string;
  identifier: string;
  platform: string;
  arch: string;
  appDataDir: string;
  cacheDir: string;
  databasePath: string;
  vectorEnabled: boolean;
  licensePublicKeyConfigured: boolean;
  portableMode: boolean;
}

export interface RuntimeProfile {
  platform: string;
  cpuCores: number | null;
  deviceMemoryGb: number | null;
  scaleFactor: number | null;
  devicePixelRatio: number;
  observedWebviewScale: number | null;
  recommendedLowResource: boolean;
  recommendedCompactDensity: boolean;
  recommendedReducedMotion: boolean;
  recommendedContainedLayout: boolean;
  needsLinuxZoomCorrection: boolean;
  suggestedZoom: number;
}

export interface IndexJob {
  id: string;
  kind: string;
  status: JobStatus;
  target: string | null;
  message: string | null;
  progress: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface PendingCourseAiDocument {
  courseId: number;
  title: string;
  currentCategory: string | null;
  currentDifficulty: string | null;
  existingDescription: string | null;
  contentHash: string;
  text: string;
  lessonCount: number;
  totalDurationSeconds: number;
}

export interface CoverCandidate {
  id: number;
  courseId: number;
  source: string;
  localPath: string | null;
  remoteUrl: string | null;
  attribution: string | null;
  score: number | null;
  status: string;
  selectedAt: string | null;
}

export interface RemoteCoverSuggestion {
  id: string;
  provider: string;
  title: string;
  previewUrl: string;
  remoteUrl: string;
  attribution: string | null;
  score: number;
}

export interface StorageOverview {
  databaseBytes: number;
  thumbnailCacheBytes: number;
  importedCoverBytes: number;
  appDataDir: string;
  cacheDir: string;
  backupDir: string;
  latestBackupPath: string | null;
  latestBackupAt: string | null;
  latestBackupBytes: number;
  backupCount: number;
}
