/**
 * Shared sortable column header.
 *
 * Compact enterprise header — a full-width clickable, keyboard-accessible
 * control that carries `aria-sort` on the owning `<th>`. Never styled as a
 * navigation hyperlink; the active sort is shown by a solid arrow and a
 * foreground-weighted label.
 */
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ListingSort, SortDirection } from './types';

interface SortableHeaderProps {
  label: string;
  sortKey: string;
  sort: ListingSort | null;
  onSort: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

const nextLabel = (dir: SortDirection | null) =>
  dir === null ? 'sort ascending' : dir === 'asc' ? 'sort descending' : 'clear sort';

export function SortableHeader({ label, sortKey, sort, onSort, align = 'left', className }: SortableHeaderProps) {
  const active = sort?.key === sortKey ? sort : null;
  const Icon = !active ? ArrowUpDown : active.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      title={`${label} — ${nextLabel(active?.direction ?? null)}`}
      aria-label={`${label}: ${nextLabel(active?.direction ?? null)}`}
      className={cn(
        'group -mx-1 flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-semibold uppercase tracking-wide transition-colors',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'text-foreground' : 'text-muted-foreground',
        align === 'right' && 'flex-row-reverse text-right',
        align === 'center' && 'justify-center',
        className,
      )}
    >
      <span className="truncate">{label}</span>
      <Icon
        aria-hidden
        className={cn('h-3.5 w-3.5 shrink-0', active ? 'opacity-100' : 'opacity-40 group-hover:opacity-80')}
      />
    </button>
  );
}
