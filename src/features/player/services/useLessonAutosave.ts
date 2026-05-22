import { type RefObject, useEffect, useRef } from "react";
import { writeLessonResumeCheckpoint } from "@/features/player/services/lesson-resume-cache";
import { computeCompleted } from "@/features/player/services/player-utils";
import { atlasApi } from "@/lib/api/atlas-api";
import { useAppStore } from "@/store/app-store";

interface SavedProgressSnapshot {
  currentTimeSeconds: number;
  progressPercent: number;
  completed: boolean;
  speed: number;
  volume: number;
  reason:
    | "interval"
    | "pause"
    | "seeked"
    | "ended"
    | "ratechange"
    | "volumechange"
    | "visibilitychange"
    | "pagehide"
    | "beforeunload"
    | "cleanup";
}

interface UseLessonAutosaveArgs {
  lessonId: number;
  videoRef: RefObject<HTMLVideoElement>;
  onSaved?: (snapshot: SavedProgressSnapshot) => void;
}

export function useLessonAutosave({ lessonId, videoRef, onSaved }: UseLessonAutosaveArgs) {
  const thresholdPercent = useAppStore((state) => state.settings?.completionThresholdPercent ?? 92);
  const lastPersistedRef = useRef<{
    currentTimeSeconds: number;
    progressPercent: number;
    completed: boolean;
    speed: number;
    volume: number;
  } | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const queuedPersistRef = useRef<{
    reason: SavedProgressSnapshot["reason"];
    force: boolean;
  } | null>(null);
  const lastCheckpointSecondRef = useRef(-1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || lessonId <= 0) {
      return;
    }

    const buildSnapshot = (): SavedProgressSnapshot => {
      const currentTime = Math.floor(video.currentTime);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const completed = computeCompleted(currentTime, duration, thresholdPercent);
      const progressPercent = duration > 0 ? Math.max(0, Math.min(100, Math.round((currentTime / duration) * 100))) : 0;

      return {
        currentTimeSeconds: currentTime,
        progressPercent,
        completed,
        speed: video.playbackRate,
        volume: video.volume,
        reason: "interval",
      };
    };

    const shouldSkipSnapshot = (snapshot: SavedProgressSnapshot, force: boolean) => {
      const lastPersisted = lastPersistedRef.current;
      if (!lastPersisted) {
        return false;
      }

      const samePlaybackSettings =
        Math.abs(lastPersisted.speed - snapshot.speed) < 0.01 &&
        Math.abs(lastPersisted.volume - snapshot.volume) < 0.01 &&
        lastPersisted.completed === snapshot.completed;
      const sameTimeline = Math.abs(lastPersisted.currentTimeSeconds - snapshot.currentTimeSeconds) < 1;

      if (force) {
        return samePlaybackSettings && sameTimeline;
      }

      return samePlaybackSettings && sameTimeline;
    };

    const checkpoint = (snapshot: SavedProgressSnapshot) => {
      writeLessonResumeCheckpoint({
        lessonId,
        currentTimeSeconds: snapshot.currentTimeSeconds,
        progressPercent: snapshot.progressPercent,
        completed: snapshot.completed,
        speed: snapshot.speed,
        volume: snapshot.volume,
        savedAt: new Date().toISOString(),
      });
      lastCheckpointSecondRef.current = snapshot.currentTimeSeconds;
    };

    const flushPersist = async (
      reason: SavedProgressSnapshot["reason"] = "interval",
      force = false,
    ) => {
      if (inFlightRef.current) {
        queuedPersistRef.current = { reason, force: queuedPersistRef.current?.force || force };
        return inFlightRef.current;
      }

      const task = (async () => {
        const snapshot = buildSnapshot();
        snapshot.reason = reason;
        checkpoint(snapshot);

        if (!force && video.paused && shouldSkipSnapshot(snapshot, false)) {
          return;
        }

        if (!force && !video.paused && Math.abs(snapshot.currentTimeSeconds - (lastPersistedRef.current?.currentTimeSeconds ?? 0)) < 2) {
          return;
        }

        if (shouldSkipSnapshot(snapshot, force)) {
          return;
        }

        try {
          await atlasApi.saveLessonProgress({
            lessonId,
            currentTimeSeconds: snapshot.currentTimeSeconds,
            speed: snapshot.speed,
            volume: snapshot.volume,
            completed: snapshot.completed,
          });

          lastPersistedRef.current = {
            currentTimeSeconds: snapshot.currentTimeSeconds,
            progressPercent: snapshot.progressPercent,
            completed: snapshot.completed,
            speed: snapshot.speed,
            volume: snapshot.volume,
          };
          onSaved?.(snapshot);
        } catch (error) {
          console.error("No se pudo guardar el progreso de la clase.", error);
        }
      })().finally(async () => {
        inFlightRef.current = null;
        const queued = queuedPersistRef.current;
        queuedPersistRef.current = null;
        if (queued) {
          await flushPersist(queued.reason, queued.force);
        }
      });

      inFlightRef.current = task;
      return task;
    };

    const interval = window.setInterval(() => {
      if (video.paused || video.seeking || video.ended) {
        return;
      }
      void flushPersist("interval");
    }, 5000);

    const onTimeUpdate = () => {
      const currentSecond = Math.floor(video.currentTime);
      if (currentSecond === lastCheckpointSecondRef.current) {
        return;
      }
      checkpoint(buildSnapshot());
    };

    const onPause = () => void flushPersist("pause", true);
    const onSeeked = () => void flushPersist("seeked", true);
    const onEnded = () => void flushPersist("ended", true);
    const onRateChange = () => void flushPersist("ratechange", true);
    const onVolumeChange = () => void flushPersist("volumechange", true);
    const onBeforeUnload = () => void flushPersist("beforeunload", true);
    const onPageHide = () => void flushPersist("pagehide", true);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushPersist("visibilitychange", true);
      }
    };

    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ended", onEnded);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("timeupdate", onTimeUpdate);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("timeupdate", onTimeUpdate);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void flushPersist("cleanup", true);
    };
  }, [lessonId, onSaved, thresholdPercent, videoRef]);
}
