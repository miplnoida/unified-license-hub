import { describe, it, expect } from 'vitest';
import {
  CANONICAL_TARGET_TYPE, RECORD_PICKER_TYPES, normaliseRecordType, presentRecordType,
  type RecordPickerType,
} from '@/services/recordPicker';

describe('record picker canonical vocabulary', () => {
  it('maps every picker type to a canonical relationship target type', () => {
    for (const t of RECORD_PICKER_TYPES) {
      expect(CANONICAL_TARGET_TYPE[t.value]).toBeTruthy();
    }
  });

  it('separates picker type from canonical target type where they differ', () => {
    expect(CANONICAL_TARGET_TYPE.return).toBe('filing');
    expect(CANONICAL_TARGET_TYPE.license).toBe('licence');
    expect(CANONICAL_TARGET_TYPE.enforcement).toBe('enforcement_action');
    expect(CANONICAL_TARGET_TYPE.correspondence).toBe('correspondence_thread');
    expect(CANONICAL_TARGET_TYPE.examination).toBe('examination');
  });

  it('retires "inspection" as a picker type and normalises the legacy alias', () => {
    expect(RECORD_PICKER_TYPES.some((t) => (t.value as string) === 'inspection')).toBe(false);
    expect(normaliseRecordType('inspection')).toBe('examination');
    expect(presentRecordType('inspection')).toBe('Examination');
  });

  it('presents canonical target types in business language', () => {
    expect(presentRecordType('filing')).toBe('Regulatory return');
    expect(presentRecordType('licence')).toBe('Licence');
    expect(presentRecordType('enforcement_action')).toBe('Enforcement case');
  });

  it('never exposes a picker type without a label', () => {
    for (const t of RECORD_PICKER_TYPES) {
      expect(presentRecordType(t.value as RecordPickerType)).toBe(t.label);
    }
  });
});

/** Page recovery arithmetic used by the picker owner. */
function lastPage(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

describe('record picker page recovery', () => {
  it('recovers an out-of-range page to the last real page', () => {
    expect(lastPage(47, 10)).toBe(5);
    expect(lastPage(93, 10)).toBe(10);
  });

  it('keeps page 1 when there are no matching records', () => {
    expect(lastPage(0, 25)).toBe(1);
  });
});
