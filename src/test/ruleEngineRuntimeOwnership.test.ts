import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(__dirname, '../..');
const REGISTRY = resolve(ROOT, 'docs/rule-engine/runtime-ownership.json');

const FAMILIES = [
  'shared_engine',
  'return_validation',
  'prudential',
  'conduct',
  'complaint_triage',
  'sufficiency',
  'rfi_auto',
  'correspondence',
  'escalation',
];

describe('rule engine runtime ownership registry', () => {
  const registry = JSON.parse(readFileSync(REGISTRY, 'utf8')) as {
    families: Array<Record<string, unknown>>;
  };

  it('covers all nine governed rule families', () => {
    expect(registry.families.map((f) => f.family).sort()).toEqual([...FAMILIES].sort());
  });

  it('declares exactly one runtime owner per family', () => {
    for (const f of registry.families) {
      expect(typeof f.runtime_owner, `${f.family} runtime_owner`).toBe('string');
      expect(String(f.runtime_owner).trim().length).toBeGreaterThan(0);
    }
  });

  it('never lets two families share the same runtime owner and source event', () => {
    const seen = new Set<string>();
    for (const f of registry.families) {
      const key = `${f.runtime_owner}##${f.source_event}`.toLowerCase();
      expect(seen.has(key), `duplicate execution path for ${f.family}`).toBe(false);
      seen.add(key);
    }
  });

  it('gives every family its own source table', () => {
    const tables = registry.families.map((f) => String(f.source_table).toLowerCase());
    expect(new Set(tables).size).toBe(tables.length);
  });

  it('marks only the shared engine as centrally editable and names module editors otherwise', () => {
    const central = registry.families.filter((f) => f.central_editor === true);
    expect(central).toHaveLength(1);
    expect(central[0].family).toBe('shared_engine');
    for (const f of registry.families.filter((x) => x.central_editor !== true)) {
      expect(String(f.module_editor ?? ''), `${f.family} module_editor`).not.toBe('');
    }
  });

  it('traces suppression, action, notification and audit ownership for every family', () => {
    for (const f of registry.families) {
      for (const field of ['suppression_owner', 'action_executor', 'notification_owner', 'audit_owner', 'trigger_location', 'evaluator']) {
        expect(String(f[field] ?? '').trim(), `${f.family}.${field}`).not.toBe('');
      }
    }
  });

  it('passes the standalone runtime-ownership oracle script', () => {
    const script = resolve(ROOT, 'scripts/verify-runtime-ownership.mjs');
    expect(existsSync(script)).toBe(true);
    const out = execFileSync('node', [script], { encoding: 'utf8' });
    expect(out).toMatch(/Runtime ownership verified/);
  });
});
