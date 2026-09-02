import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useAmlFindings } from '@/hooks/useAmlSupervision';
import { AMBER, EMERALD, NEUTRAL, RED, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

export default function AmlFindings() {
  const { data, isLoading, error } = useAmlFindings();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState('all');
  const [view, setView] = useState('all');

  const rows = (data ?? []) as any[];
  const severities = useMemo(() => Array.from(new Set(rows.map((r) => r.severity).filter(Boolean))), [rows]);
  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (severity !== 'all' && r.severity !== severity) return false;
        if (view === 'open' && ['CLOSED', 'WITHDRAWN', 'SUPERSEDED'].includes((r.status ?? '').toUpperCase())) return false;
        if (view === 'response_due' && !(r.response_target_date && r.response_target_date < today && !r.response_at)) return false;
        if (view === 'remediation_overdue') {
          const overdue = (r.remediation ?? []).some(
            (a: any) => a.target_date && a.target_date < today && !['EFFECTIVE', 'CLOSED'].includes((a.status ?? '').toUpperCase()),
          );
          if (!overdue) return false;
        }
        if (view === 'escalated' && !(r.remediation ?? []).some((a: any) => a.escalated_attention_id)) return false;
        if (q) {
          const hay = `${r.entity_name ?? ''} ${r.reference ?? ''} ${r.title ?? ''}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, severity, view, q, today],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AML/CFT Findings &amp; Remediation</h1>
          <p className="text-sm text-muted-foreground">
            The closed supervisory loop: findings issued, management response, remediation actions,
            effectiveness validation and escalation back into supervisory attention.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load findings</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${filtered.length} finding${filtered.length === 1 ? '' : 's'}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search entity, reference or title…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xs"
              />
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  {severities.map((s) => (
                    <SelectItem key={s as string} value={s as string}>
                      {titleCase(s as string)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={view} onValueChange={setView}>
                <SelectTrigger className="w-60">
                  <SelectValue placeholder="Loop stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All findings</SelectItem>
                  <SelectItem value="open">Open findings</SelectItem>
                  <SelectItem value="response_due">Management response overdue</SelectItem>
                  <SelectItem value="remediation_overdue">Remediation overdue</SelectItem>
                  <SelectItem value="escalated">Escalated to attention</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No AML/CFT findings match the current filters.
              </p>
            ) : (
              <div className="space-y-3">
                {filtered.map((f) => {
                  const responseOverdue = f.response_target_date && f.response_target_date < today && !f.response_at;
                  return (
                    <div
                      key={f.id}
                      className={`rounded-lg border p-4 ${focus === f.id ? 'ring-2 ring-primary' : ''}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{f.title}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {f.reference} · {f.entity_name || '—'} · {titleCase(f.finding_category)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={ratingTone(f.severity)}>
                            {titleCase(f.severity)}
                          </Badge>
                          <Badge variant="outline" className={statusTone(f.status)}>
                            {titleCase(f.status)}
                          </Badge>
                          {f.assessment_id ? (
                            <Button asChild size="sm" variant="outline">
                              <Link to={`/supervision/aml/assessments/${f.assessment_id}`}>Assessment</Link>
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4">
                        <div>
                          <div className="uppercase tracking-wide text-muted-foreground">Issued</div>
                          <div className="font-mono">{fmtDate(f.issued_at)}</div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wide text-muted-foreground">Response state</div>
                          <Badge variant="outline" className={responseOverdue ? RED : statusTone(f.response_state)}>
                            {responseOverdue ? 'Response overdue' : titleCase(f.response_state)}
                          </Badge>
                        </div>
                        <div>
                          <div className="uppercase tracking-wide text-muted-foreground">Finding due</div>
                          <div className={`font-mono ${f.due_date && f.due_date < today && !f.closed_at ? 'text-destructive' : ''}`}>
                            {fmtDate(f.due_date)}
                          </div>
                        </div>
                        <div>
                          <div className="uppercase tracking-wide text-muted-foreground">Validation</div>
                          <div>{titleCase(f.validation_conclusion)}</div>
                        </div>
                      </div>

                      <div className="mt-3 border-t pt-3">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Remediation actions ({(f.remediation ?? []).length})
                        </div>
                        {(f.remediation ?? []).length === 0 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            No remediation action has been recorded against this finding.
                          </p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {(f.remediation ?? []).map((a: any) => {
                              const overdue =
                                a.target_date && a.target_date < today && !['EFFECTIVE', 'CLOSED'].includes((a.status ?? '').toUpperCase());
                              return (
                                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 p-2 text-xs">
                                  <span className="min-w-0 flex-1 truncate">{a.description || a.reference}</span>
                                  <span className="flex flex-wrap items-center gap-2">
                                    <Badge variant="outline" className={overdue ? RED : statusTone(a.status)}>
                                      {overdue ? 'Overdue' : titleCase(a.status)}
                                    </Badge>
                                    {a.effectiveness ? (
                                      <Badge variant="outline" className={a.effectiveness === 'EFFECTIVE' ? EMERALD : AMBER}>
                                        {titleCase(a.effectiveness)}
                                      </Badge>
                                    ) : null}
                                    {a.escalated_attention_id ? (
                                      <Badge variant="outline" className={RED}>
                                        Escalated
                                      </Badge>
                                    ) : null}
                                    <span className="font-mono text-muted-foreground">{fmtDate(a.target_date)}</span>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          <Badge variant="outline" className={NEUTRAL}>Domain: AML/CFT</Badge> Findings and remediation are
          filtered views of the canonical supervisory finding and remediation models — no AML-private store.
        </p>
      </div>
    </DashboardLayout>
  );
}
