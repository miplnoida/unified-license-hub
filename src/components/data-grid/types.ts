/**
 * Enterprise data grid contract — the single grid model for operational
 * queues, directories, registries, admin listings and audit lists.
 *
 * Two data modes:
 *  - `client`: the grid owns filtering, sorting and paging over a bounded set;
 *  - `server`: the page owns them and feeds `rows` + `totalCount` back, so the
 *    grid never asks for the whole table.
 */
import type { ReactNode } from 'react';
import type { RowAction } from '@/components/common/RowActionsMenu';

export type GridFilterType =
  | 'text' | 'enum' | 'multiEnum' | 'boolean' | 'date' | 'dateRange' | 'number' | 'numberRange';

export type SortDirection = 'asc' | 'desc';

export interface GridFilterOption { label: string; value: string }

export interface GridColumn<T> {
  id: string;
  header: string;
  /** Raw value used for client sorting, filtering, search and export. */
  accessor?: (row: T) => unknown;
  /** Presentation. Falls back to a formatted accessor value. */
  cell?: (row: T) => ReactNode;
  sortable?: boolean;
  filterable?: boolean;
  filterType?: GridFilterType;
  filterOptions?: GridFilterOption[];
  filterLabel?: string;
  /** Included in global search (defaults to true for text-ish columns). */
  searchable?: boolean;
  width?: string;
  minWidth?: string;
  align?: 'left' | 'center' | 'right';
  /** Hidden by default in the column chooser. */
  defaultVisible?: boolean;
  /** 1 = always visible, 2 = hidden on tablet, 3 = hidden on tablet + mobile. */
  priority?: 1 | 2 | 3;
  sticky?: 'left' | 'right';
  /** Cannot be hidden by the user (identity / action columns). */
  mandatory?: boolean;
  exportable?: boolean;
  /** Clamp long values with an ellipsis + title tooltip. */
  truncate?: boolean;
  headerClassName?: string;
  cellClassName?: string;
}

export interface GridSort { id: string; direction: SortDirection }

export type GridFilterValue =
  | { kind: 'text'; value: string }
  | { kind: 'enum'; value: string }
  | { kind: 'multiEnum'; values: string[] }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'date'; value: string }
  | { kind: 'dateRange'; from?: string; to?: string }
  | { kind: 'number'; value: number }
  | { kind: 'numberRange'; min?: number; max?: number };

export interface GridState {
  pageIndex: number;
  pageSize: number;
  sort: GridSort | null;
  search: string;
  filters: Record<string, GridFilterValue>;
}

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const emptyGridState = (pageSize = DEFAULT_PAGE_SIZE): GridState => ({
  pageIndex: 0,
  pageSize,
  sort: null,
  search: '',
  filters: {},
});

export interface EnterpriseDataGridProps<T> {
  /** Stable id — used for column-visibility persistence and URL state. */
  gridId: string;
  columns: Array<GridColumn<T>>;
  rows: T[];
  getRowId: (row: T) => string;
  mode?: 'client' | 'server';
  /** Server mode: authoritative total across all pages. */
  totalCount?: number;
  /** Controlled state (required in server mode). */
  state?: GridState;
  onStateChange?: (next: GridState) => void;
  isLoading?: boolean;
  error?: string | null;
  /** Server said the caller may not read this collection. */
  restricted?: boolean;
  restrictedMessage?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  rowActions?: (row: T) => RowAction[];
  /** Single obvious action rendered as a visible button beside the menu. */
  primaryRowAction?: (row: T) => { label: string; to?: string; onClick?: () => void; icon?: ReactNode } | null;
  onRowClick?: (row: T) => void;
  toolbarActions?: ReactNode;
  /** Extra content rendered above the grid (e.g. status tabs). */
  aboveGrid?: ReactNode;
  enableExport?: boolean;
  onExport?: () => void;
  exportFileName?: string;
  enableColumnChooser?: boolean;
  enableGlobalSearch?: boolean;
  searchPlaceholder?: string;
  onRefresh?: () => void;
  /** Persist page/size/sort/search/filters in the URL query string. */
  syncUrlState?: boolean;
  stickyHeader?: boolean;
  maxBodyHeight?: string;
  density?: 'compact' | 'comfortable';
  /** Secondary information drawer content on mobile row expansion. */
  rowDetails?: (row: T) => ReactNode;
  caption?: string;
  className?: string;
}
