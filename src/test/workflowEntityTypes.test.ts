import { describe, it, expect } from 'vitest';
import {
  ENTITY_TYPE_LABELS,
  LEGACY_APPLICATION_ENTITY_TYPES,
  type WorkflowEntityType,
} from '@/hooks/useWorkflowEngine';

describe('Workflow entity types', () => {
  it('exposes Registration, Pre Application and Post Application as separate workflow types', () => {
    const keys = Object.keys(ENTITY_TYPE_LABELS) as WorkflowEntityType[];
    expect(keys).toContain('registration');
    expect(keys).toContain('pre_application');
    expect(keys).toContain('post_application');
    expect(ENTITY_TYPE_LABELS.registration).toBe('Registration');
    expect(ENTITY_TYPE_LABELS.pre_application).toBe('Pre Application');
    expect(ENTITY_TYPE_LABELS.post_application).toBe('Post Application');
  });

  it('does not surface a combined "application" workflow type to the UI', () => {
    expect((ENTITY_TYPE_LABELS as Record<string, string>).application).toBeUndefined();
  });

  it('keeps complaint / inspection / return workflow types intact', () => {
    expect(ENTITY_TYPE_LABELS.complaint).toBeDefined();
    expect(ENTITY_TYPE_LABELS.inspection).toBeDefined();
    expect(ENTITY_TYPE_LABELS.return).toBeDefined();
  });

  it('treats pre_application and post_application as the new replacements for legacy "application" rows', () => {
    expect(LEGACY_APPLICATION_ENTITY_TYPES).toEqual(
      expect.arrayContaining(['pre_application', 'post_application']),
    );
  });
});
