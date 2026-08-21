/**
 * EPR-01 — external Returns overview on canonical truth.
 *
 * Counts come from the server aggregate `returns_entity_summary`
 * (`return_filings` + `v_return_filing_workflow_state`) for the entities the
 * signed-in user is an approved member of; recent activity comes from
 * `returns_entity_filing_history`. Nothing is derived from `rows.length` of a
 * browser page and the retired `returns_filed` table is no longer read, so an
 * unavailable figure is never rendered as a misleading zero.
 */
import { useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, Clock, CheckCircle, AlertTriangle, FileText, ArrowRight, Loader2 } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { useMyApprovedMemberships } from '@/hooks/useEntityReturns';
import {
  fetchCanonicalEntityReturnsSummary,
  fetchCanonicalEntityFilingHistory,
} from '@/lib/returns/canonicalReturnsSummary';
import { objectRoute } from '@/lib/routes/objectRoutes';
import { formatDateOnly } from '@/lib/datetime';

export default function EntityReturnsDashboard() {
  const navigate = useNavigate();
  const { data: memberships = [], isLoading: loadingMemberships } = useMyApprovedMemberships();
  const entityIds = useMemo(() => memberships.map((m) => m.entity_id), [memberships]);

  const summaryQuery = useQuery({
    queryKey: ['canonical_entity_returns_summary', entityIds],
    enabled: entityIds.length > 0,
    queryFn: () => fetchCanonicalEntityReturnsSummary(entityIds),
  });

  const historyQuery = useQuery({
    queryKey: ['canonical_entity_filing_history', entityIds[0] ?? null],
    enabled: entityIds.length === 1,
    queryFn: () => fetchCanonicalEntityFilingHistory(entityIds[0]),
  });

  const summary = summaryQuery.data;
  const overdue = summary?.overdue ?? 0;

  if (loadingMemberships) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Returns Dashboard"
          description="Overview of your organisation's regulatory return filings."
          actions={
            <Button onClick={() => navigate('/entity/returns')}>
              Go to Returns workspace<ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          }
        />

        {entityIds.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              You are not an approved user of any regulated entity, so no return filings are visible to you.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard title="Due soon" value={summary?.due_soon ?? 0} icon={<Clock className="h-6 w-6" />} variant="warning" />
              <StatCard title="Overdue" value={overdue} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
              <StatCard title="In progress" value={summary?.draft ?? 0} icon={<FileText className="h-6 w-6" />} />
              <StatCard title="Awaiting review" value={summary?.pending_review ?? 0} icon={<CalendarCheck className="h-6 w-6" />} variant="warning" />
              <StatCard title="Accepted" value={summary?.accepted ?? 0} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
            </div>

            {overdue > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">
                    You have {overdue} overdue return{overdue > 1 ? 's' : ''}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Submit these filings to avoid enforcement action.</p>
                </div>
              </div>
            )}

            <Card>
              <CardHeader><CardTitle className="text-base">Next filings due</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(summary?.upcoming ?? []).map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/70"
                      onClick={() => navigate(objectRoute.returnFiling(f.id, 'external'))}
                    >
                      <div>
                        <p className="font-medium text-sm">{f.filing_reference || f.definition_name || 'Return filing'}</p>
                        <p className="text-xs text-muted-foreground">
                          {f.definition_name}{f.period_label ? ` — ${f.period_label}` : ''}
                          {f.due_date ? ` · due ${formatDateOnly(f.due_date)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {f.is_overdue && <Badge variant="destructive">Overdue</Badge>}
                        <Badge variant="secondary">{f.status_label || f.status}</Badge>
                      </div>
                    </div>
                  ))}
                  {(summary?.upcoming ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      {summaryQuery.isLoading ? 'Loading filings…' : 'No filings are currently due.'}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {entityIds.length === 1 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Recent filing activity</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(historyQuery.data ?? []).slice(0, 10).map((r) => (
                      <div
                        key={r.filing_id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted/70"
                        onClick={() => navigate(objectRoute.returnFiling(r.filing_id, 'external'))}
                      >
                        <div>
                          <p className="font-medium text-sm">{r.filing_reference || r.definition_name || 'Return filing'}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.definition_name}{r.period_label ? ` — ${r.period_label}` : ''}
                          </p>
                        </div>
                        <Badge variant="secondary">{r.status_label || r.status}</Badge>
                      </div>
                    ))}
                    {(historyQuery.data ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {historyQuery.isLoading ? 'Loading activity…' : 'No filings recorded yet.'}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

/**
 * Legacy workflow-status badge, retained for the HISTORY_ONLY legacy register
 * screens (`/entity/returns/legacy`) that still display pre-canonical codes.
 */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: any }> = {
    TEMP: { label: 'Draft', variant: 'secondary' },
    WIP: { label: 'In Progress', variant: 'outline' },
    SUB: { label: 'Awaiting Review', variant: 'default' },
    VAL: { label: 'Validated', variant: 'default' },
    TBR: { label: 'Resubmission Requested', variant: 'destructive' },
    REJ: { label: 'Rejected', variant: 'destructive' },
  };
  const m = map[status] || { label: status, variant: 'secondary' };
  return <Badge variant={m.variant} className={status === 'VAL' ? 'bg-green-600 text-white' : status === 'SUB' ? 'bg-amber-500 text-white' : status === 'WIP' ? 'bg-blue-500 text-white' : ''}>{m.label}</Badge>;
}
