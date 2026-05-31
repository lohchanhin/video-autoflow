#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/ai-content-factory}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "ERROR: $APP_DIR is not a git checkout."
  echo "Clone the repository first, then rerun this script:"
  echo "  git clone <repo-url> $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

echo "==> Fetching latest code"
git fetch --prune origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

if [ ! -f ".env" ]; then
  echo "ERROR: .env is missing on the server."
  echo "Create it from .env.example and fill production secrets before deploying."
  exit 1
fi

run_in_node() {
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    "$@"
    return
  fi

  docker run --rm \
    -v "$APP_DIR:/workspace" \
    -v ai-content-factory-pnpm-store:/root/.local/share/pnpm/store \
    -w /workspace \
    node:22-bookworm-slim \
    sh -lc "corepack enable && $*"
}

echo "==> Installing dependencies"
run_in_node corepack pnpm install --frozen-lockfile

echo "==> Running checks"
run_in_node corepack pnpm type-check
run_in_node corepack pnpm lint

echo "==> Building workspace"
run_in_node corepack pnpm build
run_in_node corepack pnpm --filter @ai-content-factory/admin-web build

echo "==> Restarting Docker Compose"
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "==> Deployment complete"
docker compose -f "$COMPOSE_FILE" ps
