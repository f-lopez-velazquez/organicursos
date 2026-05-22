# OrganiCursos

OrganiCursos es una aplicación de escritorio local-first para organizar cursos, clases y materiales de estudio sin mover los archivos del usuario a la nube. Está pensada para bibliotecas grandes de video, documentos, subtítulos y recursos de apoyo, con foco en continuidad de estudio, privacidad y operación offline.

## Instalación

La forma más simple para usuarios finales es descargar los artefactos desde la sección de Releases del repositorio.

### Linux

- `AppImage`: ejecutar directamente.
- `deb`: instalar en Debian, Ubuntu, Linux Mint y derivadas.
- `pkg.tar.zst`: instalar en Arch, CachyOS y derivadas con `pacman -U`.

Ejemplo para CachyOS o Arch:

```bash
sudo pacman -U ./organicursos-0.1.0-1-x86_64.pkg.tar.zst
```

### Windows

- instalador `setup.exe` para la mayoría de usuarios
- `msi` para despliegues administrados

### macOS

- el flujo de build está preparado, pero debe validarse y firmarse en hardware macOS antes de distribución pública final

## Qué resuelve

- Organiza carpetas de cursos sin alterar la estructura original.
- Detecta videos, PDFs, subtítulos, audios y archivos de apoyo.
- Guarda el avance de cada clase y la retoma desde el punto exacto.
- Permite notas, marcadores y búsqueda local.
- Ofrece ayudas opcionales para enriquecer descripciones, etiquetas y agrupación.
- Exporta e importa respaldos para mover el trabajo entre equipos.

## Stack técnico

- `Tauri v2`
- `React 18 + TypeScript + Vite`
- `Zustand`
- `SQLite + FTS5`
- `sqlite-vec`
- `ffmpeg` y `ffprobe` como sidecars

## Principios operativos

- `Local-first`: el contenido principal se procesa y persiste en el equipo del usuario.
- `Privacidad explícita`: cualquier ayuda remota se mantiene como opt-in.
- `Reproducción seria`: el player conserva progreso, velocidad, volumen y estado de la clase.
- `Distribución multiplataforma`: hay scripts para Windows, macOS y Linux, incluyendo paquete nativo para Arch/CachyOS.

## Desarrollo local

### Requisitos

- `Node.js 20+`
- `npm`
- `Rust + cargo`
- dependencias del sistema necesarias para `Tauri`

### Comandos base

```bash
npm install
npm run build
npm test
npm run tauri dev
```

## Scripts útiles

```bash
npm run build
npm run test
npm run lint
npm run build:windows:release
npm run build:macos:release
npm run build:linux:release
npm run build:cachyos:package
npm run deliver:linux:cachyos
npm run prepare:linux:share
```

## Linux y CachyOS

Para generar artefactos Linux:

```bash
npm run build:linux:release
npm run prepare:linux:share
```

Para generar además el paquete nativo de Arch/CachyOS:

```bash
npm run deliver:linux:cachyos
```

La salida de distribución queda en `ENTREGA/` durante los procesos locales de release, pero esa carpeta se ignora para publicación del repositorio.

## Estructura del proyecto

```text
.
|-- docs/
|-- fixtures/
|-- scripts/
|-- src/
|-- src-tauri/
|-- EULA.md
|-- LICENSE
|-- package.json
`-- README.md
```

### Directorios principales

- `src/`: interfaz, flujos de aplicación y servicios del frontend.
- `src-tauri/`: backend de escritorio, base de datos, comandos y empaquetado.
- `scripts/`: automatizaciones de build, staging y release.
- `docs/`: arquitectura, licenciamiento, distribución y operación comercial.

## Calidad y validación

Antes de publicar un cambio conviene ejecutar:

```bash
npm test
npm run build
```

En cambios de escritorio o empaquetado también conviene validar:

```bash
npm run build:linux:release
npm run build:cachyos:package
```

## Publicación del repositorio

Este proyecto está organizado para que el código fuente se publique sin incluir artefactos generados, cachés, bases locales ni entregables pesados. El `.gitignore` excluye las rutas de trabajo y distribución que solo deben existir en el entorno de build.

## Proceso de release

Los instaladores y paquetes se preparan con automatización por CLI sobre `npm`, `cargo`, `Tauri CLI` y herramientas nativas de cada plataforma. Eso permite reproducir builds, revisar pasos críticos y mantener una entrega consistente entre sistemas operativos.

## Estado del proyecto

- base funcional de escritorio lista para bibliotecas locales
- empaquetado Linux validado con AppImage, `.deb` y paquete nativo para Arch/CachyOS
- flujo de publicación preparado para mantener código, documentación y entregables de forma separada

## Documentación complementaria

- [Arquitectura](docs/architecture.md)
- [Checklist de release](docs/release-checklist.md)
- [Distribución por plataforma](docs/platform-distribution.md)
- [Licenciamiento](docs/licensing.md)
- [Readiness comercial](docs/commercial-readiness.md)
