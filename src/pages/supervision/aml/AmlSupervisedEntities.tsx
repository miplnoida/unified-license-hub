import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SupervisoryRegister } from '@/components/supervision/SupervisoryRegister';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { useAmlPortfolio } from '@/hooks/useAmlSupervision';
import { AmlNewAssessmentDialog } from '@/components/supervision/aml/AmlNewAssessmentDialog';
import { AMBER, EMERALD, NEUTRAL, RED, fmtDate, ratingTone, statusTone, titleCase, trendTone } from '@/lib/amlLabels';

export default function AmlSupervisedEntities() {
  const { data, isLoading, error } = useAmlPortfolio(300);
  const [q, setQ] = useState('');
  const [rating, setRating] = useState('all');
  const [coverage, setCoverage] = useState('all');

  const rows = data ?? [];
  const ratings = useMemo(
    () => Array.from(new Set(rows.map((r) => r.residual_rating).filter(Boolean))) as string[],
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (rating !== 'all' && r.residual_rating !== rating) return false;
        if (coverage === 'current' && !r.assessment_current) return false;
        if (coverage === 'missing' && r.assessment_current) return false;
        if (coverage === 'reassessment' && !r.reassessment_required) return false;
        if (q) {
          const hay = `${r.entity_name ?? ''} ${r.sector_name ?? ''} ${r.licence_reference ?? ''}`.toLowerCase();
          if (!hay.includes(q.toLowerCase())) return false;
        }
        return true;
      }),
    [rows, rating, coverage, q],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">AML/CFT Supervised Entities</h1>
            <p className="text-sm text-muted-foreground">
              Risk-based portfolio view: current residual rating with its inherent and control drivers,
              rating movement, review currency and open closed-loop workload per entity.
            </p>
          </div>
          <AmlNewAssessmentDialog />
        </div>


        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unable to load the supervised portfolio</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {isLoading ? 'Loading…' : `${filtered.length} entit${filtered.length === 1 ? 'y' : 'ies'}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search entity, sector or licence…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-xs"
              />
              <Select value={rating} onValueChange={setRating}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Residual rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ratings</SelectItem>
                  {ratings.map((r) => (
                    <SelectItem key={r} value={r}>
                      {titleCase(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={coverage} onValueChange={setCoverage}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="Assessment coverage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All coverage states</SelectItem>
                  <SelectItem value="current">Current assessment</SelectItem>
                  <SelectItem value="missing">No current assessment</SelectItem>
                  <SelectItem value="reassessment">Reassessment required</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No supervised entities match the current filters.
              </p>
            ) : (
              <SupervisoryRegister
                rows={filtered}
                getRowId={(r) => r.entity_id}
                caption="AML/CFT supervised entities"
                identifierHeader="Licence / entity"
                identifier={(r) => ({
                  reference: r.licence_reference || '—',
                  copyValue: r.entity_id,
                  copyLabel: 'Copy entity id',
                  subject: <span className="truncate">{r.entity_name || '—'}</span>,
                })}
                columns={[
                  {
                    id: 'risk',
                    header: 'Risk',
                    cell: (r) => (
                      <>
                        <Badge variant="outline" className={ratingTone(r.residual_rating)}>
                          {titleCase(r.residual_rating)}
                        </Badge>
                        <div className="mt-1 text-muted-foreground">
                          I: {titleCase(r.inherent_rating)} · C: {titleCase(r.control_rating)}
                        </div>
                        <Badge variant="outline" className={`mt-1 ${trendTone(r.trend)}`}>
                          {titleCase(r.trend || 'STABLE')}
                          {r.prior_rating ? ` · from ${titleCase(r.prior_rating)}` : ''}
                        </Badge>
                      </>
                    ),
                  },
                  {
                    id: 'coverage',
                    header: 'Assessment coverage',
                    cell: (r) => (
                      <>
                        <Badge variant="outline" className={r.assessment_current ? EMERALD : AMBER}>
                          {r.assessment_current ? 'Current' : 'Not current'}
                        </Badge>
                        {r.last_assessment_reference ? (
                          <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {r.last_assessment_reference}
                            {r.methodology_version ? ` · v${r.methodology_version}` : ''}
                          </div>
                        ) : null}
                        {r.reassessment_required ? (
                          <Badge variant="outline" className={`mt-1 ${RED}`}>
                            Reassessment required
                          </Badge>
                        ) : null}
                      </>
                    ),
                  },
                  {
                    id: 'review',
                    header: 'Review dates',
                    priority: 3,
                    cell: (r) => (
                      <>
                        <div className="font-mono">Last {fmtDate(r.last_review_date)}</div>
                        <div className="font-mono text-muted-foreground">Next {fmtDate(r.next_review_date)}</div>
                      </>
                    ),
                  },
                  {
                    id: 'work',
                    header: 'Open work',
                    priority: 2,
                    cell: (r) => (
                      <>
                        <div>{r.open_findings ?? 0} findings</div>
                        <div
                          className={
                            Number(r.overdue_remediation ?? 0) > 0
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                          }
                        >
                          {r.overdue_remediation ?? 0} overdue remediation
                        </div>
                        <div className="text-muted-foreground">{r.active_examinations ?? 0} examinations</div>
                      </>
                    ),
                  },
                  {
                    id: 'sector',
                    header: 'Sector',
                    priority: 2,
                    cell: (r) => <span className="text-sm">{r.sector_name || '—'}</span>,
                  },
                ]}
                actions={(r) => (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {r.last_assessment_id ? (
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/supervision/aml/assessments/${r.last_assessment_id}`}>Assessment</Link>
                      </Button>
                    ) : (
                      <Badge variant="outline" className={NEUTRAL}>
                        No assessment
                      </Badge>
                    )}
                    <AmlNewAssessmentDialog
                      entityId={r.entity_id}
                      label={r.last_assessment_id ? 'New assessment' : 'Start assessment'}
                      size="sm"
                      variant="outline"
                    />
                  </div>
                )}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
