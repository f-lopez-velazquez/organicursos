import { Compass, Sparkles } from "lucide-react";
import { productConfig } from "@/config/product";

export function AppBootScreen() {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-[#050b12] px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(91,214,190,0.18),transparent_32%),radial-gradient(circle_at_82%_14%,rgba(215,181,113,0.14),transparent_20%),linear-gradient(180deg,#08131b_0%,#04070b_100%)]" />

      <div className="relative w-full max-w-2xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 shadow-[0_36px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.5rem] border border-white/10 bg-[linear-gradient(145deg,rgba(91,214,190,0.22),rgba(16,22,32,0.92))] text-[#dffcf6] shadow-glow">
            <Compass className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{productConfig.name}</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">Preparando tu espacio de estudio</h1>
          </div>
        </div>

        <div className="mt-8 space-y-5">
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div className="loading-sheen h-full w-1/3 rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff,#d7b571)]" />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {[
              "Cargando tus cursos y avances",
              "Ordenando lo que dejaste pendiente",
              "Dejando todo listo para continuar",
            ].map((label) => (
              <div key={label} className="rounded-[1.4rem] border border-white/10 bg-white/[0.03] px-4 py-4">
                <div className="flex items-center gap-2 text-[#dffcf6]">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-sm font-medium text-white">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
