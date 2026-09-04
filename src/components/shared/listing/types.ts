/**
 * Shared enterprise listing contract.
 *
 * One listing model for every production register: `SupervisoryRegister`,
 * `DataTableShell` and any future table share these types, the sortable header,
 * the pagination bar and the sort comparators. Presentation components never
 * query a backend — a screen either supplies a complete bounded dataset
 * (`client` mode) or owns server paging and feeds back `rows` + `totalCount`
 * (`server` mode).
 */
import type { ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

/** Canonical value semantics used to sort raw values, never rendered JSX. */
export type ListingDataType = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'risk' | 'stage' | 'ordinal';

export interface ListingSort {
  key: string;
  direction: SortDirection;
}

export type ListingMode = 'client' | 'server';

export interface ListingPaging {
  page: number;
  pageSize: number;
  /** Authoritative record count across all pages (never fabricated). */
  totalCount: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Supervisory residual/inherent risk ordinal — never alphabetic. */
export const RISK_ORDER: Record<string, number> = {
  LOW: 1,
  MODERATE: 2,
  MEDIUM: 3,
  MEDIUM_HIGH: 4,
  'MEDIUM-HIGH': 4,
  HIGH: 5,
  VERY_HIGH: 6,
  SEVERE: 7,
  CRITICAL: 8,
};

/** Supervisory lifecycle ordinal: open/current work before closed work. */
export const STAGE_ORDER: Record<string, number> = {
  // examinations
  PLANNING: 1,
  SCOPING: 2,
  FIELDWORK: 3,
  DRAFT_REPORT: 4,
  REVIEW: 5,
  QA: 5,
  REPORTING: 6,
  CLOSURE: 7,
  CLOSED: 9,
  CANCELLED: 10,
  // assessments
  DRAFT: 1,
  SUBMITTED: 2,
  RETURNED_FOR_REVISION: 2,
  REVIEWED: 3,
  APPROVED: 4,
  SUPERSEDED: 8,
  WITHDRAWN: 10,
  // work items / findings
  AWAITING_DECISION: 1,
  IN_PROGRESS: 2,
  ISSUED: 3,
  VALIDATION: 4,
  EFFECTIVE: 8,
};

export interface SortableColumnMeta<T> {
  /** Enables the clickable, keyboard-accessible sortable header. */
  sortable?: boolean;
  /** Stable sort key. Server mode sends this to the backend. Defaults to column id. */
  sortKey?: string;
  /** Client mode: raw/canonical value used for sorting (never formatted text). */
  sortAccessor?: (row: T) => unknown;
  dataType?: ListingDataType;
  /** Explicit ordinal ordering for `ordinal`/`stage`/`risk` overrides. */
  businessOrder?: string[];
  /** Marks the column as the register's initial sort. */
  defaultSort?: SortDirection;
}

export interface ListingEmptyState {
  title?: string;
  description?: ReactNode;
}
