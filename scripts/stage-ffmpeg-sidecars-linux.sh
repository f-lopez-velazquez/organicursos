#!/usr/bin/env bash
set -euo pipefail

ARCH="${ARCH:-}"
SOURCE_ROOT="${SOURCE_ROOT:-}"
OUTPUT_DIR="${OUTPUT_DIR:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      ARCH="$2"
      shift 2
      ;;
    --source-root)
      SOURCE_ROOT="$2"
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
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/src-tauri/bin}"

if [[ -z "$ARCH" ]]; then
  case "$(uname -m)" in
    arm64|aarch64) ARCH="arm64" ;;
    x86_64) ARCH="x64" ;;
    *)
      echo "No se pudo detectar la arquitectura de Linux. Usa --arch x64|arm64" >&2
      exit 1
      ;;
  esac
fi

case "$ARCH" in
  arm64) TARGET_TRIPLE="aarch64-unknown-linux-gnu" ;;
  x64) TARGET_TRIPLE="x86_64-unknown-linux-gnu" ;;
  *)
    echo "Arquitectura no soportada para Linux: $ARCH" >&2
    exit 1
    ;;
esac

resolve_binary_dir() {
  if [[ -n "$SOURCE_ROOT" ]]; then
    [[ -d "$SOURCE_ROOT" ]] || { echo "La ruta de sidecars no existe: $SOURCE_ROOT" >&2; exit 1; }
    printf '%s\n' "$SOURCE_ROOT"
    return
  fi

  local ffmpeg_path ffprobe_path
  ffmpeg_path="$(command -v ffmpeg || true)"
  ffprobe_path="$(command -v ffprobe || true)"
  [[ -n "$ffmpeg_path" && -n "$ffprobe_path" ]] || {
    echo "No se encontraron ffmpeg y ffprobe en PATH. Usa --source-root /ruta/a/bin" >&2
    exit 1
  }
  dirname "$ffmpeg_path"
}

SOURCE_DIR="$(resolve_binary_dir)"
mkdir -p "$OUTPUT_DIR"

cp "$SOURCE_DIR/ffmpeg" "$OUTPUT_DIR/organicursos-ffmpeg-$TARGET_TRIPLE"
cp "$SOURCE_DIR/ffprobe" "$OUTPUT_DIR/organicursos-ffprobe-$TARGET_TRIPLE"
chmod +x "$OUTPUT_DIR/organicursos-ffmpeg-$TARGET_TRIPLE" "$OUTPUT_DIR/organicursos-ffprobe-$TARGET_TRIPLE"

echo "Sidecars Linux preparados en $OUTPUT_DIR para $TARGET_TRIPLE"
