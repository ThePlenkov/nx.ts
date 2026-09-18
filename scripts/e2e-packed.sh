#!/usr/bin/env bash
# Packed-tarball e2e: simulates a real consumer installing the built
# packages — the exact path that broke in #32 (published bin could not
# resolve the plugin it delegates to).
#
# E2E_SKIP_BUILD=1 skips the local build — used in release.yml where the
# Build step (and scripts/e2e.sh) already produced dist/ output.
set -euo pipefail
shopt -s nullglob

cd "$(dirname "$0")/.."

PACK_DIR="$(mktemp -d)"
CONSUMER="$(mktemp -d)"
trap 'rm -rf "$PACK_DIR" "$CONSUMER"' EXIT

if [ "${E2E_SKIP_BUILD:-0}" = "1" ]; then
  echo "==> Skipping build (E2E_SKIP_BUILD=1)"
else
  echo "==> Building packages"
  bun run build
fi

echo "==> Packing publishable packages"
# Discover publishable packages from the workspace: every non-private
# package with a name — a new package is exercised automatically.
PUBLISHABLE=()
for manifest in packages/*/package.json; do
  if node -e 'const p=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));process.exit(p.name&&p.private!==true?0:1)' "$manifest"; then
    PUBLISHABLE+=("$(dirname "$manifest")")
  fi
done
if [ "${#PUBLISHABLE[@]}" -eq 0 ]; then
  echo "ERROR: no publishable packages found under packages/" >&2
  exit 1
fi

for pkg_dir in "${PUBLISHABLE[@]}"; do
  echo "  packing $pkg_dir"
  (cd "$pkg_dir" && npm pack --pack-destination "$PACK_DIR" >/dev/null)
done

TARBALLS=("$PACK_DIR"/*.tgz)
if [ "${#TARBALLS[@]}" -ne "${#PUBLISHABLE[@]}" ]; then
  echo "ERROR: expected ${#PUBLISHABLE[@]} tarballs, got ${#TARBALLS[@]}" >&2
  exit 1
fi
printf '  %s\n' "${TARBALLS[@]}"

echo "==> Installing every tarball into a scratch consumer"
cd "$CONSUMER"
cat > package.json <<'JSON'
{"name":"e2e-packed-consumer","private":true,"type":"module"}
JSON
cat > tsconfig.json <<'JSON'
{"compilerOptions":{"strict":true}}
JSON
npm install --save-dev "${TARBALLS[@]}"

echo "==> Running the packed bootstrap bin"
./node_modules/.bin/nx-devkit-typescript init

echo "==> Verifying registration"
if [ ! -f nx.json ]; then
  echo "ERROR: init did not create nx.json" >&2
  exit 1
fi
grep -q '"@nx-devkit/typescript"' nx.json

echo "==> Verifying plugin resolution + inferred project"
./node_modules/.bin/nx show projects | grep -q e2e-packed-consumer

echo "==> Packed-tarball e2e passed"
