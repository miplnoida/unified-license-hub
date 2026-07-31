import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { Lock, Search } from 'lucide-react';
import {
  THREAD_STATE_LABELS,
  THREAD_TYPE_LABELS,
  type CorrespondenceThread,
  type ThreadFilters,
} from '@/hooks/useCorrespondence';

interface Props {
  threads: CorrespondenceThread[];
  isLoading?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  filters: ThreadFilters;
  onFiltersChange: (f: ThreadFilters) => void;
  unreadIds?: Set<string>;
}

const stateTone: Record<string, string> = {
  open: 'bg-primary/10 text-primary border-primary/20',
  pending_response: 'bg-amber-100 text-amber-900 border-amber-200',
  closed: 'bg-muted text-muted-foreground',
};

export function ThreadList({
  threads, isLoading, selectedId, onSelect, filters, onFiltersChange, unreadIds,
}: Props) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search subject, reference, sender…"
            value={filters.query ?? ''}
            onChange={(e) => onFiltersChange({ ...filters, query: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Select value={filters.threadType ?? 'all'} onValueChange={(v) => onFiltersChange({ ...filters, threadType: v })}>
            <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(THREAD_TYPE_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.threadState ?? 'all'} onValueChange={(v) => onFiltersChange({ ...filters, threadState: v })}>
            <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {Object.entries(THREAD_STATE_LABELS).map(([k, l]) => (
                <SelectItem key={k} value={k}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y">
        {isLoading && <div className="p-3 space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>}
        {!isLoading && threads.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No threads match your filters.</p>
        )}
        {threads.map((t) => {
          const unread = unreadIds?.has(t.id);
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                'w-full text-left p-3 space-y-1 hover:bg-muted/60 transition-colors',
                selectedId === t.id && 'bg-muted',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn('text-sm line-clamp-1', unread ? 'font-semibold' : 'font-medium')}>{t.subject}</span>
                {unread && <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" aria-label="Unread" />}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-1">
                {t.sender_name}{t.sender_org ? ` · ${t.sender_org}` : ''}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{THREAD_TYPE_LABELS[t.thread_type] ?? t.thread_type}</Badge>
                <Badge variant="outline" className={cn('text-[10px]', stateTone[t.thread_state])}>
                  {THREAD_STATE_LABELS[t.thread_state] ?? t.thread_state}
                </Badge>
                {!t.is_entity_facing && (
                  <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" />Internal</Badge>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto font-mono">{t.reference}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                {formatDistanceToNow(new Date(t.last_message_at ?? t.received_at), { addSuffix: true })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
