/**
 * Admin workflow module safety tests (Phase 1).
 *
 * Covers the pure helpers the WorkflowList page relies on for:
 *   1. backend-driven Used For options (no hardcoded fallback for create)
 *   2. duplicate detection used by both create and the activate-toggle guard
 *   3. legacy/unknown entity_type detection for warning badges
 *
 * Components themselves are exercised through these helpers — the
 * page wires them up identically.
 */
import { describe, it, expect } from 'vitest';
import {
  filterActiveWorkflowTypes,
  getWorkflowTypeLabel,
  getWorkflowTypeOptions,
  FALLBACK_WORKFLOW_TYPE_LABELS,
  type WorkflowTypeConfig,
} from '@/hooks/useWorkflowEngine';
import { findDuplicateWorkflow } from '@/lib/workflowDuplicateCheck';

const cfg = (over: Partial<WorkflowTypeConfig>): WorkflowTypeConfig => ({
  key: 'pre_application',
  display_label: 'Pre Application',
  description: null,
  is_active: true,
  sort_order: 20,
  ...over,
});

describe('admin workflow types — backend-driven options', () => {
  it('only active types are exposed for selection', () => {
    const types: WorkflowTypeConfig[] = [
      cfg({ key: 'registration', display_label: 'Registration', sort_order: 10 }),
      cfg({ key: 'pre_application', display_label: 'Pre Application', sort_order: 20, is_active: false }),
      cfg({ key: 'post_application', display_label: 'Post Application', sort_order: 30 }),
    ];
    const opts = getWorkflowTypeOptions(types).map(o => o.key);
    expect(opts).toEqual(['registration', 'post_application']);
  });

  it('returns nothing when backend config is empty — no hardcoded fallback for creation', () => {
    expect(filterActiveWorkflowTypes([])).toHaveLength(0);
    expect(getWorkflowTypeOptions([])).toHaveLength(0);
  });

  it('orders by sort_order then label', () => {
    const types: WorkflowTypeConfig[] = [
      cfg({ key: 'return', display_label: 'Compliance Return', sort_order: 60 }),
      cfg({ key: 'registration', display_label: 'Registration', sort_order: 10 }),
      cfg({ key: 'complaint', display_label: 'Complaint', sort_order: 40 }),
    ];
    expect(filterActiveWorkflowTypes(types).map(t => t.key)).toEqual([
      'registration',
      'complaint',
      'return',
    ]);
  });
});

describe('admin workflow types — legacy/unknown rendering', () => {
  it('renders configured label when available', () => {
    const types: WorkflowTypeConfig[] = [
      cfg({ key: 'registration', display_label: 'Registration (custom)' }),
    ];
    expect(getWorkflowTypeLabel('registration', types)).toBe('Registration (custom)');
  });

  it('falls back to built-in label only for rendering historical rows', () => {
    expect(getWorkflowTypeLabel('return', [])).toBe(FALLBACK_WORKFLOW_TYPE_LABELS.return);
  });

  it('returns raw value for fully unknown types so the badge still renders', () => {
    expect(getWorkflowTypeLabel('legacy_unknown', [])).toBe('legacy_unknown');
  });
});

describe('toggle-active duplicate guard', () => {
  const base = (over: Partial<{ id: string; regulator_id: string | null; sector_id: string | null; entity_type: string; is_active: boolean }>) => ({
    id: 'a',
    regulator_id: 'reg-1',
    sector_id: null,
    entity_type: 'pre_application',
    is_active: true,
    ...over,
  });

  it('blocks turning a workflow on when another active workflow shares the same scope', () => {
    const target = base({ id: 'self', is_active: false });
    const active = [
      base({ id: 'other', is_active: true }),
    ];
    // mimics WorkflowList: filter to actives only, exclude self
    const dup = findDuplicateWorkflow(
      active.filter(w => w.is_active),
      { regulator_id: target.regulator_id, sector_id: target.sector_id, entity_type: target.entity_type },
      target.id,
    );
    expect(dup?.id).toBe('other');
  });

  it('allows turning on when no other active workflow shares the scope', () => {
    const target = base({ id: 'self', is_active: false });
    const active = [
      base({ id: 'other', sector_id: 'sector-x' }),
      base({ id: 'other2', entity_type: 'post_application' }),
    ];
    const dup = findDuplicateWorkflow(
      active.filter(w => w.is_active),
      { regulator_id: target.regulator_id, sector_id: target.sector_id, entity_type: target.entity_type },
      target.id,
    );
    expect(dup).toBeNull();
  });

  it('does not flag the workflow against itself when re-saving edits', () => {
    const wfs = [base({ id: 'self' })];
    const dup = findDuplicateWorkflow(wfs, {
      regulator_id: 'reg-1',
      sector_id: null,
      entity_type: 'pre_application',
    }, 'self');
    expect(dup).toBeNull();
  });
});
