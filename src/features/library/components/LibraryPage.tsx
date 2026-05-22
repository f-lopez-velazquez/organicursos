import { AlertTriangle, BrainCircuit, HardDrive, LayoutGrid, List, RefreshCcw, Server, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CourseCard } from "@/features/library/components/CourseCard";
import {
  formatPercent,
  formatPlaybackTime,
  getProgressMessage,
  getProgressStage,
} from "@/features/player/services/player-utils";
import { atlasApi } from "@/lib/api/atlas-api";
import { cn } from "@/lib/utils/cn";
import { applyLocalFileUrlFallback, toAppFileUrl } from "@/lib/utils/file-url";
import { useViewportProfile } from "@/lib/utils/viewport-profile";
import { useAppStore } from "@/store/app-store";
import type { CourseCard as CourseCardType } from "@/types/domain";

type ViewMode = "grid" | "list" | "ai-groups";
type SortMode = "recent" | "title" | "progress";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(seconds: number) {
  return formatPlaybackTime(seconds);
}

function deriveAiGroup(course: CourseCardType) {
  return course.category ?? course.inferredCategory ?? "Sin clasificar";
}

function deriveDifficulty(course: CourseCardType) {
  return course.difficulty ?? course.inferredDifficulty ?? "Curado";
}

function deriveProgressLane(course: CourseCardType) {
  if (course.progressPercent >= 100) {
    return "Terminados";
  }

  if (course.progressPercent >= 75) {
    return "Por cerrar";
  }

  if (course.progressPercent > 0) {
    return "En ritmo";
  }

  return "Por empezar";
}

function sortCourses(courses: CourseCardType[], sortMode: SortMode) {
  return [...courses].sort((left, right) => {
    if (sortMode === "title") {
      return left.title.localeCompare(right.title, "es");
    }

    if (sortMode === "progress") {
      return right.progressPercent - left.progressPercent;
    }

    return new Date(right.lastViewedAt ?? 0).getTime() - new Date(left.lastViewedAt ?? 0).getTime();
  });
}

function CourseRow({ course }: { course: CourseCardType }) {
  const coverUrl = toAppFileUrl(course.coverPath);
  const progressStage = getProgressStage(course.progressPercent);

  return (
    <Link
      to={`/courses/${course.id}`}
      className="rounded-[28px] border border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-4 transition duration-200 ease-soft hover:border-[#5bd6be]/30 hover:bg-white/[0.05]"
    >
      <div className="grid gap-4 lg:grid-cols-[132px,minmax(0,1fr),150px] lg:items-center">
        <div className="h-24 w-full overflow-hidden rounded-[22px] bg-[linear-gradient(160deg,rgba(16,96,133,0.45),rgba(12,18,26,0.92))] lg:w-40">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={(event) => applyLocalFileUrlFallback(event, course.coverPath)}
            />
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{deriveAiGroup(course)}</Badge>
            <Badge tone={course.progressPercent >= 92 ? "success" : "default"}>{deriveDifficulty(course)}</Badge>
            <Badge tone={course.progressPercent >= 100 ? "success" : "default"}>{progressStage}</Badge>
          </div>
          <h3 className="mt-3 line-clamp-2 text-xl font-semibold text-white">{course.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-300">
            {course.subtitle ?? course.suggestedDescription ?? "Curso local listo para retomar con progreso persistente."}
          </p>
        </div>

        <div className="min-w-0 space-y-3 text-sm text-slate-400 lg:text-right">
          <p>{course.lessonCount} lecciones</p>
          <p>{formatDuration(course.totalDurationSeconds)}</p>
          <div>
            <div className="h-2 rounded-full bg-white/5">
              <div className="h-2 rounded-full bg-atlas-400" style={{ width: `${course.progressPercent}%` }} />
            </div>
            <p className="mt-2">{formatPercent(course.progressPercent)}% del curso</p>
            <p className="mt-1 text-xs text-slate-500">{getProgressMessage(course.progressPercent)}</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function LibraryPage() {
  const viewport = useViewportProfile();
  const { courses, indexing, jobs, libraries, settings, refreshLibrary } = useAppStore();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  const activeTargets = useMemo(
    () =>
      new Map(
        jobs
          .filter((job) => (job.status === "queued" || job.status === "running") && job.target)
          .map((job) => [job.target ?? "", job] as const),
      ),
    [jobs],
  );
  const activeJob = useMemo(
    () => jobs.find((job) => job.status === "queued" || job.status === "running") ?? null,
    [jobs],
  );
  const latestImportJob = useMemo(
    () =>
      jobs.find((job) =>
        ["index_library", "reindex_library"].includes(job.kind) &&
        ["queued", "running", "completed", "failed"].includes(job.status),
      ) ?? null,
    [jobs],
  );

  const sortedCourses = useMemo(() => sortCourses(courses, sortMode), [courses, sortMode]);

  const aiGroups = useMemo(() => {
    const groups = new Map<string, Map<string, CourseCardType[]>>();
    for (const course of sortedCourses) {
      const key = deriveAiGroup(course);
      const subgroup = deriveProgressLane(course);
      const nextGroup = groups.get(key) ?? new Map<string, CourseCardType[]>();
      nextGroup.set(subgroup, [...(nextGroup.get(subgroup) ?? []), course]);
      groups.set(key, nextGroup);
    }
    return [...groups.entries()]
      .map(([group, subgroups]) => ({
        group,
        total: [...subgroups.values()].reduce((total, items) => total + items.length, 0),
        subgroups: [...subgroups.entries()].sort((left, right) => right[1].length - left[1].length),
      }))
      .sort((left, right) => right.total - left.total);
  }, [sortedCourses]);
  const cardGridClass =
    viewport.mode === "wide"
      ? "grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
      : viewport.mode === "balanced"
        ? `grid ${settings?.cardDensity === "compact" ? "gap-4" : "gap-5"} md:grid-cols-2 xl:grid-cols-3`
        : "grid gap-4 sm:grid-cols-2";

  const handleReindexLibrary = async (libraryId: number, rootPath: string) => {
    setPendingTarget(rootPath);
    try {
      await atlasApi.reindexLibrary(libraryId);
      await refreshLibrary();
    } finally {
      setPendingTarget(null);
    }
  };

  const handleReindexAll = async () => {
    setPendingTarget("__all__");
    try {
      await atlasApi.reindexAllLibraries();
      await refreshLibrary();
    } finally {
      setPendingTarget(null);
    }
  };

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-slate-400">Biblioteca</p>
          <h2 className="mt-1 text-balance text-3xl font-semibold tracking-tight text-white">Todo tu material en un solo lugar</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
              <div className="max-w-full truncate rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-400">
            Todo se ordena en segundo plano
          </div>
          <Button
            variant="secondary"
            disabled={
              libraries.length === 0 ||
              indexing ||
              pendingTarget === "__all__" ||
              libraries.every((library) => !library.isAvailable)
            }
            onClick={() => void handleReindexAll()}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            Reindexar todo
          </Button>
        </div>
      </div>

      <section className="glass-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Carpetas activas</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Lugares que estas usando</h3>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-400">
            {libraries.length} biblioteca{libraries.length === 1 ? "" : "s"}
          </div>
        </div>

        {libraries.length > 0 ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {libraries.map((library) => {
              const currentJob = activeTargets.get(library.rootPath) ?? null;
              const isRunning = Boolean(currentJob) || pendingTarget === library.rootPath;
              const isUnavailable = !library.isAvailable;
              return (
                <div
                  key={library.id}
                  className={cn(
                    "rounded-[28px] border p-5 transition duration-200 ease-soft",
                    isUnavailable && !isRunning && "border-amber-400/25 bg-[linear-gradient(155deg,rgba(245,158,11,0.08),rgba(255,255,255,0.02))]",
                    isRunning
                      ? "border-[#5bd6be]/30 bg-[linear-gradient(155deg,rgba(91,214,190,0.08),rgba(255,255,255,0.02))]"
                      : "border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))]",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Server className="h-4 w-4 text-[#5bd6be]" />
                        <p className="truncate text-base font-semibold text-white">{library.name}</p>
                      </div>
                      <p className="mt-2 break-all text-sm leading-6 text-slate-400">{library.rootPath}</p>
                    </div>
                    <div
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-semibold",
                        isRunning
                          ? "bg-[#5bd6be]/15 text-[#d7fff6]"
                          : isUnavailable
                            ? "bg-amber-400/15 text-amber-100"
                            : "bg-white/6 text-slate-300",
                      )}
                    >
                      {isRunning ? `${Math.round(currentJob?.progress ?? 0)}%` : isUnavailable ? "Desconectada" : "Lista"}
                    </div>
                  </div>

                  {isUnavailable ? (
                    <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-50">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                        <div className="space-y-1">
                          <p className="font-medium">La biblioteca no esta disponible en este momento.</p>
                          <p className="text-amber-100/80">
                            {library.availabilityMessage ?? "Conecta el disco externo con la misma ruta antes de reindexar o abrir clases."}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {isRunning ? (
                    <div className="mt-4">
                      <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                        <span>{currentJob?.message ?? "Importando y organizando el contenido"}</span>
                        <span>{`${Math.round(currentJob?.progress ?? 0)}%`}</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/6">
                        <div
                          className="h-2 rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff)] transition-all"
                          style={{ width: `${currentJob?.progress ?? 0}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1 text-sm text-slate-400">
                      <p>Ultima actualizacion: {formatDate(library.updatedAt)}</p>
                      <p className="flex items-center gap-2">
                        <HardDrive className={cn("h-4 w-4", isUnavailable ? "text-amber-200" : "text-[#5bd6be]")} />
                        {library.isOfflineOnly ? "Solo en este equipo" : "Disponible sin depender de internet"}
                      </p>
                    </div>
                    <Button
                      variant={isRunning ? "ghost" : "secondary"}
                      disabled={isRunning || isUnavailable}
                      onClick={() => void handleReindexLibrary(library.id, library.rootPath)}
                    >
                      <RefreshCcw className="mr-2 h-4 w-4" />
                      Reindexar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-5 rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] p-6 text-sm leading-6 text-slate-400">
            Todavia no hay carpetas registradas. Agrega una desde la barra lateral y podras actualizarla despues sin volver a elegirla.
          </div>
        )}
      </section>

      {activeJob ? (
        <div className="glass-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">Importando tu biblioteca</p>
              <p className="mt-1 text-sm text-slate-400">{activeJob.message ?? "Ordenando cursos, clases y materiales"}</p>
            </div>
            <Badge>{`${Math.round(activeJob.progress)}%`}</Badge>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/6">
            <div
              className="h-2 rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff)] transition-all"
              style={{ width: `${activeJob.progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {!activeJob && latestImportJob ? (
        <div className="glass-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-white">
                {latestImportJob.status === "failed" ? "La ultima importacion no termino bien" : "Ultimo resultado de importacion"}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                {latestImportJob.message ?? "La biblioteca ya esta revisada."}
              </p>
            </div>
            <Badge tone={latestImportJob.status === "failed" ? "warning" : "default"}>
              {latestImportJob.status === "failed" ? "Revisar" : "Listo"}
            </Badge>
          </div>
        </div>
      ) : null}

      {courses.length > 0 ? (
        <section className="space-y-4">

          <div className="glass-panel flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Sparkles className="h-4 w-4 text-[#d7b571]" />
                Tu biblioteca ya esta ordenada y lista para recorrer.
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Elige la vista que te deje encontrar antes lo que quieres seguir.</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
                {[
                  { id: "grid", label: "Grid", icon: LayoutGrid },
                  { id: "list", label: "Lista", icon: List },
                  { id: "ai-groups", label: "Grupos", icon: BrainCircuit },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setViewMode(id as ViewMode)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                      viewMode === id ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>

              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none"
              >
                <option value="recent">Mas recientes</option>
                <option value="title">Titulo</option>
                <option value="progress">Mayor avance</option>
              </select>
            </div>
          </div>

          {viewMode === "grid" ? (
            <div className={cardGridClass}>
              {sortedCourses.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          ) : null}

          {viewMode === "list" ? (
            <div className="space-y-4">
              {sortedCourses.map((course) => (
                <CourseRow key={course.id} course={course} />
              ))}
            </div>
          ) : null}

          {viewMode === "ai-groups" ? (
            <div className="space-y-6">
              {aiGroups.map(({ group, total, subgroups }) => (
                <section key={group} className="glass-panel p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <BrainCircuit className="h-4 w-4 text-[#5bd6be]" />
                        <h3 className="text-xl font-semibold text-white">{group}</h3>
                      </div>
                      <p className="mt-2 text-sm text-slate-400">
                        Organizado por tema y por momento de avance para decidir rapido que quieres continuar o cerrar.
                      </p>
                    </div>
                    <Badge>{`${total} cursos`}</Badge>
                  </div>
                  <div className="mt-5 space-y-5">
                    {subgroups.map(([subgroup, groupCourses]) => (
                      <div key={`${group}-${subgroup}`} className="rounded-[28px] border border-white/10 bg-white/[0.02] p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-white">{subgroup}</p>
                            <p className="mt-1 text-sm text-slate-500">
                              {subgroup === "Terminados"
                                ? "Listos para volver cuando quieras."
                                : subgroup === "Por cerrar"
                                  ? "Te falta muy poco para completarlos."
                                  : subgroup === "En ritmo"
                                    ? "Ya estan en marcha y vale la pena seguirlos."
                                    : "Todavia no los empiezas."}
                            </p>
                          </div>
                          <Badge>{`${groupCourses.length} cursos`}</Badge>
                        </div>
                        <div className={cardGridClass}>
                          {groupCourses.map((course) => (
                            <CourseCard key={course.id} course={course} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </section>
      ) : (
        <div className="glass-panel p-10">
          <p className="text-sm uppercase tracking-[0.26em] text-slate-500">Biblioteca vacia</p>
          <h3 className="mt-3 text-2xl font-semibold text-white">Aun no has agregado carpetas</h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Agrega una o varias carpetas desde la barra lateral. OrganiCursos encontrara clases, documentos y subtitulos para armar tu biblioteca.
          </p>
        </div>
      )}
    </div>
  );
}
