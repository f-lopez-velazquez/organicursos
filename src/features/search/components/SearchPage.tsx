import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { runHybridSearch } from "@/features/search/services/hybrid-search";
import { useAppStore } from "@/store/app-store";
import type { SearchQueryInput, SearchResult } from "@/types/domain";

type SearchFilters = NonNullable<SearchQueryInput["filters"]>;

const defaultFilters: SearchFilters = {
  category: "",
  difficulty: "",
  progressState: undefined,
  favoriteOnly: false,
  entityType: undefined,
  fileType: "",
};

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState(defaultFilters);
  const settings = useAppStore((state) => state.settings);
  const courses = useAppStore((state) => state.courses);

  const categories = useMemo(
    () => Array.from(new Set(courses.map((course) => course.category).filter(Boolean))).sort(),
    [courses],
  );

  const handleSearch = async () => {
    setLoading(true);
    const next = await runHybridSearch(query, settings, filters);
    setResults(next);
    setLoading(false);
  };

  const targetFor = (result: SearchResult) => {
    if (result.lessonId) {
      return `/lessons/${result.lessonId}`;
    }
    if (result.courseId) {
      return `/courses/${result.courseId}`;
    }
    return "/library";
  };

  return (
    <div className="space-y-6">
      <section className="glass-panel p-6">
        <p className="text-sm text-slate-400">Busqueda textual e hibrida</p>
        <h2 className="mt-1 text-3xl font-semibold text-white">Texto + semantica local</h2>
        <div className="mt-6 flex flex-col gap-3 md:flex-row">
          <div className="flex flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent text-white outline-none placeholder:text-slate-500"
              placeholder="la clase donde explican async await"
            />
          </div>
          <Button onClick={() => void handleSearch()} disabled={loading || query.trim().length < 2}>
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={filters.category}
            onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none"
          >
            <option value="">Todas las categorias</option>
            {categories.map((category) => (
              <option key={category} value={category ?? ""}>
                {category}
              </option>
            ))}
          </select>

          <select
            value={filters.difficulty ?? ""}
            onChange={(event) => setFilters((current) => ({ ...current, difficulty: event.target.value }))}
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none"
          >
            <option value="">Todas las dificultades</option>
            <option value="Principiante">Principiante</option>
            <option value="Intermedio">Intermedio</option>
            <option value="Avanzado">Avanzado</option>
          </select>

          <select
            value={filters.progressState ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                progressState: (event.target.value || undefined) as SearchFilters["progressState"],
              }))
            }
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none"
          >
            <option value="">Cualquier progreso</option>
            <option value="new">Sin empezar</option>
            <option value="in_progress">En curso</option>
            <option value="completed">Completado</option>
          </select>

          <select
            value={filters.entityType ?? ""}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                entityType: (event.target.value || undefined) as SearchFilters["entityType"],
              }))
            }
            className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200 outline-none"
          >
            <option value="">Todos los tipos</option>
            <option value="course">Cursos</option>
            <option value="lesson">Lecciones</option>
            <option value="asset">Assets</option>
            <option value="note">Notas</option>
          </select>

          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={filters.favoriteOnly}
              onChange={(event) => setFilters((current) => ({ ...current, favoriteOnly: event.target.checked }))}
            />
            Solo favoritos
          </label>
        </div>
      </section>

      <section className="space-y-4">
        {results.map((result) => (
          <Link key={`${result.entityType}-${result.entityId}`} to={targetFor(result)} className="block glass-panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">{result.entityType}</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{result.title}</h3>
                <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-300" dangerouslySetInnerHTML={{ __html: result.snippet }} />
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
                score {result.score.toFixed(2)}
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
