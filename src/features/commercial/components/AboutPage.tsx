import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { productConfig } from "@/config/product";
import { openExternal } from "@/lib/utils/open-external";
import { useAppStore } from "@/store/app-store";

function toneForStatus(status: string): "default" | "success" | "warning" {
  if (status === "active" || status === "trial") {
    return "success";
  }
  if (status === "expired" || status === "pending") {
    return "warning";
  }
  return "default";
}

export function AboutPage() {
  const licenseState = useAppStore((state) => state.licenseState);
  const operationalProfile = useAppStore((state) => state.operationalProfile);

  return (
    <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <section className="space-y-6">
        <div className="glass-panel overflow-hidden p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={toneForStatus(licenseState?.status ?? "community")}>{licenseState?.edition ?? "Community"}</Badge>
            <Badge>{operationalProfile?.platform ?? "desktop"}</Badge>
          </div>
          <h2 className="mt-4 text-4xl font-semibold tracking-tight text-white">
            Una biblioteca pensada para estudiar con calma y volver a encontrar todo rápido
          </h2>
          <p className="mt-4 max-w-4xl text-base leading-7 text-slate-300">
            {productConfig.name} reúne tus cursos, recuerda tu avance, guarda tus notas y te ayuda a retomar sin depender de servicios externos.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <p className="text-sm text-slate-500">Privacidad</p>
              <p className="mt-3 text-lg font-semibold text-white">Todo queda en tu equipo</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Tus carpetas, tus clases y tus avances siguen contigo.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <p className="text-sm text-slate-500">Avance</p>
              <p className="mt-3 text-lg font-semibold text-white">Retoma sin perder el hilo</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Cuando vuelvas, la app te llevará al punto donde te quedaste.</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
              <p className="text-sm text-slate-500">Orden</p>
              <p className="mt-3 text-lg font-semibold text-white">Todo más fácil de encontrar</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Agrupa tus cursos y materiales para que navegar la biblioteca sea más natural.</p>
            </div>
          </div>
        </div>

        <div className="glass-panel p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-400">Tu edición</p>
              <h3 className="mt-1 text-2xl font-semibold text-white">{licenseState?.edition ?? "Community"}</h3>
            </div>
            <Badge tone={toneForStatus(licenseState?.status ?? "community")}>{licenseState?.status ?? "community"}</Badge>
          </div>
          {licenseState?.graceMessage ? <p className="mt-4 text-sm leading-6 text-slate-400">{licenseState.graceMessage}</p> : null}
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <p className="text-sm text-slate-500">Equipo mantenedor</p>
            <p className="mt-2 text-white">{productConfig.creatorName}</p>
            <p className="mt-1 text-sm text-slate-400">{productConfig.contactEmail}</p>
            <p className="mt-1 text-sm text-slate-400">{productConfig.websiteUrl}</p>
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Detalles de la app</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <p>Producto: {operationalProfile?.productName ?? productConfig.name}</p>
            <p>Versión: {operationalProfile?.version ?? __APP_VERSION__}</p>
            <p>Plataforma: {operationalProfile ? `${operationalProfile.platform} / ${operationalProfile.arch}` : "..."}</p>
          </div>
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Ayuda y apoyo</p>
          <div className="mt-4 flex flex-col gap-3">
            <Button variant="secondary" onClick={() => openExternal(productConfig.websiteUrl)}>
              Abrir sitio
            </Button>
            <Button variant="secondary" onClick={() => openExternal(`mailto:${productConfig.supportEmail}`)}>
              Contactar soporte
            </Button>
            <Button onClick={() => openExternal(productConfig.donationUrl)}>Apoyar mantenimiento</Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
