import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { atlasApi } from "@/lib/api/atlas-api";
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

export function LicensePage() {
  const licenseState = useAppStore((state) => state.licenseState);
  const refreshCommercialState = useAppStore((state) => state.refreshCommercialState);
  const [token, setToken] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const featureList = useMemo(() => licenseState?.features ?? [], [licenseState?.features]);

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await action();
      await refreshCommercialState();
      setFeedback(successMessage);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo completar la operacion.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
      <section className="space-y-6">
        <div className="glass-panel p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-400">Licenciamiento offline</p>
              <h2 className="mt-1 text-3xl font-semibold text-white">{licenseState?.edition ?? "Community"}</h2>
            </div>
            <Badge tone={toneForStatus(licenseState?.status ?? "community")}>{licenseState?.status ?? "community"}</Badge>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Modo de activacion</p>
              <p className="mt-2 text-white">{licenseState?.activationMode ?? "community"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Licencia</p>
              <p className="mt-2 text-white">{licenseState?.licenseId ?? "Sin token firmado"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Titular</p>
              <p className="mt-2 text-white">{licenseState?.licensedTo ?? "No registrado"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm text-slate-500">Expiracion</p>
              <p className="mt-2 text-white">{licenseState?.expiresAt ?? "Sin expiracion o no aplica"}</p>
            </div>
          </div>

          {licenseState?.graceMessage ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm leading-6 text-slate-300">
              {licenseState.graceMessage}
            </p>
          ) : null}
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Activar token firmado</p>
          <textarea
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Pega aqui un token ATLAS1 emitido por ventas o soporte."
            className="mt-4 min-h-40 w-full rounded-3xl border border-white/10 bg-black/30 px-4 py-4 text-sm text-white outline-none placeholder:text-slate-500"
          />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              disabled={busy || token.trim().length === 0}
              onClick={() =>
                void runAction(async () => {
                  await atlasApi.activateLicenseToken(token.trim());
                  setToken("");
                }, "Licencia activada correctamente.")
              }
            >
              Activar licencia
            </Button>
            <Button
              variant="secondary"
              disabled={busy || !licenseState?.canStartTrial}
              onClick={() => void runAction(() => atlasApi.startLicenseTrial().then(() => undefined), "Prueba profesional iniciada.")}
            >
              Iniciar prueba local
            </Button>
            <Button
              variant="ghost"
              disabled={busy || (!licenseState?.licenseId && licenseState?.status !== "trial")}
              onClick={() => void runAction(() => atlasApi.clearLicenseActivation().then(() => undefined), "Activacion local eliminada.")}
            >
              Limpiar activacion
            </Button>
          </div>
          {feedback ? <p className="mt-4 text-sm text-emerald-200">{feedback}</p> : null}
          {error ? <p className="mt-4 text-sm text-amber-200">{error}</p> : null}
          {!licenseState?.publicKeyConfigured ? (
            <p className="mt-4 text-sm leading-6 text-amber-100">
              Este build no incluye una clave publica de licencias. Las licencias firmadas no podran activarse hasta compilar con
              `ATLAS_LICENSE_PUBLIC_KEY_PEM`.
            </p>
          ) : null}
        </div>
      </section>

      <aside className="space-y-6">
        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Capacidades de esta edicion</p>
          <div className="mt-4 space-y-3">
            {featureList.map((feature) => (
              <div key={feature} className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-slate-200">
                {feature}
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Trial local</p>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            La prueba profesional corre en local y no requiere cuenta. Se registra en la base local de la app en este equipo.
          </p>
          {licenseState?.trialDaysRemaining != null ? (
            <p className="mt-4 text-white">{`Dias restantes: ${licenseState.trialDaysRemaining}`}</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
