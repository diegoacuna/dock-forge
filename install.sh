#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$REPO_ROOT/.env"
TIMESTAMP="$(date +"%Y%m%d-%H%M%S")"

MODE=""
SCHEME=""
APP_HOST=""
WEB_PORT=""
API_PORT=""
DOCKER_CONNECTION_MODE=""
DOCKER_SOCKET_PATH=""
DOCKER_HOST=""
DATABASE_PATH=""
NEXT_PUBLIC_API_BASE_URL=""
ENV_BACKUP_PATH=""
NODE_BIN=""
PNPM_BIN=""
SYSTEMD_PATH_VALUE=""
IS_UBUNTU=0
HAS_SYSTEMD=0
CAN_MANAGE_SYSTEMD=0
INSTALL_SYSTEMD=0
SYSTEMD_SERVICE_PATH="/etc/systemd/system/dockforge.service"
SYSTEMD_ACTION="not requested"

REQUIRED_TOOLS=("bash" "node" "pnpm" "docker" "curl")

if [ -t 1 ]; then
  COLOR_BLUE="$(printf '\033[1;34m')"
  COLOR_CYAN="$(printf '\033[1;36m')"
  COLOR_GREEN="$(printf '\033[1;32m')"
  COLOR_YELLOW="$(printf '\033[1;33m')"
  COLOR_RED="$(printf '\033[1;31m')"
  COLOR_DIM="$(printf '\033[2m')"
  COLOR_RESET="$(printf '\033[0m')"
else
  COLOR_BLUE=""
  COLOR_CYAN=""
  COLOR_GREEN=""
  COLOR_YELLOW=""
  COLOR_RED=""
  COLOR_DIM=""
  COLOR_RESET=""
fi

box() {
  local title="$1"
  printf "\n${COLOR_BLUE}============================================================${COLOR_RESET}\n"
  printf "${COLOR_CYAN}%s${COLOR_RESET}\n" "$title"
  printf "${COLOR_BLUE}============================================================${COLOR_RESET}\n"
}

note() {
  printf "${COLOR_CYAN}%s${COLOR_RESET}\n" "$1"
}

ok() {
  printf "${COLOR_GREEN}OK${COLOR_RESET} %s\n" "$1"
}

warn() {
  printf "${COLOR_YELLOW}WARN${COLOR_RESET} %s\n" "$1"
}

fail() {
  printf "${COLOR_RED}ERROR${COLOR_RESET} %s\n" "$1" >&2
  exit 1
}

prompt() {
  local label="$1"
  local default_value="$2"
  local response

  if [ -n "$default_value" ]; then
    printf "${COLOR_CYAN}%s${COLOR_RESET} ${COLOR_DIM}[%s]${COLOR_RESET}: " "$label" "$default_value" >&2
  else
    printf "${COLOR_CYAN}%s${COLOR_RESET}: " "$label" >&2
  fi

  read -r response
  if [ -z "$response" ]; then
    response="$default_value"
  fi

  printf "%s" "$response"
}

yes_no_prompt() {
  local label="$1"
  local default_value="$2"
  local response

  while true; do
    printf "${COLOR_CYAN}%s${COLOR_RESET} ${COLOR_DIM}[%s]${COLOR_RESET}: " "$label" "$default_value" >&2
    read -r response
    response="${response:-$default_value}"

    case "${response,,}" in
      y|yes) return 0 ;;
      n|no) return 1 ;;
      *) warn "Please answer yes or no." ;;
    esac
  done
}

require_command() {
  local command_name="$1"
  command -v "$command_name" >/dev/null 2>&1
}

build_systemd_path() {
  local node_dir="$1"
  local pnpm_dir="$2"
  local path_value="$node_dir:$pnpm_dir:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  awk -v RS=: '!seen[$0]++ { if (NR > 1) printf ":"; printf "%s", $0 }' <<<"$path_value"
}

check_prerequisites() {
  box "DockForge Installer"
  note "This will set up DockForge with a friendly guided flow."
  note "Default mode is long-lived production on Ubuntu, but you can choose development too."

  box "Checking Requirements"

  local missing=()
  local tool
  for tool in "${REQUIRED_TOOLS[@]}"; do
    if require_command "$tool"; then
      ok "Found $tool"
    else
      missing+=("$tool")
      warn "Missing $tool"
    fi
  done

  if [ -f /etc/os-release ] && grep -qi "ubuntu" /etc/os-release; then
    IS_UBUNTU=1
    ok "Ubuntu detected"
  else
    warn "Ubuntu was not detected. The installer can continue, but the systemd path may be skipped."
  fi

  if require_command systemctl; then
    HAS_SYSTEMD=1
    ok "systemd is available"
  else
    warn "systemd is not available"
  fi

  if [ "$(id -u)" -eq 0 ]; then
    CAN_MANAGE_SYSTEMD=1
    ok "Running as root, so systemd changes are allowed"
  elif require_command sudo && sudo -n true >/dev/null 2>&1; then
    CAN_MANAGE_SYSTEMD=1
    ok "Passwordless sudo is available for systemd setup"
  else
    warn "No root or passwordless sudo detected for unattended systemd setup"
  fi

  if ! docker info >/dev/null 2>&1; then
    warn "Docker is installed, but the current user cannot talk to the Docker daemon yet."
    warn "DockForge needs Docker access to be useful. Fix Docker access before continuing if you expect runtime features to work immediately."
  else
    ok "Docker daemon is reachable"
  fi

  if [ "${#missing[@]}" -gt 0 ]; then
    printf "\n${COLOR_YELLOW}Install the missing prerequisites and run ./install.sh again.${COLOR_RESET}\n"
    if [ "$IS_UBUNTU" -eq 1 ]; then
      printf "\nSuggested Ubuntu commands:\n"
      if printf '%s\n' "${missing[@]}" | grep -qx "node"; then
        printf "  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -\n"
        printf "  sudo apt-get install -y nodejs\n"
      fi
      if printf '%s\n' "${missing[@]}" | grep -qx "pnpm"; then
        printf "  corepack enable\n"
        printf "  corepack prepare pnpm@8.7.4 --activate\n"
      fi
      if printf '%s\n' "${missing[@]}" | grep -qx "docker"; then
        printf "  sudo apt-get update && sudo apt-get install -y docker.io\n"
        printf "  sudo usermod -aG docker \"$USER\"\n"
      fi
      if printf '%s\n' "${missing[@]}" | grep -qx "curl"; then
        printf "  sudo apt-get update && sudo apt-get install -y curl\n"
      fi
      if printf '%s\n' "${missing[@]}" | grep -qx "bash"; then
        printf "  sudo apt-get update && sudo apt-get install -y bash\n"
      fi
    fi
    exit 1
  fi

  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$node_major" -lt 20 ]; then
    fail "Node.js 20+ is required. Found $(node -v)."
  fi

  if [ "$node_major" -lt 22 ]; then
    warn "Node.js 22+ is recommended so migrations work without the sqlite3 CLI."
  else
    ok "Node.js version is suitable for self-contained SQLite migrations"
  fi

  NODE_BIN="$(command -v node)"
  PNPM_BIN="$(command -v pnpm)"
  SYSTEMD_PATH_VALUE="$(build_systemd_path "$(dirname "$NODE_BIN")" "$(dirname "$PNPM_BIN")")"
}

collect_configuration() {
  box "Choose Setup Mode"
  MODE="$(prompt "Install mode (production/development)" "production")"
  MODE="${MODE,,}"
  case "$MODE" in
    production|development) ;;
    *)
      fail "Unsupported mode: $MODE. Choose production or development."
      ;;
  esac
  ok "Selected $MODE mode"

  box "Configure Browser Access"
  SCHEME="$(prompt "Public scheme" "http")"
  APP_HOST="$(prompt "Public app host or IP" "localhost")"
  WEB_PORT="$(prompt "Web port" "3000")"
  API_PORT="$(prompt "API port" "4000")"
  NEXT_PUBLIC_API_BASE_URL="${SCHEME}://${APP_HOST}:${API_PORT}/api"
  ok "Browser API base URL will be $NEXT_PUBLIC_API_BASE_URL"

  box "Configure Docker Access"
  DOCKER_CONNECTION_MODE="$(prompt "Docker connection mode (socket/host)" "socket")"
  DOCKER_CONNECTION_MODE="${DOCKER_CONNECTION_MODE,,}"
  case "$DOCKER_CONNECTION_MODE" in
    socket)
      DOCKER_SOCKET_PATH="$(prompt "Docker socket path" "/var/run/docker.sock")"
      DOCKER_HOST=""
      ;;
    host)
      DOCKER_HOST="$(prompt "Docker host URL" "tcp://127.0.0.1:2375")"
      if [ -z "$DOCKER_HOST" ]; then
        fail "Docker host URL cannot be empty when host mode is selected."
      fi
      DOCKER_SOCKET_PATH=""
      ;;
    *)
      fail "Unsupported Docker connection mode: $DOCKER_CONNECTION_MODE"
      ;;
  esac
  ok "Docker runtime will use $DOCKER_CONNECTION_MODE mode"

  box "Configure Database"
  DATABASE_PATH="$(prompt "SQLite database path" "$REPO_ROOT/packages/db/dev.db")"
  if [ "${DATABASE_PATH#/}" = "$DATABASE_PATH" ]; then
    fail "Please use an absolute path for the database file."
  fi
  mkdir -p "$(dirname "$DATABASE_PATH")"
  ok "Database will live at $DATABASE_PATH"
}

write_env_file() {
  box "Writing .env"

  if [ -f "$ENV_FILE" ]; then
    ENV_BACKUP_PATH="$REPO_ROOT/.env.backup.$TIMESTAMP"
    cp "$ENV_FILE" "$ENV_BACKUP_PATH"
    ok "Backed up existing .env to $(basename "$ENV_BACKUP_PATH")"
  fi

  cat > "$ENV_FILE" <<EOF
DOCKER_HOST=$([ "$DOCKER_CONNECTION_MODE" = "host" ] && printf "%s" "$DOCKER_HOST")
DOCKER_SOCKET_PATH=$([ "$DOCKER_CONNECTION_MODE" = "socket" ] && printf "%s" "$DOCKER_SOCKET_PATH")

# API server port.
API_HOST=0.0.0.0
API_PORT=$API_PORT

# Web server bind host and port.
WEB_HOST=0.0.0.0
WEB_PORT=$WEB_PORT

# Browser-facing API base URL used by the Next.js app.
NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# SQLite database path.
DATABASE_URL=file:$DATABASE_PATH
EOF

  ok "Wrote $ENV_FILE"
}

run_setup_commands() {
  box "Installing DockForge"
  note "Running workspace install and database setup commands."

  (cd "$REPO_ROOT" && pnpm install)
  ok "Dependencies installed"

  (cd "$REPO_ROOT" && pnpm db:generate)
  ok "Prisma client generated"

  (cd "$REPO_ROOT" && pnpm db:migrate)
  ok "Database migrations applied"

  local install_complete_cmd=("pnpm" "install:complete" "--" "--docker-connection-mode" "$DOCKER_CONNECTION_MODE")
  if [ "$DOCKER_CONNECTION_MODE" = "socket" ]; then
    install_complete_cmd+=("--docker-socket-path" "$DOCKER_SOCKET_PATH")
  else
    install_complete_cmd+=("--docker-host" "$DOCKER_HOST")
  fi

  (cd "$REPO_ROOT" && "${install_complete_cmd[@]}")
  ok "DockForge install state marked as complete"

  if [ "$MODE" = "production" ]; then
    (cd "$REPO_ROOT" && pnpm build)
    ok "Production build completed"
  else
    note "Development mode selected, so build and service installation are skipped."
  fi
}

write_systemd_service() {
  local runner_user
  if [ -n "${SUDO_USER:-}" ]; then
    runner_user="$SUDO_USER"
  else
    runner_user="$(id -un)"
  fi

  local service_content
  service_content="[Unit]
Description=DockForge local production server
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=$runner_user
WorkingDirectory=$REPO_ROOT
Environment=NODE_ENV=production
Environment=PATH=$SYSTEMD_PATH_VALUE
ExecStart=$PNPM_BIN start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"

  if [ "$(id -u)" -eq 0 ]; then
    printf "%s" "$service_content" > "$SYSTEMD_SERVICE_PATH"
    systemctl daemon-reload
    systemctl enable --now dockforge
  else
    printf "%s" "$service_content" | sudo tee "$SYSTEMD_SERVICE_PATH" >/dev/null
    sudo systemctl daemon-reload
    sudo systemctl enable --now dockforge
  fi
}

configure_systemd_if_requested() {
  if [ "$MODE" != "production" ]; then
    SYSTEMD_ACTION="skipped in development mode"
    return
  fi

  if [ "$IS_UBUNTU" -eq 1 ] && [ "$HAS_SYSTEMD" -eq 1 ] && [ "$CAN_MANAGE_SYSTEMD" -eq 1 ]; then
    box "Optional systemd Service"
    note "DockForge can run as a long-lived Ubuntu service and survive terminal closure."
    if yes_no_prompt "Install and start a systemd service now?" "yes"; then
      write_systemd_service
      SYSTEMD_ACTION="installed and started"
      ok "systemd service created at $SYSTEMD_SERVICE_PATH"
    else
      SYSTEMD_ACTION="declined by user"
      warn "Skipped systemd setup."
    fi
    return
  fi

  if [ "$IS_UBUNTU" -eq 1 ] && [ "$HAS_SYSTEMD" -eq 1 ]; then
    SYSTEMD_ACTION="available but not installed"
    box "systemd Follow-up"
    warn "This machine supports systemd, but the installer cannot write the service without root or passwordless sudo."
    printf "Next step later:\n"
    printf "  sudo editor %s\n" "$SYSTEMD_SERVICE_PATH"
    printf "  sudo systemctl daemon-reload\n"
    printf "  sudo systemctl enable --now dockforge\n"
    return
  fi

  SYSTEMD_ACTION="not available on this machine"
}

print_summary() {
  box "Install Summary"
  printf "%bMode:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$MODE"
  printf "%bChecked:%b bash, node, pnpm, docker, curl" "$COLOR_DIM" "$COLOR_RESET"
  if [ "$IS_UBUNTU" -eq 1 ]; then
    printf ", ubuntu"
  fi
  if [ "$HAS_SYSTEMD" -eq 1 ]; then
    printf ", systemd"
  fi
  printf "\n"
  printf "%bEnvironment:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$ENV_FILE"
  printf "%bPublic URL:%b %s://%s:%s\n" "$COLOR_DIM" "$COLOR_RESET" "$SCHEME" "$APP_HOST" "$WEB_PORT"
  printf "%bAPI Base:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$NEXT_PUBLIC_API_BASE_URL"
  printf "%bDatabase:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$DATABASE_PATH"
  printf "%bDocker Mode:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$DOCKER_CONNECTION_MODE"
  printf "%bApp Install State:%b completed\n" "$COLOR_DIM" "$COLOR_RESET"
  printf "%bSystemd:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$SYSTEMD_ACTION"
  if [ -n "$ENV_BACKUP_PATH" ]; then
    printf "%bBackup:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$ENV_BACKUP_PATH"
  fi

  box "What To Do Next"
  if [ "$MODE" = "development" ]; then
    printf "1. Start DockForge with:\n"
    printf "   cd %s && pnpm dev\n" "$REPO_ROOT"
    printf "2. Open %s://%s:%s\n" "$SCHEME" "$APP_HOST" "$WEB_PORT"
    printf "3. When you want long-lived production later, rerun ./install.sh and choose production.\n"
    return
  fi

  if [ "$SYSTEMD_ACTION" = "installed and started" ]; then
    printf "1. Open %s://%s:%s\n" "$SCHEME" "$APP_HOST" "$WEB_PORT"
    printf "2. Check service health with:\n"
    printf "   sudo systemctl status dockforge\n"
    printf "3. Stream logs with:\n"
    printf "   sudo journalctl -u dockforge -f\n"
    return
  fi

  printf "1. Start DockForge with:\n"
  printf "   cd %s && pnpm start\n" "$REPO_ROOT"
  printf "2. Open %s://%s:%s\n" "$SCHEME" "$APP_HOST" "$WEB_PORT"
  if [ "$SYSTEMD_ACTION" = "available but not installed" ]; then
    printf "3. To make it long-lived on Ubuntu, install the service at %s and run:\n" "$SYSTEMD_SERVICE_PATH"
    printf "   sudo systemctl daemon-reload && sudo systemctl enable --now dockforge\n"
  else
    printf "3. If you want it long-lived later, rerun ./install.sh on Ubuntu with systemd access.\n"
  fi
}

main() {
  check_prerequisites
  collect_configuration
  write_env_file
  run_setup_commands
  configure_systemd_if_requested
  print_summary
}

main "$@"
