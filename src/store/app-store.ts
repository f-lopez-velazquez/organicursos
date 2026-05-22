import { create } from "zustand";
import { atlasApi } from "@/lib/api/atlas-api";
import type {
  AppSettings,
  CourseCard,
  DashboardSnapshot,
  IndexJob,
  Library,
  LicenseState,
  OperationalProfile,
  RuntimeProfile,
} from "@/types/domain";

interface AppState {
  ready: boolean;
  loading: boolean;
  activityLabel: string | null;
  indexing: boolean;
  dashboard: DashboardSnapshot | null;
  libraries: Library[];
  courses: CourseCard[];
  settings: AppSettings | null;
  jobs: IndexJob[];
  licenseState: LicenseState | null;
  operationalProfile: OperationalProfile | null;
  runtimeProfile: RuntimeProfile | null;
  setActivityLabel: (label: string | null) => void;
  setRuntimeProfile: (profile: RuntimeProfile | null) => void;
  bootstrap: () => Promise<void>;
  refreshLibrary: (options?: { silent?: boolean; activityLabel?: string | null }) => Promise<void>;
  refreshJobs: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  refreshCommercialState: () => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  loading: false,
  activityLabel: null,
  indexing: false,
  dashboard: null,
  libraries: [],
  courses: [],
  settings: null,
  jobs: [],
  licenseState: null,
  operationalProfile: null,
  runtimeProfile: null,
  setActivityLabel: (activityLabel) => set({ activityLabel }),
  setRuntimeProfile: (runtimeProfile) => set({ runtimeProfile }),
  bootstrap: async () => {
    if (get().ready || get().loading) {
      return;
    }

    set({ loading: true, activityLabel: "Abriendo tu biblioteca" });
    const [dashboard, libraries, courses, settings, jobs, licenseState, operationalProfile] = await Promise.all([
      atlasApi.getDashboard(),
      atlasApi.listLibraries(),
      atlasApi.listCourses(),
      atlasApi.getSettings(),
      atlasApi.listJobs(),
      atlasApi.getLicenseState(),
      atlasApi.getOperationalProfile(),
    ]);

    set({
      ready: true,
      loading: false,
      activityLabel: null,
      indexing: jobs.some((job) => job.status === "queued" || job.status === "running"),
      dashboard,
      libraries,
      courses,
      settings,
      jobs,
      licenseState,
      operationalProfile,
    });
  },
  refreshLibrary: async (options) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      set({ loading: true, activityLabel: options?.activityLabel ?? "Actualizando tu biblioteca" });
    }

    const [dashboard, libraries, courses, jobs] = await Promise.all([
      atlasApi.getDashboard(),
      atlasApi.listLibraries(),
      atlasApi.listCourses(),
      atlasApi.listJobs(),
    ]);

    set((state) => ({
      dashboard,
      libraries,
      courses,
      jobs,
      loading: silent ? state.loading : false,
      activityLabel: silent ? state.activityLabel : null,
      indexing: jobs.some((job) => job.status === "queued" || job.status === "running"),
    }));
  },
  refreshJobs: async () => {
    const jobs = await atlasApi.listJobs();
    set({
      jobs,
      indexing: jobs.some((job) => job.status === "queued" || job.status === "running"),
    });
  },
  refreshSettings: async () => {
    const settings = await atlasApi.getSettings();
    set({ settings });
  },
  updateSettings: async (settings) => {
    await atlasApi.updateSettings(settings);
    const nextSettings = await atlasApi.getSettings();
    set({ settings: nextSettings });
  },
  refreshCommercialState: async () => {
    const [licenseState, operationalProfile] = await Promise.all([
      atlasApi.getLicenseState(),
      atlasApi.getOperationalProfile(),
    ]);
    set({ licenseState, operationalProfile });
  },
}));
