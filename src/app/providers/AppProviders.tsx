import { type PropsWithChildren, useEffect, useRef } from "react";
import { atlasApi } from "@/lib/api/atlas-api";
import { applyRuntimeZoomCorrection, collectRuntimeProfile } from "@/lib/utils/runtime-profile";
import { useViewportProfile } from "@/lib/utils/viewport-profile";
import { useAppStore } from "@/store/app-store";

export function AppProviders({ children }: PropsWithChildren) {
  const bootstrap = useAppStore((state) => state.bootstrap);
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const refreshJobs = useAppStore((state) => state.refreshJobs);
  const settings = useAppStore((state) => state.settings);
  const indexing = useAppStore((state) => state.indexing);
  const setActivityLabel = useAppStore((state) => state.setActivityLabel);
  const operationalProfile = useAppStore((state) => state.operationalProfile);
  const runtimeProfile = useAppStore((state) => state.runtimeProfile);
  const setRuntimeProfile = useAppStore((state) => state.setRuntimeProfile);
  const viewport = useViewportProfile();
  const backupInFlightRef = useRef(false);
  const effectiveLowResourceMode = Boolean(settings?.lowResourceMode || runtimeProfile?.recommendedLowResource);
  const effectiveReducedMotion = Boolean(
    settings?.reducedMotion || effectiveLowResourceMode || runtimeProfile?.recommendedReducedMotion,
  );

  const isFocusViewActive = () => {
    if (typeof document === "undefined") {
      return false;
    }

    return Boolean(document.querySelector("[data-lesson-page]"));
  };

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        const profile = await collectRuntimeProfile(operationalProfile, {
          width: viewport.width,
          height: viewport.height,
        });

        if (cancelled) {
          return;
        }

        setRuntimeProfile(profile);
        await applyRuntimeZoomCorrection(profile);
      })();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [operationalProfile, setRuntimeProfile, viewport.height, viewport.width]);

  const isPlaybackActive = () => {
    if (typeof document === "undefined") {
      return false;
    }

    const video = document.querySelector("video");
    return Boolean(video && !video.paused && !video.ended);
  };

  const shouldSuspendBackgroundWork = () => {
    if (typeof document === "undefined") {
      return isPlaybackActive() || isFocusViewActive();
    }

    return document.visibilityState !== "visible" || isPlaybackActive() || isFocusViewActive();
  };

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const runAutomaticBackup = async (label?: string) => {
      if (backupInFlightRef.current) {
        return;
      }
      if (shouldSuspendBackgroundWork()) {
        return;
      }
      backupInFlightRef.current = true;
      if (label) {
        setActivityLabel(label);
      }
      try {
        await atlasApi.createAutomaticBackup();
      } catch {
        // Silent fallback: the user should never lose work because a backup attempt failed.
      } finally {
        backupInFlightRef.current = false;
        if (label) {
          setActivityLabel(null);
        }
      }
    };

    const startupTimeout = window.setTimeout(() => {
      void runAutomaticBackup();
    }, 120000);

    const interval = window.setInterval(() => {
      void runAutomaticBackup();
    }, 1800000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void runAutomaticBackup();
      }
    };

    const handleBeforeUnload = () => {
      void runAutomaticBackup();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.clearTimeout(startupTimeout);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [setActivityLabel, settings]);

  useEffect(() => {
    const jobsIntervalTime = effectiveLowResourceMode
      ? (indexing ? 15000 : 60000)
      : (indexing ? 4000 : 20000);

    const interval = window.setInterval(() => {
      if (shouldSuspendBackgroundWork()) {
        return;
      }
      void refreshJobs();
    }, jobsIntervalTime);

    return () => window.clearInterval(interval);
  }, [effectiveLowResourceMode, indexing, refreshJobs]);

  useEffect(() => {
    const libraryIntervalTime = effectiveLowResourceMode
      ? (indexing ? 30000 : 300000)
      : (indexing ? 10000 : 120000);

    const interval = window.setInterval(() => {
      if (shouldSuspendBackgroundWork()) {
        return;
      }
      void refreshLibrary({ silent: true });
    }, libraryIntervalTime);

    const handleFocus = () => {
      if (shouldSuspendBackgroundWork()) {
        return;
      }
      void refreshLibrary({ silent: true });
      void refreshJobs();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [effectiveLowResourceMode, indexing, refreshJobs, refreshLibrary]);

  useEffect(() => {
    if (!settings || typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.density =
      settings.cardDensity === "compact" || runtimeProfile?.recommendedCompactDensity ? "compact" : "comfortable";
    document.documentElement.dataset.motion = effectiveReducedMotion ? "reduced" : "default";
    document.documentElement.dataset.lowResource = effectiveLowResourceMode ? "true" : "false";
    document.documentElement.dataset.platform = operationalProfile?.platform ?? runtimeProfile?.platform ?? "desktop";
    document.documentElement.dataset.scaleCorrection = runtimeProfile?.needsLinuxZoomCorrection ? "true" : "false";
  }, [effectiveLowResourceMode, effectiveReducedMotion, operationalProfile, runtimeProfile, settings]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.dataset.viewportMode = viewport.mode;
    document.documentElement.dataset.viewportOrientation = viewport.orientation;
  }, [viewport.mode, viewport.orientation]);

  return children;
}
