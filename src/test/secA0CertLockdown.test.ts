import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const dir = '.lovable/drafts/drft_01m4aj14p5ejsregt7qdk15yb2/migrations';
const mig = readFileSync(join(dir, readdirSync(dir).find((f) => f.includes('sec_a0_cert_function_lockdown'))!), 'utf8');
const rb = readFileSync('docs/security/wave-a0/rollback.sql', 'utf8');
const code = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

describe('SEC-A0 staged cert lockdown (static, no DB)', () => {
  it('revokes from PUBLIC, anon, authenticated', () => {
    expect(mig).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated/);
  });
  it('scopes only cert_/rc1_ functions', () => {
    expect(mig).toMatch(/proname LIKE 'cert\\_%' OR p\.proname LIKE 'rc1\\_%'/);
  });
  it('does not change default privileges', () => {
    expect(code(mig)).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
    expect(code(rb)).not.toMatch(/ALTER DEFAULT PRIVILEGES/i);
  });
  it('keeps the arming guard and self-check', () => {
    expect(mig).toContain('sec_a0_require_armed');
    expect(mig).toContain('SEC-A0 self-check failed');
    expect(code(rb)).not.toMatch(/sec_a0_require_armed|DROP FUNCTION/);
  });
  it('rollback never grants to PUBLIC/anon/authenticated', () => {
    expect(code(rb)).not.toMatch(/GRANT[^;]*\bTO\s+(PUBLIC|anon|authenticated)\b/i);
  });
  it('evidence tables are not exposed', () => {
    expect(mig).toMatch(/REVOKE ALL ON public\.sec_a0_grant_snapshot FROM PUBLIC, anon, authenticated/);
    expect(mig).toMatch(/REVOKE ALL ON public\.sec_a0_destructive_arming FROM PUBLIC, anon, authenticated, service_role/);
  });
});
