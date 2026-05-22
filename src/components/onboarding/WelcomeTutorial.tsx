import { BookOpen, CheckCircle2, HardDriveDownload, PlayCircle, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { readLocalStorage, writeLocalStorage } from "@/lib/utils/safe-storage";

const STORAGE_KEY = "organicursos:onboarding-dismissed";

const steps = [
  {
    icon: BookOpen,
    title: "Agrega la carpeta donde estudias",
    body: "Elige la carpeta donde guardas tus cursos, clases o series. La app la ordena por ti sin mover nada.",
  },
  {
    icon: PlayCircle,
    title: "Entra y sigue justo donde ibas",
    body: "Al abrir una clase, el video arranca y tu avance se va guardando para retomarlo con facilidad.",
  },
  {
    icon: CheckCircle2,
    title: "Mantén tus materiales en el mismo lugar",
    body: "Si vas a reorganizar tus archivos, vuelve a señalar la carpeta después. Así todo seguirá apareciendo donde corresponde.",
  },
  {
    icon: HardDriveDownload,
    title: "Si cambias de equipo, usa un respaldo",
    body: "Desde Ajustes puedes crear un respaldo completo para seguir con tus avances, notas y marcadores en otra computadora.",
  },
];

export function WelcomeTutorial() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const dismissed = readLocalStorage(STORAGE_KEY);
    if (!dismissed) {
      setOpen(true);
    }
  }, []);

  const close = () => {
    writeLocalStorage(STORAGE_KEY, "1");
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#02050acc]/82 px-3 py-3 backdrop-blur-md sm:px-4 sm:py-4"
      onClick={close}
    >
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          className="glass-panel relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden border-white/15 shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:max-h-[calc(100vh-2rem)]"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="welcome-tutorial-title"
        >
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(8,13,20,0.98),rgba(8,13,20,0.9))] px-5 py-4 backdrop-blur-xl sm:px-8 sm:py-5 lg:px-10">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#5bd6be]/25 bg-[#5bd6be]/8 px-4 py-1.5 text-sm text-[#d8fff7]">
                <Sparkles className="h-4 w-4" />
                Primer vistazo
              </div>
              <h2
                id="welcome-tutorial-title"
                className="mt-4 text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl"
              >
                Todo listo para empezar sin enredos
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
                Esta guía aparece una sola vez. En menos de un minuto sabrás cómo usar la app sin perder el orden de
                tus materiales ni tus avances.
              </p>
            </div>

            <button
              type="button"
              onClick={close}
              className="interactive-lift shrink-0 rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-400 transition hover:text-white"
              aria-label="Cerrar guía"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-5 sm:px-8 sm:py-6 lg:px-10">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {steps.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="interactive-lift rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#5bd6be]/10 text-[#d8fff7]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-[28px] border border-[#d7b571]/15 bg-[linear-gradient(155deg,rgba(215,181,113,0.12),rgba(255,255,255,0.02))] p-5">
              <p className="text-sm font-medium text-white">Consejo útil</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
                Si un día cambias de computadora, usa el respaldo portátil antes de salir del equipo anterior. Así
                podrás retomar exactamente desde el mismo punto.
              </p>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 flex flex-wrap gap-3 border-t border-white/10 bg-[linear-gradient(0deg,rgba(8,13,20,0.98),rgba(8,13,20,0.9))] px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
            <Button onClick={close}>Empezar</Button>
            <Button variant="secondary" onClick={close}>
              Ya lo tengo claro
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
