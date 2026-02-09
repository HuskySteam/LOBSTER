#!/usr/bin/env bash
set -euo pipefail

REPO="HuskySteam/LOBSTER"
INSTALL_DIR="$HOME/.lobster/bin"
BINARY_NAME="lobster"

# ─── Colors & Styles ─────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ─── Output Helpers ──────────────────────────────────────────────
info()    { printf "  ${CYAN}│${RESET}  %s\n" "$*"; }
success() { printf "  ${GREEN}│${RESET}  ${GREEN}✓${RESET} %s\n" "$*"; }
warn()    { printf "  ${YELLOW}│${RESET}  ${YELLOW}⚠${RESET} %s\n" "$*"; }
error()   { printf "  ${RED}│${RESET}  ${RED}✗ %s${RESET}\n" "$*" >&2; printf "  ${RED}└${RESET}\n"; exit 1; }
step()    { printf "  ${CYAN}│${RESET}\n  ${CYAN}├─${RESET} ${BOLD}%s${RESET}\n" "$*"; }

banner() {
  echo ""
  printf "  ${RED}╔══════════════════════════════════════════════════════════╗${RESET}\n"
  printf "  ${RED}║${RESET}                                                          ${RED}║${RESET}\n"
  printf "  ${RED}║${RESET}   ${BOLD}██╗      ██████╗ ██████╗ ███████╗████████╗███████╗██████╗${RESET} ${RED} ║${RESET}\n"
  printf "  ${RED}║${RESET}   ${BOLD}██║     ██╔═══██╗██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗${RESET}${RED}║${RESET}\n"
  printf "  ${RED}║${RESET}   ${BOLD}██║     ██║   ██║██████╔╝███████╗   ██║   █████╗  ██████╔╝${RESET}${RED}║${RESET}\n"
  printf "  ${RED}║${RESET}   ${BOLD}██║     ██║   ██║██╔══██╗╚════██║   ██║   ██╔══╝  ██╔══██╗${RESET}${RED}║${RESET}\n"
  printf "  ${RED}║${RESET}   ${BOLD}███████╗╚██████╔╝██████╔╝███████║   ██║   ███████╗██║  ██║${RESET}${RED}║${RESET}\n"
  printf "  ${RED}║${RESET}   ${BOLD}╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝${RESET}${RED}║${RESET}\n"
  printf "  ${RED}║${RESET}                                                          ${RED}║${RESET}\n"
  printf "  ${RED}║${RESET}   ${DIM}AI-Powered Coding Agent with a Development Team${RESET}       ${RED}║${RESET}\n"
  printf "  ${RED}║${RESET}                                                          ${RED}║${RESET}\n"
  printf "  ${RED}╚══════════════════════════════════════════════════════════╝${RESET}\n"
  echo ""
  printf "  ${CYAN}┌─${RESET} ${BOLD}Installer${RESET}\n"
  printf "  ${CYAN}│${RESET}\n"
}

# ─── Detect OS ───────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "darwin" ;;
    *)       error "Unsupported OS: $(uname -s). Use install.ps1 for Windows." ;;
  esac
}

# ─── Detect Architecture ────────────────────────────────────────
detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64)  echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *)             error "Unsupported architecture: $(uname -m)" ;;
  esac
}

# ─── Detect Libc (Linux only) ───────────────────────────────────
detect_libc() {
  if [ "$1" != "linux" ]; then
    echo ""
    return
  fi
  if command -v ldd >/dev/null 2>&1; then
    if ldd --version 2>&1 | grep -qi musl; then
      echo "musl"
      return
    fi
  fi
  if ls /lib/ld-musl-* >/dev/null 2>&1; then
    echo "musl"
    return
  fi
  echo ""
}

# ─── Detect AVX2 (x64 only) ─────────────────────────────────────
detect_baseline() {
  local os="$1"
  local arch="$2"
  if [ "${LOBSTER_BASELINE:-}" = "1" ]; then echo "baseline"; return; fi
  if [ "$arch" != "x64" ]; then echo ""; return; fi
  if [ "$os" = "linux" ]; then
    if grep -q "avx2" /proc/cpuinfo 2>/dev/null; then echo ""; else echo "baseline"; fi
  elif [ "$os" = "darwin" ]; then
    if sysctl -n machdep.cpu.leaf7_features 2>/dev/null | grep -qi "AVX2"; then echo ""; else echo "baseline"; fi
  else
    echo ""
  fi
}

# ─── Archive Name ────────────────────────────────────────────────
get_archive_name() {
  local os="$1" arch="$2" baseline="$3" libc="$4"
  local name="lobster-${os}-${arch}"
  [ -n "$baseline" ] && name="${name}-${baseline}"
  [ -n "$libc" ] && name="${name}-${libc}"
  if [ "$os" = "linux" ]; then echo "${name}.tar.gz"; else echo "${name}.zip"; fi
}

# ─── Resolve Version ────────────────────────────────────────────
resolve_version() {
  if [ -n "${LOBSTER_VERSION:-}" ]; then echo "$LOBSTER_VERSION"; return; fi
  local latest
  latest=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name": *"v([^"]+)".*/\1/')
  if [ -z "$latest" ]; then
    error "Could not determine latest version. Set LOBSTER_VERSION manually."
  fi
  echo "$latest"
}

# ─── Progress Bar ────────────────────────────────────────────────
progress() {
  local current=$1 total=$2 width=30
  local filled=$((current * width / total))
  local empty=$((width - filled))
  printf "\r  ${CYAN}│${RESET}  ${DIM}[${RESET}"
  printf "${GREEN}%0.s█${RESET}" $(seq 1 $filled 2>/dev/null || true)
  printf "${DIM}%0.s░${RESET}" $(seq 1 $empty 2>/dev/null || true)
  printf "${DIM}]${RESET} %d%%" $((current * 100 / total))
}

# ─── Add to PATH ────────────────────────────────────────────────
add_to_path() {
  local path_entry="export PATH=\"${INSTALL_DIR}:\$PATH\""
  local fish_entry="set -gx PATH \"${INSTALL_DIR}\" \$PATH"
  local added=false
  local shell_name
  shell_name=$(basename "${SHELL:-bash}")

  case "$shell_name" in
    zsh)  add_to_shell_config "$HOME/.zshrc" "$path_entry" && added=true ;;
    bash)
      [ -f "$HOME/.bashrc" ] && add_to_shell_config "$HOME/.bashrc" "$path_entry" && added=true
      if [ -f "$HOME/.bash_profile" ]; then
        add_to_shell_config "$HOME/.bash_profile" "$path_entry" && added=true
      elif [ ! -f "$HOME/.bashrc" ]; then
        add_to_shell_config "$HOME/.bash_profile" "$path_entry" && added=true
      fi
      ;;
    fish)
      local fish_config="$HOME/.config/fish/config.fish"
      mkdir -p "$(dirname "$fish_config")"
      add_to_shell_config "$fish_config" "$fish_entry" && added=true
      ;;
    *)    add_to_shell_config "$HOME/.profile" "$path_entry" && added=true ;;
  esac

  if [ "$added" = true ]; then
    success "Added to PATH in shell config"
  fi
  export PATH="${INSTALL_DIR}:$PATH"
}

add_to_shell_config() {
  local config_file="$1" entry="$2"
  if [ -f "$config_file" ] && grep -qF "$INSTALL_DIR" "$config_file"; then return 1; fi
  echo "" >> "$config_file"
  echo "# LOBSTER" >> "$config_file"
  echo "$entry" >> "$config_file"
  return 0
}

# ─── Main ────────────────────────────────────────────────────────
main() {
  banner

  # Step 1: Detect system
  step "Detecting system"
  local os arch libc baseline
  os=$(detect_os)
  arch=$(detect_arch)
  libc=$(detect_libc "$os")
  baseline=$(detect_baseline "$os" "$arch")
  success "Platform: ${os} ${arch}${baseline:+ (baseline)}${libc:+ (${libc})}"

  # Step 2: Resolve version
  step "Resolving version"
  local version
  version=$(resolve_version)
  success "Version: ${BOLD}v${version}${RESET}"

  # Step 3: Download
  step "Downloading"
  local archive
  archive=$(get_archive_name "$os" "$arch" "$baseline" "$libc")
  local url="https://github.com/${REPO}/releases/download/v${version}/${archive}"
  info "${DIM}${archive}${RESET}"

  local tmpdir
  tmpdir=$(mktemp -d)
  trap 'rm -rf "$tmpdir"' EXIT
  local tmpfile="${tmpdir}/${archive}"
  curl -fsSL "$url" -o "$tmpfile" || error "Download failed. Check https://github.com/${REPO}/releases"
  success "Downloaded"

  # Step 4: Install
  step "Installing"
  mkdir -p "$INSTALL_DIR"
  info "${DIM}→ ${INSTALL_DIR}${RESET}"
  if [ "$os" = "linux" ]; then
    tar -xzf "$tmpfile" -C "$INSTALL_DIR"
  else
    unzip -oq "$tmpfile" -d "$INSTALL_DIR"
  fi
  chmod +x "${INSTALL_DIR}/${BINARY_NAME}"
  success "Binary installed"

  # Step 5: PATH
  step "Configuring PATH"
  add_to_path

  # Done
  printf "  ${CYAN}│${RESET}\n"
  if [ -x "${INSTALL_DIR}/${BINARY_NAME}" ]; then
    printf "  ${GREEN}└─${RESET} ${GREEN}${BOLD}Installation complete!${RESET}\n"
    echo ""
    printf "  ${DIM}┌──────────────────────────────────────────┐${RESET}\n"
    printf "  ${DIM}│${RESET}                                          ${DIM}│${RESET}\n"
    printf "  ${DIM}│${RESET}   ${BOLD}LOBSTER v${version}${RESET} installed successfully   ${DIM}│${RESET}\n"
    printf "  ${DIM}│${RESET}                                          ${DIM}│${RESET}\n"
    printf "  ${DIM}│${RESET}   Run ${CYAN}lobster${RESET} to get started             ${DIM}│${RESET}\n"
    printf "  ${DIM}│${RESET}                                          ${DIM}│${RESET}\n"
    printf "  ${DIM}└──────────────────────────────────────────┘${RESET}\n"
    echo ""
    if ! command -v lobster >/dev/null 2>&1; then
      warn "Restart your terminal or run:"
      info "  export PATH=\"${INSTALL_DIR}:\$PATH\""
      echo ""
    fi
  else
    error "Installation failed — binary not found"
  fi
}

main
