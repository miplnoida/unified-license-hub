import { describe, it, expect } from 'vitest';
import {
  deepEqualField,
  isFieldChanged,
  isRowChanged,
  isRepeatableEntryChanged,
  isFileFieldChanged,
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
  it('trims strings', () => {
    expect(deepEqualField('  hi  ', 'hi')).toBe(true);
    expect(deepEqualField('hi', 'hello')).toBe(false);
  });
  it('does NOT auto-cast number/string', () => {
    expect(deepEqualField(5, '5')).toBe(false);
  });
  it('compares numbers by value', () => {
    expect(deepEqualField(5, 5)).toBe(true);
    expect(deepEqualField(5, 6)).toBe(false);
  });
});

describe('deepEqualField — arrays and nested objects', () => {
  it('compares arrays element-wise', () => {
    expect(deepEqualField([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqualField([1, 2, 3], [3, 2, 1])).toBe(false);
  });
  it('compares nested objects by key', () => {
    expect(deepEqualField({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
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
  it('matches by groupId + version', () => {
    expect(isFileFieldChanged({ groupId: 'g', version: 2 }, { groupId: 'g', version: 2 })).toBe(false);
    expect(isFileFieldChanged({ groupId: 'g', version: 2 }, { groupId: 'g', version: 3 })).toBe(true);
  });
  it('matches by filePath fallback', () => {
    expect(isFileFieldChanged({ filePath: '/a/b.pdf' }, { filePath: '/a/b.pdf' })).toBe(false);
    expect(isFileFieldChanged({ filePath: '/a/b.pdf' }, { filePath: '/a/c.pdf' })).toBe(true);
  });
  it('matches multi-file arrays', () => {
    const a = [{ uploadId: '1' }, { uploadId: '2' }];
    const b = [{ uploadId: '1' }, { uploadId: '2' }];
    const c = [{ uploadId: '1' }, { uploadId: '3' }];
    expect(isFileFieldChanged(a, b)).toBe(false);
    expect(isFileFieldChanged(a, c)).toBe(true);
    expect(isFileFieldChanged(a, [{ uploadId: '1' }])).toBe(true);
  });
});
