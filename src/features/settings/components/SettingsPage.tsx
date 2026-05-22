import { open, save } from "@tauri-apps/plugin-dialog";
import { AlertTriangle, Database, HardDriveDownload, HardDriveUpload, Image, Shield, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { localAiService } from "@/features/ai/services/local-ai";
import { atlasApi } from "@/lib/api/atlas-api";
import { useAppStore } from "@/store/app-store";
import type { StorageOverview } from "@/types/domain";

function formatBytes(bytes: number) {
  if (bytes <= 0) {
    return "0 MB";
  }
  const value = bytes / (1024 * 1024);
  return `${value.toFixed(value > 99 ? 0 : 1)} MB`;
}

function formatBackupMoment(value: string | null) {
  if (!value) {
    return "Aun no hay un respaldo automatico.";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type PendingAction =
  | "rebuild"
  | "reorder"
  | "reset-ai"
  | "export-backup"
  | "import-backup"
  | "clear-cache"
  | "factory-reset"
  | null;

export function SettingsPage() {
  const { settings, updateSettings, refreshLibrary, refreshSettings, refreshCommercialState, jobs, licenseState, setActivityLabel } = useAppStore();
  const [storage, setStorage] = useState<StorageOverview | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    void atlasApi.getStorageOverview().then(setStorage);
  }, []);

  if (!settings) {
    return null;
  }

  const refreshStorage = async () => {
    setStorage(await atlasApi.getStorageOverview());
  };

  const runAction = async (
    action: Exclude<PendingAction, null>,
    label: string,
    work: () => Promise<void>,
  ) => {
    setPendingAction(action);
    setStatusMessage(label);
    setActivityLabel(label);
    try {
      await work();
    } finally {
      setPendingAction(null);
      setActivityLabel(null);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
      <section className="space-y-6">
        <div className="glass-panel p-6">
          <div className="rounded-[28px] border border-[#d7b571]/15 bg-[linear-gradient(155deg,rgba(215,181,113,0.11),rgba(255,255,255,0.02))] p-5">
            <p className="text-sm font-medium text-white">Para que todo siga en orden</p>
            <p className="mt-2 text-sm leading-6 text-slate-200">
              Mantén en el mismo lugar la carpeta donde guardas tus clases. Si cambias de equipo o de lugar esos
              archivos, primero señala la carpeta nueva y luego importa tu respaldo para retomar exactamente donde te
              quedaste.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-2 text-white">
            <Shield className="h-4 w-4" />
            <h2 className="text-2xl font-semibold">Privacidad y control</h2>
          </div>

          <div className="mt-6 space-y-5">
            <label className="flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
              <div>
                <p className="font-medium text-white">Modo sin conexión</p>
                <p className="mt-1 text-sm text-slate-400">Deja toda la experiencia funcionando solo con lo que ya tienes en tu equipo.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.offlineModeEnabled}
                onChange={(event) => void updateSettings({ offlineModeEnabled: event.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
              <div>
                <p className="font-medium text-white">Modo de bajo consumo</p>
                <p className="mt-1 text-sm text-slate-400">Optimiza el rendimiento desactivando desenfoques de pantalla, degradados complejos, sombras y transiciones animadas.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.lowResourceMode}
                onChange={(event) => void updateSettings({ lowResourceMode: event.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
              <div>
                <p className="font-medium text-white">Procesamiento inteligente automático</p>
                <p className="mt-1 text-sm text-slate-400">Déjalo apagado si priorizas fluidez. Cuando está activo, la app puede usar bastante memoria para generar subtítulos, resúmenes y relaciones localmente.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.aiProcessingEnabled}
                onChange={(event) => void updateSettings({ aiProcessingEnabled: event.target.checked })}
              />
            </label>

            <label className="flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
              <div>
                <p className="font-medium text-white">Buscar ideas para portadas</p>
                <p className="mt-1 text-sm text-slate-400">Solo entra en juego cuando tú lo pides y nunca cambia nada por su cuenta.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.internetEnrichmentEnabled}
                onChange={(event) => void updateSettings({ internetEnrichmentEnabled: event.target.checked })}
              />
            </label>

            <label className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
              <div className="flex items-center justify-between gap-5">
                <div>
                  <p className="font-medium text-white">Cuándo dar una clase por terminada</p>
                  <p className="mt-1 text-sm text-slate-400">Ajusta el punto a partir del cual la clase pasa a contarse como vista.</p>
                </div>
                <span className="text-sm text-white">{settings.completionThresholdPercent}%</span>
              </div>
              <input
                type="range"
                min={70}
                max={99}
                value={settings.completionThresholdPercent}
                onChange={(event) => void updateSettings({ completionThresholdPercent: Number(event.target.value) })}
                className="w-full"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
                <span className="text-sm font-medium text-white">Fuente de portadas</span>
                <select
                  value={settings.coverEnrichmentProvider}
                  onChange={(event) => void updateSettings({ coverEnrichmentProvider: event.target.value })}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="openverse">Openverse</option>
                </select>
              </label>

              <label className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
                <span className="text-sm font-medium text-white">Tamaño del contenido</span>
                <select
                  value={settings.cardDensity}
                  onChange={(event) =>
                    void updateSettings({ cardDensity: event.target.value as "comfortable" | "compact" })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="comfortable">Cómodo</option>
                  <option value="compact">Compacto</option>
                </select>
              </label>
            </div>

            <label className="flex items-center justify-between gap-5 rounded-2xl border border-white/10 bg-white/[0.025] px-5 py-4">
              <div>
                <p className="font-medium text-white">Reducir movimiento</p>
                <p className="mt-1 text-sm text-slate-400">Suaviza animaciones para que todo se sienta más estable y descansado.</p>
              </div>
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(event) => void updateSettings({ reducedMotion: event.target.checked })}
              />
            </label>
          </div>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-4 w-4" />
            <h2 className="text-2xl font-semibold">Organización inteligente</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">
            Estas herramientas ya son manuales para que el reproductor y la biblioteca principal se mantengan ligeros. Úsalas solo cuando quieras recalcular subtítulos, resúmenes o relaciones.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              loading={pendingAction === "rebuild"}
              onClick={() =>
                void runAction("rebuild", "Actualizando la base inteligente", async () => {
                  await atlasApi.rebuildEmbeddings();
                  setStatusMessage("La base inteligente ya se actualizó.");
                })
              }
            >
              Actualizar base inteligente
            </Button>
            <Button
              loading={pendingAction === "reorder"}
              onClick={() =>
                void runAction("reorder", "Reordenando tu biblioteca", async () => {
                  await atlasApi.rebuildEmbeddings();
                  await localAiService.syncLibraryIntelligence(settings.modelName);
                  await refreshLibrary();
                  setStatusMessage("La biblioteca ya quedó reordenada.");
                })
              }
            >
              Reordenar biblioteca
            </Button>
            <Button
              variant="ghost"
              loading={pendingAction === "reset-ai"}
              onClick={() =>
                void runAction("reset-ai", "Reiniciando la ayuda inteligente", async () => {
                  localAiService.resetSessionCache();
                  await localAiService.syncLibraryIntelligence(settings.modelName);
                  await refreshLibrary();
                  setStatusMessage("La ayuda inteligente quedó reiniciada.");
                })
              }
            >
              Reiniciar ayuda inteligente
            </Button>
          </div>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 text-white">
            <Database className="h-4 w-4" />
            <h2 className="text-2xl font-semibold">Respaldo y restauración</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            El programa crea y actualiza un respaldo automático por su cuenta para proteger tus avances, notas, marcadores y portadas.
          </p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-slate-300">
            <p className="font-medium text-white">Al restaurar en otro equipo</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-400">
              <li>Primero elige la carpeta donde tienes tus cursos.</li>
              <li>Después selecciona el archivo de respaldo `.organi`.</li>
              <li>Al terminar, refresca la biblioteca y retoma tus clases.</li>
            </ol>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              className="gap-2"
              loading={pendingAction === "export-backup"}
              onClick={() =>
                void runAction("export-backup", "Creando tu respaldo portable", async () => {
                  const destination = await save({
                    defaultPath: "organicursos-backup.organi",
                    filters: [{ name: "OrganiCursos Backup", extensions: ["organi", "zip"] }],
                  });
                  if (!destination) {
                    setStatusMessage("La creación del respaldo se canceló.");
                    return;
                  }
                  await atlasApi.exportBackup(destination);
                  await refreshStorage();
                  setStatusMessage("El respaldo quedó guardado correctamente.");
                })
              }
            >
              <HardDriveDownload className="h-4 w-4" />
              Crear respaldo portátil
            </Button>
            <Button
              variant="secondary"
              className="gap-2"
              loading={pendingAction === "import-backup"}
              onClick={() =>
                void runAction("import-backup", "Guiando la restauración de tu respaldo", async () => {
                  setStatusMessage("Paso 1 de 2: elige primero la carpeta donde están tus cursos.");
                  const libraryFolder = await open({
                    directory: true,
                    multiple: false,
                    title: "Paso 1 de 2: elige la carpeta de tus cursos",
                  });
                  if (!libraryFolder || Array.isArray(libraryFolder)) {
                    setStatusMessage("La restauración se canceló antes de elegir la carpeta de cursos.");
                    return;
                  }

                  await atlasApi.registerLibraryFolder(libraryFolder);

                  setStatusMessage("Paso 2 de 2: ahora elige tu archivo de respaldo .organi.");
                  const source = await open({
                    multiple: false,
                    title: "Paso 2 de 2: elige tu respaldo .organi",
                    filters: [{ name: "OrganiCursos Backup", extensions: ["organi", "zip"] }],
                  });
                  if (!source || Array.isArray(source)) {
                    setStatusMessage("La restauración se canceló antes de elegir el respaldo.");
                    return;
                  }

                  await atlasApi.importBackup(source);
                  await refreshLibrary();
                  await refreshStorage();
                  setStatusMessage("Listo. Ya puedes seguir con tus clases y avances restaurados.");
                })
              }
            >
              <HardDriveUpload className="h-4 w-4" />
              Restaurar respaldo
            </Button>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 text-sm leading-6 text-slate-400">
            <p>Último respaldo automático: {storage ? formatBackupMoment(storage.latestBackupAt) : "Cargando..."}</p>
            <p className="mt-1">Carpeta de respaldo: {storage?.backupDir ?? "Cargando..."}</p>
          </div>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 text-white">
            <Database className="h-4 w-4" />
            <h2 className="text-2xl font-semibold">Actividad reciente</h2>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Versión</p>
              <p className="mt-2 text-white">{__APP_VERSION__}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Modelo en uso</p>
              <p className="mt-2 break-all text-white">{settings.modelName}</p>
            </div>
          </div>
          {statusMessage ? (
            <div className="mt-4 rounded-2xl border border-[#5bd6be]/20 bg-[#5bd6be]/10 px-4 py-3 text-sm text-[#dffcf6]">
              {statusMessage}
            </div>
          ) : null}
          <div className="mt-5 space-y-3">
            {jobs.slice(0, 5).map((job) => (
              <div key={job.id} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{job.kind}</p>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">{job.status}</span>
                </div>
                <p className="mt-2 text-sm text-slate-400">{job.message ?? "Sin mensaje adicional"}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="glass-panel p-6">
          <div className="flex items-center gap-2 text-white">
            <Image className="h-4 w-4" />
            <h2 className="text-xl font-semibold">Almacenamiento local</h2>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-400">
            <p>Base principal: {storage ? formatBytes(storage.databaseBytes) : "..."}</p>
            <p>Miniaturas guardadas: {storage ? formatBytes(storage.thumbnailCacheBytes) : "..."}</p>
            <p>Portadas importadas: {storage ? formatBytes(storage.importedCoverBytes) : "..."}</p>
            <p>Respaldo más reciente: {storage ? formatBytes(storage.latestBackupBytes) : "..."}</p>
            <p>Respaldos guardados: {storage?.backupCount ?? "..."}</p>
            <p className="break-all">Datos: {storage?.appDataDir ?? "..."}</p>
            <p className="break-all">Caché: {storage?.cacheDir ?? "..."}</p>
            <p className="break-all">Respaldos: {storage?.backupDir ?? "..."}</p>
          </div>
          <div className="mt-5">
            <Button
              variant="secondary"
              loading={pendingAction === "clear-cache"}
              onClick={() =>
                void runAction("clear-cache", "Limpiando miniaturas temporales", async () => {
                  await atlasApi.clearThumbnailCache();
                  await refreshStorage();
                  setStatusMessage("La caché de miniaturas quedó limpia.");
                })
              }
            >
              Limpiar caché de miniaturas
            </Button>
          </div>
          <div className="mt-6 rounded-[28px] border border-rose-400/20 bg-rose-500/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-200" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-white">Restablecer de fábrica</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Borra bibliotecas registradas, progreso, notas, marcadores, historial, cachés, portadas importadas,
                  respaldos automáticos y licencias locales. La app vuelve al estado inicial de este equipo.
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Tus cursos originales no se borran, pero sí todo lo que OrganiCursos haya guardado sobre ellos.
                </p>
                <div className="mt-4">
                  <Button
                    variant="ghost"
                    loading={pendingAction === "factory-reset"}
                    onClick={() =>
                      void runAction("factory-reset", "Restableciendo la app a estado de fábrica", async () => {
                        const confirmed = window.confirm(
                          "Esto borrará todos los registros locales de OrganiCursos en este equipo y no se puede deshacer. ¿Quieres continuar?",
                        );
                        if (!confirmed) {
                          setStatusMessage("El restablecimiento de fábrica se canceló.");
                          return;
                        }

                        await atlasApi.resetAppToFactory();
                        localAiService.resetSessionCache();
                        await refreshLibrary();
                        await refreshSettings();
                        await refreshCommercialState();
                        await refreshStorage();
                        setStatusMessage("La app volvió al estado de fábrica en este equipo.");
                      })
                    }
                  >
                    Restablecer de fábrica
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-white">Tu edición</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {licenseState?.edition ?? "Community"} · {licenseState?.graceMessage ?? "Licencia local en este equipo."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/license" className="text-sm font-medium text-atlas-200 transition hover:text-white">
              Gestionar licencia
            </Link>
            <Link to="/support" className="text-sm font-medium text-atlas-200 transition hover:text-white">
              Abrir soporte
            </Link>
          </div>
        </div>

        <div className="glass-panel p-6">
          <h3 className="text-lg font-semibold text-white">Privacidad</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Revisa qué se guarda aquí, cuándo se usa internet y cómo proteger tus respaldos.
          </p>
          <div className="mt-4">
            <Link to="/privacy" className="text-sm font-medium text-atlas-200 transition hover:text-white">
              Abrir privacidad
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}
