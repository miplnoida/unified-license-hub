/**
 * AML-09 — operational due-review list.
 *
 * A work list, not portfolio analytics: no chart, no aggregate risk score, no
 * trend. Every row, its monitoring state, its next review date and the basis
 * for that date come from the server read model exactly as returned.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CalendarClock, RefreshCw } from 'lucide-react';
import {
  DUE_DATE_BASIS_LABEL,
  MONITORING_STATE_LABEL,
  useAmlRiskMonitoringDueList,
} from '@/hooks/useAmlRiskMonitoring';

const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

const STATES = ['OVERDUE', 'DUE', 'EVENT_TRIGGERED', 'UNSCHEDULED', 'CURRENT', 'LEGACY', 'BLOCKED'];

export function AmlDueReviewList({ domainCode = 'AML_CFT' }: { domainCode?: string }) {
  const [state, setState] = useState<string>('all');
  const { data, isLoading, error, refetch, isFetching } =
    useAmlRiskMonitoringDueList(domainCode, state === 'all' ? null : state);

  return (
    <Card data-testid="aml-due-review-list">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4" /> Reviews due and events awaiting consideration
        </CardTitle>
        <CardDescription>
          The server decides each entity's review state. A due or overdue review does not change the entity's rating.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Select value={state} onValueChange={setState}>
            <SelectTrigger className="h-9 w-60" aria-label="Monitoring state">
              <SelectValue placeholder="All monitoring states" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All monitoring states</SelectItem>
              {STATES.map((s) => (
                <SelectItem key={s} value={s}>{MONITORING_STATE_LABEL[s] ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost" size="icon" aria-label="Refresh due reviews"
            onClick={() => void refetch()} disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <span className="text-sm text-muted-foreground">
            {isLoading ? 'Loading…' : `${data?.count ?? 0} entit${(data?.count ?? 0) === 1 ? 'y' : 'ies'}`}
          </span>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load reviews due</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (data?.items ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No supervised entity matches this monitoring state.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entity</TableHead><TableHead>Rating</TableHead>
                <TableHead>Last established</TableHead><TableHead>Next review</TableHead>
                <TableHead>Basis</TableHead><TableHead>State</TableHead><TableHead>Events</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.items ?? []).map((r) => (
                <TableRow key={r.entity_id}>
                  <TableCell className="text-xs">
                    <Link className="underline" to={`/entities/${r.entity_id}`}>{dash(r.entity_name)}</Link>
                  </TableCell>
                  <TableCell className="text-xs">{dash(r.current_rating)}</TableCell>
                  <TableCell className="text-xs">{dash(r.last_review_date)}</TableCell>
                  <TableCell className="text-xs">{dash(r.next_review_date)}</TableCell>
                  <TableCell className="text-xs">
                    {DUE_DATE_BASIS_LABEL[r.due_date_basis ?? ''] ?? dash(r.due_date_basis)}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant={r.monitoring_state === 'OVERDUE' ? 'destructive' : 'outline'}>
                      {MONITORING_STATE_LABEL[r.monitoring_state] ?? r.monitoring_state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.event_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
