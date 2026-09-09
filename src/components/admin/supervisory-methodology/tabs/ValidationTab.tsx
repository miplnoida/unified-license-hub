/**
 * Structural validation.
 *
 * Findings come from `supervisory_methodology_validate`, and the same service is
 * executed inside the lifecycle operation: an error here genuinely refuses
 * DRAFT → REVIEW and REVIEW → APPROVED on the server. Warnings and information
 * do not — a materiality value that a regulator has not yet approved, for
 * example, is a policy-profile readiness matter and not a structural defect of
 * the methodology.
 */
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupervisoryMethodologyValidation } from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, formatDateTime, humanize } from '../labels';

type Level = 'ERROR' | 'WARNING' | 'INFO';

/** BLOCKING is what the server refuses on; everything else is guidance. */
function level(severity: string): Level {
  const s = (severity ?? '').toUpperCase();
  if (s === 'BLOCKING' || s === 'ERROR') return 'ERROR';
  if (s === 'INFO' || s === 'INFORMATION') return 'INFO';
  return 'WARNING';
}

/** Where the administrator fixes it, and what to do. */
const GUIDANCE: Record<string, { tab: string; remediation: string }> = {
  DIMENSION_WEIGHT_SUM: { tab: 'questions', remediation: 'Adjust dimension weights so the weighting structure is complete.' },
  DIMENSION_WITHOUT_QUESTION: { tab: 'questions', remediation: 'Add at least one active question to the dimension, or retire the dimension.' },
  DIMENSION_KIND_INVALID: { tab: 'questions', remediation: 'Set a governed dimension kind on the dimension.' },
  DUPLICATE_DIMENSION_CODE: { tab: 'questions', remediation: 'Give each dimension a unique code within this version.' },
  DUPLICATE_QUESTION_CODE: { tab: 'questions', remediation: 'Give each question a unique code within this version.' },
  QUESTION_WITHOUT_DIMENSION: { tab: 'questions', remediation: 'Assign the question to an active dimension of this version.' },
  QUESTION_WITHOUT_SEMANTICS: { tab: 'semantics', remediation: 'Point the question at a response-semantic profile defined on this version.' },
  SEMANTIC_PROFILE_INVALID: { tab: 'semantics', remediation: 'Correct the response-meaning definition so every option carries a meaning.' },
  SEMANTIC_REFERENCE_INVALID: { tab: 'semantics', remediation: 'Reference a semantic profile that exists on this version.' },
  SCORED_QUESTION_WITHOUT_AXIS: { tab: 'questions', remediation: 'Set the assessment axis on every scored question.' },
  CONDITIONAL_WITHOUT_TRIGGER: { tab: 'questions', remediation: 'Record the trigger condition or applicability metadata for the conditional question.' },
  NA_WITHOUT_CONDITIONS: { tab: 'questions', remediation: 'Describe when "not applicable" may be used, or stop allowing it.' },
  NA_CONFIGURATION_INCONSISTENT: { tab: 'questions', remediation: 'Make the "not applicable" rules consistent with the rationale requirement.' },
  EVIDENCE_BASIS_INVALID: { tab: 'questions', remediation: 'Use a governed evidence-basis category on the question.' },
  EVIDENCE_WITHOUT_MINIMUM: { tab: 'questions', remediation: 'Set the minimum number of evidence items expected.' },
  QUESTION_WITHOUT_CLASS: { tab: 'questions', remediation: 'Classify the question as core, conditional or enhanced.' },
  FACT_LINK_INVALID: { tab: 'facts', remediation: 'Remove the link and relink the fact within this version.' },
  CROSS_METHODOLOGY_REFERENCE: { tab: 'facts', remediation: 'Remove references that point outside this methodology version.' },
  REQUIRED_FACT_UNLINKED: { tab: 'facts', remediation: 'Link the required fact to the question that consumes it.' },
  FACT_DEFINITION_INCOMPLETE: { tab: 'facts', remediation: 'Complete the fact attribute definition — measurement basis, unit and source expectation.' },
  DUPLICATE_FACT_CODE: { tab: 'facts', remediation: 'Give each fact requirement a unique code within this version.' },
  PARAMETER_REFERENCE_INVALID: { tab: 'parameters', remediation: 'Reference a materiality parameter defined on this version.' },
  DUPLICATE_PARAMETER_CODE: { tab: 'parameters', remediation: 'Give each parameter a unique code within this version.' },
  PARAMETER_UNAPPROVED: { tab: 'parameters', remediation: 'No action here: an approved value is a regulator policy decision taken in the calculation and materiality policy layer.' },
};

const TAB_LABEL: Record<string, string> = {
  questions: 'Dimensions & Questions',
  semantics: 'Response Semantics',
  facts: 'Evidence & Facts',
  parameters: 'Parameters',
};

export function ValidationTab({ methodologyId }: { methodologyId: string }) {
  const { data, isLoading, isFetching, error, refetch } = useSupervisoryMethodologyValidation(methodologyId);
  const [, setParams] = useSearchParams();

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} title="Validation could not be run" />;
  if (!data) return <EmptyPanel title="No validation result is available for this version." />;

  const groups: Record<Level, typeof data.findings> = { ERROR: [], WARNING: [], INFO: [] };
  data.findings.forEach((f) => groups[level(f.severity)].push(f));

  const goTo = (tab: string) => setParams((prev) => {
    const next = new URLSearchParams(prev);
    next.set('tab', tab);
    return next;
  }, { replace: true });

  const section = (lvl: Level, title: string, description: string) => {
    const rows = groups[lvl];
    if (!rows.length) return null;
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{title} <span className="font-mono text-xs text-muted-foreground">({rows.length})</span></p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {rows.map((f) => {
          const g = GUIDANCE[f.code];
          return (
            <div key={`${f.code}-${f.subject ?? ''}`} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {lvl === 'ERROR'
                      ? <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                      : lvl === 'WARNING'
                        ? <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
                        : <Info className="h-4 w-4 text-muted-foreground" aria-hidden />}
                    <span className="font-mono text-xs">{f.code}</span>
                    <span className="font-normal">{humanize(f.code)}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{f.message}</p>
                  {g ? <p className="mt-1 text-sm text-foreground">{g.remediation}</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge variant="outline">{humanize(f.object)}</Badge>
                  {f.subject ? <Badge variant="secondary" className="font-mono text-[11px]">{f.subject}</Badge> : null}
                  <span className="font-mono text-xs text-muted-foreground">{f.count}</span>
                  {g ? (
                    <Button size="sm" variant="ghost" onClick={() => goTo(g.tab)}>
                      Open {TAB_LABEL[g.tab] ?? humanize(g.tab)}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base">Structural validation</CardTitle>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
              Re-run
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            An error refuses submission for review and approval on the server. Warnings and information do not block the
            lifecycle. Checked {formatDateTime(data.generated_at)}.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={groups.ERROR.length ? 'destructive' : 'secondary'}>{groups.ERROR.length} errors</Badge>
          <Badge variant="outline">{groups.WARNING.length} warnings</Badge>
          <Badge variant="outline">{groups.INFO.length} information</Badge>
          <Badge variant="outline">Status {humanize(data.status)}</Badge>
        </CardContent>
      </Card>

      {data.findings.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-2 pt-6 text-sm">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            No structural issue was found in this version.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {section('ERROR', 'Errors', 'These must be resolved before this version can be submitted for review or approved.')}
          {section('WARNING', 'Warnings', 'Content quality matters worth resolving. They do not refuse a lifecycle transition.')}
          {section('INFO', 'Information', 'Recorded for awareness only.')}
        </div>
      )}
    </div>
  );
}
