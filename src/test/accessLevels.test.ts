import { describe, it, expect } from 'vitest';
import {
  SENSITIVE_ACTION_NAMES,
  expandLevelActionNames,
  partitionSensitive,
  classifyModuleSelection,
} from '@/lib/rbac/accessLevels';

describe('accessLevels — sensitive-privilege catalogue', () => {
  it('flags export / bulk export / download variants as sensitive', () => {
    for (const name of [
      'export',
      'export_all',
      'bulk_export',
      'export_confidential',
      'download',
      'download_all',
      'download_bulk',
      'print_bulk',
    ]) {
      expect(SENSITIVE_ACTION_NAMES.has(name)).toBe(true);
    }
  });

  it('never auto-grants export at the Manager level', () => {
    const manager = expandLevelActionNames('manager');
    expect(manager).not.toContain('export');
    expect(manager).not.toContain('export_all');
    expect(manager).not.toContain('bulk_export');
    expect(manager).not.toContain('download');
  });

  it('partitionSensitive routes export into sensitive bucket', () => {
    const { regular, sensitive } = partitionSensitive([
      { name: 'view' },
      { name: 'export' },
      { name: 'bulk_export' },
      { name: 'create' },
    ]);
    expect(regular.map(a => a.name).sort()).toEqual(['create', 'view']);
    expect(sensitive.map(a => a.name).sort()).toEqual(['bulk_export', 'export']);
  });

  it('classifyModuleSelection returns sensitive list even if only sensitive actions picked', () => {
    const res = classifyModuleSelection(['export'], ['view', 'export']);
    expect(res.sensitive).toContain('export');
    expect(res.level).toBe('none');
  });
});
