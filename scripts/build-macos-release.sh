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
CARGO_TARGET_DIR="${CARGO_TARGET_DIR_INPUT:-$HOME/Library/Caches/OrganiCursos/cargo-target}"

if [[ "$SKIP_SIDECARS" -eq 0 ]]; then
  bash "$REPO_ROOT/scripts/stage-ffmpeg-sidecars-macos.sh" ${ARCH:+--arch "$ARCH"}
fi

if [[ "$SKIP_SQLITE_VEC" -eq 0 ]]; then
  bash "$REPO_ROOT/scripts/stage-sqlite-vec-macos.sh"
fi

cd "$REPO_ROOT"
export PATH="$HOME/.cargo/bin:$PATH"
export CARGO_TARGET_DIR

npm run build
if [[ "$SKIP_TESTS" -eq 0 ]]; then
  npm test
fi

npm run tauri -- build --bundles app,dmg

echo
echo "Artefactos generados en:"
echo "  $CARGO_TARGET_DIR/release/bundle/macos"
echo "  $CARGO_TARGET_DIR/release/bundle/dmg"
