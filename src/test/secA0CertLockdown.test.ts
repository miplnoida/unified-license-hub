import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// Static, file-only checks. Never connects to a database.
const dirs = ['.lovable/drafts/drft_01m4aj14p5ejsregt7qdk15yb2/migrations', 'supabase/migrations'];
function findMigration(): string {
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    const f = readdirSync(d).find((x) => x.includes('sec_a0_cert_function_lockdown'));
    if (f) return readFileSync(join(d, f), 'utf8');
  }
  throw new Error('SEC-A0 migration not found in draft or accepted location');
}
const mig = findMigration();
const rb = readFileSync('docs/security/wave-a0/rollback.sql', 'utf8');
const pg = readFileSync('supabase/tests/security/a0_cert_lockdown.sql', 'utf8');
const code = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const guardBody = mig.slice(mig.indexOf('CREATE FUNCTION public.sec_a0_require_armed'), mig.indexOf('-- 3. Before snapshot'));

const DESTRUCTIVE = [
  'cert_reset_detach_optional_links', 'cert_reset_force_delete', 'cert_reset_nonproduction_business_data_v1',
  'cert_seed_identity_v1', 'cert_seed_returns_v1', 'cert_seed_structure_v1', 'cert_seed_wave_d_v1',
  'cert_v2_begin_run', 'cert_v2_cascade_delete', 'cert_v2_clean_message_runtime', 'cert_v2_clear_message_runtime',
  'cert_v2_complete_run', 'cert_v2_detach_users', 'cert_v2_exec_unguarded', 'cert_v2_put_metric',
  'cert_v2_register_legacy_baseline', 'cert_v2_register_object', 'cert_v2_reset', 'cert_v2_seed_calculate',
  'cert_v2_seed_entities', 'cert_v2_seed_reference', 'cert_v2_seed_returns', 'cert_v2_seed_universe',
  'cert_v2_zero_message_runtime', 'cert_v2_zero_runtime',
];

describe('SEC-A0 v2 staged lockdown (static)', () => {
  it('wraps every destructive function with a guarded wrapper and owner-only impl', () => {
    for (const n of DESTRUCTIVE) {
      expect(mig).toContain(`RENAME TO ${n}__a0_impl;`);
      expect(mig).toContain(`PERFORM public.sec_a0_require_armed('${n}');`);
      expect(mig).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${n}__a0_impl\\([^)]*\\) FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;`));
    }
    expect((mig.match(/^CREATE FUNCTION public\.cert_/gm) || []).length).toBe(25);
  });
  it('has no regex body rewriting or dynamic definition edits', () => {
    expect(code(mig)).not.toMatch(/regexp_replace|pg_get_functiondef/);
  });
  it('guard uses no session settings, JWT claims or caller identity, deny check first', () => {
    expect(guardBody).not.toMatch(/current_setting|auth\.role|auth\.uid|session_user|current_user/);
    expect(guardBody.indexOf("disposition = 'deny'")).toBeLessThan(guardBody.indexOf('assert_nonproduction'));
  });
  it('inventory gate pins 57 signatures and aborts on drift', () => {
    expect(mig).toContain('SEC-A0 inventory mismatch');
    expect(mig).toContain('expected 57 public signatures');
  });
  it('closes tables, sequences and helpers including runner and service_role', () => {
    expect(mig).toMatch(/FROM PUBLIC, anon, authenticated, service_role, app_certification_runner;\nREVOKE ALL ON SEQUENCE/);
    expect(mig).toContain('BEFORE TRUNCATE ON public.sec_a0_grant_snapshot');
    expect(mig).toContain("VALUES ('7581440907192989109', 'deny'");
  });
  it('does not change default privileges', () => {
    expect(code(mig)).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(code(rb)).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
  });
  it('rollback never grants to PUBLIC/anon/authenticated/runner and keeps protections', () => {
    expect(code(rb)).not.toMatch(/\bTO\s+(PUBLIC|anon|authenticated|app_certification_runner)\b/i);
    expect(code(rb)).not.toMatch(/DROP |RENAME|DELETE FROM|sec_a0_require_armed/i);
    expect(code(rb)).toContain("NOT LIKE '%\\_\\_a0\\_impl'");
  });
  it('pgTAP never calls cert/rc1/sec_a0 functions', () => {
    // Quoted signature strings (e.g. 'cert_x(_a text)') are data, not calls.
    expect(code(pg).replace(/'[^']*'/g, "''")).not.toMatch(/\b(?:public\.)?(cert|rc1|sec_a0)_[a-z0-9_]+\s*\(/);
    expect(pg).toContain('SELECT plan(14);');
  });
});
