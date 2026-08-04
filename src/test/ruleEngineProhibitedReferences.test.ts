import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * Prohibited cross-family references (ADM-RE-001, Phase 2).
 *
 * Exactly one runtime owner may execute a rule family. These assertions fail the
 * build when a second implementation appears:
 *   - the shared engine must never evaluate a module family's rule table,
 *   - no other server-side artefact may read `engine_rules` outside the allowlist,
 *   - the registry's runtime owners and source tables must stay unique.
 */

const root = resolve(__dirname, '../..');
const FUNCTIONS = resolve(root, 'supabase/functions');

const MODULE_RULE_TABLES = [
  'prudential_thresholds',
  'return_validation_rules',
  'conduct_monitoring_rules',
  'complaint_intake_rules',
  'sufficiency_rules',
  'application_rfi_auto_rules',
  'correspondence_routing_rules',
  'escalation_rules',
];

/** Only these server-side artefacts may read the shared engine's rule table. */
const ENGINE_RULES_ALLOWLIST = ['evaluate-engine-rules'];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx|js)$/.test(entry)) out.push(p);
  }
  return out;
}

describe('rule engine — prohibited cross-family references', () => {
  it('the shared engine never evaluates a module family rule table', () => {
    const files = [
      ...walk(join(FUNCTIONS, 'evaluate-engine-rules')),
      join(FUNCTIONS, '_shared/ruleEngineEval.ts'),
    ].filter((f) => existsSync(f));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const t of MODULE_RULE_TABLES) {
        if (new RegExp(`['"\`]${t}['"\`]`).test(src)) offenders.push(`${f} → ${t}`);
      }
    }
    expect(offenders, `shared engine reads module-owned rule tables:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('no edge function outside the allowlist reads engine_rules', () => {
    const offenders: string[] = [];
    for (const f of walk(FUNCTIONS)) {
      if (!/engine_rules/.test(readFileSync(f, 'utf8'))) continue;
      const rel = f.slice(FUNCTIONS.length + 1);
      const owner = rel.split('/')[0];
      if (!ENGINE_RULES_ALLOWLIST.includes(owner)) offenders.push(rel);
    }
    expect(offenders, `unexpected engine_rules readers:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('the registry keeps one runtime owner and one source table per family', () => {
    const registry = JSON.parse(
      readFileSync(resolve(root, 'docs/rule-engine/runtime-ownership.json'), 'utf8'),
    );
    const owners = new Map<string, string>();
    const tables = new Map<string, string>();
    for (const f of registry.families) {
      expect(Array.isArray(f.runtime_owner)).toBe(false);
      const key = `${f.runtime_owner}##${f.source_event}`;
      expect(owners.has(key), `duplicate runtime execution path: ${key}`).toBe(false);
      owners.set(key, f.family);
      expect(tables.has(f.source_table), `duplicate source table: ${f.source_table}`).toBe(false);
      tables.set(f.source_table, f.family);
    }
    expect(registry.families).toHaveLength(9);
  });

  it('every module family named in the registry has a specialised tester', async () => {
    const registry = JSON.parse(
      readFileSync(resolve(root, 'docs/rule-engine/runtime-ownership.json'), 'utf8'),
    );
    const { MODULE_FAMILIES } = await import('@/lib/moduleRuleTester');
    const moduleOwned = registry.families
      .filter((f: any) => f.central_editor !== true)
      .map((f: any) => f.family)
      .sort();
    expect([...MODULE_FAMILIES].sort()).toEqual(moduleOwned);
  });
});
