import {
  BookMarked,
  ChartNoAxesCombined,
  Compass,
  FolderPlus,
  HeartHandshake,
  Info,
  LifeBuoy,
  X,
  ReceiptText,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { WelcomeTutorial } from "@/components/onboarding/WelcomeTutorial";
import { Button } from "@/components/ui/Button";
import { productConfig } from "@/config/product";
import { atlasApi } from "@/lib/api/atlas-api";
import { openExternal } from "@/lib/utils/open-external";
import { useViewportProfile } from "@/lib/utils/viewport-profile";
import { cn } from "@/lib/utils/cn";
import { useAppStore } from "@/store/app-store";

const primaryNav = [
  { to: "/dashboard", icon: ChartNoAxesCombined, label: "Inicio" },
  { to: "/library", icon: BookMarked, label: "Biblioteca" },
  { to: "/search", icon: Search, label: "Buscar" },
];

const controlNav = [
  { to: "/settings", icon: Settings2, label: "Ajustes" },
  { to: "/privacy", icon: Shield, label: "Privacidad" },
  { to: "/license", icon: ShieldCheck, label: "Licencia" },
  { to: "/support", icon: LifeBuoy, label: "Soporte" },
  { to: "/legal", icon: ReceiptText, label: "Legal" },
  { to: "/about", icon: Info, label: "Acerca de" },
];

function navClass(isActive: boolean) {
  return cn(
    "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition duration-200 ease-soft",
    isActive
      ? "border border-white/10 bg-white/10 text-white"
      : "border border-transparent text-slate-400 hover:border-white/10 hover:bg-white/5 hover:text-slate-100",
  );
}

function licenseTone(status: string | undefined) {
  if (status === "active" || status === "trial") {
    return "text-emerald-200";
  }
  if (status === "expired" || status === "pending") {
    return "text-amber-100";
  }
  return "text-slate-300";
}

function operationTitle(kind: string | undefined) {
  if (kind === "index_library" || kind === "reindex_library") {
    return "Importando y ordenando tu biblioteca";
  }
  return "Procesando tu contenido";
}

function isImportActivityLabel(label: string | null) {
  if (!label) {
    return false;
  }
  const normalized = label.toLowerCase();
  return normalized.includes("import") || normalized.includes("carpeta") || normalized.includes("biblioteca");
}

export function ShellLayout() {
  const location = useLocation();
  const viewport = useViewportProfile();
  const refreshLibrary = useAppStore((state) => state.refreshLibrary);
  const setActivityLabel = useAppStore((state) => state.setActivityLabel);
  const settings = useAppStore((state) => state.settings);
  const licenseState = useAppStore((state) => state.licenseState);
  const loading = useAppStore((state) => state.loading);
  const activityLabel = useAppStore((state) => state.activityLabel);
  const jobs = useAppStore((state) => state.jobs);
  const runtimeProfile = useAppStore((state) => state.runtimeProfile);
  const [dismissedFinishedJobId, setDismissedFinishedJobId] = useState<string | null>(null);

  const handleAddFolder = async () => {
    setActivityLabel("Preparando la importacion de tu carpeta");
    try {
      const folder = await atlasApi.addLibraryFolder();
      if (folder) {
        await refreshLibrary({ activityLabel: "Importando y ordenando tu carpeta" });
        window.setTimeout(() => {
          void refreshLibrary({ silent: true });
        }, 900);
      } else {
        setActivityLabel(null);
      }
    } catch (error) {
      setActivityLabel(null);
      throw error;
    }
  };

  const pageTitle =
    location.pathname === "/dashboard"
      ? "Tu biblioteca de aprendizaje"
      : location.pathname === "/library"
        ? "Todo tu material en un solo lugar"
        : location.pathname.startsWith("/lessons/")
          ? "Sigue aprendiendo"
          : "Ordena, retoma y avanza";

  const shellMode = settings?.offlineModeEnabled ? "Offline" : "Ayuda opcional";
  const effectiveCompactDensity = settings?.cardDensity === "compact" || runtimeProfile?.recommendedCompactDensity;
  const densityLabel = effectiveCompactDensity ? "Compacta" : "Comoda";
  const isFocusRoute = location.pathname.startsWith("/courses/") || location.pathname.startsWith("/lessons/");
  const containedLayout = isFocusRoute ? false : (runtimeProfile?.recommendedContainedLayout ?? viewport.aspectRatio > 1.9);
  const shellMaxWidth = isFocusRoute
    ? viewport.mode === "wide"
      ? 1880
      : viewport.mode === "compact"
        ? 1320
        : 1740
    : viewport.mode === "compact"
      ? 1280
      : containedLayout
        ? 1560
        : viewport.mode === "wide"
          ? 1680
          : 1500;
  const shellGap = isFocusRoute
    ? viewport.mode === "compact"
      ? 14
      : 16
    : viewport.mode === "compact"
      ? 16
      : containedLayout
        ? 18
        : viewport.mode === "wide"
          ? 22
          : 18;
  const sidebarWidth = isFocusRoute
    ? viewport.mode === "wide" && !containedLayout
      ? 188
      : 176
    : viewport.mode === "wide" && !containedLayout
      ? 272
      : 248;
  const activeImportJob = useMemo(
    () =>
      [...jobs]
        .filter((job) => job.status === "queued" || job.status === "running")
        .sort((left, right) => {
          const leftPriority = ["index_library", "reindex_library"].includes(left.kind) ? 0 : 1;
          const rightPriority = ["index_library", "reindex_library"].includes(right.kind) ? 0 : 1;
          if (leftPriority !== rightPriority) {
            return leftPriority - rightPriority;
          }
          return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
        })[0] ?? null,
    [jobs],
  );
  const latestFinishedJob = useMemo(
    () =>
      [...jobs]
        .filter((job) => job.status === "completed" || job.status === "failed" || job.status === "cancelled")
        .sort((left, right) => new Date(right.finishedAt ?? right.createdAt).getTime() - new Date(left.finishedAt ?? left.createdAt).getTime())[0] ??
      null,
    [jobs],
  );
  const recentFinishedVisible =
    !activeImportJob &&
    latestFinishedJob &&
    latestFinishedJob.finishedAt &&
    latestFinishedJob.id !== dismissedFinishedJobId &&
    Date.now() - new Date(latestFinishedJob.finishedAt).getTime() < 90000;
  const floatingWidth = viewport.mode === "compact" ? "min(92vw, 360px)" : containedLayout ? "min(380px, 30vw)" : "min(420px, 34vw)";

  useEffect(() => {
    if (!isImportActivityLabel(activityLabel)) {
      return;
    }

    if (activeImportJob || (latestFinishedJob && ["completed", "failed", "cancelled"].includes(latestFinishedJob.status))) {
      setActivityLabel(null);
    }
  }, [activeImportJob, activityLabel, latestFinishedJob, setActivityLabel]);

  useEffect(() => {
    if (!latestFinishedJob) {
      setDismissedFinishedJobId(null);
      return;
    }

    setDismissedFinishedJobId((current) =>
      current === latestFinishedJob.id ? current : null,
    );
  }, [latestFinishedJob]);

  return (
    <div className="h-screen overflow-hidden bg-hero-radial text-slate-100">
      <WelcomeTutorial />

      <div
        className="mx-auto flex h-screen w-full px-4 py-4 lg:px-5"
        style={{ maxWidth: `${shellMaxWidth}px`, gap: `${shellGap}px` }}
      >
        <aside
          className="glass-panel relative hidden min-h-0 shrink-0 flex-col justify-between overflow-y-auto overflow-x-hidden p-5 lg:flex"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top_left,rgba(91,214,190,0.24),transparent_65%)] opacity-80" />

          <div className="relative min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[1.35rem] border border-white/10 bg-[linear-gradient(145deg,rgba(91,214,190,0.22),rgba(16,22,32,0.92))] text-[#dffcf6] shadow-glow">
                <Compass className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs uppercase tracking-[0.28em] text-slate-500">{productConfig.name}</p>
                <p className="mt-1 text-lg font-semibold text-white">Aprende con calma y sin perderte</p>
                <p className="mt-1 text-xs text-slate-500">{`Version ${__APP_VERSION__}`}</p>
              </div>
            </div>

            <Button className="mt-8 w-full justify-center gap-2" onClick={() => void handleAddFolder()}>
              <FolderPlus className="h-4 w-4" />
              Agregar carpeta
            </Button>

            <nav className="mt-8 space-y-2">
              {primaryNav.map(({ to, icon: Icon, label }) => (
                <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
                  <Icon className="h-4 w-4" />
                  {label}
                </NavLink>
              ))}
            </nav>

            <div className="mt-7 border-t border-white/10 pt-5">
              <p className="px-4 text-[11px] uppercase tracking-[0.22em] text-slate-600">Cuenta y ayuda</p>
              <nav className="mt-3 space-y-2">
                {controlNav.map(({ to, icon: Icon, label }) => (
                  <NavLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>

          <div className="relative space-y-4">
            <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-4">
              <p className="text-sm font-medium text-white">Estado de tu biblioteca</p>
              <p className={cn("mt-2 text-sm font-medium", licenseTone(licenseState?.status))}>
                {licenseState ? `${licenseState.edition} - ${licenseState.status}` : "Community"}
              </p>
              <p className="mt-2 text-xs leading-6 text-slate-500">
                Tus clases, notas y avances se quedan guardados en este equipo sin interrumpirte mientras estudias.
              </p>
            </div>

            <button
              type="button"
              onClick={() => openExternal(productConfig.donationUrl)}
              className="w-full rounded-[1.75rem] border border-[#d7b571]/20 bg-[linear-gradient(155deg,rgba(215,181,113,0.14),rgba(255,255,255,0.015))] p-4 text-left transition hover:border-[#d7b571]/35 hover:bg-[linear-gradient(155deg,rgba(215,181,113,0.18),rgba(255,255,255,0.03))]"
            >
              <div className="flex items-center gap-2 text-white">
                <HeartHandshake className="h-4 w-4 text-[#f3d599]" />
                <p className="text-sm font-medium">Apoya el mantenimiento</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Si te ayuda a estudiar mejor, puedes apoyar mejoras, soporte y mantenimiento continuo.
              </p>
            </button>
          </div>
        </aside>

        <main data-app-shell-root className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {!isFocusRoute ? (
            <header className={cn("glass-panel sticky top-0 z-20 overflow-hidden", isFocusRoute ? "px-4 py-3" : "px-5 py-4")}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs uppercase tracking-[0.26em] text-slate-500">{productConfig.name}</p>
                  <h1
                    className={cn(
                      "mt-1 max-w-3xl text-balance font-semibold text-white",
                      isFocusRoute ? "text-lg sm:text-[1.75rem] sm:leading-tight" : "text-xl sm:text-[2rem] sm:leading-tight",
                    )}
                  >
                    {pageTitle}
                  </h1>
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
                  <div className="max-w-full truncate rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-slate-400">
                    {`${shellMode} - ${densityLabel} - ${licenseState?.edition ?? "Community"}`}
                  </div>
                  <Button variant="secondary" loading={loading && !activeImportJob} onClick={() => void refreshLibrary()}>
                    {activeImportJob ? `${Math.round(activeImportJob.progress)}% importado` : loading ? "Cargando..." : "Actualizar vista"}
                  </Button>
                </div>
              </div>
            </header>
          ) : null}

          <div
            data-route-scroll-root
            className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip", isFocusRoute ? "mt-0 pr-0" : "mt-6 pr-1")}
          >
            {!isFocusRoute && activeImportJob ? (
              <div className={cn("sticky z-20 mb-3", isFocusRoute ? "top-0" : "top-2")}>
                <div className="rounded-[20px] border border-[#5bd6be]/18 bg-[linear-gradient(145deg,rgba(14,22,30,0.96),rgba(10,15,23,0.88))] px-4 py-3 shadow-[0_16px_44px_rgba(5,12,18,0.28)] backdrop-blur-xl">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">Importando y ordenando tu biblioteca</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {activeImportJob.message ?? "Estamos revisando carpetas, clases y materiales."}
                      </p>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-semibold text-white">
                      {`${Math.round(activeImportJob.progress)}%`}
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff,#d7b571)] transition-all duration-500 ease-out"
                      style={{ width: `${activeImportJob.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
            {!isFocusRoute && activityLabel ? (
              <div className="sticky top-0 z-20 mb-3">
                <div className="rounded-[18px] border border-white/8 bg-black/25 px-4 py-2.5 backdrop-blur-xl">
                  <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span>{activityLabel}</span>
                    <span>Actualizando</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div className="loading-sheen h-full w-1/4 rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff,#d7b571)]" />
                  </div>
                </div>
              </div>
            ) : null}
            <div key={location.pathname} className={cn("min-w-0", !settings?.reducedMotion && "page-enter")}>
              <Outlet />
            </div>

            <footer className={cn("border-t border-white/10 px-2 pb-4 text-sm text-slate-400", isFocusRoute ? "mt-5 pt-4" : "mt-6 pt-5")}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <p className="min-w-0 text-balance">{`Mantenido por ${productConfig.creatorName}`}</p>
                <div className="flex flex-wrap items-center gap-4">
                  <button type="button" onClick={() => openExternal(productConfig.websiteUrl)} className="transition hover:text-white">
                    Sitio
                  </button>
                  <button
                    type="button"
                    onClick={() => openExternal(productConfig.donationUrl)}
                    className="transition hover:text-white"
                  >
                    Apoyar mantenimiento
                  </button>
                </div>
              </div>
            </footer>
          </div>
        </main>
      </div>

      {!isFocusRoute && (activeImportJob || activityLabel || recentFinishedVisible) ? (
        <div
          className="pointer-events-none fixed bottom-5 right-5 z-[70]"
          style={{ width: floatingWidth }}
        >
          <div className="pointer-events-auto rounded-[24px] border border-white/10 bg-[linear-gradient(155deg,rgba(9,15,23,0.96),rgba(14,20,30,0.9))] p-4 shadow-[0_28px_80px_rgba(4,10,18,0.45)] backdrop-blur-2xl">
            {activeImportJob ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{operationTitle(activeImportJob.kind)}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">
                      {activeImportJob.message ?? "Estamos revisando, nombrando y ordenando tus cursos."}
                    </p>
                  </div>
                  <div className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-sm font-semibold text-white">
                    {`${Math.round(activeImportJob.progress)}%`}
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff,#d7b571)] transition-all duration-500 ease-out"
                    style={{ width: `${activeImportJob.progress}%` }}
                  />
                </div>
              </>
            ) : null}

            {!activeImportJob && activityLabel ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">Trabajando en segundo plano</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{activityLabel}</p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                    Activo
                  </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
                  <div className="loading-sheen h-full w-1/3 rounded-full bg-[linear-gradient(90deg,#5bd6be,#4f9cff,#d7b571)]" />
                </div>
              </>
            ) : null}

            {!activeImportJob && !activityLabel && recentFinishedVisible && latestFinishedJob ? (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {latestFinishedJob.status === "completed"
                      ? "Proceso terminado"
                      : latestFinishedJob.status === "cancelled"
                        ? "La sesion anterior se cerro antes de terminar"
                        : "Proceso con observaciones"}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    {latestFinishedJob.message ?? "La biblioteca ya quedo actualizada."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedFinishedJobId(latestFinishedJob.id)}
                  className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white"
                >
                  {latestFinishedJob.status === "completed"
                    ? "Listo"
                    : latestFinishedJob.status === "cancelled"
                      ? "Recuperado"
                      : "Cerrar"}
                </button>
              </div>
            ) : null}
            {!activeImportJob && !activityLabel && recentFinishedVisible && latestFinishedJob ? (
              <button
                type="button"
                onClick={() => setDismissedFinishedJobId(latestFinishedJob.id)}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
              >
                <X className="h-4 w-4" />
                Cerrar aviso
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
