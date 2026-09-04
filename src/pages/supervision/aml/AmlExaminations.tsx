import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import { useAmlExaminations } from '@/hooks/useAmlSupervision';
import { businessActionLabel, isTerminalStage } from '@/lib/examinationWorkflow';
import { AMBER, EMERALD, RED, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

const STAGE_ORDER = [
  'planned',
  'scoping',
  'pre_exam_request',
  'fieldwork',
  'exit_meeting',
  'draft_report',
  'management_response',
  'final_report',
  'remediation',
  'closed',
  'cancelled',
];

/** Next supervisory action for the register — derived from the canonical stage engine. */
function nextAction(stage?: string | null): string {
  if (isTerminalStage(stage)) return '—';
  const idx = STAGE_ORDER.indexOf(String(stage ?? ''));
  const next = idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : null;
  return next ? businessActionLabel(next) : '—';
}

export default function AmlExaminations() {
  const { data, isLoading, error } = useAmlExaminations();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const focus = params.get('focus');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('all');
  const [openOnly, setOpenOnly] = useState(false);

  const rows = (data ?? []) as any[];
  const stages = useMemo(() => Array.from(new Set(rows.map((r) => r.stage).filter(Boolean))), [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (stage !== 'all' && r.stage !== stage) return false;
        if (openOnly && r.closed_at) return false;
        if (q) {
          const hay = `${r.entity_name ?? ''} ${r.reference ?? ''} ${r.title ?? ''} ${
            r.driving_assessment_reference ?? ''
          } ${r.plan_reference ?? ''} ${r.intervention_reference ?? ''}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, stage, openOnly, q],
  );

  const open = (id: string) => navigate(`/supervision/examinations/${id}`);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AML/CFT Examinations</h1>
          <p className="text-sm text-muted-foreground">
            AML/CFT-filtered entry point into the canonical examination model — exact provenance
            (originating assessment, plan, intervention), risk focus, team, and live examination work
            state. Open takes you into the enterprise examination workspace.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load examinations</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${filtered.length} examination${filtered.length === 1 ? '' : 's'}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search entity, reference, assessment, plan or intervention…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xs"
              />
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {stages.map((s) => (
                    <SelectItem key={s as string} value={s as string}>
                      {titleCase(s as string)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant={openOnly ? 'default' : 'outline'} onClick={() => setOpenOnly((v) => !v)}>
                Open only
              </Button>
            </div>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT examinations match the current filters.
              </p>
            ) : (
              <SupervisoryRegister
                rows={filtered}
                getRowId={(r) => r.id}
                caption="AML/CFT examinations"
                onRowClick={(r) => open(r.id)}
                isRowFocused={(r) => focus === r.id}
                identifier={(r) => ({
                  reference: r.reference || '—',
                  copyValue: r.id,
                  copyLabel: 'Copy examination id',
                  subject: (
                    <>
                      <span className="block truncate">{r.entity_name || '—'}</span>
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {r.title}
                      </span>
                    </>
                  ),
                })}
                columns={[
                  {
                    id: 'type_risk',
                    header: 'Type / risk',
                    cell: (r) => (
                      <>
                        <div>{titleCase(r.engagement_type)}</div>
                        <div className="text-muted-foreground">{titleCase(r.examination_type)}</div>
                        <Badge variant="outline" className={`mt-1 ${ratingTone(r.risk_rating)}`}>
                          {titleCase(r.risk_rating)}
                        </Badge>
                        <div className="mt-1 max-w-[12rem] text-muted-foreground">
                          {(r.scope_dimensions ?? []).length
                            ? (r.scope_dimensions ?? [])
                                .map((d: any) => titleCase(d.dimension_code))
                                .slice(0, 3)
                                .join(', ')
                            : 'Scope not yet set'}
                          {(r.scope_dimensions ?? []).length > 3
                            ? ` +${(r.scope_dimensions ?? []).length - 3}`
                            : ''}
                        </div>
                      </>
                    ),
                  },
                  {
                    id: 'stage',
                    header: 'Stage / dates',
                    cell: (r) => (
                      <>
                        <Badge variant="outline" className={statusTone(r.stage)}>
                          {titleCase(r.stage)}
                        </Badge>
                        {r.reassessment_required ? (
                          <Badge variant="outline" className={`mt-1 block w-fit ${RED}`}>
                            Reassessment required
                          </Badge>
                        ) : null}
                        <div className="mt-1 font-mono">
                          {fmtDate(r.fieldwork_start)} → {fmtDate(r.fieldwork_end)}
                        </div>
                        <div className="text-muted-foreground">
                          {r.closed_at ? `Closed ${fmtDate(r.closed_at)}` : 'In progress'}
                        </div>
                        <div className="mt-1">Next: {nextAction(r.stage)}</div>
                      </>
                    ),
                  },
                  {
                    id: 'workload',
                    header: 'Workload',
                    priority: 2,
                    cell: (r) => (
                      <>
                        <div>
                          RFIs{' '}
                          <span className={r.overdue_rfis ? RED : undefined}>{r.open_rfis ?? 0} open</span>
                          {r.overdue_rfis ? (
                            <span className="text-muted-foreground"> · {r.overdue_rfis} overdue</span>
                          ) : null}
                        </div>
                        <div>
                          Workpapers{' '}
                          <span className={r.workpapers_outstanding ? AMBER : EMERALD}>
                            {r.workpapers_outstanding ?? 0}
                          </span>
                          <span className="text-muted-foreground"> of {r.workpapers_total ?? 0}</span>
                        </div>
                        <div>
                          Findings {r.findings_open ?? 0} open
                          <span className="text-muted-foreground"> of {r.findings_total ?? 0}</span>
                        </div>
                      </>
                    ),
                  },
                  {
                    id: 'provenance',
                    header: 'Provenance / team',
                    priority: 3,
                    cell: (r) => (
                      <>
                        {r.driving_assessment_reference ? (
                          <div className="font-mono">{r.driving_assessment_reference}</div>
                        ) : (
                          <div className="text-muted-foreground">No driving assessment</div>
                        )}
                        <div className="text-muted-foreground">
                          {r.plan_reference ? `Plan ${r.plan_reference}` : 'No plan'}
                          {r.intervention_reference ? ` · ${r.intervention_reference}` : ''}
                        </div>
                        {r.intervention_type ? (
                          <div className="text-muted-foreground">{titleCase(r.intervention_type)}</div>
                        ) : null}
                        <div className="mt-1">{r.lead_examiner_name || 'Unassigned'}</div>
                        <div className="text-muted-foreground">
                          {r.team_size ? `${r.team_size} on team` : 'No team'}
                        </div>
                      </>
                    ),
                  },
                ]}
                actions={(r) => (
                  <Button size="sm" variant="outline" onClick={() => open(r.id)}>
                    Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              />
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Examination scoping, team assignment, data requests, workpapers, reports, stage transitions and
          closure are performed inside the canonical examination workspace. Findings issued from an
          examination appear in{' '}
          <Link className="underline" to="/supervision/aml/findings">
            Findings &amp; Remediation
          </Link>
          .
        </p>
      </div>
    </DashboardLayout>
  );
}
