#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${SQLITE_VEC_SOURCE:-}"
OUTPUT_DIR="${OUTPUT_DIR:-}"
VERSION="${SQLITE_VEC_VERSION:-0.1.9}"
ARCH="${ARCH:-}"

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
    --version)
      VERSION="$2"
      shift 2
      ;;
    --arch)
      ARCH="$2"
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

resolve_arch() {
  if [[ -n "$ARCH" ]]; then
    case "$ARCH" in
      arm64|aarch64)
        printf '%s\n' "aarch64"
        return
        ;;
      x64|x86_64|amd64)
        printf '%s\n' "x86_64"
        return
        ;;
      *)
        echo "Arquitectura no soportada para sqlite-vec en macOS: $ARCH" >&2
        exit 1
        ;;
    esac
  fi

  case "$(uname -m)" in
    arm64|aarch64) printf '%s\n' "aarch64" ;;
    x86_64|amd64) printf '%s\n' "x86_64" ;;
    *)
      echo "No se pudo detectar la arquitectura de macOS. Usa --arch x64|arm64" >&2
      exit 1
      ;;
  esac
}

download_sqlite_vec() {
  local detected_arch asset_name asset_url temp_dir archive_path extract_dir candidate staged_path
  detected_arch="$(resolve_arch)"
  asset_name="sqlite-vec-$VERSION-loadable-macos-$detected_arch.tar.gz"
  asset_url="https://github.com/asg017/sqlite-vec/releases/download/v$VERSION/$asset_name"

  if command -v curl >/dev/null 2>&1; then
    :
  elif command -v wget >/dev/null 2>&1; then
    :
  else
    echo "Se necesita curl o wget para descargar sqlite-vec automaticamente." >&2
    exit 1
  fi

  temp_dir="$(mktemp -d)"
  archive_path="$temp_dir/$asset_name"
  extract_dir="$temp_dir/extract"
  mkdir -p "$extract_dir"

  echo "Descargando sqlite-vec $VERSION para macOS $detected_arch..." >&2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$asset_url" -o "$archive_path"
  else
    wget -q "$asset_url" -O "$archive_path"
  fi

  tar -xzf "$archive_path" -C "$extract_dir"
  for candidate in "$extract_dir/vec0.dylib" "$extract_dir/sqlite_vec.dylib"; do
    if [[ -f "$candidate" ]]; then
      staged_path="$temp_dir/vec0.dylib"
      cp "$candidate" "$staged_path"
      chmod +x "$staged_path"
      printf '%s\n' "$staged_path"
      return
    fi
  done

  rm -rf "$temp_dir"
  echo "No se encontro vec0.dylib ni sqlite_vec.dylib dentro del paquete descargado: $asset_url" >&2
  exit 1
}

[[ -n "$SOURCE_FILE" ]] || {
  SOURCE_FILE="$(download_sqlite_vec)"
}

[[ -f "$SOURCE_FILE" ]] || {
  echo "No existe la biblioteca sqlite-vec indicada: $SOURCE_FILE" >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"
cp "$SOURCE_FILE" "$OUTPUT_DIR/vec0.dylib"
chmod +x "$OUTPUT_DIR/vec0.dylib"

echo "sqlite-vec para macOS preparado en $OUTPUT_DIR/vec0.dylib"
