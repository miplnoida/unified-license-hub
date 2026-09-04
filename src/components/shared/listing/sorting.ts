/**
 * Canonical listing sort + page helpers.
 *
 * Sorting always operates on raw canonical values supplied by a column's
 * `sortAccessor`, never on rendered JSX or formatted labels. Nulls sort last in
 * both directions, and every comparison falls back to a deterministic secondary
 * key (canonical reference / row id) so paging is stable.
 */
import {
  RISK_ORDER,
  STAGE_ORDER,
  type ListingDataType,
  type ListingSort,
  type SortDirection,
} from './types';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function ordinalOf(value: unknown, order: Record<string, number> | string[]): number | null {
  if (value == null || value === '') return null;
  const key = String(value).trim().toUpperCase().replace(/\s+/g, '_');
  if (Array.isArray(order)) {
    const idx = order.findIndex((o) => o.trim().toUpperCase().replace(/\s+/g, '_') === key);
    return idx === -1 ? null : idx + 1;
  }
  return order[key] ?? null;
}

/** Compares two canonical values for a data type. Nulls are reported as null. */
export function compareValues(
  a: unknown,
  b: unknown,
  dataType: ListingDataType = 'text',
  businessOrder?: string[],
): number {
  const aNull = a == null || a === '';
  const bNull = b == null || b === '';
  if (aNull && bNull) return 0;
  if (aNull) return 1; // nulls last regardless of direction
  if (bNull) return -1;

  switch (dataType) {
    case 'number': {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na === nb ? 0 : na < nb ? -1 : 1;
    }
    case 'date':
    case 'datetime': {
      const ta = new Date(String(a)).getTime();
      const tb = new Date(String(b)).getTime();
      if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
      if (Number.isNaN(ta)) return 1;
      if (Number.isNaN(tb)) return -1;
      return ta === tb ? 0 : ta < tb ? -1 : 1;
    }
    case 'boolean': {
      const ba = a === true || a === 'true' ? 1 : 0;
      const bb = b === true || b === 'true' ? 1 : 0;
      return ba === bb ? 0 : ba < bb ? -1 : 1;
    }
    case 'risk':
    case 'stage':
    case 'ordinal': {
      const order = businessOrder ?? (dataType === 'risk' ? RISK_ORDER : STAGE_ORDER);
      const oa = ordinalOf(a, order);
      const ob = ordinalOf(b, order);
      if (oa == null && ob == null) return collator.compare(String(a), String(b));
      if (oa == null) return 1;
      if (ob == null) return -1;
      return oa === ob ? 0 : oa < ob ? -1 : 1;
    }
    default:
      return collator.compare(String(a), String(b));
  }
}

export interface SortSpec<T> {
  key: string;
  accessor: (row: T) => unknown;
  dataType?: ListingDataType;
  businessOrder?: string[];
}

/**
 * Client-mode sort. `secondary` is the deterministic tie-breaker (canonical
 * reference or row id) and is always applied ascending.
 */
export function sortRows<T>(
  rows: T[],
  sort: ListingSort | null,
  specs: Array<SortSpec<T>>,
  secondary?: (row: T) => string,
): T[] {
  if (!sort) return rows;
  const spec = specs.find((s) => s.key === sort.key);
  if (!spec) return rows;
  const factor = sort.direction === 'desc' ? -1 : 1;
  return [...rows].sort((ra, rb) => {
    const primary = compareValues(spec.accessor(ra), spec.accessor(rb), spec.dataType, spec.businessOrder);
    if (primary !== 0) {
      // Nulls stay last in both directions.
      const aNull = isBlank(spec.accessor(ra));
      const bNull = isBlank(spec.accessor(rb));
      if (aNull !== bNull) return primary;
      return primary * factor;
    }
    if (!secondary) return 0;
    return collator.compare(secondary(ra), secondary(rb));
  });
}

function isBlank(v: unknown) {
  return v == null || v === '';
}

/** default -> asc -> desc -> default */
export function cycleSort(current: ListingSort | null, key: string): ListingSort | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

export function ariaSortOf(current: ListingSort | null, key: string): 'ascending' | 'descending' | 'none' {
  if (!current || current.key !== key) return 'none';
  return current.direction === 'asc' ? 'ascending' : 'descending';
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

export function pageCount(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / Math.max(1, pageSize)));
}

export function rangeLabel(totalCount: number, page: number, pageSize: number): string {
  if (totalCount === 0) return 'No records';
  const from = (Math.max(1, page) - 1) * pageSize + 1;
  const to = Math.min(totalCount, from + pageSize - 1);
  return `Showing ${from}\u2013${to} of ${totalCount}`;
}

export type { SortDirection };
