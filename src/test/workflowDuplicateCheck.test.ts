import { describe, it, expect } from 'vitest';
import {
  findDuplicateWorkflow,
  DUPLICATE_WORKFLOW_MESSAGE,
} from '@/lib/workflowDuplicateCheck';
import { ENTITY_TYPE_LABELS } from '@/hooks/useWorkflowEngine';

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

  it('exposes the registration / pre / post used-for types dynamically', () => {
    // Frontend must offer the three split workflow types and not the combined "application"
    expect(ENTITY_TYPE_LABELS).toMatchObject({
      registration: 'Registration',
      pre_application: 'Pre Application',
      post_application: 'Post Application',
    });
    expect(Object.keys(ENTITY_TYPE_LABELS)).not.toContain('application');
  });

  it('exports a user-facing message', () => {
    expect(DUPLICATE_WORKFLOW_MESSAGE.toLowerCase()).toContain('already exists');
  });
});
