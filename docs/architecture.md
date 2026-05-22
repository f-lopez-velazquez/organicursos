# Arquitectura de OrganiCursos

## Decisión principal

La app se divide en tres capas:

1. `Shell nativo`
   Rust + Tauri v2 exponen un conjunto pequeño y tipado de comandos IPC para archivos, SQLite, indexación, sidecars y jobs.
2. `Cliente de experiencia`
   React renderiza el shell premium, reproductor, biblioteca, búsqueda y ajustes sin bloquear al usuario.
3. `IA local ligera`
   Transformers.js corre en un worker independiente; genera embeddings y clasifica localmente, y luego persiste resultados en SQLite/sqlite-vec mediante comandos seguros.

## Flujo local-first

1. El usuario agrega una o varias carpetas raíz.
2. Rust crea o reutiliza una `library`.
3. El indexador recorre archivos soportados.
4. `ffprobe` extrae metadatos de video y `ffmpeg` genera miniaturas.
5. Se actualizan `courses`, `course_sections`, `lessons`, `lesson_assets`, `file_fingerprints` y `search_documents`.
6. Se crean placeholders en `embeddings`.
7. El worker de Transformers.js lee pendientes, calcula embeddings y los escribe en `embeddings_vec`.
8. La búsqueda híbrida mezcla FTS5 con similitud vectorial.

## Identidad de archivos

La identidad usa:

- ruta absoluta
- ruta canónica normalizada
- tamaño
- fecha de modificación
- hash parcial `blake3`
- duración cuando existe

Esta combinación permite relink posterior cuando el archivo cambia de ruta pero mantiene firma coherente.

## Seguridad

- Acceso sensible centralizado en Rust.
- Sidecars limitados a `ffprobe` y `ffmpeg`.
- Capabilities mínimas en `src-tauri/capabilities/main.json`.
- Internet reservado a capas opcionales futuras de enriquecimiento.

## Búsqueda

- `FTS5` para coincidencia lexical robusta.
- `sqlite-vec` para similitud semántica.
- ranking híbrido con ponderación `0.55 lexical / 0.45 semantic`.

## UX

- tema oscuro por defecto
- layout con panel lateral estable
- tarjetas con gradientes sobrios y jerarquía tipográfica fuerte
- guardado automático de progreso en video
- estados vacíos y loaders listos para ampliar
