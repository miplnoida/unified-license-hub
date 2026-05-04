import { describe, it, expect } from 'vitest';
import { buildTypeChangePatch, isDestructiveTypeChange } from '@/lib/fieldTypeChange';

describe('fieldTypeChange', () => {
  it('text → number resets text-only validation and keeps label/name via spread', () => {
    const f = { type: 'text', label: 'Age', validation: { minLength: 2, maxLength: 5, pattern: '^\\d+$' } };
    const patch = buildTypeChangePatch(f, 'number');
    expect(patch.type).toBe('number');
    expect(patch.validation?.minLength).toBeUndefined();
    expect(patch.validation?.maxLength).toBeUndefined();
    expect(patch.validation?.pattern).toBeUndefined();
  });

  it('select → radio preserves options', () => {
    const f = { type: 'select', options: ['a', 'b'], optionSource: 'manual' };
    const patch = buildTypeChangePatch(f, 'radio');
    expect(patch.options).toBeUndefined(); // not overwritten — caller spreads, original options stay
    expect(patch.type).toBe('radio');
  });

  it('select → text strips options and option source', () => {
    const f = { type: 'select', options: ['a', 'b'], optionSource: 'manual', masterDataTypeCode: 'X' };
    const patch = buildTypeChangePatch(f, 'text');
    expect(patch.options).toBeUndefined();
    expect(patch.optionSource).toBeUndefined();
    expect(patch.masterDataTypeCode).toBeUndefined();
  });

  it('text → select initializes at least one option', () => {
    const f = { type: 'text' };
    const patch = buildTypeChangePatch(f, 'select');
    expect(patch.options).toEqual(['Option 1']);
  });

  it('file → date strips file validation', () => {
    const f = { type: 'file', validation: { allowedTypes: ['.pdf'], maxSizeMB: 5 } };
    const patch = buildTypeChangePatch(f, 'date');
    expect(patch.validation?.allowedTypes).toBeUndefined();
    expect(patch.validation?.maxSizeMB).toBeUndefined();
  });

  it('number → text strips min/max', () => {
    const f = { type: 'number', validation: { min: 0, max: 100 } };
    const patch = buildTypeChangePatch(f, 'text');
    expect(patch.validation?.min).toBeUndefined();
    expect(patch.validation?.max).toBeUndefined();
  });

  it('isDestructiveTypeChange detects choice → non-choice', () => {
    expect(isDestructiveTypeChange('select', 'text')).toBe(true);
    expect(isDestructiveTypeChange('select', 'radio')).toBe(false);
    expect(isDestructiveTypeChange('text', 'number')).toBe(false);
    expect(isDestructiveTypeChange('file', 'text')).toBe(true);
    expect(isDestructiveTypeChange('text', 'text')).toBe(false);
  });

  it('text → number clears defaultValue when not numeric-compatible', () => {
    const f = { type: 'text', defaultValue: 'hello' };
    const patch = buildTypeChangePatch(f, 'number');
    expect(patch.defaultValue).toBe('');
  });

  it('text → email keeps defaultValue (both textual)', () => {
    const f = { type: 'text', defaultValue: 'a@b.com' };
    const patch = buildTypeChangePatch(f, 'email');
    expect(patch.defaultValue).toBeUndefined(); // unchanged in patch — preserved via spread
  });
});
