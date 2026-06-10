import { describe, it, expect } from 'vitest';
import {
  filterActiveWorkflowTypes,
  getWorkflowTypeLabel,
  getWorkflowTypeOptions,
  type WorkflowTypeConfig,
} from '@/hooks/useWorkflowEngine';

const configs: WorkflowTypeConfig[] = [
  {
    key: 'inspection',
    display_label: 'Inspection',
    description: 'Inspection reviews',
    is_active: true,
    sort_order: 50,
  },
  {
    key: 'registration',
    display_label: 'Registration',
    description: 'Registration reviews',
    is_active: true,
    sort_order: 10,
  },
  {
    key: 'pre_application',
    display_label: 'Pre Application',
    description: 'Pre-license applications',
    is_active: true,
    sort_order: 20,
  },
  {
    key: 'post_application',
    display_label: 'Post Application',
    description: 'Post-license applications',
    is_active: true,
    sort_order: 30,
  },
  {
    key: 'complaint',
    display_label: 'Complaint',
    description: 'Complaint handling',
    is_active: false,
    sort_order: 40,
  },
  {
    key: 'return',
    display_label: 'Compliance Return',
    description: 'Return approvals',
    is_active: true,
    sort_order: 60,
  },
];

describe('workflow type configuration helpers', () => {
  it('keeps only active workflow types and sorts by backend order', () => {
    expect(filterActiveWorkflowTypes(configs).map((item) => item.key)).toEqual([
      'registration',
      'pre_application',
      'post_application',
      'inspection',
      'return',
    ]);
  });

  it('builds user-facing options from backend configuration', () => {
    expect(getWorkflowTypeOptions(configs)).toEqual([
      { key: 'registration', label: 'Registration', description: 'Registration reviews' },
      { key: 'pre_application', label: 'Pre Application', description: 'Pre-license applications' },
      { key: 'post_application', label: 'Post Application', description: 'Post-license applications' },
      { key: 'inspection', label: 'Inspection', description: 'Inspection reviews' },
      { key: 'return', label: 'Compliance Return', description: 'Return approvals' },
    ]);
  });

  it('resolves labels from backend config and never invents a legacy application label', () => {
    expect(getWorkflowTypeLabel('registration', configs)).toBe('Registration');
    expect(getWorkflowTypeLabel('post_application', configs)).toBe('Post Application');
    expect(getWorkflowTypeLabel('application', configs)).toBe('application');
  });
});