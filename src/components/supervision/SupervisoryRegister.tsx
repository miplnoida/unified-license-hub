/**
 * Reusable supervisory register presentation.
 *
 * Presentation only — no data access, no business rules. Registers pass already
 * derived rows and cells; this component owns the readability contract:
 *  - one horizontal scroll context at most (the shared Table supplies it);
 *  - the canonical human-readable identifier is always visible (first column,
 *    sticky on wide screens) with an optional copy control for the technical id;
 *  - the action column is sticky to the right so actions never scroll away;
 *  - low-priority columns collapse on tablet, and mobile renders stacked cards;
 *  - column sorting and paging use the shared listing kit.
 *
 * Two data modes:
 *  - `client`: the caller supplies a complete bounded dataset and the register
 *    sorts and pages it locally over raw canonical values;
 *  - `server`: the screen owns the query (order/range/count) and feeds back the
 *    current page plus the authoritative `totalCount`. The register never
 *    queries a backend in either mode.
 */
import { ReactNode, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { PaginationBar, SortableHeader } from '@/components/shared/listing';
import { ariaSortOf, paginate, sortRows, type SortSpec } from '@/components/shared/listing/sorting';
import {
  DEFAULT_PAGE_SIZE,
  type ListingDataType,
  type ListingMode,
  type ListingSort,
} from '@/components/shared/listing/types';

/** 1 = always visible, 2 = hidden below xl, 3 = hidden below lg. */
export type RegisterPriority = 1 | 2 | 3;

export interface RegisterColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  priority?: RegisterPriority;
  align?: 'left' | 'right';
  className?: string;
  headerClassName?: string;
  /** Enable the shared sortable header for this column. */
  sortable?: boolean;
  /** Stable sort key sent to the backend in server mode. Defaults to `id`. */
  sortKey?: string;
  /** Client mode: raw canonical value used for sorting (never rendered JSX). */
  sortAccessor?: (row: T) => unknown;
  dataType?: ListingDataType;
  businessOrder?: string[];
}

export interface RegisterIdentifier {
  /** Canonical human-readable reference, e.g. an examination reference. */
  reference: string;
  /** Subject line shown under the reference (entity, title). */
  subject?: ReactNode;
  /** Technical id/work key offered behind a copy control only. */
  copyValue?: string | null;
  copyLabel?: string;
}

export interface SupervisoryRegisterProps<T> {
  rows: T[];
  getRowId: (row: T) => string;
  identifier: (row: T) => RegisterIdentifier;
  columns: Array<RegisterColumn<T>>;
  actions: (row: T) => ReactNode;
  identifierHeader?: string;
  onRowClick?: (row: T) => void;
  isRowFocused?: (row: T) => boolean;
  /** Extra stacked content for the mobile card, below the standard columns. */
  mobileExtra?: (row: T) => ReactNode;
  caption?: string;
  className?: string;

  /* ----- listing behaviour ----- */
  mode?: ListingMode;
  /** Current sort. Controlled when `onSortChange` is supplied. */
  sort?: ListingSort | null;
  onSortChange?: (sort: ListingSort | null) => void;
  /** Sort the canonical identifier column (defaults to the reference text). */
  identifierSortable?: boolean;
  identifierSortKey?: string;
  /** Paging. Omit entirely for genuinely small bounded lists. */
  paged?: boolean;
  page?: number;
  pageSize?: number;
  /** Server mode: authoritative total across all pages. */
  totalCount?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  /** Show the record count line even on a single page. */
  showRecordCount?: boolean;
}

const priorityClass: Record<RegisterPriority, string> = {
  1: '',
  2: 'hidden xl:table-cell',
  3: 'hidden lg:table-cell',
};

export function CopyReferenceButton({
  value,
  label = 'Copy identifier',
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      className="h-6 w-6 text-muted-foreground"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function IdentifierBlock({ id }: { id: RegisterIdentifier }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1">
        <span className="truncate font-mono text-xs font-semibold">{id.reference || '—'}</span>
        {id.copyValue ? (
          <CopyReferenceButton value={id.copyValue} label={id.copyLabel ?? 'Copy identifier'} />
        ) : null}
      </div>
      {id.subject ? (
        <div className="mt-0.5 truncate text-sm font-medium text-foreground">{id.subject}</div>
      ) : null}
    </div>
  );
}

const IDENTIFIER_KEY = 'reference';

export function SupervisoryRegister<T>({
  rows,
  getRowId,
  identifier,
  columns,
  actions,
  identifierHeader = 'Reference / subject',
  onRowClick,
  isRowFocused,
  mobileExtra,
  caption,
  className,
  mode = 'client',
  sort = null,
  onSortChange,
  identifierSortable = false,
  identifierSortKey = IDENTIFIER_KEY,
  paged = false,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
  totalCount,
  onPageChange,
  onPageSizeChange,
  showRecordCount = false,
}: SupervisoryRegisterProps<T>) {
  const sortSpecs = useMemo<Array<SortSpec<T>>>(() => {
    const specs: Array<SortSpec<T>> = columns
      .filter((c) => c.sortable)
      .map((c) => ({
        key: c.sortKey ?? c.id,
        accessor: c.sortAccessor ?? (() => null),
        dataType: c.dataType,
        businessOrder: c.businessOrder,
      }));
    if (identifierSortable) {
      specs.push({
        key: identifierSortKey,
        accessor: (row: T) => identifier(row).reference,
        dataType: 'text',
      });
    }
    return specs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, identifierSortable, identifierSortKey]);

  const secondary = (row: T) => `${identifier(row).reference ?? ''}|${getRowId(row)}`;

  const sorted = useMemo(
    () => (mode === 'server' ? rows : sortRows(rows, sort, sortSpecs, secondary)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort, sortSpecs, mode],
  );

  const total = mode === 'server' ? (totalCount ?? rows.length) : sorted.length;
  const visible = useMemo(
    () => (paged && mode === 'client' ? paginate(sorted, page, pageSize) : sorted),
    [sorted, paged, mode, page, pageSize],
  );

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    if (!sort || sort.key !== key) onSortChange({ key, direction: 'asc' });
    else if (sort.direction === 'asc') onSortChange({ key, direction: 'desc' });
    else onSortChange(null);
  };

  const sortableEnabled = Boolean(onSortChange);

  return (
    <div className={className}>
      {/* Desktop / tablet compact register — the shared Table owns overflow. */}
      <Table className="hidden md:table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow>
            <TableHead
              className="sticky left-0 z-20 min-w-[13rem] bg-card"
              aria-sort={
                identifierSortable && sortableEnabled ? ariaSortOf(sort, identifierSortKey) : undefined
              }
            >
              {identifierSortable && sortableEnabled ? (
                <SortableHeader
                  label={identifierHeader}
                  sortKey={identifierSortKey}
                  sort={sort}
                  onSort={handleSort}
                />
              ) : (
                identifierHeader
              )}
            </TableHead>
            {columns.map((c) => {
              const key = c.sortKey ?? c.id;
              const isSortable = Boolean(c.sortable) && sortableEnabled;
              return (
                <TableHead
                  key={c.id}
                  aria-sort={isSortable ? ariaSortOf(sort, key) : undefined}
                  className={cn(
                    priorityClass[c.priority ?? 1],
                    c.align === 'right' && 'text-right',
                    c.headerClassName,
                  )}
                >
                  {isSortable ? (
                    <SortableHeader
                      label={c.header}
                      sortKey={key}
                      sort={sort}
                      onSort={handleSort}
                      align={c.align ?? 'left'}
                    />
                  ) : (
                    c.header
                  )}
                </TableHead>
              );
            })}
            {/* Action column is never sortable. */}
            <TableHead className="sticky right-0 z-20 bg-card text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => {
            const focused = isRowFocused?.(row) ?? false;
            return (
              <TableRow
                key={getRowId(row)}
                className={cn(
                  'group',
                  onRowClick && 'cursor-pointer',
                  focused && 'bg-muted/60',
                )}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                <TableCell
                  className={cn(
                    'sticky left-0 z-10 max-w-[18rem] bg-card p-3 group-hover:bg-muted/50',
                    focused && 'bg-muted/60',
                  )}
                >
                  <IdentifierBlock id={identifier(row)} />
                </TableCell>
                {columns.map((c) => (
                  <TableCell
                    key={c.id}
                    className={cn(
                      'p-3 align-top text-xs',
                      priorityClass[c.priority ?? 1],
                      c.align === 'right' && 'text-right',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </TableCell>
                ))}
                <TableCell
                  className={cn(
                    'sticky right-0 z-10 whitespace-nowrap bg-card p-3 text-right group-hover:bg-muted/50',
                    focused && 'bg-muted/60',
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {actions(row)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Mobile: stacked cards instead of a very wide table. */}
      <ul className="space-y-3 md:hidden">
        {visible.map((row) => {
          const focused = isRowFocused?.(row) ?? false;
          return (
            <li
              key={getRowId(row)}
              className={cn('rounded-lg border bg-card p-3', focused && 'ring-2 ring-primary')}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                disabled={!onRowClick}
              >
                <IdentifierBlock id={identifier(row)} />
              </button>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                {columns
                  .filter((c) => (c.priority ?? 1) < 3)
                  .map((c) => (
                    <div key={c.id} className="min-w-0">
                      <dt className="uppercase tracking-wide text-muted-foreground">{c.header}</dt>
                      <dd className="mt-0.5">{c.cell(row)}</dd>
                    </div>
                  ))}
              </dl>
              {mobileExtra ? <div className="mt-3 text-xs">{mobileExtra(row)}</div> : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">{actions(row)}</div>
            </li>
          );
        })}
      </ul>

      {paged && onPageChange ? (
        <PaginationBar
          className="mt-3"
          totalCount={total}
          page={page}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          alwaysShowCount={showRecordCount}
        />
      ) : null}
    </div>
  );
}
