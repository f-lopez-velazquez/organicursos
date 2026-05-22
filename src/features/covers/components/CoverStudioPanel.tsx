import { open } from "@tauri-apps/plugin-dialog";
import { Download, ImagePlus, RefreshCcw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { coverEnrichmentService } from "@/features/covers/services/cover-enrichment";
import { atlasApi } from "@/lib/api/atlas-api";
import { cn } from "@/lib/utils/cn";
import { applyLocalFileUrlFallback, toAppFileUrl } from "@/lib/utils/file-url";
import type { CoverCandidate, RemoteCoverSuggestion } from "@/types/domain";

interface CoverStudioPanelProps {
  courseId: number;
  courseTitle: string;
  category?: string | null;
  tags?: string[];
  canUseInternet: boolean;
  provider: string;
  onCoverUpdated: () => Promise<void>;
  onClose?: () => void;
}

export function CoverStudioPanel({
  courseId,
  courseTitle,
  category,
  tags,
  canUseInternet,
  provider,
  onCoverUpdated,
  onClose,
}: CoverStudioPanelProps) {
  const [candidates, setCandidates] = useState<CoverCandidate[]>([]);
  const [remoteSuggestions, setRemoteSuggestions] = useState<RemoteCoverSuggestion[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [showAllLocal, setShowAllLocal] = useState(false);

  const loadCandidates = async () => {
    setLoadingCandidates(true);
    try {
      setCandidates(await atlasApi.listCoverCandidates(courseId));
    } finally {
      setLoadingCandidates(false);
    }
  };

  useEffect(() => {
    void loadCandidates();
  }, [courseId]);

  const uniqueCandidates = useMemo(() => {
    const seen = new Set<string>();
    return candidates.filter((candidate) => {
      const key = candidate.localPath ?? candidate.remoteUrl ?? `${candidate.source}-${candidate.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [candidates]);

  const selectedCandidate = uniqueCandidates.find((candidate) => candidate.status === "selected") ?? uniqueCandidates[0] ?? null;
  const localCandidates = showAllLocal ? uniqueCandidates : uniqueCandidates.slice(0, 4);

  return (
    <section className="glass-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-4 w-4" />
            <h3 className="text-xl font-semibold">Portada del curso</h3>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
            Elige la imagen que mejor represente este curso. Si no te convence la primera, puedes probar otra sin tocar tus archivos.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {onClose ? (
            <Button variant="ghost" className="gap-2" onClick={onClose}>
              <X className="h-4 w-4" />
              Cerrar
            </Button>
          ) : null}
          <Button
            variant="secondary"
            className="gap-2"
            onClick={async () => {
              const selected = await open({
                multiple: false,
                filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp"] }],
                title: "Selecciona una portada para OrganiCursos",
              });
              if (!selected || Array.isArray(selected)) {
                return;
              }

              await atlasApi.importLocalCover(courseId, selected);
              await loadCandidates();
            }}
          >
            <ImagePlus className="h-4 w-4" />
            Importar imagen
          </Button>

          <Button variant="ghost" className="gap-2" onClick={() => void loadCandidates()} disabled={loadingCandidates}>
            <RefreshCcw className="h-4 w-4" />
            Recargar
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <div className="rounded-[30px] border border-white/10 bg-white/[0.025] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-400">Vista principal</p>
            {selectedCandidate ? <Badge>{selectedCandidate.status === "selected" ? "En uso" : "Sugerida"}</Badge> : null}
          </div>

          <div className="mt-4 overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(160deg,rgba(46,107,216,0.35),rgba(8,11,16,0.9))]">
            {selectedCandidate?.localPath || selectedCandidate?.remoteUrl ? (
              <img
                src={toAppFileUrl(selectedCandidate.localPath) ?? selectedCandidate.remoteUrl ?? undefined}
                alt=""
                className="aspect-[16/9] w-full object-cover"
                onError={(event) => applyLocalFileUrlFallback(event, selectedCandidate.localPath)}
              />
            ) : (
              <div className="flex aspect-[16/9] items-center justify-center text-sm text-slate-500">Vista previa no disponible</div>
            )}
          </div>

          {selectedCandidate ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{selectedCandidate.source}</Badge>
                  {selectedCandidate.source === "generated-local" ? <Badge>Selección automática</Badge> : null}
                </div>
                <p className="text-sm leading-6 text-slate-400">
                  {selectedCandidate.attribution ??
                    (selectedCandidate.source === "generated-local"
                      ? "Tomada automáticamente del mejor inicio del video."
                      : "Lista para usar en este curso.")}
                </p>
              </div>

              <Button
                className="gap-2"
                disabled={selectedCandidate.status === "selected"}
                onClick={async () => {
                  await atlasApi.selectCoverCandidate(selectedCandidate.id);
                  await loadCandidates();
                  await onCoverUpdated();
                }}
              >
                <Download className="h-4 w-4" />
                {selectedCandidate.status === "selected" ? "Ya está activa" : "Usar esta portada"}
              </Button>
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-400">Más opciones</p>
            {uniqueCandidates.length > 4 ? (
              <button
                type="button"
                onClick={() => setShowAllLocal((current) => !current)}
                className="text-sm text-slate-400 transition hover:text-white"
              >
                {showAllLocal ? "Mostrar menos" : `Ver ${uniqueCandidates.length} opciones`}
              </button>
            ) : null}
          </div>

          {loadingCandidates ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-5 text-sm text-slate-500">
              Cargando portadas...
            </div>
          ) : localCandidates.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              {localCandidates.map((candidate) => {
                const imageUrl = toAppFileUrl(candidate.localPath) ?? candidate.remoteUrl;
                const isActive = selectedCandidate?.id === candidate.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={async () => {
                      await atlasApi.selectCoverCandidate(candidate.id);
                      await loadCandidates();
                      await onCoverUpdated();
                    }}
                    className={cn(
                      "overflow-hidden rounded-[22px] border text-left transition duration-200 ease-soft",
                      isActive ? "border-[#5bd6be]/45 bg-white/[0.06]" : "border-white/10 bg-white/[0.025] hover:border-white/20",
                    )}
                  >
                    <div className="h-28 bg-[linear-gradient(160deg,rgba(46,107,216,0.35),rgba(8,11,16,0.9))]">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(event) => applyLocalFileUrlFallback(event, candidate.localPath)}
                        />
                      ) : null}
                    </div>
                    <div className="space-y-2 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{candidate.source}</Badge>
                        {candidate.status === "selected" ? <Badge tone="success">Activa</Badge> : null}
                      </div>
                      <p className="text-xs leading-5 text-slate-400">
                        {candidate.source === "generated-local" ? "Elegida automáticamente" : "Lista para usar"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-5 text-sm text-slate-500">
              Todavía no hay opciones guardadas para este curso.
            </div>
          )}
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Sugerencias por internet</p>
              <p className="mt-1 text-xs text-slate-500">Solo se consultan cuando tú lo pides.</p>
            </div>
            <Button
              variant="secondary"
              disabled={!canUseInternet || loadingRemote}
              onClick={async () => {
                setLoadingRemote(true);
                try {
                  const next = await coverEnrichmentService.searchCourseCoverSuggestions({
                    title: courseTitle,
                    category,
                    tags,
                    provider,
                  });
                  setRemoteSuggestions(next);
                } finally {
                  setLoadingRemote(false);
                }
              }}
            >
              {canUseInternet ? "Buscar ideas" : "Modo offline"}
            </Button>
          </div>

          {remoteSuggestions.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {remoteSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="rounded-[22px] border border-white/10 bg-white/[0.025] p-3">
                  <div className="flex gap-3">
                    <img src={suggestion.previewUrl} alt="" className="h-20 w-28 rounded-2xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="truncate font-medium text-white">{suggestion.title}</p>
                        <Badge>{`${Math.round(suggestion.score * 100)}%`}</Badge>
                      </div>
                      {suggestion.attribution ? <p className="mt-2 text-sm text-slate-400">{suggestion.attribution}</p> : null}
                      <div className="mt-3">
                        <Button
                          className="gap-2"
                          onClick={async () => {
                            await atlasApi.cacheRemoteCoverCandidate({
                              courseId,
                              remoteUrl: suggestion.remoteUrl,
                              source: suggestion.provider,
                              attribution: suggestion.attribution,
                              score: suggestion.score,
                            });
                            await loadCandidates();
                          }}
                        >
                          Guardar para este curso
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-5 text-sm leading-6 text-slate-500">
              {canUseInternet ? "Si quieres otra estética, aquí puedes buscar opciones externas y guardarlas localmente." : "Las búsquedas externas están apagadas en este momento."}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
