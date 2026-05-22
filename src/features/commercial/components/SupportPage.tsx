import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { productConfig } from "@/config/product";
import { atlasApi } from "@/lib/api/atlas-api";
import { openExternal } from "@/lib/utils/open-external";
import { useAppStore } from "@/store/app-store";
import type { StorageOverview } from "@/types/domain";

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 MB";
  }

  const value = bytes / (1024 * 1024);
  return `${value.toFixed(value > 99 ? 0 : 1)} MB`;
}

export function SupportPage() {
  const licenseState = useAppStore((state) => state.licenseState);
  const operationalProfile = useAppStore((state) => state.operationalProfile);
  const [storage, setStorage] = useState<StorageOverview | null>(null);

  useEffect(() => {
    void atlasApi.getStorageOverview().then(setStorage);
  }, []);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
      <section className="space-y-6">
        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Soporte operativo</p>
          <h2 className="mt-1 text-3xl font-semibold text-white">Ayuda, diagnostico y recuperacion</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            Usa esta vista para preparar tickets de soporte, revisar el estado local y respaldar la biblioteca antes de moverla
            entre equipos.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => openExternal(`mailto:${productConfig.supportEmail}`)}>
              Escribir a soporte
            </Button>
            <Button variant="ghost" onClick={() => openExternal(productConfig.supportUrl)}>
              Abrir centro de ayuda
            </Button>
          </div>
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Perfil tecnico</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Version</p>
              <p className="mt-2 text-white">{operationalProfile?.version ?? __APP_VERSION__}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Edicion</p>
              <p className="mt-2 text-white">{licenseState?.edition ?? "Community"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Identificador</p>
              <p className="mt-2 break-all text-white">{operationalProfile?.identifier ?? "..."}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Plataforma</p>
              <p className="mt-2 text-white">
                {operationalProfile ? `${operationalProfile.platform} / ${operationalProfile.arch}` : "..."}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Modo de datos</p>
              <p className="mt-2 text-white">{operationalProfile?.portableMode ? "Portatil" : "Instalacion normal"}</p>
            </div>
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Rutas locales</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p className="break-all">Datos: {storage?.appDataDir ?? operationalProfile?.appDataDir ?? "..."}</p>
            <p className="break-all">Cache: {storage?.cacheDir ?? operationalProfile?.cacheDir ?? "..."}</p>
            <p className="break-all">Base SQLite: {operationalProfile?.databasePath ?? "..."}</p>
          </div>
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Consumo local</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Base de datos: {storage ? formatBytes(storage.databaseBytes) : "..."}</p>
            <p>Miniaturas: {storage ? formatBytes(storage.thumbnailCacheBytes) : "..."}</p>
            <p>Portadas importadas: {storage ? formatBytes(storage.importedCoverBytes) : "..."}</p>
            <p>sqlite-vec: {operationalProfile?.vectorEnabled ? "Disponible" : "No disponible"}</p>
          </div>
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Playbook rapido</p>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <p>1. Exporta un respaldo desde Ajustes antes de mover bibliotecas o reinstalar.</p>
            <p>2. Si cambian rutas de disco, reindexa la biblioteca para relinkear por huella.</p>
            <p>3. Si falla la busqueda semantica, verifica `sqlite-vec` y ejecuta reindexacion de embeddings.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
