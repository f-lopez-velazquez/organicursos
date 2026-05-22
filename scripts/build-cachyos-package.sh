#!/usr/bin/env bash
set -euo pipefail

VERSION="${VERSION:-}"
PKGREL="${PKGREL:-1}"
DEB_FILE="${DEB_FILE:-}"
OUTPUT_DIR="${OUTPUT_DIR:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --pkgrel)
      PKGREL="$2"
      shift 2
      ;;
    --deb-file)
      DEB_FILE="$2"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="$2"
      shift 2
      ;;
    *)
      echo "Argumento no reconocido: $1" >&2
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${VERSION:-$(node -p "JSON.parse(require('fs').readFileSync('$REPO_ROOT/package.json','utf8')).version")}"
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/ENTREGA/OrganiCursos-$VERSION-Linux/INSTALABLE}"

find_deb_file() {
  local candidate
  for candidate in \
    "$REPO_ROOT/src-tauri/target/release/bundle/deb"/*.deb \
    "$REPO_ROOT/ENTREGA/OrganiCursos-$VERSION-Linux/INSTALABLE"/*.deb
  do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

DEB_FILE="${DEB_FILE:-$(find_deb_file || true)}"

[[ -n "$DEB_FILE" && -f "$DEB_FILE" ]] || {
  echo "No se encontro un .deb de OrganiCursos para reutilizar en el paquete de CachyOS." >&2
  echo "Genera primero la release Linux con: npm run build:linux:release" >&2
  exit 1
}

for command_name in ar makepkg node tar; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "Falta la herramienta requerida: $command_name" >&2
    exit 1
  }
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

cp "$REPO_ROOT/scripts/cachyos-arch/PKGBUILD" "$WORK_DIR/PKGBUILD"
cp "$REPO_ROOT/LICENSE" "$WORK_DIR/LICENSE"
cp "$REPO_ROOT/EULA.md" "$WORK_DIR/EULA.md"

mkdir -p "$WORK_DIR/payload"
(
  cd "$WORK_DIR/payload"
  ar x "$DEB_FILE" data.tar.gz
  tar -xzf data.tar.gz
  rm -f data.tar.gz
  rm -f usr/lib/OrganiCursos/resources/sqlite-vec/vec0.dll
  tar -czf "$WORK_DIR/payload.tar.gz" usr
)

mkdir -p "$OUTPUT_DIR"
(
  cd "$WORK_DIR"
  ORGANI_VERSION="$VERSION" ORGANI_PKGREL="$PKGREL" makepkg -f
)

PACKAGE_FILE="$(find "$WORK_DIR" -maxdepth 1 -type f -name "organicursos-$VERSION-$PKGREL-*.pkg.tar.zst" | head -n 1 || true)"
[[ -n "$PACKAGE_FILE" && -f "$PACKAGE_FILE" ]] || {
  echo "No se pudo generar el paquete .pkg.tar.zst de CachyOS/Arch." >&2
  exit 1
}

cp "$PACKAGE_FILE" "$OUTPUT_DIR/"

echo "Paquete nativo de CachyOS/Arch generado en:"
echo "  $OUTPUT_DIR/$(basename "$PACKAGE_FILE")"
