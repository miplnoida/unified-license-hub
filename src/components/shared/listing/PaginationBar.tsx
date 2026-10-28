/**
 * Shared listing pagination bar.
 *
 * Shows the real record range and total from the owning screen (or the complete
 * bounded dataset), and hides itself when there is only one page and the caller
 * does not need a page-size selector.
 */
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pageCount, rangeLabel } from './sorting';
import { PAGE_SIZE_OPTIONS } from './types';

interface PaginationBarProps {
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  /** Keep the bar visible (record count only) even with a single page. */
  alwaysShowCount?: boolean;
  className?: string;
}

export function PaginationBar({
  totalCount,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  alwaysShowCount = false,
  className,
}: PaginationBarProps) {
  const pages = pageCount(totalCount, pageSize);
  const single = totalCount <= pageSize;
  if (single && !alwaysShowCount && !onPageSizeChange) return null;
  const sizes = [...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${className ?? ''}`}>
      <p className="text-xs text-muted-foreground">{rangeLabel(totalCount, page, pageSize)}</p>
      <div className="flex items-center gap-2">
        {onPageSizeChange ? (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[5.5rem]" aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sizes.map((o) => (
                <SelectItem key={o} value={String(o)}>
                  {o} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {!single ? (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="First page"
              title="First page"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous page"
              title="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-1 text-xs font-medium tabular-nums">
              Page {Math.min(page, pages)} of {pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next page"
              title="Next page"
              disabled={page >= pages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Last page"
              title="Last page"
              disabled={page >= pages}
              onClick={() => onPageChange(pages)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
