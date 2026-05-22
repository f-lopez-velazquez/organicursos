import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { productConfig } from "@/config/product";
import { openExternal } from "@/lib/utils/open-external";

const eulaSummary = [
  "La licencia cubre el binario compilado de OrganiCursos y no transfiere el codigo fuente.",
  "El usuario conserva la propiedad de su contenido local, notas, progreso y metadatos.",
  "Las funciones remotas, cuando existan, son opt-in y no deben usarse para almacenar el contenido principal.",
  "La revision legal final debe hacerse antes de cualquier lanzamiento comercial publico.",
];

const privacySummary = [
  "El contenido del usuario permanece local salvo accion explicita en funciones opcionales de enriquecimiento.",
  "La base de datos, miniaturas, progreso y notas se guardan en el equipo del usuario.",
  "El modo offline puede bloquear consultas remotas y mantener la operacion estrictamente local.",
];

export function LegalPage() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
      <section className="space-y-6">
        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Marco legal visible in-app</p>
          <h2 className="mt-1 text-3xl font-semibold text-white">Privacidad, licencia y comunicacion comercial</h2>
          <p className="mt-4 text-sm leading-7 text-slate-300">
            Esta pantalla resume los compromisos operativos del producto. El texto legal definitivo debe revisarse con asesoria
            juridica antes de publicar o vender.
          </p>
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Resumen de EULA</p>
          <div className="mt-4 space-y-3">
            {eulaSummary.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Resumen de privacidad</p>
          <div className="mt-4 space-y-3">
            {privacySummary.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm text-slate-200">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5">
            <Link to="/privacy" className="text-sm font-medium text-atlas-200 transition hover:text-white">
              Abrir pantalla de privacidad
            </Link>
          </div>
        </div>

        <div className="glass-panel p-6">
          <p className="text-sm text-slate-400">Enlaces externos</p>
          <div className="mt-4 flex flex-col gap-3">
            <Button variant="secondary" onClick={() => openExternal(productConfig.privacyUrl)}>
              Politica de privacidad web
            </Button>
            <Button variant="ghost" onClick={() => openExternal(`mailto:${productConfig.supportEmail}`)}>
              Contactar soporte legal
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
