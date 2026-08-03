import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, Clock, Lock, Search, Users, X,
} from 'lucide-react';
import {
  CORRESPONDENCE_MODULE_LABELS,
  THREAD_STATE_LABELS,
  THREAD_TYPE_LABELS,
  type FeedThread,
  type ThreadFeedFilters,
} from '@/hooks/useCorrespondence';

interface Props {
  threads: FeedThread[];
  isLoading?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  filters: ThreadFeedFilters;
  onFiltersChange: (f: ThreadFeedFilters) => void;
  canFilterAssignee?: boolean;
  officers?: Array<{ id: string; full_name: string }>;
  total?: number;
  compact?: boolean;
}

const stateTone: Record<string, string> = {
  open: 'bg-primary/10 text-primary border-primary/20',
  pending_response: 'bg-amber-100 text-amber-900 border-amber-200',
  closed: 'bg-muted text-muted-foreground',
};

function DirectionChip({ t }: { t: FeedThread }) {
  if (!t.is_entity_facing || t.effective_direction === 'internal') {
    return <Badge variant="secondary" className="text-[10px] gap-1"><Lock className="h-2.5 w-2.5" />Internal</Badge>;
  }
  return t.effective_direction === 'inbound'
    ? <Badge variant="outline" className="text-[10px] gap-1"><ArrowDownLeft className="h-2.5 w-2.5" />Inbound</Badge>
    : <Badge variant="outline" className="text-[10px] gap-1"><ArrowUpRight className="h-2.5 w-2.5" />Outbound</Badge>;
}

export function ThreadList({
  threads, isLoading, selectedId, onSelect, filters, onFiltersChange,
  canFilterAssignee, officers = [], total, compact,
}: Props) {
  const set = (patch: Partial<ThreadFeedFilters>) => onFiltersChange({ ...filters, ...patch });
  const activeCount = [
    filters.status && filters.status !== 'all',
    filters.module && filters.module !== 'all',
    filters.direction && filters.direction !== 'all',
    filters.thread_type && filters.thread_type !== 'all',
    filters.assigned_officer_id,
    filters.unread_only,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search title, entity, case reference or participant…"
            value={filters.query ?? ''}
            onChange={(e) => set({ query: e.target.value })}
          />
        </div>

        {!compact && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Select value={filters.status ?? 'all'} onValueChange={(v) => set({ status: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {Object.entries(THREAD_STATE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.module ?? 'all'} onValueChange={(v) => set({ module: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Module" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {Object.entries(CORRESPONDENCE_MODULE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.direction ?? 'all'} onValueChange={(v) => set({ direction: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Direction" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All directions</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.thread_type ?? 'all'} onValueChange={(v) => set({ thread_type: v })}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(THREAD_TYPE_LABELS).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canFilterAssignee && (
              <Select
                value={filters.assigned_officer_id ?? 'all'}
                onValueChange={(v) => set({ assigned_officer_id: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Assigned officer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any assignee</SelectItem>
                  {officers.map((o) => <SelectItem key={o.id} value={o.id}>{o.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            <div className="flex items-center justify-between">
              <label className="text-xs inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!filters.unread_only}
                  onChange={(e) => set({ unread_only: e.target.checked })}
                />
                Unread only
              </label>
              {activeCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => onFiltersChange({ query: filters.query, source_type: filters.source_type, source_id: filters.source_id })}
                >
                  <X className="h-3 w-3 mr-1" />Clear {activeCount}
                </Button>
              )}
            </div>
          </>
        )}

        <p className="text-[11px] text-muted-foreground">
          {isLoading ? 'Loading threads…' : `${threads.length} shown${total ? ` of ${total} authorised` : ''}`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto divide-y">
        {isLoading && (
          <div className="p-3 space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        )}
        {!isLoading && threads.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">No threads match your filters.</p>
        )}
        {threads.map((t) => {
          const unread = (t.unread_count ?? 0) > 0;
          const parties = (t.parties ?? []).map((p) => p.name).slice(0, 3).join(', ');
          return (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={cn(
                'w-full text-left p-3 space-y-1.5 hover:bg-muted/60 transition-colors',
                selectedId === t.id && 'bg-muted',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn('text-sm line-clamp-1', unread ? 'font-semibold' : 'font-medium')}>{t.subject}</span>
                {unread && (
                  <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {t.unread_count}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  {CORRESPONDENCE_MODULE_LABELS[t.module] ?? t.module}
                </span>
                {t.source_reference && <span className="font-mono">· {t.source_reference}</span>}
                {t.entity_name && <span>· {t.entity_name}</span>}
              </div>

              {t.last_message_preview && (
                <p className="text-xs text-muted-foreground line-clamp-2">{t.last_message_preview}</p>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">{THREAD_TYPE_LABELS[t.thread_type] ?? t.thread_type}</Badge>
                <Badge variant="outline" className={cn('text-[10px]', stateTone[t.thread_state])}>
                  {THREAD_STATE_LABELS[t.thread_state] ?? t.thread_state}
                </Badge>
                <DirectionChip t={t} />
                {t.sla_breached_at && (
                  <Badge variant="destructive" className="text-[10px] gap-1">
                    <AlertTriangle className="h-2.5 w-2.5" />SLA breached
                  </Badge>
                )}
                {!t.sla_breached_at && t.sla_warned_at && (
                  <Badge variant="outline" className="text-[10px] gap-1 border-amber-200 bg-amber-50 text-amber-900">
                    <Clock className="h-2.5 w-2.5" />Due soon
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto font-mono">{t.reference}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                {parties && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{parties}</span>}
                {(t.assigned_officer || t.assigned_team || t.assigned_unit) && (
                  <span>· {t.assigned_officer ?? t.assigned_team ?? t.assigned_unit}</span>
                )}
                <span className="ml-auto">
                  {formatDistanceToNow(new Date(t.last_message_at ?? t.received_at), { addSuffix: true })}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
