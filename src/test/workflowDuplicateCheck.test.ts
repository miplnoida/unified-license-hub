import { describe, it, expect } from 'vitest';
import {
  findDuplicateWorkflow,
  DUPLICATE_WORKFLOW_MESSAGE,
} from '@/lib/workflowDuplicateCheck';
import {
  filterActiveWorkflowTypes,
  getWorkflowTypeLabel,
} from '@/hooks/useWorkflowEngine';

const rows = [
  { id: 'a', regulator_id: 'r1', sector_id: 's1', entity_type: 'registration' },
  { id: 'b', regulator_id: 'r1', sector_id: 's1', entity_type: 'pre_application' },
  { id: 'c', regulator_id: 'r1', sector_id: 's2', entity_type: 'pre_application' },
  { id: 'd', regulator_id: 'r1', sector_id: 's1', entity_type: 'post_application' },
];

describe('findDuplicateWorkflow', () => {
  it('blocks same sector + same used-for', () => {
    const dup = findDuplicateWorkflow(rows, {
      regulator_id: 'r1',
      sector_id: 's1',
      entity_type: 'pre_application',
    });
    expect(dup?.id).toBe('b');
  });

  it('allows same used-for in a different sector', () => {
    expect(
      findDuplicateWorkflow(rows, {
        regulator_id: 'r1',
        sector_id: 's3',
        entity_type: 'pre_application',
      }),
    ).toBeNull();
  });

  it('allows same sector with a different used-for', () => {
    expect(
      findDuplicateWorkflow(rows, {
        regulator_id: 'r1',
        sector_id: 's1',
        entity_type: 'return',
      }),
    ).toBeNull();
  });

  it('does not flag the row being edited as its own duplicate', () => {
    expect(
      findDuplicateWorkflow(
        rows,
        { regulator_id: 'r1', sector_id: 's1', entity_type: 'pre_application' },
        'b',
      ),
    ).toBeNull();
  });

  it('treats null sector consistently', () => {
    const r2 = [...rows, { id: 'e', regulator_id: 'r1', sector_id: null, entity_type: 'registration' }];
    expect(
      findDuplicateWorkflow(r2, {
        regulator_id: 'r1',
        sector_id: null,
        entity_type: 'registration',
      })?.id,
    ).toBe('e');
  });

  it('derives active used-for options from backend configuration records', () => {
    const workflowTypes = filterActiveWorkflowTypes([
      { key: 'complaint', display_label: 'Complaint', description: null, is_active: true, sort_order: 40 },
      { key: 'post_application', display_label: 'Post Application', description: null, is_active: true, sort_order: 30 },
      { key: 'registration', display_label: 'Registration', description: null, is_active: true, sort_order: 10 },
      { key: 'pre_application', display_label: 'Pre Application', description: null, is_active: true, sort_order: 20 },
      { key: 'inspection', display_label: 'Inspection', description: null, is_active: false, sort_order: 50 },
    ]);

    expect(workflowTypes.map((item) => item.key)).toEqual([
      'registration',
      'pre_application',
      'post_application',
      'complaint',
    ]);
    expect(workflowTypes.find((item) => item.key === 'inspection')).toBeUndefined();
    expect(getWorkflowTypeLabel('pre_application', workflowTypes)).toBe('Pre Application');
    expect(getWorkflowTypeLabel('application', workflowTypes)).toBe('application');
  });

  it('exports a user-facing message', () => {
    expect(DUPLICATE_WORKFLOW_MESSAGE.toLowerCase()).toContain('already exists');
  });
});
