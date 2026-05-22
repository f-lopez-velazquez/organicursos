#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
BOLD='\033[1m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd || true)"

find_package_file() {
  local candidate
  for candidate in \
    "$SCRIPT_DIR"/organicursos-*.pkg.tar.zst \
    "$SCRIPT_DIR"/../*.pkg.tar.zst \
    "$REPO_ROOT"/ENTREGA/OrganiCursos-*-Linux/INSTALABLE/organicursos-*.pkg.tar.zst
  do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

find_deb_file() {
  local candidate
  for candidate in \
    "$SCRIPT_DIR"/OrganiCursos-*.deb \
    "$SCRIPT_DIR"/../*.deb \
    "$REPO_ROOT"/ENTREGA/OrganiCursos-*-Linux/INSTALABLE/*.deb \
    "$REPO_ROOT"/src-tauri/target/release/bundle/deb/*.deb
  do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

echo -e "${BLUE}${BOLD}====================================================${NC}"
echo -e "${GREEN}${BOLD}      Instalador de OrganiCursos para CachyOS / Arch ${NC}"
echo -e "${BLUE}${BOLD}====================================================${NC}"
echo

if [[ ! -f /etc/arch-release ]]; then
  echo -e "${RED}[ERROR] Este instalador esta pensado para CachyOS, Arch Linux y derivados.${NC}"
  exit 1
fi

command -v pacman >/dev/null 2>&1 || {
  echo -e "${RED}[ERROR] No se encontro pacman en el sistema.${NC}"
  exit 1
}

PACKAGE_FILE="$(find_package_file || true)"
if [[ -z "$PACKAGE_FILE" ]]; then
  BUILD_SCRIPT="$REPO_ROOT/scripts/build-cachyos-package.sh"
  DEB_FILE="$(find_deb_file || true)"
  if [[ -n "$REPO_ROOT" && -x "$BUILD_SCRIPT" && -n "$DEB_FILE" ]]; then
    echo -e "${YELLOW}[1/2] No habia paquete .pkg.tar.zst listo. Lo genero a partir del .deb Linux...${NC}"
    bash "$BUILD_SCRIPT" --deb-file "$DEB_FILE" --output-dir "$SCRIPT_DIR"
    PACKAGE_FILE="$(find_package_file || true)"
  fi
fi

[[ -n "$PACKAGE_FILE" && -f "$PACKAGE_FILE" ]] || {
  echo -e "${RED}[ERROR] No se encontro un paquete .pkg.tar.zst para instalar.${NC}"
  echo -e "${BLUE}Coloca este script junto al paquete nativo o genera uno con:${NC}"
  echo -e "${BLUE}  npm run build:cachyos:package${NC}"
  exit 1
}

echo -e "${YELLOW}[1/2] Instalando dependencias y paquete nativo...${NC}"
sudo pacman -U --needed "$PACKAGE_FILE"

echo
echo -e "${GREEN}${BOLD}====================================================${NC}"
echo -e "${GREEN}${BOLD}   OrganiCursos quedo instalado correctamente        ${NC}"
echo -e "${BLUE}   Abre 'OrganiCursos' desde el menu o ejecuta:${NC}"
echo -e "${BLUE}   organicursos${NC}"
echo -e "${GREEN}${BOLD}====================================================${NC}"
