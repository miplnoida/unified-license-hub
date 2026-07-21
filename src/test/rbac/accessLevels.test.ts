import { describe, it, expect } from 'vitest';
import {
  expandLevelActionNames,
  classifyModuleSelection,
  meaningfulLevelsForModule,
  partitionSensitive,
  SENSITIVE_ACTION_NAMES,
  ACCESS_LEVEL_ORDER,
} from '@/lib/rbac/accessLevels';

describe('accessLevels — expansion never leaks sensitive privileges', () => {
  it('no level includes any sensitive action name', () => {
    for (const level of ACCESS_LEVEL_ORDER) {
      const names = expandLevelActionNames(level);
      for (const n of names) {
        expect(SENSITIVE_ACTION_NAMES.has(n), `${level} leaked ${n}`).toBe(false);
      }
    }
  });

  it('none expands to []', () => {
    expect(expandLevelActionNames('none')).toEqual([]);
  });

  it('view expands to at least view', () => {
    expect(expandLevelActionNames('view')).toContain('view');
  });

  it('contributor cumulatively includes view + create + edit', () => {
    const names = expandLevelActionNames('contributor');
    expect(names).toEqual(expect.arrayContaining(['view', 'create', 'edit']));
    expect(names).not.toContain('delete');
    expect(names).not.toContain('publish');
    expect(names).not.toContain('change_status');
  });

  it('approver includes approve + reject but not delete/publish/change_status', () => {
    const names = expandLevelActionNames('approver');
    expect(names).toEqual(expect.arrayContaining(['view', 'review', 'approve', 'reject']));
    expect(names).not.toContain('delete');
    expect(names).not.toContain('publish');
    expect(names).not.toContain('change_status');
  });

  it('manager does not implicitly grant delete/publish/manage_users', () => {
    const names = expandLevelActionNames('manager');
    expect(names).not.toContain('delete');
    expect(names).not.toContain('publish');
    expect(names).not.toContain('manage_users');
    expect(names).not.toContain('manage_roles');
    expect(names).not.toContain('view_all_entities');
  });
});

describe('accessLevels — classification round-trip', () => {
  const formActions = ['view', 'create', 'edit', 'delete', 'change_status', 'publish'];

  it('empty selection classifies as none', () => {
    expect(classifyModuleSelection([], formActions).level).toBe('none');
  });

  it('view-only classifies as view', () => {
    expect(classifyModuleSelection(['view'], formActions).level).toBe('view');
  });

  it('view+create+edit classifies as contributor', () => {
    expect(classifyModuleSelection(['view', 'create', 'edit'], formActions).level).toBe('contributor');
  });

  it('sensitive actions are reported separately and never affect level', () => {
    const result = classifyModuleSelection(['view', 'create', 'edit', 'delete', 'publish'], formActions);
    expect(result.level).toBe('contributor');
    expect(result.sensitive.sort()).toEqual(['delete', 'publish']);
  });

  it('unusual mix classifies as custom', () => {
    // approve without view/review would be malformed and classify as custom
    const result = classifyModuleSelection(['approve'], ['view', 'review', 'approve', 'reject']);
    expect(result.level).toBe('custom');
  });
});

describe('accessLevels — meaningful levels per module', () => {
  it('hides approver when module has no approve/reject actions', () => {
    const levels = meaningfulLevelsForModule(['view', 'create', 'edit']);
    expect(levels).toContain('none');
    expect(levels).toContain('view');
    expect(levels).toContain('contributor');
    expect(levels).not.toContain('approver');
  });

  it('shows approver when module has approve', () => {
    const levels = meaningfulLevelsForModule(['view', 'review', 'approve', 'reject']);
    expect(levels).toContain('approver');
  });
});

describe('accessLevels — sensitive partition', () => {
  it('splits regular vs sensitive by name', () => {
    const actions = [
      { name: 'view' },
      { name: 'edit' },
      { name: 'delete' },
      { name: 'publish' },
      { name: 'manage_users' },
    ];
    const { regular, sensitive } = partitionSensitive(actions);
    expect(regular.map(a => a.name)).toEqual(['view', 'edit']);
    expect(sensitive.map(a => a.name).sort()).toEqual(['delete', 'manage_users', 'publish']);
  });
});
