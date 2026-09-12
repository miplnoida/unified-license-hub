import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { SortableHeader, sortRows, type ListingSort } from '@/components/shared/listing';
import { ariaSortOf } from '@/components/shared/listing/sorting';
import { useAmlAssessment } from '@/hooks/useAmlSupervision';
import { useAssessmentCalculationView } from '@/hooks/useAmlCalculationPolicy';
import { AmlAssessmentGovernance } from '@/components/supervision/aml/AmlAssessmentGovernance';
import { AmlAssessmentCalculation } from '@/components/supervision/aml/AmlAssessmentCalculation';
import { AmlQuestionPlanPanel } from '@/components/supervision/aml/AmlQuestionPlanPanel';
import { AmlAssessmentReviewPanel } from '@/components/supervision/aml/AmlAssessmentReviewPanel';
import { AmlPolicyBasisPanel } from '@/components/supervision/aml/AmlPolicyBasisPanel';
import { AmlEvidencePolicyPanel } from '@/components/supervision/aml/AmlEvidencePolicyPanel';
import { AmlEntityRiskHistory } from '@/components/supervision/aml/AmlEntityRiskHistory';

import { AmlSupervisoryActivity } from '@/components/supervision/aml/AmlSupervisoryActivity';
import { AmlSupervisoryConsequencePanel } from '@/components/supervision/aml/AmlSupervisoryConsequencePanel';
import { AmlOutcomeEffectivenessPanel } from '@/components/supervision/aml/AmlOutcomeEffectivenessPanel';
import { AMBER, EMERALD, NEUTRAL, RED, fmtDate, ratingTone, statusTone, titleCase, trendTone } from '@/lib/amlLabels';



const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-sm">{value}</div>
  </div>
);

export default function AmlAssessmentWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch, isFetching } = useAmlAssessment(id);
  // Methodology dimension lists are small and bounded — sortable columns, no pager.
  const [dimSort, setDimSort] = useState<ListingSort | null>({ key: 'dimension', direction: 'asc' });
  // Display-only: when the working file carries no manually recorded inherent or
  // control rating, show the bands from the server's own latest calculation run so
  // the header agrees with the approved residual rating. The server stays the sole
  // authority — nothing here computes or persists a rating.
  const calcView = useAssessmentCalculationView(id);
  const latestRun = calcView.data?.latest_run ?? null;
  const calculatedInherent = latestRun?.status === 'CALCULATED' ? latestRun.inherent_band : null;
  const calculatedControl = latestRun?.status === 'CALCULATED' ? latestRun.control_band : null;

  if (isLoading) {
    return (
      <DashboardLayout>
        <Skeleton className="h-96 w-full" />
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Assessment unavailable</AlertTitle>
          <AlertDescription>
            {error ? (error as Error).message : 'This AML/CFT assessment could not be found or is outside your supervisory scope.'}
          </AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  const h = data.header as any;
  const dims = data.dimensions as any[];
  const inherent = dims.filter((d) => /inherent/i.test(d.dimension_group ?? ''));
  const control = dims.filter((d) => /control/i.test(d.dimension_group ?? ''));
  const other = dims.filter((d) => !inherent.includes(d) && !control.includes(d));

  const calcOf = (d: any, kind: 'inherent' | 'control' | 'other') =>
    kind === 'control'
      ? d.calculated_control_rating
      : kind === 'inherent'
        ? d.calculated_inherent_rating
        : d.calculated_residual_rating;
  const judgedOf = (d: any, kind: 'inherent' | 'control' | 'other') =>
    kind === 'control' ? d.control_rating : kind === 'inherent' ? d.inherent_rating : d.residual_rating;

  const dimensionTable = (rows: any[], kind: 'inherent' | 'control' | 'other') => {
    const specs = [
      { key: 'dimension', accessor: (d: any) => d.dimension_code, dataType: 'text' as const },
      { key: 'weight', accessor: (d: any) => d.weight, dataType: 'number' as const },
      { key: 'calculated', accessor: (d: any) => calcOf(d, kind), dataType: 'risk' as const },
      { key: 'judged', accessor: (d: any) => judgedOf(d, kind), dataType: 'risk' as const },
      { key: 'trend', accessor: (d: any) => d.confidence, dataType: 'risk' as const },
      {
        key: 'evidence',
        accessor: (d: any) => (Array.isArray(d.evidence_refs) ? d.evidence_refs.length : d.evidence_refs ? 1 : 0),
        dataType: 'number' as const,
      },
    ];
    const sorted = sortRows(rows, dimSort, specs, (d: any) => String(d.dimension_code ?? d.id));
    const head = (label: string, key: string) => (
      <TableHead aria-sort={ariaSortOf(dimSort, key)}>
        <SortableHeader
          label={label}
          sortKey={key}
          sort={dimSort}
          onSort={(k) =>
            setDimSort(
              !dimSort || dimSort.key !== k
                ? { key: k, direction: 'asc' }
                : dimSort.direction === 'asc'
                  ? { key: k, direction: 'desc' }
                  : null,
            )
          }
        />
      </TableHead>
    );
    return (
      <Table>
        <TableHeader>
          <TableRow>
            {head('Dimension', 'dimension')}
            {head('Weight', 'weight')}
            {head('Calculated', 'calculated')}
            {head('Judged', 'judged')}
            <TableHead>Override rationale</TableHead>
            {head('Trend / confidence', 'trend')}
            {head('Evidence', 'evidence')}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                No {kind} dimensions recorded on this assessment.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((d) => {
              const calc = calcOf(d, kind);
              const judged = judgedOf(d, kind);
              const evidence = Array.isArray(d.evidence_refs) ? d.evidence_refs.length : d.evidence_refs ? 1 : 0;
              return (
                <TableRow key={d.id}>
                  <TableCell className="max-w-[16rem]">
                    <div className="text-sm font-medium">{titleCase(d.dimension_code)}</div>
                    <div className="text-xs text-muted-foreground">{titleCase(d.dimension_group)}</div>
                    {d.is_applicable === false ? (
                      <Badge variant="outline" className={`mt-1 ${NEUTRAL}`}>
                        Not applicable
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{d.weight ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ratingTone(calc)}>
                      {titleCase(calc)}
                    </Badge>
                    {d.calculated_score != null ? (
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">score {d.calculated_score}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ratingTone(judged)}>
                      {titleCase(judged)}
                    </Badge>
                    {d.is_overridden ? (
                      <Badge variant="outline" className={`ml-1 ${AMBER}`}>
                        Overridden
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[18rem] text-xs">
                    {d.is_overridden ? d.override_reason || <span className="text-destructive">Rationale missing</span> : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className={trendTone(d.trend)}>
                      {titleCase(d.trend || 'STABLE')}
                    </Badge>
                    <div className="mt-1 text-muted-foreground">
                      Confidence: {titleCase(d.confidence)} · Data: {titleCase(d.data_quality)}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">{evidence} reference{evidence === 1 ? '' : 's'}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={h.entity_name || 'AML/CFT assessment'}
          backHref="/supervision/aml/assessments"
          backLabel="Back to AML/CFT assessments"
          breadcrumbLabel={h.reference || null}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{h.reference}</span>
              <Badge variant="outline" className={statusTone(h.status)}>
                {titleCase(h.status)}
              </Badge>
              <Badge variant="outline" className={ratingTone(h.residual_rating)}>
                Residual: {titleCase(h.residual_rating)}
              </Badge>
              {h.is_current ? (
                <Badge variant="outline" className={EMERALD}>
                  Current
                </Badge>
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void refetch()}
                disabled={isFetching}
                aria-label="Refresh assessment"
                title="Refresh assessment"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          }
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assessment header</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field
              label="Methodology"
              value={
                data.methodology ? (
                  <>
                    {(data.methodology as any).name}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">
                      v{(data.methodology as any).version}
                    </span>
                  </>
                ) : (
                  h.methodology_version ? `Version ${h.methodology_version}` : '—'
                )
              }
            />
            <Field label="Assessment type" value={titleCase(h.assessment_type)} />
            <Field label="Trigger" value={titleCase(h.trigger_type)} />
            <Field label="Review period" value={`${fmtDate(h.period_start)} → ${fmtDate(h.period_end)}`} />
            <Field
              label="Inherent rating"
              value={
                <span className="inline-flex items-center gap-2">
                  <Badge variant="outline" className={ratingTone(h.inherent_rating ?? calculatedInherent)}>
                    {titleCase(h.inherent_rating ?? calculatedInherent)}
                  </Badge>
                  {!h.inherent_rating && calculatedInherent ? (
                    <span className="text-xs text-muted-foreground">calculated</span>
                  ) : null}
                </span>
              }
            />
            <Field
              label="Control effectiveness"
              value={
                <span className="inline-flex items-center gap-2">
                  <Badge variant="outline" className={ratingTone(h.control_rating ?? calculatedControl)}>
                    {titleCase(h.control_rating ?? calculatedControl)}
                  </Badge>
                  {!h.control_rating && calculatedControl ? (
                    <span className="text-xs text-muted-foreground">calculated</span>
                  ) : null}
                </span>
              }
            />
            <Field label="Next review" value={fmtDate(h.next_review_date)} />
            <Field label="Confidentiality" value={titleCase(h.confidentiality)} />
          </CardContent>
        </Card>

        <AmlAssessmentGovernance
          view="actions"
          assessmentId={h.id}
          entityId={h.entity_id}
          entityName={h.entity_name}
          status={h.status}
          methodologyId={h.methodology_id ?? (data.methodology as any)?.id ?? null}
          dimensions={dims}
          attention={data.attention as any[]}
          plans={data.plans as any[]}
          onChanged={() => void refetch()}
        />

        <Tabs defaultValue="worksheet">
          <TabsList className="flex-wrap">
            <TabsTrigger value="worksheet">Working file</TabsTrigger>
            <TabsTrigger value="scope">Question scope</TabsTrigger>
            <TabsTrigger value="policy-basis">Policy basis</TabsTrigger>
            <TabsTrigger value="inherent">Inherent risk ({inherent.length})</TabsTrigger>
            <TabsTrigger value="control">Control effectiveness ({control.length})</TabsTrigger>
            {other.length > 0 ? <TabsTrigger value="other">Other dimensions ({other.length})</TabsTrigger> : null}
            <TabsTrigger value="calculation">Calculation</TabsTrigger>
            <TabsTrigger value="review">Review &amp; decision</TabsTrigger>
            <TabsTrigger value="consequence">Supervisory consequence</TabsTrigger>
            <TabsTrigger value="provenance">Attention, plan & examination</TabsTrigger>
            <TabsTrigger value="findings">Findings ({(data.findings as any[]).length})</TabsTrigger>
            <TabsTrigger value="history">Approval history</TabsTrigger>
          </TabsList>

          <TabsContent value="scope" className="mt-4">
            <AmlQuestionPlanPanel assessmentId={h.id} status={h.status} />
          </TabsContent>

          <TabsContent value="policy-basis" className="mt-4 space-y-4">
            <AmlPolicyBasisPanel assessmentId={h.id} />
            <AmlPolicyTracePanel assessmentId={h.id} />
            <AmlEvidencePolicyPanel assessmentId={h.id} />

          </TabsContent>

          <TabsContent value="calculation" className="mt-4">
            <AmlAssessmentCalculation assessmentId={h.id} />
          </TabsContent>

          <TabsContent value="review" className="mt-4 space-y-4">
            <AmlAssessmentReviewPanel assessmentId={h.id} />
            <AmlEntityRiskHistory entityId={h.entity_id} />
          </TabsContent>

          <TabsContent value="consequence" className="mt-4 space-y-4">
            <AmlSupervisoryConsequencePanel entityId={h.entity_id} assessmentId={h.id} />
            <AmlOutcomeEffectivenessPanel entityId={h.entity_id} />
          </TabsContent>


          <TabsContent value="worksheet" className="mt-4">
            <AmlAssessmentGovernance
              view="worksheet"
              assessmentId={h.id}
              entityId={h.entity_id}
              entityName={h.entity_name}
              status={h.status}
              methodologyId={h.methodology_id ?? (data.methodology as any)?.id ?? null}
              dimensions={dims}
              attention={data.attention as any[]}
              plans={data.plans as any[]}
              onChanged={() => void refetch()}
            />
          </TabsContent>


          <TabsContent value="inherent" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Inherent risk dimensions</CardTitle>
              </CardHeader>
              <CardContent>{dimensionTable(inherent, 'inherent')}</CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="control" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Control-effectiveness dimensions</CardTitle>
              </CardHeader>
              <CardContent>{dimensionTable(control, 'control')}</CardContent>
            </Card>
          </TabsContent>

          {other.length > 0 ? (
            <TabsContent value="other" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Other dimensions</CardTitle>
                </CardHeader>
                <CardContent>{dimensionTable(other, 'other')}</CardContent>
              </Card>
            </TabsContent>
          ) : null}

          <TabsContent value="provenance" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Supervisory attention raised from this assessment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.attention as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No supervisory attention has been raised from this assessment.
                  </p>
                ) : (
                  (data.attention as any[]).map((a) => (
                    <div key={a.id} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{a.title}</span>
                        <span className="flex gap-2">
                          <Badge variant="outline" className={ratingTone(a.materiality)}>
                            Materiality: {titleCase(a.materiality)}
                          </Badge>
                          <Badge variant="outline" className={ratingTone(a.urgency)}>
                            Urgency: {titleCase(a.urgency)}
                          </Badge>
                          <Badge variant="outline" className={statusTone(a.status)}>
                            {titleCase(a.status)}
                          </Badge>
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {a.reference}
                        {a.confirmed_priority ? ` · priority ${titleCase(a.confirmed_priority)}` : ''}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <AmlSupervisoryActivity
              assessmentId={id as string}
              assessmentStatus={data.header.status}
              entityId={data.header.entity_id}
              entityName={data.header.entity_name}
              dimensions={data.dimensions as any[]}
              attention={data.attention as any[]}
              plans={data.plans as any[]}
              interventions={(data as any).interventions ?? []}
              examinations={data.examinations as any[]}
              onChanged={() => refetch()}
            />
          </TabsContent>

          <TabsContent value="findings" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Findings issued from this assessment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(data.findings as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No findings have been issued from this assessment.</p>
                ) : (
                  (data.findings as any[]).map((f) => (
                    <Link
                      key={f.id}
                      to={`/supervision/findings/${f.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm hover:bg-muted/50"
                    >
                      <span className="font-medium">{f.title}</span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className={ratingTone(f.severity)}>{titleCase(f.severity)}</Badge>
                        <Badge variant="outline" className={statusTone(f.status)}>{titleCase(f.status)}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">due {fmtDate(f.due_date)}</span>
                      </span>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Maker–checker approval history</CardTitle>
              </CardHeader>
              <CardContent>
                {(data.history as any[]).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lifecycle events recorded yet.</p>
                ) : (
                  <ol className="space-y-3">
                    {(data.history as any[]).map((ev) => (
                      <li key={ev.id} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{titleCase(ev.event_type)}</span>
                          <span className="font-mono text-xs text-muted-foreground">{fmtDate(ev.created_at)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {titleCase(ev.from_status)} → {titleCase(ev.to_status)}
                        </div>
                        {ev.rationale ? <p className="mt-1 text-sm">{ev.rationale}</p> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {h.status !== 'approved' ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Not yet approved</AlertTitle>
            <AlertDescription>
              Ratings shown are provisional until the assessment is approved by a checker other than its maker.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
