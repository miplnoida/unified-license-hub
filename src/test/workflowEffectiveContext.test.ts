import { describe, expect, it } from 'vitest';
import {
  sortWorkflowInstances,
  sortWorkflowSteps,
  workflowInstanceEntityTypesForLookup,
} from '@/hooks/useWorkflowEngine';

describe('workflow effective context helpers', () => {
  it('looks up application workflow instances across legacy and canonical entity types', () => {
    expect(workflowInstanceEntityTypesForLookup('application')).toEqual([
      'application',
      'pre_application',
      'post_application',
    ]);
    expect(workflowInstanceEntityTypesForLookup('registration')).toEqual(['registration']);
  });

  it('prioritizes active instance workflow_id before paused or terminal rows', () => {
    const rows = sortWorkflowInstances([
      { id: 'completed-old', status: 'completed', created_at: '2026-07-14T10:00:00Z' },
      { id: 'paused-new', status: 'paused', created_at: '2026-07-14T12:00:00Z' },
      { id: 'active-canonical', status: 'active', created_at: '2026-07-14T11:00:00Z' },
    ] as any[]);

    expect(rows.map((row: any) => row.id)).toEqual(['active-canonical', 'paused-new', 'completed-old']);
  });

  it('loads every configured step in backend order, including non-contiguous step_order values', () => {
    const rows = sortWorkflowSteps([
      { id: 'step-6', step_order: 6, created_at: '2026-07-14T10:03:00Z', name: 'Final Approval' },
      { id: 'step-2', step_order: 2, created_at: '2026-07-14T10:01:00Z', name: 'Analyst Review' },
      { id: 'step-1', step_order: 1, created_at: '2026-07-14T10:00:00Z', name: 'Quality Assurance' },
      { id: 'step-3', step_order: 3, created_at: '2026-07-14T10:02:00Z', name: 'Licensing Officer' },
    ] as any[]);

    expect(rows.map((row: any) => row.name)).toEqual([
      'Quality Assurance',
      'Analyst Review',
      'Licensing Officer',
      'Final Approval',
    ]);
  });
});