import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, ArrowRight, Inbox } from 'lucide-react';
import { formatDate } from '@/lib/datetime';
import {
  WORK_SCOPES,
  WORK_SCOPE_LABELS,
  useSupervisoryWorkQueue,
  type SupervisoryWorkItem,
  type WorkScope,
} from '@/hooks/useSupervisoryWork';

/**
 * My Work (EPIC 4).
 *
 * My Work is now a filter over the single canonical enterprise work model
 * (`supervisory_work_item`), not a queue of its own. Scopes — My Work, My Team,
 * Unassigned, Due Soon, Overdue, High Priority, Awaiting My Approval — are all
 * served by the governed `supervisory_work_queue` read model, which derives
 * every row from the authoritative record. Nothing is copied into a generic
 * work table and no state is recomputed here; each row links straight back to
 * the workspace that owns the decision.
 */
const DOMAIN_OPTIONS = [
  { value: 'all', label: 'All domains' },
  { value: 'PRUDENTIAL', label: 'Prudential' },
  { value: 'AML_CFT', label: 'AML/CFT' },
  { value: 'MARKET_CONDUCT', label: 'Market conduct' },
  { value: 'OPERATIONAL_RESILIENCE', label: 'Operational resilience' },
  { value: 'GOVERNANCE', label: 'Governance' },
  { value: 'CROSS_DOMAIN', label: 'Cross-domain' },
];

const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: 'border-destructive/40 text-destructive',
  HIGH: 'border-destructive/30 text-destructive',
  MEDIUM: 'border-border text-foreground',
  LOW: 'border-border text-muted-foreground',
  ROUTINE: 'border-border text-muted-foreground',
};

const stateLabel = (item: SupervisoryWorkItem) =>
  item.work_state
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');

export default function MyWork() {
  const [scope, setScope] = useState<WorkScope>('MY_WORK');
  const [domain, setDomain] = useState<string>('all');
  const [workType, setWorkType] = useState<string>('all');

  const { data, isLoading, error } = useSupervisoryWorkQueue({
    scope,
    domain: domain === 'all' ? null : domain,
    workType: workType === 'all' ? null : workType,
  });

  const items = data?.items ?? [];
  const counts = data?.counts ?? {};

  const workTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    items.forEach((item) => seen.set(item.work_type, item.work_type_label));
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">My Work</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          One enterprise work list, derived live from the supervisory record that owns each decision.
          Switch scope to see your team's work, unassigned work, what is due or overdue, and what is
          waiting on your approval.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {WORK_SCOPES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={scope === s ? 'default' : 'outline'}
            onClick={() => setScope(s)}
          >
            {WORK_SCOPE_LABELS[s]}
            <Badge variant="secondary" className="ml-1.5">
              {counts[s] ?? 0}
            </Badge>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={domain} onValueChange={setDomain}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent>
            {DOMAIN_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={workType} onValueChange={setWorkType}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Work type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All work types</SelectItem>
            {workTypeOptions.map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}

      {error && (
        <Card>
          <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {String((error as Error).message)}
          </CardContent>
        </Card>
      )}

      {data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              {WORK_SCOPE_LABELS[scope]} — {items.length} item{items.length === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No supervisory work matches this scope right now.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work</TableHead>
                      <TableHead className="whitespace-nowrap">Work type</TableHead>
                      <TableHead className="whitespace-nowrap">Entity</TableHead>
                      <TableHead className="whitespace-nowrap">Domain</TableHead>
                      <TableHead className="whitespace-nowrap">State</TableHead>
                      <TableHead className="whitespace-nowrap">Priority</TableHead>
                      <TableHead className="whitespace-nowrap">Due</TableHead>
                      <TableHead className="w-16" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.work_key}>
                        <TableCell className="min-w-[240px]">
                          <span className="block font-medium">{item.title || 'Untitled'}</span>
                          {item.reference && (
                            <span className="block font-mono text-xs text-muted-foreground">
                              {item.reference}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.work_type_label}
                          {item.decision_point && (
                            <Badge variant="outline" className="ml-1.5 text-[10px]">
                              Decision
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.entity_id ? (
                            <Link className="underline-offset-2 hover:underline" to={`/entities/${item.entity_id}`}>
                              {item.entity_name || 'Entity'}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs font-mono">
                          {item.domain_code || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{stateLabel(item)}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <Badge variant="outline" className={PRIORITY_TONE[item.priority] ?? ''}>
                            {item.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.due_date ? (
                            <span className={item.is_overdue ? 'font-medium text-destructive' : undefined}>
                              {formatDate(item.due_date)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="ghost">
                            <Link to={item.route} aria-label="Open item">
                              <ArrowRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
