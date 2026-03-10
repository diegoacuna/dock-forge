#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$REPO_ROOT/.env"
SYSTEMD_SERVICE_PATH="/etc/systemd/system/dockforge.service"

NODE_BIN=""
PNPM_BIN=""
SYSTEMD_PATH_VALUE=""
RESTART_METHOD="auto"
NON_INTERACTIVE=0
SKIP_INSTALL=0
SKIP_BUILD=0
SKIP_RESTART=0
SYSTEMD_ACTION="not attempted"
MANUAL_RESTART_COMMAND="cd $REPO_ROOT && pnpm start"
DATABASE_URL_VALUE=""
DATABASE_PATH=""

REQUIRED_TOOLS=("bash" "node" "pnpm" "docker")

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

usage() {
  cat <<EOF
Usage:
  ./update.sh [options]

Options:
  --non-interactive         Run without prompts and use the selected/default restart method.
  --skip-install            Skip pnpm install.
  --skip-build              Skip pnpm build.
  --skip-restart            Do not restart DockForge after a successful update.
  --restart-method <mode>   Choose restart handling: auto, systemd, or manual.
  --help, -h                Show this help text.

Examples:
  ./update.sh
  ./update.sh --skip-restart
  ./update.sh --non-interactive --restart-method manual
EOF
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --non-interactive)
        NON_INTERACTIVE=1
        ;;
      --skip-install)
        SKIP_INSTALL=1
        ;;
      --skip-build)
        SKIP_BUILD=1
        ;;
      --skip-restart)
        SKIP_RESTART=1
        ;;
      --restart-method)
        shift
        [ "$#" -gt 0 ] || fail "Missing value for --restart-method."
        RESTART_METHOD="${1,,}"
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
    shift
  done

  case "$RESTART_METHOD" in
    auto|systemd|manual) ;;
    *)
      fail "Unsupported restart method: $RESTART_METHOD. Choose auto, systemd, or manual."
      ;;
  esac
}

read_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    printf ""
    return
  fi

  printf "%s" "${line#*=}"
}

resolved_env_value() {
  local key="$1"
  local default_value="$2"
  local value
  value="$(read_env_value "$key")"
  if [ -n "$value" ]; then
    printf "%s" "$value"
    return
  fi

  printf "%s" "$default_value"
}

resolve_database_path() {
  local database_url="$1"
  local raw_target="${database_url#file:}"

  if [[ "$raw_target" = /* ]]; then
    printf "%s" "$raw_target"
    return
  fi

  printf "%s" "$REPO_ROOT/packages/db/prisma/$raw_target"
}

check_prerequisites() {
  box "DockForge Updater"
  note "This updates an existing DockForge production install in the current checkout."
  note "Update the repo separately first, then use this script to apply dependencies, migrations, and a rebuild."

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

  if ! docker info >/dev/null 2>&1; then
    warn "Docker is installed, but the current user cannot reach the Docker daemon right now."
    warn "The update can continue, but runtime features will stay unavailable until Docker access is fixed."
  else
    ok "Docker daemon is reachable"
  fi

  if [ "${#missing[@]}" -gt 0 ]; then
    printf "\n${COLOR_YELLOW}Install the missing prerequisites and run ./update.sh again.${COLOR_RESET}\n"
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

validate_environment() {
  box "Validating Existing Install"

  if [ ! -f "$ENV_FILE" ]; then
    fail "Missing $ENV_FILE. This updater is for an existing install. Run ./install.sh first."
  fi
  ok "Found $ENV_FILE"
  note "Using the existing environment file without modifying it."

  local api_host api_port web_host web_port api_base_url
  api_host="$(resolved_env_value "API_HOST" "0.0.0.0")"
  api_port="$(resolved_env_value "API_PORT" "4000")"
  web_host="$(resolved_env_value "WEB_HOST" "0.0.0.0")"
  web_port="$(resolved_env_value "WEB_PORT" "3000")"
  api_base_url="$(resolved_env_value "NEXT_PUBLIC_API_BASE_URL" "http://localhost:4000/api")"
  DATABASE_URL_VALUE="$(resolved_env_value "DATABASE_URL" "file:$REPO_ROOT/packages/db/dev.db")"

  if [ -z "$(read_env_value "API_HOST")" ]; then
    warn ".env is missing API_HOST. Falling back to 0.0.0.0."
  else
    ok "Loaded API_HOST from .env"
  fi

  if [ -z "$(read_env_value "API_PORT")" ]; then
    warn ".env is missing API_PORT. Falling back to 4000."
  else
    ok "Loaded API_PORT from .env"
  fi

  if [ -z "$(read_env_value "WEB_HOST")" ]; then
    warn ".env is missing WEB_HOST. Falling back to 0.0.0.0."
  else
    ok "Loaded WEB_HOST from .env"
  fi

  if [ -z "$(read_env_value "WEB_PORT")" ]; then
    warn ".env is missing WEB_PORT. Falling back to 3000."
  else
    ok "Loaded WEB_PORT from .env"
  fi

  if [ -z "$(read_env_value "NEXT_PUBLIC_API_BASE_URL")" ]; then
    warn ".env is missing NEXT_PUBLIC_API_BASE_URL. Falling back to http://localhost:4000/api."
  else
    ok "Loaded NEXT_PUBLIC_API_BASE_URL from .env"
  fi

  if [ -z "$(read_env_value "DATABASE_URL")" ]; then
    warn ".env is missing DATABASE_URL. Falling back to file:$REPO_ROOT/packages/db/dev.db."
  else
    ok "Loaded DATABASE_URL from .env"
  fi

  case "$api_port" in
    ''|*[!0-9]*)
      fail "API_PORT must be a numeric port. Found: $api_port"
      ;;
  esac

  case "$web_port" in
    ''|*[!0-9]*)
      fail "WEB_PORT must be a numeric port. Found: $web_port"
      ;;
  esac

  if [ -z "$api_host" ] || [ -z "$web_host" ]; then
    fail "API_HOST and WEB_HOST must resolve to non-empty values."
  fi

  case "$api_base_url" in
    http://*|https://*)
      ok "Resolved browser API base URL to $api_base_url"
      ;;
    *)
      fail "NEXT_PUBLIC_API_BASE_URL must start with http:// or https://. Found: $api_base_url"
      ;;
  esac

  if [[ "$DATABASE_URL_VALUE" != file:* ]]; then
    fail "DATABASE_URL must use a SQLite file: path. Found: $DATABASE_URL_VALUE"
  fi

  DATABASE_PATH="$(resolve_database_path "$DATABASE_URL_VALUE")"
  if [ ! -f "$DATABASE_PATH" ]; then
    fail "Expected an existing SQLite database at $DATABASE_PATH. This updater is for an installed instance; run ./install.sh first if the database has not been created."
  fi
  ok "Found existing SQLite database at $DATABASE_PATH"
}

run_update_commands() {
  box "Applying Update"
  note "Running dependency install, Prisma client generation, database migrations, and production build."

  if [ "$SKIP_INSTALL" -eq 1 ]; then
    warn "Skipping pnpm install because --skip-install was provided."
  else
    (cd "$REPO_ROOT" && pnpm install)
    ok "Dependencies installed"
  fi

  (cd "$REPO_ROOT" && pnpm db:generate)
  ok "Prisma client generated"

  (cd "$REPO_ROOT" && pnpm db:migrate)
  ok "Database migrations applied"

  if [ "$SKIP_BUILD" -eq 1 ]; then
    warn "Skipping pnpm build because --skip-build was provided."
  else
    (cd "$REPO_ROOT" && pnpm build)
    ok "Production build completed"
  fi
}

can_manage_systemd() {
  if [ "$(id -u)" -eq 0 ]; then
    return 0
  fi

  require_command sudo && sudo -n true >/dev/null 2>&1
}

restart_with_systemd() {
  if [ "$(id -u)" -eq 0 ]; then
    systemctl restart dockforge
    return
  fi

  sudo systemctl restart dockforge
}

restart_or_print_next_steps() {
  box "Restart Handling"

  if [ "$SKIP_RESTART" -eq 1 ]; then
    SYSTEMD_ACTION="skipped by flag"
    warn "Skipping restart because --skip-restart was provided."
    return
  fi

  if [ "$RESTART_METHOD" = "manual" ]; then
    SYSTEMD_ACTION="manual restart selected"
    note "Manual restart selected. No service restart was attempted."
    return
  fi

  local service_present=0
  if require_command systemctl && [ -f "$SYSTEMD_SERVICE_PATH" ]; then
    service_present=1
  fi

  if [ "$RESTART_METHOD" = "systemd" ] && [ "$service_present" -eq 0 ]; then
    fail "Restart method is systemd, but $SYSTEMD_SERVICE_PATH was not found or systemctl is unavailable."
  fi

  if [ "$service_present" -eq 1 ]; then
    if can_manage_systemd; then
      restart_with_systemd
      SYSTEMD_ACTION="systemd service restarted"
      ok "Restarted dockforge via systemd"
      return
    fi

    SYSTEMD_ACTION="systemd service found but restart requires sudo"
    warn "Detected a DockForge systemd service, but automatic restart needs root or passwordless sudo."
    note "Run this command manually:"
    printf "  sudo systemctl restart dockforge\n"
    return
  fi

  if [ "$RESTART_METHOD" = "systemd" ]; then
    fail "Restart method is systemd, but no DockForge systemd service was detected."
  fi

  SYSTEMD_ACTION="no systemd service detected"
  note "No DockForge systemd service was detected. Restart DockForge manually if it is currently running."
  printf "  %s\n" "$MANUAL_RESTART_COMMAND"
}

print_summary() {
  box "Update Summary"
  printf "%bEnvironment:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$ENV_FILE"
  printf "%bDatabase:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$DATABASE_PATH"
  printf "%bInstall Step:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$([ "$SKIP_INSTALL" -eq 1 ] && printf "skipped" || printf "ran")"
  printf "%bBuild Step:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$([ "$SKIP_BUILD" -eq 1 ] && printf "skipped" || printf "ran")"
  printf "%bRestart:%b %s\n" "$COLOR_DIM" "$COLOR_RESET" "$SYSTEMD_ACTION"

  box "What To Do Next"
  if [ "$SKIP_RESTART" -eq 1 ] || [ "$RESTART_METHOD" = "manual" ] || [ "$SYSTEMD_ACTION" = "no systemd service detected" ] || [ "$SYSTEMD_ACTION" = "systemd service found but restart requires sudo" ]; then
    printf "1. Restart DockForge if it is currently running:\n"
    if [ -f "$SYSTEMD_SERVICE_PATH" ]; then
      printf "   sudo systemctl restart dockforge\n"
    else
      printf "   %s\n" "$MANUAL_RESTART_COMMAND"
    fi
    printf "2. Open the configured DockForge URL in your browser.\n"
    return
  fi

  printf "1. Open the configured DockForge URL in your browser.\n"
  printf "2. Check service health if needed:\n"
  printf "   sudo systemctl status dockforge\n"
  printf "3. Stream logs if needed:\n"
  printf "   sudo journalctl -u dockforge -f\n"
}

main() {
  parse_args "$@"
  check_prerequisites
  validate_environment
  run_update_commands
  restart_or_print_next_steps
  print_summary
}

main "$@"
