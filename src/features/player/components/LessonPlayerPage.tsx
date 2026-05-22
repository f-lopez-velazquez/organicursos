import {
  Bookmark,
  Captions,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileArchive,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Pause,
  PictureInPicture2,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  computeCompleted,
  formatPercent,
  formatPlaybackTime,
  getProgressMessage,
  getProgressStage,
} from "@/features/player/services/player-utils";
import { PlayerSlider } from "@/features/player/components/PlayerSlider";
import { readLessonResumeCheckpoint } from "@/features/player/services/lesson-resume-cache";
import { useLessonAutosave } from "@/features/player/services/useLessonAutosave";
import { usePlayerHotkeys } from "@/features/player/services/usePlayerHotkeys";
import { atlasApi } from "@/lib/api/atlas-api";
import { applyLocalFileUrlFallback, toAppFileUrl } from "@/lib/utils/file-url";
import { readLocalStorage, writeLocalStorage } from "@/lib/utils/safe-storage";
import { openExternal } from "@/lib/utils/open-external";
import { cn } from "@/lib/utils/cn";
import { useViewportProfile } from "@/lib/utils/viewport-profile";
import { useAppStore } from "@/store/app-store";
import type { Bookmark as BookmarkItem, LessonAsset, LessonPlayerPayload, Note } from "@/types/domain";

type ResourceView = "preview" | "list";

function isImageAsset(asset: LessonAsset) {
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(asset.extension.toLowerCase());
}

function isAudioAsset(asset: LessonAsset) {
  return ["wav", "mp3", "m4a", "aac", "ogg", "flac"].includes(asset.extension.toLowerCase()) || asset.assetKind === "audio";
}

function isHtmlAsset(asset: LessonAsset) {
  return ["html", "htm"].includes(asset.extension.toLowerCase()) || asset.assetKind === "html";
}

function isPresentationAsset(asset: LessonAsset) {
  return asset.assetKind === "presentation" || asset.extension.toLowerCase() === "pptx";
}

function canPreviewInline(asset: LessonAsset) {
  return (
    asset.assetKind === "pdf" ||
    asset.assetKind === "subtitle" ||
    asset.assetKind === "text" ||
    asset.assetKind === "docx" ||
    isImageAsset(asset) ||
    isAudioAsset(asset) ||
    isHtmlAsset(asset) ||
    isPresentationAsset(asset)
  );
}

function openAsset(asset: LessonAsset) {
  openExternal(asset.absolutePath);
}

function resourceIcon(asset: LessonAsset) {
  if (asset.assetKind === "archive") {
    return FileArchive;
  }
  if (isAudioAsset(asset)) {
    return Volume2;
  }
  if (isImageAsset(asset)) {
    return ImageIcon;
  }
  return FileText;
}

function sortAssets(assets: LessonAsset[]) {
  return [...assets].sort((left, right) => {
    const leftRank = canPreviewInline(left) ? 0 : 1;
    const rightRank = canPreviewInline(right) ? 0 : 1;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return left.title.localeCompare(right.title, "es");
  });
}

function describePlaybackFailure(video: HTMLVideoElement) {
  switch (video.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "La reproduccion se interrumpio antes de terminar de preparar el video.";
    case MediaError.MEDIA_ERR_NETWORK:
      return "No se pudo leer el archivo de video de forma estable. Revisa que la carpeta siga disponible.";
    case MediaError.MEDIA_ERR_DECODE:
      return "El sistema encontro el archivo, pero no pudo decodificarlo con el runtime actual.";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "El formato del video no es compatible con este runtime o la ruta entregada no fue valida.";
    default:
      return "No se pudo preparar este video. Reintenta y, si persiste, reindexa la biblioteca para regenerar sus metadatos.";
  }
}

export function LessonPlayerPage() {
  const { lessonId } = useParams();
  const navigate = useNavigate();
  const viewport = useViewportProfile();
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const completionThresholdPercent = useAppStore((state) => state.settings?.completionThresholdPercent ?? 92);
  const [payload, setPayload] = useState<LessonPlayerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [bookmarkLabel, setBookmarkLabel] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [resourceView, setResourceView] = useState<ResourceView>("preview");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isTheater, setIsTheater] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(true);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(() => {
    return readLocalStorage("organicursos.subtitles.enabled") !== "false";
  });
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressSeconds, setProgressSeconds] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [savingBookmark, setSavingBookmark] = useState(false);
  const [videoSource, setVideoSource] = useState<string | null>(null);
  const [posterSource, setPosterSource] = useState<string | null>(null);
  const [subtitleSource, setSubtitleSource] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [bufferedPercent, setBufferedPercent] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volumeLevel, setVolumeLevel] = useState(1);
  const [seekDraftSeconds, setSeekDraftSeconds] = useState<number | null>(null);
  const [nextLessonPreload, setNextLessonPreload] = useState<{
    lessonId: number;
    title: string;
    videoSource: string | null;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasRestoredRef = useRef<number | null>(null);
  const isVideoInteractiveRef = useRef(false);
  const prefetchedLessonsRef = useRef(new Map<number, LessonPlayerPayload>());
  const prefetchingLessonsRef = useRef(new Set<number>());

  const applyLessonPayload = (nextPayload: LessonPlayerPayload) => {
    setPayload(nextPayload);
    setBookmarks(nextPayload.bookmarks);
    setNotes(nextPayload.notes);
    setProgressPercent(nextPayload.lesson.progressPercent);
    setProgressSeconds(nextPayload.lesson.progressSeconds);
    setCompleted(nextPayload.lesson.completed);
    setSelectedAssetId(sortAssets(nextPayload.assets)[0]?.id ?? null);
    setResourceView(nextPayload.assets.some(canPreviewInline) ? "preview" : "list");
    setBookmarkLabel("");
    setNoteBody("");
    hasRestoredRef.current = null;
    isVideoInteractiveRef.current = false;
    setIsVideoReady(false);
    setIsVideoBuffering(true);
    setIsPlaying(false);
    setIsMuted(false);
    setVideoSource(toAppFileUrl(nextPayload.lesson.absolutePath));
    setPosterSource(toAppFileUrl(nextPayload.lesson.thumbnailPath));
    setSubtitleSource(toAppFileUrl(nextPayload.lesson.subtitlePath));
    setVideoDuration(nextPayload.lesson.durationSeconds ?? 0);
    setBufferedPercent(0);
    setPlaybackRate(nextPayload.lesson.speed || 1);
    setVolumeLevel(nextPayload.lesson.volume ?? 1);
    setSeekDraftSeconds(null);
    setNextLessonPreload(null);
  };

  const loadLesson = async (targetLessonId: number) => {
    setLoading(true);
    setError(null);
    setPlaybackError(null);
    try {
      const cachedPayload = prefetchedLessonsRef.current.get(targetLessonId);
      if (cachedPayload) {
        prefetchedLessonsRef.current.delete(targetLessonId);
        applyLessonPayload(cachedPayload);
        return;
      }

      const nextPayload = await atlasApi.getLessonPlayerPayload(targetLessonId);
      applyLessonPayload(nextPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo abrir esta clase.");
      setPayload(null);
      setVideoSource(null);
      setPosterSource(null);
      setSubtitleSource(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!lessonId) {
      return;
    }
    void loadLesson(Number(lessonId));
  }, [lessonId]);

  const sortedAssets = useMemo(
    () =>
      sortAssets(
        (payload?.assets ?? []).filter(
          (asset) => asset.assetKind !== "video" && asset.absolutePath !== payload?.lesson.absolutePath,
        ),
      ),
    [payload?.assets, payload?.lesson.absolutePath],
  );
  const selectedAsset = useMemo(
    () => sortedAssets.find((asset) => asset.id === selectedAssetId) ?? sortedAssets[0] ?? null,
    [selectedAssetId, sortedAssets],
  );
  const knownDurationSeconds = useMemo(
    () => Math.max(videoDuration, payload?.lesson.durationSeconds ?? 0),
    [payload?.lesson.durationSeconds, videoDuration],
  );
  const visibleProgressSeconds = seekDraftSeconds ?? progressSeconds;
  const visibleProgressPercent = useMemo(() => {
    if (knownDurationSeconds <= 0) {
      return progressPercent;
    }

    return Math.max(0, Math.min(100, Math.round((visibleProgressSeconds / knownDurationSeconds) * 100)));
  }, [knownDurationSeconds, progressPercent, visibleProgressSeconds]);

  const mediaAspectRatio = useMemo(() => {
    const width = payload?.lesson.mediaInfo?.width ?? 0;
    const height = payload?.lesson.mediaInfo?.height ?? 0;

    if (width > 0 && height > 0) {
      return width / height;
    }

    return 16 / 9;
  }, [payload?.lesson.mediaInfo?.height, payload?.lesson.mediaInfo?.width]);

  const playerStageMaxHeight = useMemo(() => {
    const reservedChrome = viewport.mode === "compact" ? 208 : isTheater ? 164 : 220;
    const availableHeight = viewport.height - reservedChrome;
    const minHeight = viewport.mode === "compact" ? 240 : 360;
    const maxHeight = isTheater ? 900 : 780;
    return Math.max(minHeight, Math.min(availableHeight, maxHeight));
  }, [isTheater, viewport.height, viewport.mode]);

  const playerStageMaxWidth = useMemo(() => {
    const minWidth = viewport.mode === "compact" ? 320 : 640;
    return Math.max(minWidth, Math.round(playerStageMaxHeight * mediaAspectRatio));
  }, [mediaAspectRatio, playerStageMaxHeight, viewport.mode]);

  const contentGridClassName =
    viewport.mode === "wide" && viewport.width >= 1840
      ? "grid gap-5 xl:grid-cols-[minmax(0,1.58fr),minmax(300px,0.42fr)]"
      : "grid gap-4";

  const syncPlaybackUi = (video: HTMLVideoElement) => {
    const duration = Number.isFinite(video.duration) && video.duration > 0
      ? video.duration
      : (payload?.lesson.durationSeconds ?? 0);
    const currentTime = Math.floor(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    const nextProgressPercent = duration > 0 ? Math.max(0, Math.min(100, Math.round((currentTime / duration) * 100))) : 0;

    setVideoDuration(Math.floor(duration));
    setProgressSeconds(currentTime);
    setProgressPercent(nextProgressPercent);
    setCompleted(computeCompleted(currentTime, duration, payload?.completionThresholdPercent ?? completionThresholdPercent));
    setPlaybackRate(video.playbackRate || 1);
    setVolumeLevel(video.volume);
    setIsMuted(video.muted);

    if (video.buffered.length > 0 && duration > 0) {
      const bufferedEnd = video.buffered.end(video.buffered.length - 1);
      setBufferedPercent(Math.max(0, Math.min(100, (bufferedEnd / duration) * 100)));
      return;
    }

    setBufferedPercent(0);
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    if (video.paused) {
      await video.play().catch(() => undefined);
      return;
    }
    video.pause();
  };

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : knownDurationSeconds;
    const clampedTime = Math.max(0, Math.min(duration || 0, seconds));
    video.currentTime = clampedTime;
    setSeekDraftSeconds(null);
    syncPlaybackUi(video);
  };

  const seekBy = (delta: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    seekTo(video.currentTime + delta);
  };

  const toggleMuted = () => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = !video.muted;
    setIsMuted(video.muted);
    setVolumeLevel(video.volume);
  };

  const setPlayerVolume = (nextVolume: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const clampedVolume = Math.max(0, Math.min(1, nextVolume));
    video.volume = clampedVolume;
    video.muted = clampedVolume === 0;
    setVolumeLevel(clampedVolume);
    setIsMuted(video.muted);
  };

  const setPlayerSpeed = (nextSpeed: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.playbackRate = nextSpeed;
    setPlaybackRate(nextSpeed);
  };

  const togglePictureInPicture = async () => {
    const video = videoRef.current;
    if (!video || !("pictureInPictureEnabled" in document) || !document.pictureInPictureEnabled) {
      return;
    }
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }
    if ("requestPictureInPicture" in video) {
      await video.requestPictureInPicture();
    }
  };

  const goToSiblingLesson = async (targetLessonId: number | null) => {
    if (!targetLessonId) {
      return;
    }
    navigate(`/lessons/${targetLessonId}`);
  };

  const handleEnded = () => {
    if (!payload?.nextLessonId) {
      return;
    }
    window.setTimeout(() => {
      void goToSiblingLesson(payload.nextLessonId);
    }, 120);
  };

  useLessonAutosave({
    lessonId: Number(lessonId ?? 0),
    videoRef,
    onSaved: (snapshot) => {
      setProgressPercent(snapshot.progressPercent);
      setProgressSeconds(snapshot.currentTimeSeconds);
      setCompleted(snapshot.completed);
    },
  });

  usePlayerHotkeys({
    videoRef,
    onToggleMuted: toggleMuted,
    onToggleTheater: () => setIsTheater((current) => !current),
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !payload) {
      return;
    }

    const onLoadedMetadata = () => {
      if (hasRestoredRef.current !== payload.lesson.id) {
        const localCheckpoint = readLessonResumeCheckpoint(payload.lesson.id);
        const resumeSeconds = Math.max(payload.lesson.progressSeconds || 0, localCheckpoint?.currentTimeSeconds ?? 0);
        video.currentTime = resumeSeconds;
        video.playbackRate = localCheckpoint?.speed ?? payload.lesson.speed ?? 1;
        video.volume = localCheckpoint?.volume ?? payload.lesson.volume ?? 1;
        video.muted = false;
        setIsMuted(false);
        hasRestoredRef.current = payload.lesson.id;
      }
      syncPlaybackUi(video);
    };

    const markVideoInteractive = async (shouldAutoplay = false) => {
      syncPlaybackUi(video);
      isVideoInteractiveRef.current = true;
      setIsVideoReady(true);
      setIsVideoBuffering(false);
      setPlaybackError(null);

      if (shouldAutoplay && video.paused) {
        await video.play().catch(() => undefined);
      }
    };

    const onPlay = () => {
      setIsPlaying(true);
      syncPlaybackUi(video);
    };
    const onPause = () => {
      setIsPlaying(false);
      syncPlaybackUi(video);
    };
    const onLoadedData = () => void markVideoInteractive(true);
    const onWaiting = () => {
      if (isVideoInteractiveRef.current) {
        setIsVideoBuffering(true);
      }
    };
    const onCanPlay = () => void markVideoInteractive(false);
    const onTimeUpdate = () => syncPlaybackUi(video);
    const onDurationChange = () => syncPlaybackUi(video);
    const onProgress = () => syncPlaybackUi(video);
    const onPlaybackError = () => {
      setIsVideoBuffering(false);
      setIsVideoReady(false);
      isVideoInteractiveRef.current = false;
      setPlaybackError(describePlaybackFailure(video));
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onCanPlay);
    video.addEventListener("seeked", onCanPlay);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("progress", onProgress);
    video.addEventListener("error", onPlaybackError);

    if (video.readyState >= 1) {
      onLoadedMetadata();
    }
    if (video.readyState >= 2) {
      void onCanPlay();
    }

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onCanPlay);
      video.removeEventListener("seeked", onCanPlay);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("progress", onProgress);
      video.removeEventListener("error", onPlaybackError);
    };
  }, [completionThresholdPercent, payload, videoSource]);

  useEffect(() => {
    if (!payload?.nextLessonId) {
      setNextLessonPreload(null);
      return;
    }

    const remainingSeconds = Math.max(0, knownDurationSeconds - visibleProgressSeconds);
    const shouldPrepareNextLesson =
      visibleProgressPercent >= 72 || (knownDurationSeconds > 0 && remainingSeconds <= Math.min(150, knownDurationSeconds * 0.18));

    if (!shouldPrepareNextLesson) {
      return;
    }

    const nextLessonId = payload.nextLessonId;
    if (prefetchedLessonsRef.current.has(nextLessonId)) {
      const prefetchedPayload = prefetchedLessonsRef.current.get(nextLessonId)!;
      setNextLessonPreload({
        lessonId: nextLessonId,
        title: prefetchedPayload.lesson.title,
        videoSource: toAppFileUrl(prefetchedPayload.lesson.absolutePath),
      });
      return;
    }

    if (prefetchingLessonsRef.current.has(nextLessonId)) {
      return;
    }

    let cancelled = false;
    prefetchingLessonsRef.current.add(nextLessonId);

    void atlasApi
      .getLessonPlayerPayload(nextLessonId)
      .then((prefetchedPayload) => {
        if (cancelled) {
          return;
        }

        prefetchedLessonsRef.current.set(nextLessonId, prefetchedPayload);
        setNextLessonPreload({
          lessonId: nextLessonId,
          title: prefetchedPayload.lesson.title,
          videoSource: toAppFileUrl(prefetchedPayload.lesson.absolutePath),
        });
      })
      .catch((prefetchError) => {
        console.warn("No se pudo preparar la siguiente clase con anticipacion.", prefetchError);
      })
      .finally(() => {
        prefetchingLessonsRef.current.delete(nextLessonId);
      });

    return () => {
      cancelled = true;
    };
  }, [knownDurationSeconds, payload?.lesson.id, payload?.nextLessonId, visibleProgressPercent, visibleProgressSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    for (let index = 0; index < video.textTracks.length; index += 1) {
      video.textTracks[index].mode = subtitlesEnabled ? "showing" : "disabled";
    }

    writeLocalStorage("organicursos.subtitles.enabled", subtitlesEnabled ? "true" : "false");
  }, [payload?.lesson.id, subtitlesEnabled]);

  const saveBookmark = async () => {
    if (!payload || !videoRef.current) {
      return;
    }
    setSavingBookmark(true);
    try {
      const bookmark = await atlasApi.createBookmark({
        lessonId: payload.lesson.id,
        timestampSeconds: Math.floor(videoRef.current.currentTime),
        label: bookmarkLabel.trim() || null,
      });
      setBookmarks((current) => [bookmark, ...current]);
      setBookmarkLabel("");
    } finally {
      setSavingBookmark(false);
    }
  };

  const saveNote = async () => {
    if (!payload || !noteBody.trim()) {
      return;
    }
    setSavingNote(true);
    try {
      const note = await atlasApi.saveNote({
        courseId: payload.lesson.courseId,
        lessonId: payload.lesson.id,
        timestampSeconds: Math.floor(videoRef.current?.currentTime ?? payload.lesson.progressSeconds ?? 0),
        body: noteBody.trim(),
      });
      setNotes((current) => [note, ...current]);
      setNoteBody("");
    } finally {
      setSavingNote(false);
    }
  };

  const toggleCompleted = async () => {
    if (!payload) {
      return;
    }
    const nextCompleted = !completed;
    await atlasApi.saveLessonProgress({
      lessonId: payload.lesson.id,
      currentTimeSeconds: nextCompleted
        ? payload.lesson.durationSeconds ?? Math.max(payload.lesson.progressSeconds, progressSeconds)
        : progressSeconds,
      speed: videoRef.current?.playbackRate ?? payload.lesson.speed ?? 1,
      volume: videoRef.current?.volume ?? payload.lesson.volume ?? 1,
      completed: nextCompleted,
    });
    setCompleted(nextCompleted);
    setProgressPercent(nextCompleted ? 100 : Math.max(progressPercent, 0));
    await refreshLibrary({ silent: true });
  };

  if (loading) {
    return (
      <section className="rounded-[30px] border border-white/8 bg-black/20 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-500">OrganiCursos</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Preparando tu clase</h1>
        <p className="mt-3 text-slate-400">Estamos dejando listo el video, los materiales y tu punto exacto de avance.</p>
      </section>
    );
  }

  if (error || !payload) {
    return (
      <section className="rounded-[30px] border border-rose-400/20 bg-rose-500/5 p-6">
        <p className="text-sm uppercase tracking-[0.28em] text-rose-200/80">No se pudo abrir</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Esta clase no estuvo disponible</h1>
        <p className="mt-3 text-slate-300">{error ?? "No se pudo cargar el contenido."}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => navigate(-1)}>Volver</Button>
          <Button onClick={() => lessonId && void loadLesson(Number(lessonId))}>Reintentar</Button>
        </div>
      </section>
    );
  }

  const selectedAssetUrl = selectedAsset ? toAppFileUrl(selectedAsset.absolutePath) : null;
  const courseLink = `/courses/${payload.lesson.courseId}`;

  return (
    <section className="space-y-3" data-lesson-page>
      <div className={contentGridClassName}>
        <div className="space-y-4">
          {playbackError ? (
            <div className="rounded-[26px] border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-50">
              <p className="font-medium">No se pudo preparar la reproduccion de esta clase.</p>
              <p className="mt-1 text-amber-100/80">{playbackError}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => lessonId && void loadLesson(Number(lessonId))}>Reintentar</Button>
                <Link to={courseLink}>
                  <Button variant="ghost">Volver al curso</Button>
                </Link>
              </div>
            </div>
          ) : null}
          <div className={cn("overflow-hidden rounded-[30px] border border-white/8 bg-black/30", isTheater && "shadow-2xl shadow-black/30")}>
            <div className="border-b border-white/8 bg-[linear-gradient(180deg,rgba(17,24,33,0.96),rgba(11,16,24,0.92))] px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[13px] font-semibold text-white">{payload.lesson.title}</p>
                    <Badge>{completed ? "Lista" : getProgressStage(visibleProgressPercent)}</Badge>
                    {payload.sectionTitle ? <Badge>{payload.sectionTitle}</Badge> : null}
                    <Badge>{`${formatPercent(visibleProgressPercent)}% de esta clase`}</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link to={courseLink}>
                    <Button variant="secondary" className="gap-2 px-3 py-1.5">
                      <ChevronLeft className="h-4 w-4" />
                      Curso
                    </Button>
                  </Link>
                  <Button
                    variant="secondary"
                    className="gap-2 px-3 py-1.5"
                    onClick={() => void goToSiblingLesson(payload.previousLessonId)}
                    disabled={!payload.previousLessonId}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="secondary"
                    className="gap-2 px-3 py-1.5"
                    onClick={() => void goToSiblingLesson(payload.nextLessonId)}
                    disabled={!payload.nextLessonId}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" className="gap-2 px-3 py-1.5" onClick={toggleCompleted}>
                    <Bookmark className="h-4 w-4" />
                    {completed ? "Pendiente" : "Lista"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-[linear-gradient(180deg,rgba(0,0,0,0.86),rgba(0,0,0,0.72))] px-2 py-2 sm:px-3 sm:py-3">
              <div className="mx-auto w-full" style={{ maxWidth: `${playerStageMaxWidth}px` }}>
                <div
                  className={cn(
                    "relative w-full overflow-hidden rounded-[24px] bg-black",
                    isTheater && "shadow-[0_24px_60px_rgba(0,0,0,0.34)]",
                  )}
                  style={{ aspectRatio: `${mediaAspectRatio}` }}
                >
                  <video
                    ref={videoRef}
                    key={payload.lesson.id}
                    src={videoSource ?? undefined}
                    poster={posterSource ?? undefined}
                    playsInline
                    preload="auto"
                    className="absolute inset-0 h-full w-full bg-black object-contain"
                    onEnded={handleEnded}
                  >
                    {subtitleSource ? (
                      <track
                        kind="subtitles"
                        src={subtitleSource}
                        srcLang="es"
                        label="Español"
                        default
                      />
                    ) : null}
                  </video>
                  {!playbackError && !isVideoReady ? (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(5,9,14,0.44),rgba(5,9,14,0.68))]">
                      <div className="w-full max-w-sm px-6">
                        <div className="rounded-[24px] border border-white/10 bg-black/45 px-5 py-4 backdrop-blur-xl">
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Preparando video</p>
                          <p className="mt-2 text-sm text-white">Cargando video, punto de avance y controles.</p>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className="loading-sheen h-full w-1/3 rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff,#d7b571)]" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="border-t border-white/8 bg-black/25 px-3 py-2.5">
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-[18px] border border-white/8 bg-black/20 px-3 py-3">
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 rounded-[18px] bg-[linear-gradient(90deg,rgba(91,214,190,0.12),rgba(79,156,255,0.12),rgba(215,181,113,0.08))]"
                    style={{ width: `${bufferedPercent}%` }}
                  />
                  <PlayerSlider
                    label="Avance de la clase"
                    min={0}
                    max={Math.max(knownDurationSeconds, 1)}
                    step={1}
                    value={Math.min(visibleProgressSeconds, Math.max(knownDurationSeconds, 1))}
                    valueText={`${formatPlaybackTime(visibleProgressSeconds)} / ${formatPlaybackTime(knownDurationSeconds)}`}
                    onValueChange={(value) => setSeekDraftSeconds(value)}
                    onValueCommit={(value) => seekTo(value)}
                    disabled={knownDurationSeconds <= 0}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" className="gap-2 px-3 py-2" onClick={() => void togglePlayback()}>
                      {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {isPlaying ? "Pausar" : "Reproducir"}
                    </Button>
                    <Button variant="secondary" className="gap-2 px-3 py-2" onClick={() => seekBy(-10)}>
                      <SkipBack className="h-4 w-4" />
                      -10
                    </Button>
                    <Button variant="secondary" className="gap-2 px-3 py-2" onClick={() => seekBy(10)}>
                      <SkipForward className="h-4 w-4" />
                      +10
                    </Button>
                    {payload.lesson.subtitlePath ? (
                      <Button variant="secondary" className="gap-2 px-3 py-2" onClick={() => setSubtitlesEnabled((current) => !current)}>
                        <Captions className="h-4 w-4" />
                        {subtitlesEnabled ? "Subtitulos activos" : "Subtitulos apagados"}
                      </Button>
                    ) : null}
                    <Button variant="secondary" className="gap-2 px-3 py-2" onClick={toggleMuted}>
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      {isMuted ? "Activar sonido" : "Silenciar"}
                    </Button>
                    <Button
                      variant="secondary"
                      className="gap-2 px-3 py-2"
                      onClick={() => void goToSiblingLesson(payload.previousLessonId)}
                      disabled={!payload.previousLessonId}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="secondary"
                      className="gap-2 px-3 py-2"
                      onClick={() => void goToSiblingLesson(payload.nextLessonId)}
                      disabled={!payload.nextLessonId}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[170px] rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2">
                      <PlayerSlider
                        label="Volumen"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(volumeLevel * 100)}
                        valueText={isMuted ? "0%" : `${Math.round(volumeLevel * 100)}%`}
                        onValueChange={(value) => setPlayerVolume(value / 100)}
                        onValueCommit={(value) => setPlayerVolume(value / 100)}
                      />
                    </div>

                    <label className="flex items-center gap-2 rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Velocidad</span>
                      <select
                        aria-label="Velocidad de reproduccion"
                        value={String(playbackRate)}
                        className="rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-white outline-none"
                        onChange={(event) => setPlayerSpeed(Number(event.target.value))}
                      >
                        {[0.75, 1, 1.25, 1.5, 1.75, 2].map((speed) => (
                          <option key={speed} value={speed}>
                            {speed}x
                          </option>
                        ))}
                      </select>
                    </label>

                    <Button variant="secondary" className="gap-2 px-3 py-2" onClick={() => setIsTheater((current) => !current)}>
                      {isTheater ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      {isTheater ? "Vista normal" : "Vista amplia"}
                    </Button>
                    <Button variant="secondary" className="gap-2 px-3 py-2" onClick={() => void togglePictureInPicture()}>
                      <PictureInPicture2 className="h-4 w-4" />
                      Mini reproductor
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-400">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    <span>{`${formatPlaybackTime(visibleProgressSeconds)} vistos`}</span>
                    <span>{`${formatPlaybackTime(knownDurationSeconds)} de duracion`}</span>
                    <span>{`${formatPercent(visibleProgressPercent)}% reproducido`}</span>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-slate-300">
                    {!isVideoReady
                      ? "Preparando"
                      : isVideoBuffering
                        ? "Cargando segmentos"
                        : nextLessonPreload
                          ? "Siguiente clase lista"
                          : "Listo"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {nextLessonPreload?.videoSource ? (
            <video
              key={`prefetch-${nextLessonPreload.lessonId}`}
              src={nextLessonPreload.videoSource}
              preload="metadata"
              muted
              aria-hidden="true"
              className="hidden"
            />
          ) : null}

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.08fr),minmax(260px,0.92fr)]">
            <section className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Tu avance</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">{getProgressMessage(visibleProgressPercent)}</h2>
                </div>
                <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">En esta clase</p>
                  <p className="mt-2 text-2xl font-semibold text-white">{`${formatPercent(visibleProgressPercent)}%`}</p>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-white/5">
                <div className="h-2 rounded-full bg-atlas-400" style={{ width: `${visibleProgressPercent}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-400">
                <span>{formatPlaybackTime(visibleProgressSeconds)} vistos</span>
                <span>{formatPlaybackTime(knownDurationSeconds)} de duracion</span>
                <span>{completed ? "Clase terminada" : "Lista para retomar"}</span>
              </div>
            </section>

            <section className="rounded-[24px] border border-white/8 bg-black/20 p-4">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Resumen de la clase</p>
              <div className="mt-4 space-y-3">
                {payload.lessonSummary ? (
                  <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm leading-6 text-slate-200">
                    {payload.lessonSummary}
                  </div>
                ) : null}
                {payload.lessonHighlights.length > 0 ? (
                  <div className="grid gap-2">
                    {payload.lessonHighlights.map((highlight) => (
                      <div key={highlight} className="rounded-[18px] border border-white/8 bg-black/15 px-4 py-2.5 text-sm leading-6 text-slate-300">
                        {highlight}
                      </div>
                    ))}
                  </div>
                ) : !payload.lessonSummary ? (
                  <p className="text-sm leading-6 text-slate-400">
                    Esta clase se describira mejor cuando haya mas subtitulos o materiales para resumirla con precision.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </div>

        <aside className="space-y-3">
          <section className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Siguiente paso</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Sigue sin perder el hilo</h2>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="px-3" onClick={() => void goToSiblingLesson(payload.previousLessonId)} disabled={!payload.previousLessonId}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="secondary" className="px-3" onClick={() => void goToSiblingLesson(payload.nextLessonId)} disabled={!payload.nextLessonId}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Resolucion</p>
                <p className="mt-2 font-semibold text-white">
                  {payload.lesson.mediaInfo?.width && payload.lesson.mediaInfo?.height
                    ? `${payload.lesson.mediaInfo.width}x${payload.lesson.mediaInfo.height}`
                    : "No disponible"}
                </p>
              </div>
              <div className="rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Audio</p>
                <p className="mt-2 font-semibold text-white">{payload.lesson.mediaInfo?.audioCodec ?? "No disponible"}</p>
              </div>
            </div>
            {payload.lessonTranscriptPreview ? (
              <div className="mt-4 rounded-[20px] border border-white/8 bg-white/[0.03] p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Vista previa</p>
                <p className="mt-3 text-sm leading-6 text-slate-300">{payload.lessonTranscriptPreview}</p>
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Material de apoyo</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Todo junto y a la mano</h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition",
                    resourceView === "preview" ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5",
                  )}
                  onClick={() => setResourceView("preview")}
                >
                  Vista
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition",
                    resourceView === "list" ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5",
                  )}
                  onClick={() => setResourceView("list")}
                >
                  Lista
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {sortedAssets.length === 0 ? (
                <p className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-slate-400">
                  Esta clase no tiene materiales extra.
                </p>
              ) : resourceView === "preview" && selectedAsset && canPreviewInline(selectedAsset) ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {sortedAssets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-sm transition",
                          selectedAsset.id === asset.id
                            ? "border-atlas-300 bg-atlas-400/15 text-white"
                            : "border-white/10 text-slate-400 hover:bg-white/5",
                        )}
                        onClick={() => setSelectedAssetId(asset.id)}
                      >
                        {asset.title}
                      </button>
                    ))}
                  </div>

                  <div className="rounded-[24px] border border-white/8 bg-black/25 p-3">
                    {selectedAsset.assetKind === "pdf" ? (
                      <iframe title={selectedAsset.title} src={selectedAssetUrl ?? undefined} className="h-[320px] w-full rounded-[18px] bg-white" />
                    ) : isHtmlAsset(selectedAsset) ? (
                      <iframe title={selectedAsset.title} src={selectedAssetUrl ?? undefined} className="h-[320px] w-full rounded-[18px] bg-white" />
                    ) : isAudioAsset(selectedAsset) ? (
                      <div className="rounded-[18px] bg-black/30 p-5">
                        <audio controls className="w-full" src={selectedAssetUrl ?? undefined} />
                        <p className="mt-4 text-sm leading-6 text-slate-300">
                          {selectedAsset.extractedText ?? selectedAsset.extractedTextPreview ?? "Este audio de apoyo ya queda disponible dentro de la clase."}
                        </p>
                      </div>
                    ) : isPresentationAsset(selectedAsset) ? (
                      <div className="rounded-[18px] bg-black/30 p-5">
                        <p className="text-sm font-medium text-white">Presentacion del curso</p>
                        <p className="mt-3 text-sm leading-6 text-slate-300">
                          {selectedAsset.extractedText ?? selectedAsset.extractedTextPreview ?? "Esta presentacion queda registrada dentro de la clase. Si trae texto, se muestra aqui para revisar sus ideas clave."}
                        </p>
                      </div>
                    ) : isImageAsset(selectedAsset) ? (
                      <img
                        src={selectedAssetUrl ?? undefined}
                        alt={selectedAsset.title}
                        className="max-h-[320px] w-full rounded-[18px] object-contain"
                        onError={(event) => applyLocalFileUrlFallback(event, selectedAsset.absolutePath)}
                      />
                    ) : (
                      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-[18px] bg-black/30 p-4 text-sm leading-6 text-slate-200">
                        {selectedAsset.extractedText ?? selectedAsset.extractedTextPreview ?? "Este recurso no tiene una vista rapida disponible todavia."}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {sortedAssets.map((asset) => {
                    const Icon = resourceIcon(asset);
                    return (
                      <div key={asset.id} className="flex items-start justify-between gap-3 rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="rounded-2xl border border-white/10 bg-white/[0.04] p-2">
                            <Icon className="h-4 w-4 text-slate-300" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">{asset.title}</p>
                            <p className="mt-1 text-sm text-slate-400">{asset.relativePath}</p>
                          </div>
                        </div>
                        {canPreviewInline(asset) ? (
                          <Button
                            variant="secondary"
                            className="gap-2 px-3"
                            onClick={() => {
                              setSelectedAssetId(asset.id);
                              setResourceView("preview");
                            }}
                          >
                            <FileText className="h-4 w-4" />
                            Ver aqui
                          </Button>
                        ) : (
                          <Button variant="secondary" className="gap-2 px-3" onClick={() => openAsset(asset)}>
                            <ExternalLink className="h-4 w-4" />
                            Abrir
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Marcadores</p>
            <div className="mt-4 space-y-3">
              <input
                value={bookmarkLabel}
                onChange={(event) => setBookmarkLabel(event.target.value)}
                placeholder="Ponle un nombre a este momento"
                className="w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-atlas-300"
              />
              <Button className="w-full justify-center" loading={savingBookmark} onClick={() => void saveBookmark()}>
                {`Guardar momento en ${formatPlaybackTime(Math.floor(videoRef.current?.currentTime ?? progressSeconds))}`}
              </Button>
              <div className="space-y-2">
                {bookmarks.map((bookmark) => (
                  <div key={bookmark.id} className="flex items-center justify-between gap-3 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">{bookmark.label ?? "Momento guardado"}</p>
                      <p className="text-xs text-slate-400">{formatPlaybackTime(bookmark.timestampSeconds)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      className="px-2"
                      onClick={async () => {
                        await atlasApi.deleteBookmark(bookmark.id);
                        setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
                      }}
                    >
                      Quitar
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-white/8 bg-black/20 p-4">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Notas de esta clase</p>
            <div className="mt-4 space-y-3">
              <textarea
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                placeholder="Escribe una nota rapida para retomarla despues"
                className="min-h-[136px] w-full rounded-[18px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-500 focus:border-atlas-300"
              />
              <Button className="w-full justify-center" loading={savingNote} onClick={() => void saveNote()}>
                Guardar nota
              </Button>
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        {note.timestampSeconds != null ? formatPlaybackTime(note.timestampSeconds) : "Nota general"}
                      </p>
                      <button
                        type="button"
                        className="text-xs text-slate-400 transition hover:text-white"
                        onClick={async () => {
                          await atlasApi.deleteNote(note.id);
                          setNotes((current) => current.filter((item) => item.id !== note.id));
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-200">{note.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}
