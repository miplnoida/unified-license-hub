import { describe, it, expect } from 'vitest';
import {
  deepEqualField,
  isFieldChanged,
  isRowChanged,
  isRepeatableEntryChanged,
  isFileFieldChanged,
  diffRepeatable,
  buildDiffIndex,
} from '@/lib/formDiff';

describe('deepEqualField — empty normalization', () => {
  it.each([
    [undefined, null],
    [null, ''],
    ['', '   '],
    [[], undefined],
    [{}, null],
  ])('treats %p and %p as equal-empty', (a, b) => {
    expect(deepEqualField(a, b)).toBe(true);
  });

  it('detects empty vs non-empty', () => {
    expect(deepEqualField('', 'x')).toBe(false);
    expect(deepEqualField([], [1])).toBe(false);
  });
});

describe('deepEqualField — scalars', () => {
  it('trims and collapses internal whitespace', () => {
    expect(deepEqualField('  hi  there ', 'hi there')).toBe(true);
    expect(deepEqualField('hi', 'hello')).toBe(false);
  });
  it('cross-compares numeric strings and numbers', () => {
    expect(deepEqualField(5, '5')).toBe(true);
    expect(deepEqualField('5', 5)).toBe(true);
    expect(deepEqualField(' 5 ', 5)).toBe(true);
    expect(deepEqualField(5, '6')).toBe(false);
  });
  it('compares numbers by value', () => {
    expect(deepEqualField(5, 5)).toBe(true);
    expect(deepEqualField(5, 6)).toBe(false);
  });
  it('normalizes booleans across types', () => {
    expect(deepEqualField(true, 'true')).toBe(true);
    expect(deepEqualField(false, 'no')).toBe(true);
    expect(deepEqualField(true, 'false')).toBe(false);
  });
  it('compares dates regardless of representation', () => {
    expect(deepEqualField('2024-01-01', '2024-01-01T00:00:00.000Z')).toBe(true);
    expect(deepEqualField('2024-01-02', '2024-01-01')).toBe(false);
  });
});

describe('deepEqualField — arrays and nested objects', () => {
  it('compares arrays element-wise', () => {
    expect(deepEqualField([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqualField([1, 2, 3], [3, 2, 1])).toBe(false);
  });
  it('compares nested objects by sorted keys', () => {
    expect(deepEqualField({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqualField({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });
});

describe('isFieldChanged', () => {
  it('returns false when baseline is missing', () => {
    expect(isFieldChanged('x', 'val', null)).toBe(false);
    expect(isFieldChanged('x', 'val', undefined)).toBe(false);
  });
  it('detects changes against baseline', () => {
    expect(isFieldChanged('x', 'new', { x: 'old' })).toBe(true);
    expect(isFieldChanged('x', 'same', { x: 'same' })).toBe(false);
  });
});

describe('isRowChanged / isRepeatableEntryChanged', () => {
  it('flags row content changes', () => {
    expect(isRowChanged({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(false);
    expect(isRowChanged({ a: 1, b: 2 }, { a: 1, b: 3 })).toBe(true);
  });
  it('flags repeatable entry changes', () => {
    expect(isRepeatableEntryChanged({ name: 'A' }, { name: 'A' })).toBe(false);
    expect(isRepeatableEntryChanged({ name: 'A' }, { name: 'B' })).toBe(true);
  });
});

describe('isFileFieldChanged', () => {
  it('treats empty/empty as unchanged', () => {
    expect(isFileFieldChanged(null, undefined)).toBe(false);
    expect(isFileFieldChanged([], [])).toBe(false);
  });
  it('flags missing-on-one-side as changed', () => {
    expect(isFileFieldChanged({ uploadId: '1' }, null)).toBe(true);
  });
  it('matches by uploadId', () => {
    expect(isFileFieldChanged({ uploadId: 'abc' }, { uploadId: 'abc' })).toBe(false);
    expect(isFileFieldChanged({ uploadId: 'abc' }, { uploadId: 'def' })).toBe(true);
  });
  it('matches by groupId + versionId', () => {
    expect(isFileFieldChanged({ groupId: 'g', versionId: 'v1' }, { groupId: 'g', versionId: 'v1' })).toBe(false);
    expect(isFileFieldChanged({ groupId: 'g', versionId: 'v1' }, { groupId: 'g', versionId: 'v2' })).toBe(true);
  });
  it('matches by groupId + version', () => {
    expect(isFileFieldChanged({ groupId: 'g', version: 2 }, { groupId: 'g', version: 2 })).toBe(false);
    expect(isFileFieldChanged({ groupId: 'g', version: 2 }, { groupId: 'g', version: 3 })).toBe(true);
  });
  it('matches by filePath fallback', () => {
    expect(isFileFieldChanged({ filePath: '/a/b.pdf' }, { filePath: '/a/b.pdf' })).toBe(false);
    expect(isFileFieldChanged({ filePath: '/a/b.pdf' }, { filePath: '/a/c.pdf' })).toBe(true);
  });
  it('matches multi-file arrays order-insensitively', () => {
    const a = [{ uploadId: '1' }, { uploadId: '2' }];
    const b = [{ uploadId: '2' }, { uploadId: '1' }];
    const c = [{ uploadId: '1' }, { uploadId: '3' }];
    expect(isFileFieldChanged(a, b)).toBe(false);
    expect(isFileFieldChanged(a, c)).toBe(true);
    expect(isFileFieldChanged(a, [{ uploadId: '1' }])).toBe(true);
  });
});

describe('diffRepeatable', () => {
  it('detects unchanged identical arrays', () => {
    const r = diffRepeatable([{ name: 'A' }], [{ name: 'A' }]);
    expect(r.added).toBe(0);
    expect(r.deleted).toBe(0);
    expect(r.edited).toBe(0);
    expect(r.pairs[0].status).toBe('unchanged');
  });
  it('detects edits when same index but different content', () => {
    const r = diffRepeatable([{ name: 'A2' }], [{ name: 'A' }]);
    expect(r.edited).toBe(1);
    expect(r.pairs[0].status).toBe('edited');
  });
  it('detects additions and deletions', () => {
    const r = diffRepeatable([{ id: '1' }, { id: '2' }], [{ id: '1' }]);
    expect(r.added).toBe(1);
    expect(r.deleted).toBe(0);
  });
  it('detects reorder when same ids in different positions', () => {
    const r = diffRepeatable([{ id: 'b' }, { id: 'a' }], [{ id: 'a' }, { id: 'b' }]);
    expect(r.reordered).toBeGreaterThan(0);
  });
  it('detects trailing deletes', () => {
    const r = diffRepeatable([{ id: '1' }], [{ id: '1' }, { id: '2' }]);
    expect(r.deleted).toBe(1);
    expect(r.pairs.at(-1)?.status).toBe('deleted');
  });
});

describe('buildDiffIndex', () => {
  it('returns empty map without baseline', () => {
    expect(buildDiffIndex({ a: 1 }, null, ['a']).size).toBe(0);
  });
  it('flags changed and equal fields correctly', () => {
    const idx = buildDiffIndex({ a: 1, b: 'x' }, { a: 1, b: 'y' }, ['a', 'b']);
    expect(idx.get('a')?.changed).toBe(false);
    expect(idx.get('b')?.changed).toBe(true);
    expect(idx.get('b')?.original).toBe('y');
  });
});
