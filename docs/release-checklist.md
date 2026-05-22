# Release Checklist

## Pre-release

- Confirmar `npm run build` y `npm test`.
- Confirmar tambien `npm run test:smoke` para curso y reproductor.
- Validar `cargo check`, `cargo test` y `npm run tauri build` en Windows, macOS y Linux.
- Confirmar al menos una corrida real del workflow de CI y del workflow de bundles antes de publicar.
- En Windows, preferir `npm run build:windows:release` para usar `vcvars64` y `CARGO_TARGET_DIR` fuera de OneDrive.
- Verificar sidecars reales de `ffmpeg` y `ffprobe` por plataforma en `src-tauri/bin/`.
- En Windows se puede automatizar con `npm run stage:sidecars:windows`.
- En macOS se puede automatizar con `npm run stage:sidecars:macos -- --arch arm64|x64`.
- En Linux se puede automatizar con `npm run stage:sidecars:linux -- --arch x64|arm64`.
- Verificar librerias nativas de `sqlite-vec` por plataforma en `src-tauri/resources/sqlite-vec/`.
- En Windows se puede automatizar con `npm run stage:sqlite-vec:windows`.
- En macOS se puede automatizar con `npm run stage:sqlite-vec:macos -- --source /ruta/vec0.dylib`.
- En Linux se puede automatizar con `npm run stage:sqlite-vec:linux` o `npm run stage:sqlite-vec:linux -- --source /ruta/vec0.so`.
- En Linux se puede preparar la carpeta final de entrega con `npm run prepare:linux:share`.
- Si se vendera con activacion offline, compilar con `ATLAS_LICENSE_PUBLIC_KEY_PEM` configurada.
- Revisar iconografia de bundle e instaladores.
- Confirmar politica de privacidad, EULA y notas de licencia de terceros.
- Si se distribuira como carpeta portable, habilitar `.organicursos-portable` antes de empaquetar esa variante.

## Product QA

- Flujo de primera biblioteca.
- Indexacion de videos, PDFs y subtitulos.
- Reanudacion exacta y guardado de progreso.
- Busqueda textual y semantica.
- Seleccion manual de portada local y remota.
- Exportacion e importacion de respaldo.
- Comportamiento con modo offline activado.

## Distribution

- Firmar binarios y sidecars.
- Preparar changelog y numero de version.
- Generar instaladores para Windows `nsis` o `msi`.
- Generar instaladores para macOS `.app` o `.dmg`.
- Generar instaladores para Linux `AppImage` y `.deb`.
- Validar tambien la variante portable cuando se distribuya fuera de instalador.
- Probar instalacion limpia, actualizacion y desinstalacion.
- En macOS, completar firma y notarizacion antes de distribuir a usuario final.

## Commercial

- Configurar web de ventas, soporte y correo de licencias.
- Definir politica de devoluciones y soporte.
- Verificar textos legales visibles desde la app.
- Preparar guia de onboarding, FAQ y notas de version.
- Validar emision y activacion de token con `docs/licensing.md`.
