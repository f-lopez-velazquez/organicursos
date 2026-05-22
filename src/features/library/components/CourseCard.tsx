import { Clock3, PlayCircle, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { formatPercent, getProgressMessage, getProgressStage } from "@/features/player/services/player-utils";
import { applyLocalFileUrlFallback, toAppFileUrl } from "@/lib/utils/file-url";
import type { CourseCard as CourseCardType } from "@/types/domain";

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function courseInitials(title: string) {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase() ?? "")
    .join("");
}

export function CourseCard({ course }: { course: CourseCardType }) {
  const coverUrl = toAppFileUrl(course.coverPath);
  const progressStage = getProgressStage(course.progressPercent);

  return (
    <Link
      to={`/courses/${course.id}`}
      className="group overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] transition duration-300 ease-soft hover:-translate-y-1 hover:border-[#5bd6be]/30 hover:shadow-[0_22px_80px_rgba(8,16,24,0.45)]"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-[linear-gradient(160deg,rgba(16,96,133,0.45),rgba(12,18,26,0.92))]">
        {coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              onError={(event) => applyLocalFileUrlFallback(event, course.coverPath)}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,10,14,0.06),rgba(6,10,14,0.88))]" />
          </>
        ) : (
          <>
            <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(46,107,216,0.34),rgba(18,26,38,0.98))]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(91,214,190,0.28),transparent_42%)]" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-[28px] border border-white/12 bg-white/[0.06] px-5 py-3 text-3xl font-semibold tracking-[0.16em] text-white/88">
                {courseInitials(course.title)}
              </div>
            </div>
          </>
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(91,214,190,0.4),transparent_38%)]" />
        <div className="absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(215,181,113,0.14),transparent)]" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="flex items-center justify-between">
            <Badge>{course.category ?? course.inferredCategory ?? "General"}</Badge>
            {course.isFavorite ? <Star className="h-4 w-4 fill-accent-gold text-accent-gold" /> : null}
          </div>
          <h3 title={course.title} className="mt-3 line-clamp-2 text-balance text-lg font-semibold text-white xl:text-[1.18rem]">
            {course.title}
          </h3>
          <p className="mt-1 line-clamp-1 text-sm text-slate-200/80">
            {course.subtitle ?? course.suggestedDescription ?? "Curso local indexado y listo para retomar con precision."}
          </p>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em] text-slate-500">
          <span>{course.difficulty ?? course.inferredDifficulty ?? "Curado"}</span>
          <span>{course.isFavorite ? "Guardado" : "Catalogado"}</span>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-400">
          <span className="inline-flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            {course.lessonCount} lecciones
          </span>
          <span className="inline-flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            {formatDuration(course.totalDurationSeconds)}
          </span>
        </div>

        <div>
          <div className="h-1.5 rounded-full bg-white/5">
            <div className="h-1.5 rounded-full bg-atlas-400 transition-all" style={{ width: `${course.progressPercent}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <p className="text-slate-300">{`${formatPercent(course.progressPercent)}% del curso`}</p>
            <span className="text-slate-500">{progressStage}</span>
          </div>
          <p className="mt-1.5 line-clamp-1 text-sm text-slate-500">{getProgressMessage(course.progressPercent)}</p>
        </div>
      </div>
    </Link>
  );
}
