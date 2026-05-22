import { HeartHandshake, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { productConfig } from "@/config/product";
import { useSubtleDonationPrompt } from "@/features/commercial/hooks/useSubtleDonationPrompt";
import { formatPercent, formatPlaybackTime } from "@/features/player/services/player-utils";
import { atlasApi } from "@/lib/api/atlas-api";
import { openExternal } from "@/lib/utils/open-external";
import { applyLocalFileUrlFallback, toAppFileUrl } from "@/lib/utils/file-url";
import { useViewportProfile } from "@/lib/utils/viewport-profile";
import { cn } from "@/lib/utils/cn";
import { useAppStore } from "@/store/app-store";

function progressMessage(progressPercent: number) {
  if (progressPercent >= 92) {
    return "Lista";
  }
  if (progressPercent >= 50) {
    return "Vas muy bien";
  }
  if (progressPercent > 0) {
    return "Ya empezaste";
  }
  return "Por empezar";
}

export function DashboardPage() {
  const { dashboard, loading, refreshLibrary, licenseState } = useAppStore();
  const { shouldShow, dismiss } = useSubtleDonationPrompt();
  const viewport = useViewportProfile();
  const statsGridClass =
    viewport.mode === "wide"
      ? "grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      : viewport.mode === "compact"
        ? "grid gap-4 sm:grid-cols-2"
        : "grid gap-4 sm:grid-cols-2 xl:grid-cols-4";
  const focusGridStyle =
    viewport.mode === "wide"
      ? { gridTemplateColumns: "minmax(0,1.55fr) minmax(320px,0.62fr)" }
      : viewport.mode === "compact"
        ? undefined
        : { gridTemplateColumns: "minmax(0,1.35fr) minmax(290px,0.72fr)" };

  if (!dashboard && loading) {
    return (
      <div className={statsGridClass}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-36" />
        ))}
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  if (dashboard.stats.activeLibraries === 0) {
    return (
      <div className="space-y-6 overflow-x-hidden">
        <section className="glass-panel overflow-hidden p-8 lg:p-10">
          <p className="text-sm uppercase tracking-[0.26em] text-slate-500">Bienvenida</p>
          <h2 className="mt-3 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-white lg:text-4xl">
            Convierte tus carpetas en una biblioteca clara, bonita y facil de continuar
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">
            Agrega la carpeta donde guardas tus cursos, clases o series y {productConfig.name} se encargara de ordenar
            videos, documentos, subtitulos y progreso sin mover tus archivos.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              onClick={async () => {
                const folder = await atlasApi.addLibraryFolder();
                if (folder) {
                  await refreshLibrary();
                }
              }}
            >
              Agregar mi primera carpeta
            </Button>
            <Link
              to="/privacy"
              className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/[0.08]"
            >
              Ver privacidad
            </Link>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="glass-panel p-6">
            <Badge>Orden</Badge>
            <h3 className="mt-4 text-xl font-semibold text-white">Tus cursos, bien acomodados</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Detecta clases, materiales y subtitulos para que no tengas que buscar archivo por archivo.
            </p>
          </div>
          <div className="glass-panel p-6">
            <Badge>Avance</Badge>
            <h3 className="mt-4 text-xl font-semibold text-white">Retoma al instante</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Guarda donde te quedaste y vuelve justo al mismo punto cuando regreses.
            </p>
          </div>
          <div className="glass-panel p-6">
            <Badge>Ayuda local</Badge>
            <h3 className="mt-4 text-xl font-semibold text-white">Encuentra mas rapido</h3>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Sugiere categorias y agrupaciones para que tu biblioteca sea mas facil de recorrer.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6 overflow-x-hidden">
      {shouldShow ? (
        <section className="glass-panel overflow-hidden border-[#d7b571]/15 bg-[linear-gradient(155deg,rgba(215,181,113,0.12),rgba(255,255,255,0.02))] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-[#f6deb0]">
                <HeartHandshake className="h-4 w-4" />
                <p className="text-sm font-medium">Si te esta sirviendo, puedes apoyar su mantenimiento</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Cada donativo ayuda a mantener mejoras y correcciones para que estudiar aqui siga siendo comodo.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => dismiss(14)}>
                Mas tarde
              </Button>
              <Button onClick={() => openExternal(productConfig.donationUrl)}>Hacer donativo</Button>
            </div>
          </div>
        </section>
      ) : null}

      <section className={statsGridClass}>
        <StatCard label="Cursos" value={String(dashboard.stats.courses)} hint="Listos para abrir" />
        <StatCard label="Lecciones" value={String(dashboard.stats.lessons)} hint="Entre videos y materiales" />
        <StatCard label="Horas vistas" value={String(dashboard.stats.hoursWatched)} hint="Todo tu avance suma" />
        <StatCard label="Carpetas" value={String(dashboard.stats.activeLibraries)} hint="Fuentes activas" />
      </section>

      <section className={cn("grid gap-6", viewport.mode === "compact" ? "grid-cols-1" : "")} style={focusGridStyle}>
        <div className="glass-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-400">Seguir viendo</p>
              <h2 className="mt-1 text-balance text-2xl font-semibold text-white">Vuelve justo donde te quedaste</h2>
            </div>
            <Badge tone="success">Guardado automatico</Badge>
          </div>

          <div className="mt-6 space-y-3">
            {dashboard.continueWatching.map((lesson) => (
              <Link
                key={lesson.id}
                to={`/lessons/${lesson.id}`}
                className="group rounded-3xl border border-white/10 bg-white/[0.025] p-4 transition hover:bg-white/[0.05]"
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),170px] lg:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="h-16 w-28 shrink-0 overflow-hidden rounded-2xl bg-white/[0.04]">
                      {lesson.thumbnailPath ? (
                        <img
                          src={toAppFileUrl(lesson.thumbnailPath) ?? undefined}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(event) => applyLocalFileUrlFallback(event, lesson.thumbnailPath)}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-slate-500">Sin vista previa</div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium text-white">{lesson.title}</p>
                      <p className="mt-1 line-clamp-1 text-sm text-slate-400">{lesson.relativePath}</p>
                      <p className="mt-2 text-xs text-slate-500">{progressMessage(lesson.progressPercent)}</p>
                    </div>
                  </div>

                  <div className="min-w-0 lg:text-right">
                    <div className="h-2 rounded-full bg-white/5">
                      <div className="h-2 rounded-full bg-atlas-400" style={{ width: `${lesson.progressPercent}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{formatPercent(lesson.progressPercent)}% de esta clase</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6">
            <p className="text-sm text-slate-400">Favoritos</p>
            <h2 className="mt-1 text-balance text-2xl font-semibold text-white">Tus accesos rapidos</h2>
            <div className="mt-6 space-y-4">
              {dashboard.favoriteCourses.map((course) => (
                <Link
                  key={course.id}
                  to={`/courses/${course.id}`}
                  className="block rounded-3xl border border-white/10 bg-white/[0.025] px-5 py-4 transition hover:bg-white/[0.05]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{course.title}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-400">{course.subtitle}</p>
                    </div>
                    <Badge>{course.category ?? "Sin categoria"}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="glass-panel p-5">
            <p className="text-sm text-slate-400">Tu edicion</p>
            <p className="mt-2 text-lg font-semibold text-white">{licenseState?.edition ?? "Community"}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Todo esta pensado para que sigas aprendiendo incluso sin conexion.
            </p>
          </div>
        </div>
      </section>

      <section className={cn("grid gap-6", viewport.mode === "wide" ? "xl:grid-cols-2" : viewport.mode === "balanced" ? "lg:grid-cols-2" : "grid-cols-1")}>
        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Vistos hace poco</p>
          <div className="mt-5 space-y-3">
            {dashboard.recentlyViewed.map((lesson) => (
              <Link
                key={`viewed-${lesson.id}`}
                to={`/lessons/${lesson.id}`}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{lesson.title}</p>
                  <p className="mt-1 text-sm text-slate-400">{formatPlaybackTime(lesson.durationSeconds)}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{progressMessage(lesson.progressPercent)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-400">Recien agregados</p>
              <p className="mt-1 text-white">Siempre listos para empezar</p>
            </div>
            <Link to="/about" className="text-sm font-medium text-atlas-200 transition hover:text-white">
              Conocer la app
            </Link>
          </div>
          <div className="mt-5 space-y-3">
            {dashboard.recentlyAdded.map((lesson) => (
              <Link
                key={`added-${lesson.id}`}
                to={`/lessons/${lesson.id}`}
                className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <PlayCircle className="h-4 w-4 shrink-0 text-atlas-300" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{lesson.title}</p>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-400">{lesson.relativePath}</p>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-slate-500">{formatPlaybackTime(lesson.durationSeconds)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
