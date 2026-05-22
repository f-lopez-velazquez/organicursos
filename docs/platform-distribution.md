# Distribucion multiplataforma

OrganiCursos usa una sola base de codigo, pero cada sistema operativo necesita sus propios sidecars y su propia biblioteca `sqlite-vec`.

## Windows

1. Prepara sidecars:
   - `npm run stage:sidecars:windows`
2. Prepara `sqlite-vec`:
   - `npm run stage:sqlite-vec:windows`
3. Compila release:
   - `npm run build:windows:release`

Salida esperada:
- `src-tauri/bin/organicursos-ffmpeg-x86_64-pc-windows-msvc.exe`
- `src-tauri/bin/organicursos-ffprobe-x86_64-pc-windows-msvc.exe`
- `src-tauri/resources/sqlite-vec/vec0.dll`

## macOS

1. Coloca `ffmpeg` y `ffprobe` para la arquitectura correcta o deja ambos en `PATH`.
2. Copia `sqlite-vec` macOS:
   - `npm run stage:sqlite-vec:macos -- --source /ruta/vec0.dylib`
3. Prepara sidecars:
   - Apple Silicon: `npm run stage:sidecars:macos -- --arch arm64`
   - Intel: `npm run stage:sidecars:macos -- --arch x64`
4. Compila release:
   - `npm run build:macos:release -- --arch arm64`
   - o `npm run build:macos:release -- --arch x64`

Salida esperada:
- `src-tauri/bin/organicursos-ffmpeg-aarch64-apple-darwin` o `organicursos-ffmpeg-x86_64-apple-darwin`
- `src-tauri/bin/organicursos-ffprobe-aarch64-apple-darwin` o `organicursos-ffprobe-x86_64-apple-darwin`
- `src-tauri/resources/sqlite-vec/vec0.dylib`

## Linux / Debian

1. Instala dependencias de build:
   - `build-essential`
   - `pkg-config`
   - `curl`
   - `wget`
   - `file`
   - `libglib2.0-dev`
   - `libwebkit2gtk-4.1-dev`
   - `libxdo-dev`
   - `libssl-dev`
   - `libayatana-appindicator3-dev`
   - `librsvg2-dev`
   - `patchelf`
2. Instala Rust con `rustup` si aun no tienes `cargo`.
3. Coloca `ffmpeg` y `ffprobe` en `PATH` o usa una carpeta propia.
4. Prepara `sqlite-vec`:
   - automatico: `npm run stage:sqlite-vec:linux`
   - manual: `npm run stage:sqlite-vec:linux -- --source /ruta/vec0.so`
5. Prepara sidecars:
   - `npm run stage:sidecars:linux -- --arch x64`
6. Compila release:
   - `npm run build:linux:release -- --arch x64`
7. Prepara carpeta final para compartir:
   - `npm run prepare:linux:share`

Salida esperada:
- `src-tauri/bin/organicursos-ffmpeg-x86_64-unknown-linux-gnu`
- `src-tauri/bin/organicursos-ffprobe-x86_64-unknown-linux-gnu`
- `src-tauri/resources/sqlite-vec/vec0.so`
- `~/.cache/OrganiCursos/cargo-target/release/bundle/deb/*.deb`
- `~/.cache/OrganiCursos/cargo-target/release/bundle/appimage/*.AppImage`
- `ENTREGA/OrganiCursos-0.1.0-Linux/`

## Modo portable

OrganiCursos puede funcionar en modo portable si activas un marcador junto a la app desempaquetada:

- Windows: `npm run portable:enable:windows -- "C:\\ruta\\a\\tu\\carpeta"`
- macOS / Linux: `npm run portable:enable:unix -- /ruta/a/tu/carpeta`

Eso crea:
- `.organicursos-portable`
- `portable-data/data`
- `portable-data/cache`

Uso recomendado:
- util para carpetas desempaquetadas o distribuciones controladas
- no recomendado dentro de una app instalada de macOS en `/Applications`

## Validacion minima por plataforma

Antes de vender o distribuir:

1. Abrir una biblioteca nueva.
2. Reindexar una biblioteca existente.
3. Abrir un curso y varias lecciones.
4. Confirmar guardado y reanudacion del progreso.
5. Confirmar autoavance a la siguiente clase.
6. Validar miniaturas, portadas y subtitulos.
7. Exportar e importar respaldo.
8. Probar instalacion limpia y desinstalacion.

## Estado de salida recomendado

Para considerar la app lista para publico en una plataforma concreta:

1. `npm run build`
2. `npm run test:smoke`
3. `npm test`
4. `cargo check`
5. `cargo test`
6. `npm run tauri build`
7. prueba manual de abrir biblioteca, reanudar clase, autoavance, respaldo y restauracion

La preparacion multiplataforma del repositorio ya cubre Windows, macOS y Linux, pero cada sistema debe pasar esa validacion real en una maquina o runner propio antes de publicarse.
