#!/usr/bin/env bash
set -euo pipefail

SKIP_TESTS=0
SKIP_SIDECARS=0
SKIP_SQLITE_VEC=0
ARCH="${ARCH:-}"
CARGO_TARGET_DIR_INPUT="${CARGO_TARGET_DIR_INPUT:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-tests)
      SKIP_TESTS=1
      shift
      ;;
    --skip-sidecars)
      SKIP_SIDECARS=1
      shift
      ;;
    --skip-sqlite-vec)
      SKIP_SQLITE_VEC=1
      shift
      ;;
    --arch)
      ARCH="$2"
      shift 2
      ;;
    --cargo-target-dir)
      CARGO_TARGET_DIR_INPUT="$2"
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
BUNDLE_ROOT="$CARGO_TARGET_DIR/release/bundle"

resolve_appimage_arch() {
  case "${ARCH:-$(uname -m)}" in
    arm64|aarch64)
      printf '%s\n' "aarch64"
      ;;
    x64|x86_64|amd64)
      printf '%s\n' "x86_64"
      ;;
    *)
      printf '%s\n' "x86_64"
      ;;
  esac
}

repair_appimage_bundle() {
  local appimage_dir appdir deb_file output_file appimagetool_path desktop_file icon_name appimage_arch metainfo_source metainfo_target
  appimage_dir="$BUNDLE_ROOT/appimage"
  appdir="$(find "$appimage_dir" -maxdepth 1 -type d -name "*.AppDir" | head -n 1 || true)"
  deb_file="$(find "$BUNDLE_ROOT/deb" -maxdepth 1 -type f -name "*.deb" | head -n 1 || true)"
  appimage_arch="$(resolve_appimage_arch)"

  if [[ -z "$appdir" || ! -d "$appdir" ]]; then
    echo "No se encontro AppDir para reparar el AppImage." >&2
    return 1
  fi

  if [[ -n "$deb_file" ]]; then
    output_file="$appimage_dir/$(basename "${deb_file%.deb}.AppImage")"
  else
    output_file="$appimage_dir/$(basename "${appdir%.AppDir}.AppImage")"
  fi

  desktop_file="$(find "$appdir/usr/share/applications" -maxdepth 1 -type f -name "*.desktop" | head -n 1 || true)"
  icon_name="$(sed -n 's/^Icon=//p' "$desktop_file" 2>/dev/null | head -n 1 || true)"
  if [[ -n "$icon_name" && ! -e "$appdir/$icon_name.png" && -e "$appdir/OrganiCursos.png" ]]; then
    ln -sf "OrganiCursos.png" "$appdir/$icon_name.png"
  fi

  metainfo_source="$REPO_ROOT/src-tauri/OrganiCursos.appdata.xml"
  metainfo_target="$appdir/usr/share/metainfo/app.organicursos.desktop.appdata.xml"
  if [[ -f "$metainfo_source" ]]; then
    mkdir -p "$(dirname "$metainfo_target")"
    cp "$metainfo_source" "$metainfo_target"
  fi

  appimagetool_path="$(find /tmp -maxdepth 4 -type f -path "*/usr/bin/appimagetool" | head -n 1 || true)"
  if [[ -z "$appimagetool_path" ]]; then
    echo "No se encontro appimagetool temporal para reparar el AppImage." >&2
    return 1
  fi

  echo "Intentando reparar AppImage manualmente desde $appdir"
  ARCH="$appimage_arch" "$appimagetool_path" "$appdir" "$output_file"
}

if [[ "$SKIP_SIDECARS" -eq 0 ]]; then
  bash "$REPO_ROOT/scripts/stage-ffmpeg-sidecars-linux.sh" ${ARCH:+--arch "$ARCH"}
fi

if [[ "$SKIP_SQLITE_VEC" -eq 0 ]]; then
  bash "$REPO_ROOT/scripts/stage-sqlite-vec-linux.sh"
fi

cd "$REPO_ROOT"
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR

npm run build
if [[ "$SKIP_TESTS" -eq 0 ]]; then
  npm test
fi

if ! npm run tauri -- build --bundles deb,appimage; then
  echo "Tauri no pudo cerrar el AppImage automaticamente. Intentando reparacion..." >&2
  repair_appimage_bundle
fi

echo
echo "Artefactos generados en:"
echo "  $CARGO_TARGET_DIR/release/bundle/deb"
echo "  $CARGO_TARGET_DIR/release/bundle/appimage"
