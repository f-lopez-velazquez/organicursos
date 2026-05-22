#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -x "$SCRIPT_DIR/scripts/cachyos-arch/install.sh" ]]; then
  cd "$SCRIPT_DIR"
  exec ./scripts/cachyos-arch/install.sh
fi

echo "No se encontro el instalador de CachyOS esperado." >&2
exit 1
