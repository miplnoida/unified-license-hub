import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowUpRight, ShieldCheck, Gauge, FileSearch, ListChecks, RefreshCw } from 'lucide-react';
import { useAmlOverview, useAmlWorkQueue } from '@/hooks/useAmlSupervision';
import { AMBER, EMERALD, RED, WORK_QUEUE_KIND_LABEL, fmtDate, statusTone, titleCase } from '@/lib/amlLabels';

type Metric = { label: string; value: number | string; hint: string; tone?: string; to?: string };

export default function AmlOverview() {
  const { data, isLoading, error, refetch, isFetching } = useAmlOverview();
  const queue = useAmlWorkQueue(8);
  const m = data ?? {};

  const coverage: Metric[] = [
    {
      label: 'Entities supervised',
      value: m.entities_supervised ?? 0,
      hint: 'Active regulated entities in the AML/CFT supervised population.',
      to: '/supervision/aml/entities',
    },
    {
      label: 'Current assessment',
      value: m.entities_with_current_assessment ?? 0,
      hint: 'Entities with an approved, current AML/CFT risk assessment.',
    },
    {
      label: 'Coverage',
      value: `${m.assessment_coverage_pct ?? 0}%`,
      hint: 'Share of the supervised population carrying a current approved assessment.',
      tone: Number(m.assessment_coverage_pct ?? 0) >= 80 ? EMERALD : AMBER,
    },
    {
      label: 'High-risk entities',
      value: m.high_risk_entities ?? 0,
      hint: 'Entities whose current residual AML/CFT rating is High or Severe.',
      tone: Number(m.high_risk_entities ?? 0) > 0 ? RED : undefined,
      to: '/supervision/aml/heatmap',
    },
  ];

  const pipeline: Metric[] = [
    { label: 'Assessments due (60 days)', value: m.assessments_due ?? 0, hint: 'Next review date falls inside the next 60 days.' },
    {
      label: 'Assessments overdue',
      value: m.assessments_overdue ?? 0,
      hint: 'Next review date has passed without an approved reassessment.',
      tone: Number(m.assessments_overdue ?? 0) > 0 ? RED : undefined,
    },
    { label: 'Awaiting review / approval', value: m.assessments_awaiting_review ?? 0, hint: 'Submitted or reviewed assessments awaiting a checker decision.', to: '/supervision/aml/assessments' },
    { label: 'Reassessments required', value: m.reassessments_required ?? 0, hint: 'Open reassessment requirements raised by findings, examinations or risk movement.' },
  ];

  const loop: Metric[] = [
    { label: 'Active examinations', value: m.active_examinations ?? 0, hint: 'AML/CFT examinations not yet closed.', to: '/supervision/aml/examinations' },
    { label: 'Awaiting report', value: m.examinations_awaiting_report ?? 0, hint: 'Examinations in reporting or draft-report stage.' },
    { label: 'Open findings', value: m.open_findings ?? 0, hint: 'AML/CFT findings not closed, withdrawn or superseded.', to: '/supervision/aml/findings' },
    {
      label: 'Overdue remediation',
      value: m.overdue_remediation ?? 0,
      hint: 'Remediation actions past target date and not yet effective or closed.',
      tone: Number(m.overdue_remediation ?? 0) > 0 ? RED : undefined,
    },
  ];

  const section = (title: string, icon: React.ReactNode, metrics: Metric[]) => (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((k) => (
          <div key={k.label} className="rounded-lg border p-3" title={k.hint}>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
            <div className="mt-1.5 flex items-center gap-2">
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <span className="font-mono text-2xl font-semibold">{k.value}</span>
              )}
              {k.tone && !isLoading ? <Badge variant="outline" className={k.tone}>attention</Badge> : null}
              {k.to ? (
                <Button asChild variant="ghost" size="icon" className="ml-auto h-7 w-7" aria-label={`Open ${k.label}`} title={`Open ${k.label}`}>
                  <Link to={k.to}>
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <PageHeader
          title="AML/CFT Supervision"
          actions={
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => refetch()}
                disabled={isFetching}
                aria-label="Refresh metrics"
                title="Refresh metrics"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/supervision/aml/work-queue">
                  <ListChecks className="mr-1.5 h-4 w-4" />
                  Work queue
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/supervision/aml/assessments">
                  <ArrowUpRight className="mr-1.5 h-4 w-4" />
                  Assessments
                </Link>
              </Button>
            </>
          }
        />

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load AML/CFT metrics</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        {section('Population & risk coverage', <ShieldCheck className="h-4 w-4 text-primary" />, coverage)}
        {section('Assessment pipeline', <Gauge className="h-4 w-4 text-primary" />, pipeline)}
        {section('Examinations, findings & remediation', <FileSearch className="h-4 w-4 text-primary" />, loop)}

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListChecks className="h-4 w-4 text-primary" />
              Assigned to me
            </CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link to="/supervision/aml/work-queue">
                <ArrowUpRight className="mr-1.5 h-4 w-4" />
                View all
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {queue.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (queue.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing is currently awaiting your action in AML/CFT supervision.
              </p>
            ) : (
              (queue.data ?? []).map((row) => (
                <Link
                  key={`${row.kind}-${row.id}`}
                  to={row.href || '/supervision/aml/work-queue'}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{row.title || '—'}</div>
                    <div className="text-xs text-muted-foreground">
                      {WORK_QUEUE_KIND_LABEL[row.kind] ?? titleCase(row.kind)}
                      {(row as any).entity_name ? ` · ${(row as any).entity_name}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.status ? (
                      <Badge variant="outline" className={statusTone(row.status)}>
                        {titleCase(row.status)}
                      </Badge>
                    ) : null}
                    <span className="font-mono text-xs text-muted-foreground">{fmtDate(row.due_at)}</span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
