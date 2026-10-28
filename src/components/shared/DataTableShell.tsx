import { ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { PaginationBar, SortableHeader, useInvalidPageRecovery } from '@/components/shared/listing';
import { ariaSortOf, paginate, sortRows, type SortSpec } from '@/components/shared/listing/sorting';
import {
  DEFAULT_PAGE_SIZE,
  type ListingDataType,
  type ListingMode,
  type ListingSort,
} from '@/components/shared/listing/types';

/**
 * Shared listing shell for admin and operational tables.
 *
 * Owns presentation only: compact toolbar, sortable headers over raw canonical
 * values, real filter application, record count and paging. In `server` mode the
 * screen owns the query and supplies the current page plus the authoritative
 * `totalCount`; the shell never queries a backend.
 */
export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  /** Enable the shared sortable header. Defaults to true when a raw key exists. */
  sortable?: boolean;
  sortKey?: string;
  /** Raw canonical value used for sorting and search (never rendered JSX). */
  sortAccessor?: (row: T) => unknown;
  dataType?: ListingDataType;
  businessOrder?: string[];
  align?: 'left' | 'right';
  className?: string;
}

export interface DataTableShellProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Stable row identity — required for keys and deterministic sort ties. */
  getRowId?: (row: T) => string;
  searchPlaceholder?: string;
  filterOptions?: { label: string; value: string }[];
  filterLabel?: string;
  /** Row field the filter applies to. Required for the filter to be meaningful. */
  filterKey?: string;
  filterAccessor?: (row: T) => unknown;
  onRowClick?: (row: T) => void;
  actions?: ReactNode;
  pageSize?: number;
  /** Hide paging for genuinely small bounded lists (count line is kept). */
  paged?: boolean;
  emptyMessage?: string;
  onExport?: () => void;
  /* server mode */
  mode?: ListingMode;
  totalCount?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  sort?: ListingSort | null;
  onSortChange?: (sort: ListingSort | null) => void;
  /** Authoritative sort-toggle intent from the owning listing state. */
  onSortToggle?: (key: string) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  filterValue?: string;
  onFilterChange?: (value: string) => void;
}

export function DataTableShell<T extends Record<string, any>>({
  columns,
  data,
  getRowId,
  searchPlaceholder = 'Search...',
  filterOptions,
  filterLabel = 'Filter',
  filterKey,
  filterAccessor,
  onRowClick,
  actions,
  pageSize: pageSizeProp = DEFAULT_PAGE_SIZE,
  paged = true,
  emptyMessage = 'No records found.',
  onExport,
  mode = 'client',
  totalCount,
  page: pageProp,
  onPageChange,
  onPageSizeChange,
  sort: sortProp,
  onSortChange,
  onSortToggle,
  search: searchProp,
  onSearchChange,
  filterValue: filterValueProp,
  onFilterChange,
}: DataTableShellProps<T>) {
  const [searchLocal, setSearchLocal] = useState('');
  const [filterLocal, setFilterLocal] = useState('all');
  const [pageLocal, setPageLocal] = useState(1);
  const [pageSizeLocal, setPageSizeLocal] = useState(pageSizeProp);
  const [sortLocal, setSortLocal] = useState<ListingSort | null>(null);

  const controlledSearch = searchProp !== undefined;
  const search = controlledSearch ? searchProp! : searchLocal;
  const setSearch = (value: string) => {
    if (onSearchChange) onSearchChange(value);
    if (!controlledSearch) setSearchLocal(value);
    if (onPageChange) onPageChange(1);
    setPageLocal(1);
  };

  const filterValue = filterValueProp ?? filterLocal;
  const setFilterValue = (value: string) => {
    if (onFilterChange) onFilterChange(value);
    if (filterValueProp === undefined) setFilterLocal(value);
    if (onPageChange) onPageChange(1);
    setPageLocal(1);
  };

  const sort = sortProp !== undefined ? sortProp : sortLocal;
  /** Delegates to the owning listing state when it owns the sort semantics. */
  const toggleSort = (key: string) => {
    if (onSortToggle) {
      onSortToggle(key);
      if (onPageChange) onPageChange(1);
      setPageLocal(1);
      return;
    }
    if (!sort || sort.key !== key) setSort({ key, direction: 'asc' });
    else if (sort.direction === 'asc') setSort({ key, direction: 'desc' });
    else setSort(null);
  };
  const setSort = (next: ListingSort | null) => {
    if (onSortChange) onSortChange(next);
    if (sortProp === undefined) setSortLocal(next);
    if (onPageChange) onPageChange(1);
    setPageLocal(1);
  };

  const page = pageProp ?? pageLocal;
  const setPage = (next: number) => {
    if (onPageChange) onPageChange(next);
    else setPageLocal(next);
  };
  const pageSize = onPageSizeChange ? pageSizeProp : pageSizeLocal;
  const setPageSize = (size: number) => {
    if (onPageSizeChange) onPageSizeChange(size);
    else setPageSizeLocal(size);
    setPage(1);
  };

  /**
   * Stable row identity. A register row is a real record, so it always has a
   * canonical key — array position is never an identity because it changes with
   * every sort, filter and page. When neither `getRowId` nor a canonical key is
   * available the shell refuses to render rather than fabricate identity.
   */
  const rowId = (row: T) => {
    if (getRowId) return getRowId(row);
    const canonical = row.id ?? row.uuid ?? row.key ?? row.work_key ?? row.code ?? row.reference;
    if (canonical === undefined || canonical === null || canonical === '') {
      throw new Error(
        'DataTableShell: rows have no canonical identity — supply getRowId. Array index is never a row id.',
      );
    }
    return String(canonical);
  };


  const rawValue = (col: Column<T>, row: T) =>
    col.sortAccessor ? col.sortAccessor(row) : row[col.key];

  const filtered = useMemo(() => {
    if (mode === 'server') return data;
    const needle = search.trim().toLowerCase();
    return data.filter((row) => {
      const matchesSearch =
        needle === '' ||
        columns.some((c) => String(rawValue(c, row) ?? '').toLowerCase().includes(needle)) ||
        Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(needle));
      if (!matchesSearch) return false;
      if (!filterOptions || filterValue === 'all') return true;
      const value = filterAccessor
        ? filterAccessor(row)
        : filterKey
          ? row[filterKey]
          : undefined;
      if (value === undefined) {
        // No filter binding declared — match against any row value so the
        // control never silently does nothing.
        return Object.values(row).some((v) => String(v ?? '') === filterValue);
      }
      return String(value ?? '') === filterValue;
       
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, filterValue, filterOptions, filterKey, filterAccessor, columns, mode]);

  const sortSpecs = useMemo<Array<SortSpec<T>>>(
    () =>
      columns
        .filter((c) => c.sortable !== false)
        .map((c) => ({
          key: c.sortKey ?? c.key,
          accessor: (row: T) => rawValue(c, row),
          dataType: c.dataType,
          businessOrder: c.businessOrder,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns],
  );

  const sorted = useMemo(
    () =>
      mode === 'server'
        ? filtered
        : sortRows(filtered, sort, sortSpecs, (row) => rowId(row)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered, sort, sortSpecs, mode],
  );

  const total = mode === 'server' ? (totalCount ?? sorted.length) : sorted.length;
  // Filters/data/count can invalidate the current page — move to the last valid
  // page instead of showing an empty table on a page that no longer exists.
  const effectivePage = useInvalidPageRecovery({
    page,
    totalCount: total,
    pageSize,
    onPageChange: setPage,
    enabled: paged,
  });
  const visible = mode === 'server' || !paged ? sorted : paginate(sorted, effectivePage, pageSize);


  return (
    <div className="space-y-3">
      <RegisterToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={searchPlaceholder}
        trailing={
          <>
            <Badge variant="outline" className="font-mono text-xs">
              {total} record{total === 1 ? '' : 's'}
            </Badge>
            {onExport ? (
              <Button
                data-rbac="report_management.export"
                variant="outline"
                size="sm"
                onClick={onExport}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            ) : null}
            {actions}
          </>
        }
      >
        {filterOptions ? (
          <Select value={filterValue} onValueChange={setFilterValue}>
            <SelectTrigger className="h-9 w-full sm:w-40" aria-label={filterLabel}>
              <SelectValue placeholder={filterLabel} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {filterOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </RegisterToolbar>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => {
                const key = col.sortKey ?? col.key;
                const isSortable = col.sortable !== false;
                return (
                  <TableHead
                    key={col.key}
                    aria-sort={isSortable ? ariaSortOf(sort, key) : undefined}
                    className={col.align === 'right' ? 'text-right' : undefined}
                  >
                    {isSortable ? (
                      <SortableHeader
                        label={col.label}
                        sortKey={key}
                        sort={sort}
                        onSort={toggleSort}
                        align={col.align ?? 'left'}
                      />
                    ) : (
                      col.label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="py-12 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((row) => (
                <TableRow
                  key={rowId(row)}
                  className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={`${col.align === 'right' ? 'text-right' : ''} ${col.className ?? ''}`}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {paged ? (
        <PaginationBar
          totalCount={total}
          page={effectivePage}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      ) : null}
    </div>
  );
}
