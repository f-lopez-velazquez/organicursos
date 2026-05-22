#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${SQLITE_VEC_SOURCE:-}"
OUTPUT_DIR="${OUTPUT_DIR:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      SOURCE_FILE="$2"
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
OUTPUT_DIR="${OUTPUT_DIR:-$REPO_ROOT/src-tauri/resources/sqlite-vec}"

[[ -n "$SOURCE_FILE" ]] || {
  echo "Debes indicar la biblioteca vec0.dylib con --source /ruta/vec0.dylib o SQLITE_VEC_SOURCE." >&2
  exit 1
}

[[ -f "$SOURCE_FILE" ]] || {
  echo "No existe la biblioteca sqlite-vec indicada: $SOURCE_FILE" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
cp "$SOURCE_FILE" "$OUTPUT_DIR/vec0.dylib"
chmod +x "$OUTPUT_DIR/vec0.dylib"

echo "sqlite-vec para macOS preparado en $OUTPUT_DIR/vec0.dylib"
