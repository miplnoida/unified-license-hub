#!/usr/bin/env node
/**
 * Wrapper for scripts/verify-hardening.sql
 * Usage:  npm run verify:hardening
 *
 * Requires the standard PG* env vars (PGHOST, PGUSER, PGDATABASE, PGPASSWORD,
 * PGPORT) to point at the project DB. In Lovable Cloud sandboxes these are
 * pre-set. For local Supabase: source the values from `supabase status`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const sql = "scripts/verify-hardening.sql";
if (!existsSync(sql)) {
  console.error(`[verify:hardening] missing ${sql}`);
  process.exit(2);
}
if (!process.env.PGHOST) {
  console.error(
    "[verify:hardening] PGHOST is not set. Export PG* env vars (or run inside a Lovable Cloud sandbox) before invoking this script."
  );
  process.exit(2);
}

const r = spawnSync(
  "psql",
  ["-v", "ON_ERROR_STOP=1", "-f", sql],
  {
    stdio: "inherit",
    env: { ...process.env, PGOPTIONS: "--client-min-messages=notice" },
  }
);
process.exit(r.status ?? 1);
