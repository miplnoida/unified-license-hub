/**
 * EPR-03 — Entity 360 enforcement summary.
 *
 * Read-only enforcement position for one regulated entity, served by
 * `enforcement_entity_summary()`. Drill-downs go to the canonical enforcement
 * queue or case workspace. This panel never edits a case and offers no status
 * control — enforcement state changes only inside the case workspace's current
 * step.
 */
import { Link } from 'react-router-dom';
import { ArrowUpRight, Gavel } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateTime } from '@/lib/datetime';
import { formatBaseMoney, formatMoney } from '@/lib/money';
import { ENFORCEMENT_SOURCE_LABEL, type EnforcementSourceKind } from '@/lib/enforcementProcessOps';
import { useEnforcementEntitySummary } from '@/hooks/useEnforcementProcess';

const SLA_CLASS: Record<string, string> = {
  breached: 'bg-destructive/10 text-destructive border-destructive/30',
  due_soon: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  on_track: 'bg-muted text-muted-foreground',
  paused: 'bg-muted text-muted-foreground',
};

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'danger' }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${tone === 'danger' ? 'text-destructive' : ''}`}>{value}</div>
    </div>
  );
}

export function EntityEnforcementPanel({ entityId }: { entityId: string }) {
  const { data, isLoading, error } = useEnforcementEntitySummary(entityId);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (error) return <Card><CardContent className="py-4 text-sm text-destructive">{(error as Error).message}</CardContent></Card>;
  if (!data) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2"><Gavel className="h-4 w-4 text-primary" /> Enforcement</span>
          <Link to={`/enforcement?entity=${entityId}`} className="inline-flex items-center gap-1 text-xs font-normal text-primary hover:underline">
            Open in enforcement queue <ArrowUpRight className="h-3 w-3" />
          </Link>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Enforcement cases against this entity, whatever process referred them. Cases are progressed in
          the case workspace, never from this profile.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Open cases" value={data.open_cases} />
          <Stat label="Closed cases" value={data.closed_cases} />
          <Stat label="SLA breached" value={data.breached_sla} tone={data.breached_sla > 0 ? 'danger' : undefined} />
          <Stat label="Open obligations" value={data.open_obligations} />
          <Stat label="Penalty imposed" value={formatBaseMoney(data.penalty_imposed)} />
          <Stat label="Penalty outstanding" value={formatBaseMoney(data.penalty_outstanding)}
                tone={Number(data.penalty_outstanding) > 0 ? 'danger' : undefined} />
        </div>

        {data.cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No enforcement case has been opened against this entity.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead><TableHead>Referred from</TableHead>
                  <TableHead>Stage</TableHead><TableHead>SLA</TableHead>
                  <TableHead>Penalty</TableHead><TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.cases.map((c) => (
                  <TableRow key={c.case_id}>
                    <TableCell>
                      <Link to={c.canonical_href} className="font-mono text-xs text-primary hover:underline">{c.case_number}</Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {ENFORCEMENT_SOURCE_LABEL[(c.source_kind ?? 'MANUAL_REFERRAL') as EnforcementSourceKind] ?? c.source_kind}
                      {c.source_reference ? <div className="font-mono text-[11px] text-muted-foreground">{c.source_reference}</div> : null}
                    </TableCell>
                    <TableCell className="text-sm">{c.stage_label ?? c.stage}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={SLA_CLASS[c.sla_state] ?? SLA_CLASS.paused}>
                        {c.sla_state.replace('_', ' ')}
                      </Badge>
                      <div className="text-[11px] text-muted-foreground">{c.sla_due_at ? formatDateTime(c.sla_due_at) : '—'}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatMoney(c.penalty_amount, c.penalty_currency)}
                    </TableCell>
                    <TableCell className="text-sm capitalize">{(c.decision_outcome ?? '').replace(/_/g, ' ') || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EntityEnforcementPanel;
