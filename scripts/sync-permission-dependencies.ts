/**
 * scripts/sync-permission-dependencies.ts
 *
 * Regenerate the DEPENDENT_ACTIONS constant in
 * `src/lib/rbac/permissionDependencies.ts` from the authoritative table
 * `public.permission_dependent_actions`.
 *
 * Usage (from repo root, with .env populated):
 *   bunx tsx scripts/sync-permission-dependencies.ts
 *
 * The script is idempotent: rerunning it when the file is already in sync
 * exits 0 with no diff. Exits non-zero when the fetched list differs from
 * the file so CI can gate on drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_URL / key env vars.');
  process.exit(2);
}

const supabase = createClient(SUPABASE_URL, KEY, { auth: { persistSession: false } });

async function main() {
  const { data, error } = await supabase
    .from('permission_dependent_actions')
    .select('action')
    .order('action');
  if (error) throw error;

  const actions = (data ?? []).map((r: { action: string }) => r.action);
  const file = resolve('src/lib/rbac/permissionDependencies.ts');
  const src = readFileSync(file, 'utf8');

  const marker = /export const DEPENDENT_ACTIONS = \[[\s\S]*?\] as const;/;
  const newBlock =
    `export const DEPENDENT_ACTIONS = [\n` +
    actions.map((a) => `  '${a}',`).join('\n') +
    `\n] as const;`;

  if (!marker.test(src)) {
    console.error('DEPENDENT_ACTIONS block not found.');
    process.exit(2);
  }
  const next = src.replace(marker, newBlock);
  if (next === src) {
    console.log(`In sync (${actions.length} actions).`);
    return;
  }
  writeFileSync(file, next, 'utf8');
  console.log(`Rewrote DEPENDENT_ACTIONS with ${actions.length} entries.`);
  process.exit(1); // signal drift to CI
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
