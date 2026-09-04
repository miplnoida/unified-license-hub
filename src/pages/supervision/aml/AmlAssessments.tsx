import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RegisterToolbar } from '@/components/shared/RegisterToolbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAmlAssessments } from '@/hooks/useAmlSupervision';
import { AmlNewAssessmentDialog } from '@/components/supervision/aml/AmlNewAssessmentDialog';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { EMERALD, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

export default function AmlAssessments() {
  const { data, isLoading, error, refetch, isFetching } = useAmlAssessments();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');

  const rows = (data ?? []) as any[];
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status).filter(Boolean))), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (status !== 'all' && r.status !== status) return false;
        if (q) {
          const hay = `${r.entity_name ?? ''} ${r.reference ?? ''} ${r.assessment_type ?? ''}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, status, q],
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="AML/CFT Risk Assessments"
          actions={
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="Refresh assessments"
                title="Refresh assessments"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
              <AmlNewAssessmentDialog size="sm" />
            </>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load assessments</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardContent className="space-y-3 pt-4">
            <RegisterToolbar
              search={q}
              onSearchChange={setQ}
              searchPlaceholder="Search entity, reference or type…"
              trailing={
                <span className="text-sm text-muted-foreground">
                  {isLoading ? 'Loading…' : `${filtered.length} assessment${filtered.length === 1 ? '' : 's'}`}
                </span>
              }
            >
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s as string} value={s as string}>
                      {titleCase(s as string)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </RegisterToolbar>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT assessments match the current filters.
              </p>
            ) : (
              <SupervisoryRegister
                rows={filtered}
                getRowId={(r) => r.id}
                caption="AML/CFT risk assessments"
                identifier={(r) => ({
                  reference: r.reference || '—',
                  copyValue: r.id,
                  copyLabel: 'Copy assessment id',
                  subject: (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate">{r.entity_name || '—'}</span>
                      {r.is_current ? (
                        <Badge variant="outline" className={EMERALD}>
                          Current
                        </Badge>
                      ) : null}
                    </span>
                  ),
                })}
                columns={[
                  {
                    id: 'type',
                    header: 'Type / trigger',
                    cell: (r) => (
                      <>
                        <div>{titleCase(r.assessment_type)}</div>
                        <div className="text-muted-foreground">{titleCase(r.trigger_type)}</div>
                      </>
                    ),
                  },
                  {
                    id: 'ratings',
                    header: 'Ratings',
                    cell: (r) => (
                      <>
                        <Badge variant="outline" className={ratingTone(r.residual_rating)}>
                          {titleCase(r.residual_rating)}
                        </Badge>
                        <div className="mt-1 text-muted-foreground">
                          I: {titleCase(r.inherent_rating)} · C: {titleCase(r.control_rating)}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    cell: (r) => (
                      <>
                        <Badge variant="outline" className={statusTone(r.status)}>
                          {titleCase(r.status)}
                        </Badge>
                        {r.approved_at ? (
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                            Approved {fmtDate(r.approved_at)}
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    id: 'period',
                    header: 'Period / methodology',
                    priority: 3,
                    cell: (r) => (
                      <>
                        <div className="font-mono">
                          {fmtDate(r.period_start)} → {fmtDate(r.period_end)}
                        </div>
                        <div className="font-mono text-muted-foreground">
                          {r.methodology_version ? `v${r.methodology_version}` : '—'}
                        </div>
                      </>
                    ),
                  },
                ]}
                actions={(r) => (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/supervision/aml/assessments/${r.id}`}>
                      Open
                      <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
