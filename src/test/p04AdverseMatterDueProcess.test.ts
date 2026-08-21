/**
 * P04 A.9–A.13 — adverse matter due-process contract tests.
 *
 * Static assertions over the migration SQL and the licence frontend so the
 * governed path cannot be edited away: input requirements are server-declared,
 * `license_lifecycle_step` is the only browser entry point, the expiry sweep is
 * service-role only, and the legacy adverse buttons stay retired.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(__dirname, '../../supabase/migrations');

function migrationMatching(...needles: string[]): string {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort().reverse();
  for (const f of files) {
    const src = readFileSync(resolve(DIR, f), 'utf-8');
    if (needles.every((n) => src.includes(n))) return src;
  }
  throw new Error(`Migration containing ${needles.join(' + ')} not found`);
}

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf-8');

describe('server-declared step inputs', () => {
  const sql = migrationMatching('public.license_action_input_requirements');

  it('declares the payload schema per action', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.license_action_input_requirements/);
    expect(sql).toMatch(/'ISSUE_NOTICE'/);
    expect(sql).toMatch(/'RECORD_REPRESENTATION'/);
    expect(sql).toMatch(/'COMPLETE_EVIDENCE_REVIEW'/);
  });
});

describe('license_lifecycle_step is the only browser mutation path', () => {
  const sql = migrationMatching('public.license_lifecycle_step');

  it('validates the payload against the declared requirements', () => {
    expect(sql).toMatch(/license_action_input_requirements/);
    expect(sql).toMatch(/FIELD_REQUIRED/);
  });

  it('the raw executor is not granted to the browser', () => {
    expect(sql).toMatch(/REVOKE[\s\S]{0,120}license_lifecycle_action[\s\S]{0,120}(authenticated|PUBLIC)/i);
  });

  it('the frontend calls the validated step RPC', () => {
    const hook = src('hooks/useLicenseLifecycle.ts');
    expect(hook).toContain("rpc('license_lifecycle_step'");
    expect(hook).not.toContain("rpc('license_lifecycle_action'");
  });
});

describe('adverse matter case read model', () => {
  const sql = migrationMatching('public.license_adverse_matter_case');

  it('computes the due-process timeline server-side', () => {
    expect(sql).toMatch(/timeline/);
    expect(sql).toMatch(/license_matter_notices/);
    expect(sql).toMatch(/license_matter_representations/);
    expect(sql).toMatch(/license_decisions/);
  });
});

describe('legacy adverse UI is retired', () => {
  const page = src('pages/licenses/LicenseDetail.tsx');

  it('no direct suspend/revoke/reinstate/cancel buttons remain', () => {
    expect(page).not.toMatch(/openAction\('suspension'\)/);
    expect(page).not.toMatch(/openAction\('revocation'\)/);
    expect(page).not.toMatch(/openAction\('reinstatement'\)/);
    expect(page).not.toMatch(/openAction\('cancellation'\)/);
  });

  it('renders the governed adverse matter panel instead', () => {
    expect(page).toContain('LicenseAdverseMatterPanel');
  });

  it('licence lifecycle browser DML on licenses is zero from the detail page', () => {
    expect(page).not.toMatch(/from\('licenses'\)[\s\S]{0,80}\.update\(/);
    expect(page).not.toMatch(/from\('license_actions'\)[\s\S]{0,80}\.insert\(/);
  });
});

describe('expiry sweep execution', () => {
  const sql = migrationMatching('public.license_expiry_sweep_runs');

  it('is service-role only and audited per run', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.license_expiry_sweep_runs/);
    expect(sql).toMatch(/auth\.uid\(\) IS NOT NULL/);
  });

  it('has a privileged edge execution path', () => {
    const fn = readFileSync(
      resolve(__dirname, '../../supabase/functions/license-expiry-sweep/index.ts'),
      'utf-8',
    );
    expect(fn).toContain('license_expiry_sweep_run');
    expect(fn).toContain('requireWorkerInvocationAsync');
    expect(fn).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });
});
