#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-0.1.0}"
ARCH="${ARCH:-}"
CARGO_TARGET_DIR_INPUT="${CARGO_TARGET_DIR_INPUT:-}"
SOURCE_ROOT="${SOURCE_ROOT:-}"
OUTPUT_ROOT="${OUTPUT_ROOT:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --arch)
      ARCH="$2"
      shift 2
      ;;
    --cargo-target-dir)
      CARGO_TARGET_DIR_INPUT="$2"
      shift 2
      ;;
    --source-root)
      SOURCE_ROOT="$2"
      shift 2
      ;;
    --output-root)
      OUTPUT_ROOT="$2"
      shift 2
      ;;
    *)
      echo "Argumento no reconocido: $1" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CARGO_TARGET_DIR="${CARGO_TARGET_DIR_INPUT:-${XDG_CACHE_HOME:-$HOME/.cache}/OrganiCursos/cargo-target}"
SOURCE_ROOT="${SOURCE_ROOT:-$CARGO_TARGET_DIR/release}"
OUTPUT_ROOT="${OUTPUT_ROOT:-$REPO_ROOT/ENTREGA/OrganiCursos-$VERSION-Linux}"

resolve_arch() {
  if [[ -n "$ARCH" ]]; then
    case "$ARCH" in
      arm64|aarch64)
        printf '%s\n' "arm64"
        return
        ;;
      x64|x86_64|amd64)
        printf '%s\n' "x64"
        return
        ;;
      *)
        echo "Arquitectura no soportada para Linux: $ARCH" >&2
        exit 1
        ;;
    esac
  fi

  case "$(uname -m)" in
    arm64|aarch64) printf '%s\n' "arm64" ;;
    x86_64|amd64) printf '%s\n' "x64" ;;
    *)
      echo "No se pudo detectar la arquitectura de Linux. Usa --arch x64|arm64" >&2
      exit 1
      ;;
  esac
}

first_existing() {
  local path
  for path in "$@"; do
    if [[ -f "$path" ]]; then
      printf '%s\n' "$path"
      return 0
    fi
  done
  return 1
}

copy_with_mode() {
  local source="$1"
  local target="$2"
  cp "$source" "$target"
  chmod +x "$target"
}

ARCH_LABEL="$(resolve_arch)"
APPIMAGE_DIR="$SOURCE_ROOT/bundle/appimage"
DEB_DIR="$SOURCE_ROOT/bundle/deb"
INSTALLER_DIR="$OUTPUT_ROOT/INSTALABLE"
PORTABLE_DIR="$OUTPUT_ROOT/PORTABLE"
PORTABLE_RESOURCES_DIR="$PORTABLE_DIR/resources/sqlite-vec"
PORTABLE_DATA_DIR="$PORTABLE_DIR/portable-data"

APPIMAGE_SOURCE="$(find "$APPIMAGE_DIR" -maxdepth 1 -type f -name "*.AppImage" | head -n 1 || true)"
DEB_SOURCE="$(find "$DEB_DIR" -maxdepth 1 -type f -name "*.deb" | head -n 1 || true)"
APP_BINARY="$(first_existing \
  "$SOURCE_ROOT/atlas-courses" \
  "$SOURCE_ROOT/OrganiCursos" \
  "$SOURCE_ROOT/organicursos" \
)"
FFMPEG_SOURCE="$(first_existing \
  "$SOURCE_ROOT/organicursos-ffmpeg" \
  "$SOURCE_ROOT/organicursos-ffmpeg-x86_64-unknown-linux-gnu" \
  "$SOURCE_ROOT/organicursos-ffmpeg-aarch64-unknown-linux-gnu" \
  "$SOURCE_ROOT/ffmpeg" \
  "$SOURCE_ROOT/ffmpeg-x86_64-unknown-linux-gnu" \
  "$SOURCE_ROOT/ffmpeg-aarch64-unknown-linux-gnu" \
)"
FFPROBE_SOURCE="$(first_existing \
  "$SOURCE_ROOT/organicursos-ffprobe" \
  "$SOURCE_ROOT/organicursos-ffprobe-x86_64-unknown-linux-gnu" \
  "$SOURCE_ROOT/organicursos-ffprobe-aarch64-unknown-linux-gnu" \
  "$SOURCE_ROOT/ffprobe" \
  "$SOURCE_ROOT/ffprobe-x86_64-unknown-linux-gnu" \
  "$SOURCE_ROOT/ffprobe-aarch64-unknown-linux-gnu" \
)"
VEC_SOURCE="$(first_existing \
  "$SOURCE_ROOT/resources/sqlite-vec/vec0.so" \
  "$SOURCE_ROOT/resources/sqlite-vec/sqlite_vec.so" \
)"

for required in "$APPIMAGE_SOURCE" "$DEB_SOURCE" "$APP_BINARY" "$FFMPEG_SOURCE" "$FFPROBE_SOURCE" "$VEC_SOURCE"; do
  if [[ -z "${required:-}" || ! -f "$required" ]]; then
    echo "Falta un archivo requerido para la entrega Linux: ${required:-no-detectado}" >&2
    exit 1
  fi
done

rm -rf "$OUTPUT_ROOT"
mkdir -p "$INSTALLER_DIR" "$PORTABLE_RESOURCES_DIR" "$PORTABLE_DATA_DIR/data" "$PORTABLE_DATA_DIR/cache"

cp "$DEB_SOURCE" "$INSTALLER_DIR/OrganiCursos-$VERSION-${ARCH_LABEL}.deb"
cp "$APPIMAGE_SOURCE" "$INSTALLER_DIR/OrganiCursos-$VERSION-${ARCH_LABEL}.AppImage"
chmod +x "$INSTALLER_DIR/OrganiCursos-$VERSION-${ARCH_LABEL}.AppImage"

# Generar paquete nativo de Arch Linux / CachyOS si makepkg esta disponible
ARCH_PKG_SOURCE=""
if [[ -f "$REPO_ROOT/scripts/build-cachyos-package.sh" ]] && command -v makepkg >/dev/null 2>&1; then
  bash "$REPO_ROOT/scripts/build-cachyos-package.sh" \
    --version "$VERSION" \
    --deb-file "$DEB_SOURCE" \
    --output-dir "$INSTALLER_DIR"
  ARCH_PKG_SOURCE="$(find "$INSTALLER_DIR" -maxdepth 1 -type f -name "organicursos-*.pkg.tar.zst" | head -n 1 || true)"
fi

if [[ -n "$ARCH_PKG_SOURCE" && -f "$ARCH_PKG_SOURCE" ]]; then
  echo "Paquete nativo Arch/CachyOS disponible en INSTALABLE."
fi

cp "$REPO_ROOT/scripts/cachyos-arch/install.sh" "$INSTALLER_DIR/instalar-cachyos.sh"
chmod +x "$INSTALLER_DIR/instalar-cachyos.sh"

if [[ -f "$REPO_ROOT/instalar.desktop" ]]; then
  cp "$REPO_ROOT/instalar.desktop" "$INSTALLER_DIR/Instalar OrganiCursos.desktop"
fi

copy_with_mode "$APP_BINARY" "$PORTABLE_DIR/OrganiCursos"
copy_with_mode "$FFMPEG_SOURCE" "$PORTABLE_DIR/ffmpeg"
copy_with_mode "$FFPROBE_SOURCE" "$PORTABLE_DIR/ffprobe"
copy_with_mode "$VEC_SOURCE" "$PORTABLE_RESOURCES_DIR/vec0.so"
printf 'portable-mode=1\n' > "$PORTABLE_DIR/.organicursos-portable"

# Crear script lanzador inteligente para el Portable
cat > "$PORTABLE_DIR/run-portable.sh" <<'EOF'
#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
chmod +x ./OrganiCursos ./ffmpeg ./ffprobe 2>/dev/null || true
exec ./OrganiCursos "$@"
EOF
chmod +x "$PORTABLE_DIR/run-portable.sh"

cat > "$OUTPUT_ROOT/LEEME.txt" <<EOF
OrganiCursos $VERSION - carpeta final para compartir en Linux $ARCH_LABEL

Esta entrega incluye dos maneras de usar la app:

1. INSTALABLE
- Recomendado para la mayoria de usuarios Linux.
- En CachyOS o Arch Linux puedes usar ./instalar-cachyos.sh para instalar el paquete nativo en un paso.
- Usa el archivo .AppImage si quieres ejecutar al instante sin instalar.
- Usa el archivo .deb si quieres instalarlo en sistemas compatibles con Debian, Ubuntu o Linux Mint.
- Usa el archivo .pkg.tar.zst si quieres instalarlo nativamente en CachyOS, Arch Linux o Manjaro (usando pacman -U).

2. PORTABLE
- No instala nada en el sistema.
- Abre directamente ejecutando ./run-portable.sh
- Funciona en cualquier distribucion de Linux (incluyendo CachyOS / Arch).
- Guarda sus datos dentro de la subcarpeta portable-data.
EOF

cat > "$INSTALLER_DIR/LEEME.txt" <<EOF
INSTALABLE - OrganiCursos $VERSION para Linux $ARCH_LABEL

Archivos:
- OrganiCursos-$VERSION-${ARCH_LABEL}.deb
- OrganiCursos-$VERSION-${ARCH_LABEL}.AppImage
- instalar-cachyos.sh
- *.pkg.tar.zst (paquete nativo de Arch Linux / CachyOS)

Uso sugerido:
1. En Debian, Ubuntu o Linux Mint, instala el .deb con sudo apt install ./archivo.deb
2. En CachyOS, Arch Linux o Manjaro, ejecuta ./instalar-cachyos.sh o instala manualmente el paquete con sudo pacman -U ./archivo-*.pkg.tar.zst
3. Si prefieres no instalar, marca el AppImage como ejecutable y abrelo.
4. Abre OrganiCursos y agrega la carpeta donde guardas tus cursos o videos.
EOF

cat > "$PORTABLE_DIR/LEEME.txt" <<EOF
PORTABLE - OrganiCursos $VERSION para Linux $ARCH_LABEL

Como usar:
1. Manten esta carpeta completa junta.
2. No muevas ni borres los archivos internos del programa.
3. Abre ./run-portable.sh (ejecutará e iniciará la app haciendo ejecutables los binarios automáticamente).
4. Los avances, notas y caché se guardarán en portable-data.

Importante:
- No copies solo el binario principal: debe ir con ffmpeg, ffprobe, resources y run-portable.sh.
- Si cambias esta carpeta de lugar, muevela completa.
EOF

(
  cd "$OUTPUT_ROOT"
  find . -type f ! -name 'SHA256SUMS.txt' -print0 \
    | sort -z \
    | xargs -0 sha256sum \
    | sed 's# \*\./# *#; s#  \./# *#' > SHA256SUMS.txt
)

echo "Entrega Linux preparada en:"
echo "  $OUTPUT_ROOT"
