#!/usr/bin/env bash
# Fetch Prisma engines for NixOS. Prisma's CDN does not publish a linux-nixos
# build, so we download the debian-openssl-3.0.x variant (glibc-compatible
# when loaded via nix-ld) and wrap the executables with nix-ld's ld.so.
#
# Idempotent: skips downloads if the cache already has the engines.
#
# Usage: scripts/fetch-prisma-engines.sh
#
# After running once, set up the test environment via the env vars below
# (or rely on the vitest setup file which auto-detects this cache).

set -euo pipefail

PRISMA_VERSION="${PRISMA_VERSION:-5.22.0}"
# Commit hash that ships Prisma 5.22.0; pin so re-runs are reproducible.
ENGINES_COMMIT="${ENGINES_COMMIT:-605197351a3c8bdd595af2d2a9bc3025bca48ea2}"
BASE="https://binaries.prisma.sh/all_commits/${ENGINES_COMMIT}"
TARGET="debian-openssl-3.0.x"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/prisma-engines/${PRISMA_VERSION}"
NIX_LD_LIB="/run/current-system/sw/share/nix-ld/lib"

if [ ! -d "$NIX_LD_LIB" ]; then
  echo "nix-ld not found at $NIX_LD_LIB — this script is for NixOS only."
  echo "On other systems Prisma downloads engines automatically."
  exit 0
fi

mkdir -p "$CACHE_DIR"
echo "Cache: $CACHE_DIR"

download() {
  local name="$1"
  local url="${BASE}/${TARGET}/${name}.gz"
  local target="$CACHE_DIR/${name}"
  if [ -s "$target" ]; then
    echo "  ✓ $name (cached)"
    return 0
  fi
  echo "  ↓ $name"
  curl -fsSL -o "$target.gz" "$url"
  gzip -d -f "$target.gz"
  chmod +x "$target"
}

download "libquery_engine.so.node"
download "query-engine"
download "schema-engine"

# Wrap executables so nix-ld resolves their libs.
for exe in query-engine schema-engine; do
  cat > "$CACHE_DIR/${exe}.sh" <<EOF
#!/usr/bin/env bash
exec "$NIX_LD_LIB/ld.so" "$CACHE_DIR/$exe" "\$@"
EOF
  chmod +x "$CACHE_DIR/${exe}.sh"
done

echo ""
echo "Engines ready. To use them in your shell:"
cat <<EOF
  export LD_LIBRARY_PATH="\$HOME/.cache/prisma-engines/${PRISMA_VERSION}:\${LD_LIBRARY_PATH:+\$LD_LIBRARY_PATH}"
  export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
  export PRISMA_SCHEMA_ENGINE_BINARY="$CACHE_DIR/schema-engine.sh"
  export PRISMA_QUERY_ENGINE_BINARY="$CACHE_DIR/query-engine.sh"
  export PRISMA_QUERY_ENGINE_LIBRARY="$CACHE_DIR/libquery_engine.so.node"
EOF
echo ""
echo "The vitest setup file picks these up automatically."