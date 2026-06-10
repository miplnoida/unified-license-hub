import { describe, it, expect } from 'vitest';
import {
  FALLBACK_WORKFLOW_TYPE_LABELS,
  LEGACY_APPLICATION_ENTITY_TYPES,
  filterActiveWorkflowTypes,
  getWorkflowTypeLabel,
  type WorkflowEntityType,
} from '@/hooks/useWorkflowEngine';

describe('Workflow entity types', () => {
  it('exposes Registration, Pre Application and Post Application as separate fallback workflow types', () => {
    const keys = Object.keys(FALLBACK_WORKFLOW_TYPE_LABELS) as WorkflowEntityType[];
    expect(keys).toContain('registration');
    expect(keys).toContain('pre_application');
    expect(keys).toContain('post_application');
    expect(FALLBACK_WORKFLOW_TYPE_LABELS.registration).toBe('Registration');
    expect(FALLBACK_WORKFLOW_TYPE_LABELS.pre_application).toBe('Pre Application');
    expect(FALLBACK_WORKFLOW_TYPE_LABELS.post_application).toBe('Post Application');
  });

  it('does not surface a combined "application" workflow type in fallback labels or backend-driven lists', () => {
    expect((FALLBACK_WORKFLOW_TYPE_LABELS as Record<string, string>).application).toBeUndefined();
    const activeTypes = filterActiveWorkflowTypes([
      { key: 'registration', display_label: 'Registration', description: null, is_active: true, sort_order: 10 },
      { key: 'pre_application', display_label: 'Pre Application', description: null, is_active: true, sort_order: 20 },
      { key: 'post_application', display_label: 'Post Application', description: null, is_active: true, sort_order: 30 },
      { key: 'complaint', display_label: 'Complaint', description: null, is_active: true, sort_order: 40 },
      { key: 'inspection', display_label: 'Inspection', description: null, is_active: true, sort_order: 50 },
      { key: 'return', display_label: 'Compliance Return', description: null, is_active: true, sort_order: 60 },
    ]);
    expect(activeTypes.map((item) => item.key)).not.toContain('application');
  });

  it('keeps complaint / inspection / return workflow types intact', () => {
    expect(FALLBACK_WORKFLOW_TYPE_LABELS.complaint).toBeDefined();
    expect(FALLBACK_WORKFLOW_TYPE_LABELS.inspection).toBeDefined();
    expect(FALLBACK_WORKFLOW_TYPE_LABELS.return).toBeDefined();
  });

  it('treats pre_application and post_application as the new replacements for legacy "application" rows', () => {
    expect(LEGACY_APPLICATION_ENTITY_TYPES).toEqual(
      expect.arrayContaining(['pre_application', 'post_application']),
    );
    expect(getWorkflowTypeLabel('registration')).toBe('Registration');
    expect(getWorkflowTypeLabel('application')).toBe('application');
  });
});
