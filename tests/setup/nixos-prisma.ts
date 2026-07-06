// Vitest setup file. On NixOS, Prisma's CDN does not ship a linux-nixos
// query-engine build, so `prisma generate` / the runtime client cannot find
// a loadable engine. The scripts/fetch-prisma-engines.sh helper downloads
// the glibc-compatible debian engine once into ~/.cache/prisma-engines.
//
// This setup file points the Prisma env vars at that cache when present,
// and sets LD_LIBRARY_PATH so the engine's libssl/libcrypto resolve via
// nix-ld. On non-NixOS systems the cache dir doesn't exist, so this is a
// no-op and Prisma falls back to its bundled engine.
//
// LD_LIBRARY_PATH is honored by glibc's dlopen at load time of the .node,
// and Node's process.dlopen consults process.env — so setting it here,
// before any PrismaClient is instantiated, is sufficient.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CACHE = join(homedir(), '.cache/prisma-engines/5.22.0');
const NIX_LD_LIB = '/run/current-system/sw/share/nix-ld/lib';

if (existsSync(join(CACHE, 'libquery_engine.so.node')) && existsSync(NIX_LD_LIB)) {
  // LD_LIBRARY_PATH so the shared-object query engine finds libssl/libcrypto.
  const existing = process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : '';
  process.env.LD_LIBRARY_PATH = `${NIX_LD_LIB}${existing}`;
  // Tell Prisma where to find each engine.
  process.env.PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = '1';
  process.env.PRISMA_QUERY_ENGINE_LIBRARY = join(CACHE, 'libquery_engine.so.node');
  process.env.PRISMA_QUERY_ENGINE_BINARY = join(CACHE, 'query-engine.sh');
  process.env.PRISMA_SCHEMA_ENGINE_BINARY = join(CACHE, 'schema-engine.sh');
}