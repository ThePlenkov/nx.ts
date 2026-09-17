#!/usr/bin/env bash
# Packed-tarball e2e: simulates a real consumer installing the built
# packages — the exact path that broke in #32 (published bin could not
# resolve the plugin it delegates to).
set -euo pipefail

cd "$(dirname "$0")/.."

PACK_DIR="$(mktemp -d)"
CONSUMER="$(mktemp -d)"
trap 'rm -rf "$PACK_DIR" "$CONSUMER"' EXIT

echo "==> Building packages"
bun run build

echo "==> Packing publishable packages"
for pkg in tsdown oxlint biome typescript-preset prepare-for-release skill skillspector release; do
  (cd "packages/$pkg" && npm pack --pack-destination "$PACK_DIR" >/dev/null)
done
ls "$PACK_DIR"

echo "==> Installing every tarball into a scratch consumer"
cd "$CONSUMER"
cat > package.json <<'JSON'
{"name":"e2e-packed-consumer","private":true,"type":"module"}
JSON
cat > tsconfig.json <<'JSON'
{"compilerOptions":{"strict":true}}
JSON
npm install --save-dev "$PACK_DIR"/*.tgz

echo "==> Running the packed bootstrap bin"
./node_modules/.bin/nx-devkit-typescript init

echo "==> Verifying registration"
grep -q '"@nx-devkit/typescript"' nx.json

echo "==> Verifying plugin resolution + inferred project"
./node_modules/.bin/nx show projects | grep -q e2e-packed-consumer

echo "==> Packed-tarball e2e passed"
