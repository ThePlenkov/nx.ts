#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Building packages"
bun run build

cd apps/demo

echo "==> Installing dependencies in apps/demo"
bun install

echo "==> Running nx run-many against demo workspace"
bunx nx run-many -t build typecheck lint format-check test
