/**
 * Workflow versioning — schema/runtime contract tests.
 *
 * These tests pin the contract added by the workflow-versioning migration:
 *   1. `approval_workflow_versions` exists with the expected shape.
 *   2. `workflow_instances` carries pinning columns (`workflow_version_id`,
 *      `version_snapshot`, `current_step_key`).
 *   3. `approval_actions` carries `workflow_version_id` for audit.
 *   4. `build_workflow_snapshot` / `publish_workflow_version` RPCs exist.
 *
 * They run as static SQL-source assertions so they pass in CI without a
 * live database — they fail loudly if the migration file is edited away.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

function loadVersioningMigration(): string {
  const dir = resolve(__dirname, '../../supabase/migrations');
  // Most recent migration that creates approval_workflow_versions.
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const f of [...files].reverse()) {
    const src = readFileSync(resolve(dir, f), 'utf-8');
    if (/approval_workflow_versions/.test(src) && /publish_workflow_version/.test(src)) {
      return src;
    }
  }
  throw new Error('Workflow versioning migration not found');
}

describe('workflow versioning migration', () => {
  const sql = loadVersioningMigration();

  it('creates approval_workflow_versions with snapshot + status', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.approval_workflow_versions/);
    expect(sql).toMatch(/version_number\s+integer NOT NULL/);
    expect(sql).toMatch(/status\s+text NOT NULL DEFAULT 'draft' CHECK \(status IN \('draft','published','archived'\)\)/);
    expect(sql).toMatch(/snapshot\s+jsonb NOT NULL/);
    expect(sql).toMatch(/UNIQUE \(workflow_id, version_number\)/);
  });

  it('grants Data API access to authenticated/service_role and enables RLS', () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.approval_workflow_versions TO authenticated/);
    expect(sql).toMatch(/GRANT ALL ON public\.approval_workflow_versions TO service_role/);
    expect(sql).toMatch(/ALTER TABLE public\.approval_workflow_versions ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/Admins manage workflow versions/);
  });

  it('adds version pointers on approval_workflows', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS current_published_version_id uuid/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS draft_version_id uuid/);
  });

  it('adds pinning columns on workflow_instances', () => {
    expect(sql).toMatch(/workflow_instances[\s\S]+workflow_version_id uuid/);
    expect(sql).toMatch(/workflow_instances[\s\S]+version_snapshot jsonb/);
    expect(sql).toMatch(/workflow_instances[\s\S]+current_step_key text/);
  });

  it('adds workflow_version_id audit column on approval_actions', () => {
    expect(sql).toMatch(/approval_actions[\s\S]+workflow_version_id uuid/);
  });

  it('defines build_workflow_snapshot + publish_workflow_version', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.build_workflow_snapshot/);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.publish_workflow_version/);
    expect(sql).toMatch(/has_role\(auth\.uid\(\), 'admin'\)/);
  });

  it('backfills v1 for existing workflows and pins existing instances', () => {
    expect(sql).toMatch(/version_number, status, snapshot[\s\S]+'published'/);
    expect(sql).toMatch(/UPDATE public\.workflow_instances[\s\S]+workflow_version_id/);
  });

  it('auto-pins new workflow instances via trigger', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.pin_workflow_instance_version/);
    expect(sql).toMatch(/CREATE TRIGGER trg_pin_workflow_instance_version/);
  });

  it('stamps approval_actions with the instance version via trigger', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.stamp_approval_action_version/);
    expect(sql).toMatch(/CREATE TRIGGER trg_stamp_approval_action_version/);
  });
});

describe('registration notification event seed', () => {
  const sql = loadVersioningMigration();

  const REQUIRED_KEYS = [
    'registration.workflow_started',
    'registration.step_assigned',
    'registration.step_entered',
    'registration.pending_review',
    'registration.approved_step',
    'registration.send_back',
    'registration.resubmission_requested',
    'registration.returned_for_correction',
    'registration.more_info_requested',
    'registration.escalated',
    'registration.final_approved',
    'registration.final_rejected',
    'registration.correction_required',
    'registration.resubmitted',
    'registration.new_submission',
    'registration.action_taken',
    'registration.workflow_completed',
  ];

  for (const key of REQUIRED_KEYS) {
    it(`seeds ${key}`, () => {
      expect(sql).toContain(`'${key}'`);
    });
  }

  it('is idempotent via ON CONFLICT (event_key) DO UPDATE', () => {
    expect(sql).toMatch(/ON CONFLICT \(event_key\) DO UPDATE SET/);
  });
});
