/**
 * EnterpriseDataGrid — the single list/grid standard for the platform.
 *
 * Responsibilities:
 *  - consistent toolbar (search, filters, column chooser, export, refresh);
 *  - sticky header and sticky action column so actions stay reachable;
 *  - explicit loading, empty, error and restricted (no-permission) states;
 *  - client or server data mode, with page/sort/filter state optionally
 *    persisted in the URL so Back returns to the same queue view.
 *
 * The grid renders business values only; callers supply semantic cells
 * (StatusBadge, formatted amounts, named references) rather than raw records.
 */
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown,
  Columns3, Download, Inbox, Lock, RefreshCw, Search, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { cn } from '@/lib/utils';
import { EMPTY, formatTemporal } from '@/lib/presentation/format';
import { GridFilterBar } from './GridFilterBar';
import {
  applyClientPipeline, exportRowsToCsv, useColumnVisibility, useGridState,
} from './gridState';
import { PAGE_SIZE_OPTIONS, type EnterpriseDataGridProps, type GridColumn } from './types';

const PRIORITY_CLASS: Record<number, string> = {
  1: '',
  2: 'hidden md:table-cell',
  3: 'hidden lg:table-cell',
};

function defaultCell<T>(col: GridColumn<T>, row: T) {
  if (!col.accessor) return EMPTY;
  const value = col.accessor(row);
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">{EMPTY}</span>;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return <span className="text-muted-foreground">{EMPTY}</span>;
  return formatTemporal(value);
}

export function EnterpriseDataGrid<T>({
  gridId,
  columns,
  rows,
  getRowId,
  mode = 'client',
  totalCount,
  state: controlledState,
  onStateChange,
  isLoading = false,
  error = null,
  restricted = false,
  restrictedMessage = 'You do not have permission to view these records.',
  emptyTitle = 'Nothing to show yet',
  emptyDescription = 'No records match the current view.',
  rowActions,
  primaryRowAction,
  onRowClick,
  toolbarActions,
  aboveGrid,
  enableExport = true,
  onExport,
  exportFileName,
  enableColumnChooser = true,
  enableGlobalSearch = true,
  searchPlaceholder = 'Search records',
  onRefresh,
  syncUrlState = true,
  stickyHeader = true,
  maxBodyHeight,
  density = 'compact',
  rowDetails,
  caption,
  className,
}: EnterpriseDataGridProps<T>) {
  const [state, setState] = useState_GridState({
    gridId, columns, syncUrlState, controlledState, onStateChange,
  });
  const { hidden, toggle, reset } = useColumnVisibility(gridId, columns);
  const [expanded, setExpanded] = useState<string | null>(null);

  const hasActions = Boolean(rowActions || primaryRowAction);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.mandatory || !hidden.includes(c.id)),
    [columns, hidden],
  );

  const { filtered, paged } = useMemo(() => {
    if (mode === 'server') return { filtered: rows, paged: rows };
    return applyClientPipeline(rows, columns, state);
  }, [mode, rows, columns, state]);

  const total = mode === 'server' ? (totalCount ?? rows.length) : filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize));
  const pageStart = total === 0 ? 0 : state.pageIndex * state.pageSize + 1;
  const pageEnd = Math.min(total, (state.pageIndex + 1) * state.pageSize);

  const handleSort = useCallback((id: string) => {
    setState((prev) => {
      if (prev.sort?.id !== id) return { ...prev, sort: { id, direction: 'asc' }, pageIndex: 0 };
      if (prev.sort.direction === 'asc') return { ...prev, sort: { id, direction: 'desc' }, pageIndex: 0 };
      return { ...prev, sort: null, pageIndex: 0 };
    });
  }, [setState]);

  const handleExport = useCallback(() => {
    if (onExport) return onExport();
    exportRowsToCsv(mode === 'server' ? rows : filtered, visibleColumns, exportFileName ?? gridId);
  }, [onExport, mode, rows, filtered, visibleColumns, exportFileName, gridId]);

  const rowPad = density === 'comfortable' ? 'py-3' : 'py-2';
  const colSpan = visibleColumns.length + (hasActions ? 1 : 0) + (rowDetails ? 1 : 0);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {enableGlobalSearch && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={state.search}
                onChange={(e) => setState((prev) => ({ ...prev, search: e.target.value, pageIndex: 0 }))}
                placeholder={searchPlaceholder}
                className="h-9 pl-8 pr-8"
                aria-label={searchPlaceholder}
              />
              {state.search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setState((prev) => ({ ...prev, search: '', pageIndex: 0 }))}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
          <GridFilterBar columns={columns} state={state} onChange={setState} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {toolbarActions}
          {onRefresh && (
            <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2" disabled={isLoading}>
              <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          )}
          {enableColumnChooser && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Columns3 className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Columns</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.filter((c) => c.id !== 'actions').map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    checked={col.mandatory || !hidden.includes(col.id)}
                    disabled={col.mandatory}
                    onCheckedChange={() => toggle(col.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {col.header}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={false} onCheckedChange={reset} onSelect={(e) => e.preventDefault()}>
                  Show all columns
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {enableExport && (
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2" disabled={total === 0}>
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}
        </div>
      </div>

      {aboveGrid}

      {/* Grid */}
      <div className="rounded-lg border bg-card">
        <div
          className={cn('relative w-full overflow-auto', maxBodyHeight && 'overflow-y-auto')}
          style={maxBodyHeight ? { maxHeight: maxBodyHeight } : undefined}
        >
          <table className="w-full caption-bottom text-sm">
            {caption && <caption className="px-4 py-2 text-left text-xs text-muted-foreground">{caption}</caption>}
            <thead className={cn(stickyHeader && 'sticky top-0 z-20')}>
              <tr className="border-b bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
                {rowDetails && <th className="w-8" aria-label="Expand" />}
                {visibleColumns.map((col) => {
                  const active = state.sort?.id === col.id;
                  return (
                    <th
                      key={col.id}
                      scope="col"
                      className={cn(
                        'whitespace-nowrap px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.priority ? PRIORITY_CLASS[col.priority] : '',
                        col.sticky === 'left' && 'sticky left-0 z-10 bg-muted/95',
                        col.headerClassName,
                      )}
                      style={{ width: col.width, minWidth: col.minWidth }}
                      aria-sort={active ? (state.sort!.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {col.sortable ? (
                        <button
                          type="button"
                          onClick={() => handleSort(col.id)}
                          className={cn(
                            'inline-flex items-center gap-1 hover:text-foreground',
                            col.align === 'right' && 'flex-row-reverse',
                          )}
                        >
                          {col.header}
                          {active
                            ? (state.sort!.direction === 'asc'
                              ? <ArrowUp className="h-3 w-3" />
                              : <ArrowDown className="h-3 w-3" />)
                            : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                        </button>
                      ) : col.header}
                    </th>
                  );
                })}
                {hasActions && (
                  <th scope="col" className="sticky right-0 z-10 w-40 min-w-[10rem] bg-muted/95 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {restricted ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center">
                    <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
                    <p className="font-medium">Restricted</p>
                    <p className="mt-1 text-sm text-muted-foreground">{restrictedMessage}</p>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center">
                    <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" aria-hidden />
                    <p className="font-medium">We could not load these records</p>
                    <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                    {onRefresh && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={onRefresh}>Try again</Button>
                    )}
                  </td>
                </tr>
              ) : isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="border-b">
                    {rowDetails && <td className="px-3 py-2" />}
                    {visibleColumns.map((col) => (
                      <td key={col.id} className={cn('px-3', rowPad, col.priority ? PRIORITY_CLASS[col.priority] : '')}>
                        <Skeleton className="h-4 w-full max-w-[10rem]" />
                      </td>
                    ))}
                    {hasActions && <td className={cn('px-3', rowPad)}><Skeleton className="ml-auto h-8 w-8 rounded-md" /></td>}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-12 text-center">
                    <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
                    <p className="font-medium">{emptyTitle}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
                  </td>
                </tr>
              ) : (
                paged.map((row) => {
                  const id = getRowId(row);
                  const actions = rowActions?.(row).filter((a) => !a.hidden) ?? [];
                  const primary = primaryRowAction?.(row) ?? null;
                  const isExpanded = expanded === id;
                  return (
                    <Fragment key={id}>
                      <tr
                        className={cn(
                          'border-b transition-colors hover:bg-muted/40',
                          onRowClick && 'cursor-pointer',
                        )}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                      >
                        {rowDetails && (
                          <td className={cn('px-2', rowPad)}>
                            <button
                              type="button"
                              aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
                              onClick={(e) => { e.stopPropagation(); setExpanded(isExpanded ? null : id); }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          </td>
                        )}
                        {visibleColumns.map((col) => (
                          <td
                            key={col.id}
                            className={cn(
                              'px-3 align-middle', rowPad,
                              col.align === 'right' && 'text-right',
                              col.align === 'center' && 'text-center',
                              col.priority ? PRIORITY_CLASS[col.priority] : '',
                              col.sticky === 'left' && 'sticky left-0 z-10 bg-card',
                              col.truncate && 'max-w-[18rem] truncate',
                              col.cellClassName,
                            )}
                            title={col.truncate && col.accessor ? String(col.accessor(row) ?? '') : undefined}
                          >
                            {col.cell ? col.cell(row) : defaultCell(col, row)}
                          </td>
                        ))}
                        {hasActions && (
                          <td className={cn('sticky right-0 z-10 bg-card px-3 text-right', rowPad)}>
                            <div className="flex items-center justify-end gap-1">
                              {primary && (primary.to ? (
                                <Button asChild variant="ghost" size="sm" className="h-8">
                                  <Link to={primary.to} onClick={(e) => e.stopPropagation()}>{primary.label}</Link>
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost" size="sm" className="h-8"
                                  onClick={(e) => { e.stopPropagation(); primary.onClick?.(); }}
                                >
                                  {primary.label}
                                </Button>
                              ))}
                              {actions.length > 0 && <RowActionsMenu actions={actions} />}
                            </div>
                          </td>
                        )}
                      </tr>
                      {rowDetails && isExpanded && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={colSpan} className="px-4 py-3">{rowDetails(row)}</td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Separator />

        {/* Footer / pagination */}
        <div className="flex flex-col gap-3 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            {total === 0 ? 'No records' : `Showing ${pageStart}–${pageEnd} of ${total.toLocaleString('en-GB')}`}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="hidden text-xs text-muted-foreground sm:inline">Rows</span>
              <Select
                value={String(state.pageSize)}
                onValueChange={(v) => setState((prev) => ({ ...prev, pageSize: Number(v), pageIndex: 0 }))}
              >
                <SelectTrigger className="h-8 w-[4.5rem]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="sm" className="h-8"
                disabled={state.pageIndex === 0 || isLoading}
                onClick={() => setState((prev) => ({ ...prev, pageIndex: Math.max(0, prev.pageIndex - 1) }))}
              >
                Previous
              </Button>
              <span className="px-2 text-xs text-muted-foreground">
                Page {state.pageIndex + 1} of {pageCount}
              </span>
              <Button
                variant="outline" size="sm" className="h-8"
                disabled={state.pageIndex + 1 >= pageCount || isLoading}
                onClick={() => setState((prev) => ({ ...prev, pageIndex: prev.pageIndex + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Thin adapter so the component body reads like a normal `useState` pair. */
function useState_GridState<T>(args: {
  gridId: string;
  columns: Array<GridColumn<T>>;
  syncUrlState: boolean;
  controlledState?: EnterpriseDataGridProps<T>['state'];
  onStateChange?: EnterpriseDataGridProps<T>['onStateChange'];
}) {
  return useGridState<T>({
    gridId: args.gridId,
    columns: args.columns,
    syncUrl: args.syncUrlState,
    controlled: args.controlledState,
    onControlledChange: args.onStateChange,
  });
}

export default EnterpriseDataGrid;
