/**
 * EPIC 4 / W6 — dashboard work position, served by the canonical enterprise
 * work model.
 *
 * The widget reads `supervisory_work_queue` (over `supervisory_work_item`), the
 * same governed read model behind My Work, Entity 360's next action and the
 * enterprise portfolio. Ranking, priority, due dates and routes all come from
 * the read model — nothing is inferred from module tables here, so the
 * dashboard can never disagree with the case file it points at.
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
import { useSupervisoryWorkQueue, type SupervisoryWorkItem } from '@/hooks/useSupervisoryWork';

const PRIORITY_CLASS: Record<string, string> = {
  CRITICAL: 'bg-destructive/10 text-destructive border-destructive/30',
  HIGH: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  MEDIUM: 'bg-muted text-muted-foreground',
  LOW: 'bg-muted text-muted-foreground',
  ROUTINE: 'bg-muted text-muted-foreground',
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'PRUDENTIAL', label: 'Prudential' },
  { key: 'AML_CFT', label: 'AML/CFT' },
  { key: 'MARKET_CONDUCT', label: 'Conduct' },
  { key: 'CROSS_DOMAIN', label: 'Cross-domain' },
] as const;

export function SupervisoryPriorityQueueWidget({ limit = 30 }: { limit?: number }) {
  const [domain, setDomain] = useState<string>('all');
  const { data, isLoading, error } = useSupervisoryWorkQueue({
    scope: 'HIGH_PRIORITY',
    domain: domain === 'all' ? null : domain,
    limit,
  });

  const rows: SupervisoryWorkItem[] = useMemo(() => data?.items ?? [], [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" /> Supervisory priority work
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            One enterprise work model — governed priority first, then overdue and decision-point work.
          </p>
        </div>
        <Tabs value={domain} onValueChange={setDomain}>
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
            No high-priority supervisory work in the domains you can access.
          </p>
        ) : (
          <>
            {rows.map((item) => (
              <Link
                key={item.work_key}
                to={item.route}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title ?? item.reference ?? item.work_type_label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.work_type_label}
                    {item.entity_name ? ` · ${item.entity_name}` : ''}
                    {' · '}{humanize(item.work_state)}
                    {item.due_date ? ` · Due ${formatDate(item.due_date)}` : ''}
                  </p>
                </div>
                {item.is_overdue && (
                  <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-[10px] text-destructive">
                    Overdue
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[10px] ${PRIORITY_CLASS[item.priority] ?? PRIORITY_CLASS.MEDIUM}`}>
                  {humanize(item.priority)}
                </Badge>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            <Link to="/my-work" className="mt-2 block px-2 text-xs text-primary hover:underline">
              Open My Work for the full enterprise queue
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
