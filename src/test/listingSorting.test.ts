import { describe, expect, it } from 'vitest';
import {
  compareValues,
  cycleSort,
  pageCount,
  paginate,
  rangeLabel,
  sortRows,
} from '@/components/shared/listing/sorting';

interface Row {
  ref: string;
  risk: string | null;
  stage: string;
  due: string | null;
  open: number;
}

const rows: Row[] = [
  { ref: 'B-2', risk: 'LOW', stage: 'CLOSED', due: '2026-02-01', open: 2 },
  { ref: 'A-1', risk: 'HIGH', stage: 'FIELDWORK', due: null, open: 10 },
  { ref: 'C-3', risk: null, stage: 'PLANNING', due: '2026-01-01', open: 0 },
  { ref: 'A-10', risk: 'MEDIUM', stage: 'REVIEW', due: '2026-03-01', open: 5 },
];

const specs = [
  { key: 'risk', accessor: (r: Row) => r.risk, dataType: 'risk' as const },
  { key: 'stage', accessor: (r: Row) => r.stage, dataType: 'stage' as const },
  { key: 'due', accessor: (r: Row) => r.due, dataType: 'date' as const },
  { key: 'open', accessor: (r: Row) => r.open, dataType: 'number' as const },
  { key: 'ref', accessor: (r: Row) => r.ref, dataType: 'text' as const },
];

const order = (sorted: Row[]) => sorted.map((r) => r.ref);

describe('listing comparators', () => {
  it('orders risk by supervisory ordinal, not alphabetically', () => {
    expect(compareValues('HIGH', 'LOW', 'risk')).toBeGreaterThan(0);
    expect(compareValues('MEDIUM', 'HIGH', 'risk')).toBeLessThan(0);
  });

  it('orders numbers numerically and dates chronologically', () => {
    expect(compareValues(9, 10, 'number')).toBeLessThan(0);
    expect(compareValues('2026-01-02', '2026-01-10', 'date')).toBeLessThan(0);
  });

  it('treats blanks as last regardless of type', () => {
    expect(compareValues(null, 'LOW', 'risk')).toBeGreaterThan(0);
    expect(compareValues('', '2026-01-01', 'date')).toBeGreaterThan(0);
  });
});

describe('sortRows', () => {
  it('sorts risk descending with nulls last', () => {
    const sorted = sortRows(rows, { key: 'risk', direction: 'desc' }, specs, (r) => r.ref);
    expect(order(sorted)).toEqual(['A-1', 'A-10', 'B-2', 'C-3']);
  });

  it('sorts stage ascending so open work precedes closed work', () => {
    const sorted = sortRows(rows, { key: 'stage', direction: 'asc' }, specs, (r) => r.ref);
    expect(order(sorted)).toEqual(['C-3', 'A-1', 'A-10', 'B-2']);
  });

  it('keeps null due dates last in both directions', () => {
    expect(order(sortRows(rows, { key: 'due', direction: 'asc' }, specs, (r) => r.ref)).at(-1)).toBe('A-1');
    expect(order(sortRows(rows, { key: 'due', direction: 'desc' }, specs, (r) => r.ref)).at(-1)).toBe('A-1');
  });

  it('sorts references naturally with a deterministic tie-break', () => {
    const sorted = sortRows(rows, { key: 'ref', direction: 'asc' }, specs, (r) => r.ref);
    expect(order(sorted)).toEqual(['A-1', 'A-10', 'B-2', 'C-3']);
  });

  it('leaves rows untouched for an unknown sort key', () => {
    expect(order(sortRows(rows, { key: 'nope', direction: 'asc' }, specs))).toEqual(order(rows));
  });
});

describe('paging helpers', () => {
  it('cycles unsorted -> asc -> desc -> unsorted', () => {
    const a = cycleSort(null, 'risk');
    expect(a).toEqual({ key: 'risk', direction: 'asc' });
    const b = cycleSort(a, 'risk');
    expect(b).toEqual({ key: 'risk', direction: 'desc' });
    expect(cycleSort(b, 'risk')).toBeNull();
  });

  it('pages deterministically and reports a real range', () => {
    expect(paginate(rows, 2, 2).map((r) => r.ref)).toEqual(['C-3', 'A-10']);
    expect(pageCount(101, 25)).toBe(5);
    expect(rangeLabel(101, 3, 25)).toBe('Showing 51–75 of 101');
    expect(rangeLabel(0, 1, 25)).toBe('No records');
  });
});
