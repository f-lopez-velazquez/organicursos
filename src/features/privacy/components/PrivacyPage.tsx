import { Badge } from "@/components/ui/Badge";

export function PrivacyPage() {
  return (
    <div className="space-y-6">
      <section className="glass-panel p-8">
        <p className="text-sm uppercase tracking-[0.26em] text-slate-500">Privacidad</p>
        <h2 className="mt-2 text-4xl font-semibold tracking-tight text-white">Todo lo importante permanece en local</h2>
        <p className="mt-4 max-w-4xl text-base leading-7 text-slate-300">
          OrganiCursos está diseñado para bibliotecas privadas offline. El contenido principal del usuario, el progreso,
          las notas, los embeddings y la indexación viven en el equipo del usuario salvo que éste active de forma
          explícita un flujo opcional de enriquecimiento por internet.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="glass-panel p-6">
          <Badge>Local</Badge>
          <h3 className="mt-4 text-xl font-semibold text-white">Siempre en el dispositivo</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Archivos fuente, rutas, progreso de vídeo, notas, favoritos, historial de reproducción, miniaturas
            generadas, base SQLite, índices FTS5 y vectores sqlite-vec.
          </p>
        </div>

        <div className="glass-panel p-6">
          <Badge>Opcional</Badge>
          <h3 className="mt-4 text-xl font-semibold text-white">Internet sólo bajo demanda</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            La app puede consultar proveedores de portadas cuando el usuario lo solicita y el modo offline está
            desactivado. La portada final se descarga y se cachea localmente tras la confirmación del usuario.
          </p>
        </div>

        <div className="glass-panel p-6">
          <Badge>Control</Badge>
          <h3 className="mt-4 text-xl font-semibold text-white">Sin sobrescrituras automáticas</h3>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Las sugerencias de IA ligera se guardan como inferencias. No reemplazan categorías, dificultad, notas ni
            metadatos editados manualmente por el usuario.
          </p>
        </div>
      </section>

      <section className="glass-panel p-6">
        <h3 className="text-2xl font-semibold text-white">Resumen operativo</h3>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <p className="font-medium text-white">Datos indexados</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Nombres de carpetas, nombres de archivos, texto extraído de PDFs, subtítulos y hashes parciales para relink.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <p className="font-medium text-white">Procesamiento local</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              ffprobe, ffmpeg, SQLite, FTS5, sqlite-vec y Transformers.js se usan localmente para la funcionalidad base.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <p className="font-medium text-white">Respaldo</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Los respaldos exportan la base y las portadas locales a un paquete comprimido para restauración en otro equipo.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
            <p className="font-medium text-white">Trazabilidad</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Las portadas externas conservan su fuente y atribución; el usuario elige si las guarda y si las activa.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
