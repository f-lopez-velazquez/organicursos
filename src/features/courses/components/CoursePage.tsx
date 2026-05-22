import { CheckCircle2, ExternalLink, FileArchive, FileText, Heart, Image as ImageIcon, ImagePlus, NotebookPen, PlayCircle, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CoverStudioPanel } from "@/features/covers/components/CoverStudioPanel";
import {
  formatPercent,
  formatPlaybackTime,
  getProgressMessage,
  getProgressStage,
} from "@/features/player/services/player-utils";
import { atlasApi } from "@/lib/api/atlas-api";
import { applyLocalFileUrlFallback, toAppFileUrl } from "@/lib/utils/file-url";
import { openExternal } from "@/lib/utils/open-external";
import { cn } from "@/lib/utils/cn";
import { useViewportProfile } from "@/lib/utils/viewport-profile";
import { useAppStore } from "@/store/app-store";
import type { CourseDetail, LessonAsset, LessonSummary } from "@/types/domain";

type LessonFilter = "all" | "resume" | "pending" | "done";
type CourseViewMode = "sections" | "blocks" | "progress";

function countCompletedLessons(course: CourseDetail) {
  return course.sections.flatMap((section) => section.lessons).filter((lesson) => lesson.completed).length;
}

function flattenLessons(course: CourseDetail) {
  return course.sections.flatMap((section) => section.lessons);
}

function getResumeLesson(course: CourseDetail) {
  return flattenLessons(course)
    .filter((lesson) => lesson.progressPercent > 0 && !lesson.completed)
    .sort((left, right) => new Date(right.lastViewedAt ?? 0).getTime() - new Date(left.lastViewedAt ?? 0).getTime())[0];
}

function matchesFilter(lesson: LessonSummary, filter: LessonFilter) {
  if (filter === "resume") {
    return lesson.progressPercent > 0 && !lesson.completed;
  }

  if (filter === "pending") {
    return lesson.progressPercent === 0 && !lesson.completed;
  }

  if (filter === "done") {
    return lesson.completed;
  }

  return true;
}

function chunkLessons(lessons: LessonSummary[], chunkSize: number) {
  const chunks: LessonSummary[][] = [];
  for (let index = 0; index < lessons.length; index += chunkSize) {
    chunks.push(lessons.slice(index, index + chunkSize));
  }
  return chunks;
}

function progressBucket(lesson: LessonSummary) {
  if (lesson.completed) {
    return "Listas";
  }
  if (lesson.progressPercent > 0) {
    return "En curso";
  }
  return "Por empezar";
}

function compactPathLabel(relativePath: string) {
  const parts = relativePath.split("/");
  return parts.slice(-2).join(" / ");
}

function courseInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("");
}

function courseAssetIcon(asset: LessonAsset) {
  if (asset.assetKind === "archive") {
    return FileArchive;
  }

  if (["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(asset.extension.toLowerCase())) {
    return ImageIcon;
  }

  return FileText;
}

function courseAssetKindLabel(asset: LessonAsset) {
  if (asset.assetKind === "subtitle") {
    return "Subtitulos";
  }
  if (asset.assetKind === "pdf") {
    return "PDF";
  }
  if (asset.assetKind === "docx") {
    return "Documento";
  }
  if (asset.assetKind === "archive") {
    return "Archivo comprimido";
  }
  if (asset.assetKind === "text") {
    return "Texto";
  }
  return "Material";
}

function buildCourseAssetGroups(course: CourseDetail | null) {
  if (!course) {
    return [];
  }

  const lessonsById = new Map<number, LessonSummary>();
  const sectionTitleByLessonId = new Map<number, string>();

  for (const section of course.sections) {
    for (const lesson of section.lessons) {
      lessonsById.set(lesson.id, lesson);
      sectionTitleByLessonId.set(lesson.id, section.title);
    }
  }

  const groups = new Map<string, { title: string; assets: Array<LessonAsset & { lessonTitle: string | null }> }>();

  for (const asset of course.assets) {
    const sectionTitle = asset.lessonId ? sectionTitleByLessonId.get(asset.lessonId) : null;
    const lessonTitle = asset.lessonId ? lessonsById.get(asset.lessonId)?.title ?? null : null;
    const groupTitle = sectionTitle ?? "Material general";
    const existingGroup = groups.get(groupTitle) ?? { title: groupTitle, assets: [] };
    existingGroup.assets.push({
      ...asset,
      lessonTitle,
    });
    groups.set(groupTitle, existingGroup);
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    assets: group.assets.sort((left, right) => {
      const leftRank = left.lessonTitle ? 0 : 1;
      const rightRank = right.lessonTitle ? 0 : 1;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      return left.title.localeCompare(right.title, "es");
    }),
  }));
}

function LessonCard({
  lesson,
  onToggleCompleted,
}: {
  lesson: LessonSummary;
  onToggleCompleted: (lesson: LessonSummary) => Promise<void>;
}) {
  const lessonStage = getProgressStage(lesson.progressPercent);

  return (
    <div className="rounded-[16px] border border-white/8 bg-black/20 px-2.5 py-2 transition hover:border-white/12 hover:bg-white/[0.045]">
      <div className="grid gap-2.5 md:grid-cols-[72px,minmax(0,1fr),auto] md:items-center">
        <Link to={`/lessons/${lesson.id}`} className="block overflow-hidden rounded-[18px] bg-white/[0.04]">
          <div className="h-11 w-full md:w-[72px]">
            {lesson.thumbnailPath ? (
              <img
                src={toAppFileUrl(lesson.thumbnailPath) ?? undefined}
                alt=""
                className="h-full w-full object-cover"
                onError={(event) => applyLocalFileUrlFallback(event, lesson.thumbnailPath)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">Sin miniatura</div>
            )}
          </div>
        </Link>

        <div className="min-w-0">
          <Link to={`/lessons/${lesson.id}`} className="block">
            <div className="flex items-start gap-2">
              <PlayCircle className="mt-1 h-4 w-4 shrink-0 text-atlas-300" />
              <div className="min-w-0">
                <p title={lesson.title} className="line-clamp-2 text-pretty break-words text-[13px] font-semibold leading-5 text-white md:text-[13px]">
                  {lesson.title}
                </p>
                <p title={lesson.relativePath} className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-slate-400 md:text-xs">
                  {compactPathLabel(lesson.relativePath)}
                </p>
              </div>
            </div>
          </Link>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500 md:text-[11px]">
            <span>{formatPlaybackTime(lesson.durationSeconds)}</span>
            <span>-</span>
            <span>{lesson.completed ? "Lista" : lesson.progressPercent > 0 ? "En curso" : "Pendiente"}</span>
            {lesson.lastViewedAt ? (
              <>
                <span>-</span>
                <span>Vista hace poco</span>
              </>
            ) : null}
          </div>

          <div className="mt-1 h-1.5 rounded-full bg-white/5 md:max-w-[240px]">
            <div className="h-1.5 rounded-full bg-atlas-400" style={{ width: `${lesson.progressPercent}%` }} />
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-1.5 md:items-end">
          <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-2 py-1 text-center md:min-w-[88px]">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Clase</p>
            <p className="mt-0.5 text-[13px] font-semibold text-white">{lessonStage}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">{`${formatPercent(lesson.progressPercent)}%`}</p>
          </div>

          <div className="flex flex-wrap gap-1.5 md:max-w-[164px] md:justify-end">
            <Link to={`/lessons/${lesson.id}`} className="block">
              <Button className="gap-2 px-2.5 py-1.5">
                <PlayCircle className="h-4 w-4" />
                Abrir
              </Button>
            </Link>

            <Button
              variant={lesson.completed ? "primary" : "secondary"}
              className="gap-2 px-2.5 py-1.5"
              onClick={() => void onToggleCompleted(lesson)}
            >
              <CheckCircle2 className={`h-4 w-4 ${lesson.completed ? "fill-white" : ""}`} />
              {lesson.completed ? "Lista" : "Marcar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CoursePage() {
  const { courseId } = useParams();
  const viewport = useViewportProfile();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [courseNote, setCourseNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCoverStudio, setShowCoverStudio] = useState(false);
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>("all");
  const [courseViewMode, setCourseViewMode] = useState<CourseViewMode>("sections");
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const settings = useAppStore((state) => state.settings);
  const courseTopRef = useRef<HTMLDivElement>(null);
  const playlistRef = useRef<HTMLDivElement>(null);

  const loadCourse = async (id: string | number) => {
    setLoading(true);
    setError(null);
    try {
      const payload = await atlasApi.getCourse(Number(id));
      setCourse(payload);
    } catch (loadError) {
      setCourse(null);
      setError(loadError instanceof Error ? loadError.message : "No se pudo abrir este curso.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!courseId) {
      return;
    }
    void loadCourse(courseId);
  }, [courseId]);

  useLayoutEffect(() => {
    if (!courseId) {
      return;
    }

    const rafId = window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-route-scroll-root]")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      playlistRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      courseTopRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [courseId]);

  const completedLessons = useMemo(() => (course ? countCompletedLessons(course) : 0), [course]);
  const resumeLesson = useMemo(() => (course ? getResumeLesson(course) : null), [course]);
  const courseStage = getProgressStage(course?.progressPercent);

  const filteredSections = useMemo(() => {
    if (!course) {
      return [];
    }

    return course.sections
      .map((section) => ({
        ...section,
        lessons: section.lessons.filter((lesson) => matchesFilter(lesson, lessonFilter)),
      }))
      .filter((section) => section.lessons.length > 0);
  }, [course, lessonFilter]);
  const blockGroups = useMemo(() => {
    const chunkSize = viewport.mode === "compact" ? 4 : viewport.mode === "wide" ? 8 : 6;

    return filteredSections.flatMap((section) =>
      chunkLessons(section.lessons, chunkSize).map((lessons, index) => ({
        id: `${section.id}-block-${index + 1}`,
        title: section.lessons.length > chunkSize ? `${section.title} - Bloque ${index + 1}` : section.title,
        subtitle: `${lessons.length} clases juntas para avanzar sin perder el hilo`,
        lessons,
      })),
    );
  }, [filteredSections, viewport.mode]);
  const progressGroups = useMemo(() => {
    const buckets = new Map<string, Map<string, LessonSummary[]>>();
    for (const section of filteredSections) {
      for (const lesson of section.lessons) {
        const key = progressBucket(lesson);
        const sectionBuckets = buckets.get(key) ?? new Map<string, LessonSummary[]>();
        const sectionLessons = sectionBuckets.get(section.title) ?? [];
        sectionBuckets.set(section.title, [...sectionLessons, lesson]);
        buckets.set(key, sectionBuckets);
      }
    }

    return ["En curso", "Por empezar", "Listas"]
      .map((key) => ({
        title: key,
        subtitle:
          key === "En curso"
            ? "Aqui esta lo que ya empezaste."
            : key === "Por empezar"
              ? "Lo que sigue cuando quieras avanzar."
              : "Lo que ya puedes dar por terminado.",
        sections: Array.from(buckets.get(key)?.entries() ?? []).map(([title, lessons]) => ({
          title,
          lessons,
        })),
      }))
      .filter((group) => group.sections.length > 0);
  }, [filteredSections]);
  const courseAssetGroups = useMemo(() => buildCourseAssetGroups(course), [course]);
  const courseLayoutStyle =
    viewport.mode === "wide"
      ? { gridTemplateColumns: "minmax(0,2.2fr) minmax(286px,0.56fr)" }
      : viewport.mode === "balanced" && viewport.width >= 1480
        ? { gridTemplateColumns: "minmax(0,1.95fr) minmax(270px,0.58fr)" }
        : undefined;
  const playlistMaxHeight = Math.max(590, viewport.height - 150);

  if (loading) {
    return (
      <div className="glass-panel p-8">
        <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Curso</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">Cargando contenido</h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">Estamos preparando las clases, tus avances y el material de este curso.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel p-8">
        <p className="text-sm uppercase tracking-[0.24em] text-amber-200">Error de carga</p>
        <h2 className="mt-3 text-3xl font-semibold text-white">No se pudo abrir este curso</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{error}</p>
        <div className="mt-5">
          <Button onClick={() => (courseId ? void loadCourse(courseId) : undefined)}>Reintentar</Button>
        </div>
      </div>
    );
  }

  if (!course) {
    return null;
  }

  const coverUrl = toAppFileUrl(course.coverPath);
  const toggleLessonCompleted = async (lesson: LessonSummary) => {
    await atlasApi.saveLessonProgress({
      lessonId: lesson.id,
      currentTimeSeconds: lesson.completed ? 0 : lesson.durationSeconds ?? 0,
      speed: lesson.speed,
      volume: lesson.volume,
      completed: !lesson.completed,
    });
    const next = await atlasApi.getCourse(course.id);
    setCourse(next);
    await refreshLibrary();
  };

  return (
    <div ref={courseTopRef} tabIndex={-1} className="space-y-6 outline-none">
      <section className="glass-panel overflow-hidden">
        <div className="relative overflow-hidden bg-[linear-gradient(155deg,rgba(46,107,216,0.4),rgba(10,15,23,0.9))] px-8 py-8">
          {coverUrl ? (
            <>
              <img
                src={coverUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-30"
                onError={(event) => applyLocalFileUrlFallback(event, course.coverPath)}
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,11,16,0.12),rgba(8,11,16,0.88))]" />
            </>
          ) : (
            <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(46,107,216,0.28),rgba(8,11,16,0.96))]" />
          )}
          <div className="relative flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0 flex-1">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-300">Curso</p>
              <h2 className="mt-2 max-w-4xl text-balance text-4xl font-semibold tracking-tight text-white">{course.title}</h2>
              <p className="mt-3 max-w-4xl text-base leading-7 text-slate-200/80">
                {course.description ?? course.suggestedDescription ?? "Aqui encontraras todas las clases y materiales de este curso."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {course.tags.map((tag) => (
                  <Badge key={tag}>{tag}</Badge>
                ))}
                <Badge tone={course.progressPercent >= 100 ? "success" : "default"}>{courseStage}</Badge>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {resumeLesson ? (
                <Link to={`/lessons/${resumeLesson.id}`}>
                  <Button className="gap-2">
                    <PlayCircle className="h-4 w-4" />
                    Seguir donde ibas
                  </Button>
                </Link>
              ) : null}
              <Button
                variant={course.isFavorite ? "primary" : "secondary"}
                className="gap-2"
                onClick={async () => {
                  await atlasApi.toggleFavorite(course.id, !course.isFavorite);
                  const next = await atlasApi.getCourse(course.id);
                  setCourse(next);
                  await refreshLibrary();
                }}
              >
                <Heart className={`h-4 w-4 ${course.isFavorite ? "fill-white" : ""}`} />
                {course.isFavorite ? "Guardado" : "Guardar"}
              </Button>
              <Button variant="secondary" className="gap-2" onClick={() => setShowCoverStudio((current) => !current)}>
                <ImagePlus className="h-4 w-4" />
                {showCoverStudio ? "Cerrar portada" : "Cambiar portada"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className={cn("grid gap-6", viewport.mode === "compact" ? "grid-cols-1" : "")} style={courseLayoutStyle}>
        <div className="space-y-6">
          <div className="glass-panel p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr),auto,auto] xl:items-center">
              <div>
                <p className="text-sm text-slate-400">Avance del curso</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h3 className="text-3xl font-semibold text-white">{`${formatPercent(course.progressPercent)}%`}</h3>
                  <Badge tone={course.progressPercent >= 100 ? "success" : "default"}>{courseStage}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{getProgressMessage(course.progressPercent)}</p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Clases listas</p>
                <p className="mt-2 text-lg font-semibold text-white">{`${completedLessons} de ${course.lessonCount}`}</p>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Tiempo total</p>
                <p className="mt-2 text-lg font-semibold text-white">{formatPlaybackTime(course.totalDurationSeconds)}</p>
              </div>
            </div>

            <div className="mt-4 h-2 rounded-full bg-white/5">
              <div className="h-2 rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff)]" style={{ width: `${course.progressPercent}%` }} />
            </div>
          </div>

          <div className="glass-panel p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-slate-400">Contenido del curso</p>
                <h3 className="mt-1 text-2xl font-semibold text-white">Temario del curso</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "all", label: "Todo" },
                  { id: "resume", label: "Retomar" },
                  { id: "pending", label: "Por empezar" },
                  { id: "done", label: "Listas" },
                ].map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setLessonFilter(filter.id as LessonFilter)}
                    className={cn(
                      "rounded-2xl border px-4 py-2 text-sm transition",
                      lessonFilter === filter.id
                        ? "border-white/15 bg-white/10 text-white"
                        : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200",
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
              {[
                { id: "sections", label: "Temario" },
                { id: "blocks", label: "Bloques" },
                { id: "progress", label: "Avance" },
              ].map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setCourseViewMode(view.id as CourseViewMode)}
                  className={cn(
                    "rounded-2xl border px-4 py-2 text-sm transition",
                    courseViewMode === view.id
                      ? "border-white/15 bg-white/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200",
                  )}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <Badge>{`${filteredSections.reduce((total, section) => total + section.lessons.length, 0)} elementos`}</Badge>
            </div>

            <div className="mt-4 rounded-[30px] border border-white/10 bg-black/15 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-2">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Sparkles className="h-4 w-4 text-[#d7b571]" />
                {resumeLesson ? "Tu siguiente paso ya esta a mano." : "Elige una clase y entra de inmediato."}
              </div>
              </div>

              <div
                ref={playlistRef}
                data-testid="course-playlist"
                className="space-y-3 overflow-y-auto pr-2"
                style={{ maxHeight: `${playlistMaxHeight}px` }}
              >
                {filteredSections.length === 0 ? (
                  <div className="rounded-[26px] border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm leading-6 text-slate-400">
                    No hay clases en este grupo todavia. Cambia el filtro para ver el resto del curso.
                  </div>
                ) : courseViewMode === "sections" ? (
                  filteredSections.map((section) => (
                    <div key={section.id} className="rounded-[22px] border border-white/10 bg-white/[0.025] p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-balance text-lg font-semibold text-white">{section.title}</h4>
                          <p className="mt-1 text-sm text-slate-500">{`${section.lessons.length} clases en esta parte`}</p>
                        </div>
                        <Badge>{`${section.lessons.filter((lesson) => lesson.completed).length} listas`}</Badge>
                      </div>

                      <div className="mt-3 space-y-2">
                        {section.lessons.map((lesson) => (
                          <LessonCard key={lesson.id} lesson={lesson} onToggleCompleted={toggleLessonCompleted} />
                        ))}
                      </div>
                    </div>
                  ))
                ) : courseViewMode === "blocks" ? (
                  blockGroups.map((group) => (
                    <div key={group.id} className="rounded-[22px] border border-white/10 bg-white/[0.025] p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-balance text-lg font-semibold text-white">{group.title}</h4>
                          <p className="mt-1 text-sm text-slate-500">{group.subtitle}</p>
                        </div>
                        <Badge>{`${group.lessons.length} clases`}</Badge>
                      </div>

                      <div className="mt-3 space-y-2">
                        {group.lessons.map((lesson) => (
                          <LessonCard key={lesson.id} lesson={lesson} onToggleCompleted={toggleLessonCompleted} />
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  progressGroups.map((group) => (
                    <div key={group.title} className="rounded-[22px] border border-white/10 bg-white/[0.025] p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="text-balance text-lg font-semibold text-white">{group.title}</h4>
                          <p className="mt-1 text-sm text-slate-500">{group.subtitle}</p>
                        </div>
                        <Badge>{`${group.sections.reduce((total, section) => total + section.lessons.length, 0)} clases`}</Badge>
                      </div>

                      <div className="mt-3 space-y-2">
                        {group.sections.map((section) => (
                          <div key={`${group.title}-${section.title}`} className="space-y-2.5 rounded-[20px] border border-white/8 bg-black/10 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{section.title}</p>
                              <span className="text-xs text-slate-500">{`${section.lessons.length} clases`}</span>
                            </div>
                            <div className="space-y-2">
                              {section.lessons.map((lesson) => (
                                <LessonCard key={lesson.id} lesson={lesson} onToggleCompleted={toggleLessonCompleted} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {courseAssetGroups.length > 0 ? (
            <div className="glass-panel p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">Material de apoyo</p>
                  <h3 className="mt-1 text-2xl font-semibold text-white">Archivos del curso</h3>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                    Todo el material adicional queda ordenado por bloque para que abras cada apoyo justo cuando lo necesitas.
                  </p>
                </div>
                <Badge>{`${course.assets.length} archivos`}</Badge>
              </div>

              <div className="mt-5 space-y-4">
                {courseAssetGroups.map((group) => (
                  <div key={group.title} className="rounded-[26px] border border-white/10 bg-white/[0.025] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-white">{group.title}</h4>
                        <p className="mt-1 text-sm text-slate-500">{`${group.assets.length} materiales ordenados en este bloque`}</p>
                      </div>
                      <Badge>{`${group.assets.length} archivos`}</Badge>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {group.assets.map((asset) => {
                        const Icon = courseAssetIcon(asset);
                        return (
                          <div key={asset.id} className="rounded-[22px] border border-white/8 bg-black/15 p-4">
                            <div className="flex items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05] text-atlas-200">
                                <Icon className="h-5 w-5" />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="line-clamp-2 text-sm font-semibold leading-6 text-white">{asset.title}</p>
                                  <span className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                    {courseAssetKindLabel(asset)}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-400">
                                  {asset.lessonTitle ? `Se usa en: ${asset.lessonTitle}` : "Disponible para todo el curso"}
                                </p>
                                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                                  {asset.extractedTextPreview ?? compactPathLabel(asset.relativePath)}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              {asset.lessonId ? (
                                <Link to={`/lessons/${asset.lessonId}`}>
                                  <Button variant="secondary" className="gap-2">
                                    <PlayCircle className="h-4 w-4" />
                                    Ir a la clase
                                  </Button>
                                </Link>
                              ) : null}
                              <Button
                                variant="ghost"
                                className="gap-2"
                                onClick={() => openExternal(asset.absolutePath)}
                              >
                                <ExternalLink className="h-4 w-4" />
                                Abrir archivo
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className={cn("space-y-6", viewport.mode === "compact" ? "" : "self-start")}>
          {showCoverStudio ? (
            <CoverStudioPanel
              courseId={course.id}
              courseTitle={course.title}
              category={course.category}
              tags={course.tags}
              canUseInternet={Boolean(settings?.internetEnrichmentEnabled && !settings.offlineModeEnabled)}
              provider={settings?.coverEnrichmentProvider ?? "openverse"}
              onClose={() => setShowCoverStudio(false)}
              onCoverUpdated={async () => {
                const next = await atlasApi.getCourse(course.id);
                setCourse(next);
                await refreshLibrary();
              }}
            />
          ) : (
            <div className="glass-panel p-6">
              <p className="text-sm text-slate-400">Portada</p>
              <div className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(160deg,rgba(46,107,216,0.35),rgba(8,11,16,0.9))]">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt=""
                    className="aspect-[16/9] w-full object-cover"
                    onError={(event) => applyLocalFileUrlFallback(event, course.coverPath)}
                  />
                ) : (
                  <div className="flex aspect-[16/9] items-center justify-center bg-[linear-gradient(145deg,rgba(46,107,216,0.28),rgba(8,11,16,0.96))]">
                    <div className="rounded-[28px] border border-white/12 bg-white/[0.06] px-5 py-3 text-3xl font-semibold tracking-[0.16em] text-white/88">
                      {courseInitials(course.title)}
                    </div>
                  </div>
                )}
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">Puedes cambiarla cuando quieras sin alterar el contenido del curso.</p>
              <div className="mt-4">
                <Button variant="secondary" className="gap-2" onClick={() => setShowCoverStudio(true)}>
                  <ImagePlus className="h-4 w-4" />
                  Elegir otra portada
                </Button>
              </div>
            </div>
          )}

          <div className="glass-panel p-6">
            <p className="text-sm text-slate-400">Siguiente paso</p>
            <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
              {resumeLesson ? (
                <>
                  <p className="text-base font-semibold text-white">{resumeLesson.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{getProgressMessage(resumeLesson.progressPercent)}</p>
                  <div className="mt-4 h-2 rounded-full bg-white/5">
                    <div className="h-2 rounded-full bg-atlas-400" style={{ width: `${resumeLesson.progressPercent}%` }} />
                  </div>
                  <div className="mt-4">
                    <Link to={`/lessons/${resumeLesson.id}`}>
                      <Button className="w-full gap-2">
                        <PlayCircle className="h-4 w-4" />
                        Seguir esta clase
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-base font-semibold text-white">Todo va en orden</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {course.progressPercent >= 100
                      ? "Este curso ya quedo completado."
                      : "Abre cualquier clase y el programa guardara por ti el punto exacto."}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="glass-panel p-6">
            <p className="text-sm text-slate-400">Resumen</p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-slate-500">Categoria</p>
                <p className="text-white">{course.category ?? "General"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Nivel</p>
                <p className="text-white">{course.difficulty ?? "Pendiente"}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Ritmo actual</p>
                <p className="text-white">{courseStage}</p>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6">
            <div className="flex items-center gap-2 text-white">
              <NotebookPen className="h-4 w-4" />
              <p className="font-medium">Notas del curso</p>
            </div>
            <div className="mt-4 flex gap-3">
              <textarea
                value={courseNote}
                onChange={(event) => setCourseNote(event.target.value)}
                placeholder="Escribe una nota general para este curso"
                className="min-h-28 flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
            <div className="mt-3">
              <Button
                disabled={courseNote.trim().length < 3}
                onClick={async () => {
                  await atlasApi.saveNote({
                    courseId: course.id,
                    body: courseNote.trim(),
                  });
                  setCourseNote("");
                  setCourse(await atlasApi.getCourse(course.id));
                }}
              >
                Guardar nota
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {course.notes.map((note) => (
                <div key={note.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm leading-6 text-slate-200">{note.body}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        await atlasApi.deleteNote(note.id);
                        setCourse(await atlasApi.getCourse(course.id));
                      }}
                      className="text-slate-500 transition hover:text-white"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
