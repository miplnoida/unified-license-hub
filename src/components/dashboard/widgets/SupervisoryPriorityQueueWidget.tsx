/**
 * Package A4 — canonical supervisory priority work queue.
 *
 * One ranked list of everything a supervisor must act on next, served by
 * `sup_priority_work_queue`. Ranking is decided in the read model (hard
 * breaches first, then overdue/early-warning work, then investigations, then
 * routine filings and applications) so every surface shows the same order.
 * Each row deep-links to the canonical record — never to a legacy screen.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ListChecks } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate } from '@/lib/presentation/format';
import { humanize } from '@/lib/presentation/statusLabels';
import { useSupPriorityWorkQueue, type SupDomain, type SupWorkItem } from '@/hooks/useSupervisoryReadModels';

const KIND_LABEL: Record<string, string> = {
  prudential_signal: 'Prudential signal',
  return_filing: 'Return filing',
  conduct_investigation: 'Conduct investigation',
  conduct_action: 'Conduct action',
  thematic_action: 'Thematic remediation',
  application: 'Licence application',
};

const SEVERITY_CLASS: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  medium: 'bg-muted text-muted-foreground',
  low: 'bg-muted text-muted-foreground',
};

const FILTERS: Array<{ key: 'all' | SupDomain; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'prudential', label: 'Prudential' },
  { key: 'returns', label: 'Returns' },
  { key: 'conduct', label: 'Conduct' },
  { key: 'licensing', label: 'Licensing' },
];

export function SupervisoryPriorityQueueWidget({ limit = 30 }: { limit?: number }) {
  const [filter, setFilter] = useState<'all' | SupDomain>('all');
  const { data, isLoading, error } = useSupPriorityWorkQueue(limit, filter === 'all' ? null : filter);

  const rows: SupWorkItem[] = useMemo(() => data ?? [], [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" /> Supervisory priority queue
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Ranked by regulatory consequence — unacknowledged breaches first, then overdue obligations.
          </p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | SupDomain)}>
          <TabsList className="h-8">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.key} value={f.key} className="px-2.5 text-xs">{f.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-11 w-full" />)
        ) : error ? (
          <p className="py-3 text-sm text-destructive">{(error as Error).message}</p>
        ) : rows.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">
            No outstanding supervisory work in the domains you can access.
          </p>
        ) : (
          rows.map((item) => (
            <Link
              key={`${item.kind}-${item.id}`}
              to={item.href}
              className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {KIND_LABEL[item.kind] ?? humanize(item.kind)}
                  {' · '}{humanize(item.status)}
                  {item.due_at ? ` · Due ${formatDate(item.due_at)}` : ''}
                </p>
              </div>
              <Badge variant="outline" className={`text-[10px] ${SEVERITY_CLASS[item.severity] ?? SEVERITY_CLASS.medium}`}>
                {humanize(item.severity)}
              </Badge>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
