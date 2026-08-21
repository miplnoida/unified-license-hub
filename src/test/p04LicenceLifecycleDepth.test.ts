/**
 * P04 A.4 / A.5 / A.7 / A.8 — licence lifecycle depth contract tests.
 *
 * Static SQL-source assertions so they run in CI without a live database.
 * They fail loudly if the term-history, configuration or condition-governance
 * guarantees are edited away.
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

describe('A.4 licence term history', () => {
  const sql = migrationMatching('public.license_terms', 'tg_license_terms_append_only');

  it('creates an additive term ledger with decision provenance', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.license_terms/);
    expect(sql).toMatch(/term_kind text NOT NULL CHECK \(term_kind IN \('original','renewal','variation','reinstatement'\)\)/);
    expect(sql).toMatch(/effective_from timestamptz NOT NULL/);
    expect(sql).toMatch(/effective_until timestamptz/);
    expect(sql).toMatch(/source_decision text/);
    expect(sql).toMatch(/decision_actor uuid/);
    expect(sql).toMatch(/conditions_snapshot jsonb/);
    expect(sql).toMatch(/superseded_by uuid/);
  });

  it('grants Data API access and enables RLS', () => {
    expect(sql).toMatch(/GRANT SELECT ON public\.license_terms TO authenticated/);
    expect(sql).toMatch(/GRANT ALL ON public\.license_terms TO service_role/);
    expect(sql).toMatch(/ALTER TABLE public\.license_terms ENABLE ROW LEVEL SECURITY/);
  });

  it('never destroys historical validity periods', () => {
    expect(sql).toMatch(/LICENSE_TERM_IMMUTABLE/);
    expect(sql).toMatch(/CREATE TRIGGER trg_license_terms_append_only[\s\S]*BEFORE UPDATE OR DELETE ON public\.license_terms/);
  });

  it('enforces a single current term per licence and backfills the original term', () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_license_terms_current[\s\S]*WHERE is_current/);
    expect(sql).toMatch(/'ORIGINAL_ISSUE'/);
  });
});

describe('A.5 configurable renewal policy', () => {
  const sql = migrationMatching('CREATE TABLE IF NOT EXISTS public.license_lifecycle_configs', 'license_lifecycle_config_resolve');

  it('makes renewal rules configurable rather than hardcoded', () => {
    for (const col of [
      'renewal_cycle', 'renewal_window_days', 'grace_period_days', 'reminder_days',
      'required_form_package_id', 'required_documents', 'verification_required',
      'fp_required', 'fee_required', 'payment_verification_required',
      'decision_authority', 'late_renewal_treatment', 'expiry_behavior', 'breach_consequence',
    ]) {
      expect(sql).toContain(col);
    }
  });

  it('scopes configuration by regulator / sector / class and resolves most-specific first', () => {
    expect(sql).toMatch(/regulator_id uuid/);
    expect(sql).toMatch(/license_type text/);
    expect(sql).toMatch(/ORDER BY \(CASE WHEN x\.category_id IS NOT NULL THEN 8/);
  });

  it('restricts configuration writes to administrators', () => {
    expect(sql).toMatch(/llc_admin_write/);
    expect(sql).toMatch(/has_role\(auth\.uid\(\),'admin'\)/);
  });
});

describe('A.7 / A.8 conditions as monitored obligations', () => {
  const sql = migrationMatching('public.license_condition_evidence', 'public.license_condition_review');

  it('supports the full condition state model', () => {
    expect(sql).toMatch(/'open','in_progress','evidence_due','under_review','satisfied','waived','varied','breached','closed'/);
  });

  it('evidence submission moves the condition into review, never to satisfied', () => {
    expect(sql).toMatch(/license_condition_submit_evidence/);
    expect(sql).toMatch(/SET status = 'under_review', review_state = 'submitted'/);
    const submit = sql.slice(
      sql.indexOf('license_condition_submit_evidence'),
      sql.indexOf('license_condition_review'),
    );
    expect(submit).not.toMatch(/status = 'satisfied'/);
  });

  it('satisfaction requires a governed review with evidence present', () => {
    expect(sql).toMatch(/enforce_permission\('license_management','manage_conditions'\)/);
    expect(sql).toMatch(/No evidence has been submitted for this condition/);
  });

  it('breach applies the configured consequence and never auto-suspends', () => {
    expect(sql).toMatch(/breach_consequence/);
    expect(sql).toMatch(/suspension_review/);
    const review = sql.slice(sql.indexOf('license_condition_review'));
    expect(review).not.toMatch(/UPDATE public\.licenses[\s\S]{0,200}status\s*=\s*'suspended'/);
    expect(review).not.toMatch(/status\s*=\s*'revoked'/);
  });
});

describe('A.4 renewal decision wiring', () => {
  const sql = migrationMatching('license_lifecycle_action', 'license_terms');

  it('approval creates a new term and supersedes the prior one', () => {
    expect(sql).toMatch(/INSERT INTO public\.license_terms\([\s\S]*'APPROVE_RENEWAL'/);
    expect(sql).toMatch(/SET superseded_by = v_term_id, superseded_at = now\(\)/);
  });

  it('refusal preserves the current term and records refusal evidence', () => {
    expect(sql).toMatch(/'refusal', jsonb_build_object/);
    expect(sql).toMatch(/preserved_term_id/);
  });

  it('renewal length comes from resolved configuration, not the client', () => {
    expect(sql).toMatch(/license_lifecycle_config_resolve\(l\.id, 'renewal'\)/);
    expect(sql).toMatch(/NULLIF\(cfg->>'period_days',''\)::int/);
  });
});
