#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-.}"
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
MARKER="$TARGET_DIR/.organicursos-portable"
PORTABLE_ROOT="$TARGET_DIR/portable-data"

mkdir -p "$PORTABLE_ROOT/data" "$PORTABLE_ROOT/cache"
printf 'portable-mode=1\n' > "$MARKER"

echo "Modo portable habilitado en $TARGET_DIR"
echo "Se creo el marcador: $MARKER"
