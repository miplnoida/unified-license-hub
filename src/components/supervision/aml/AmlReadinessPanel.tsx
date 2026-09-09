/**
 * Server-authoritative submission readiness.
 *
 * Everything shown here is read from the platform's own readiness contract —
 * the same calculation the platform runs when the assessment is submitted — so
 * the officer can never be told the file is ready while submission refuses it,
 * or the other way round.
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { useAssessmentReadiness, type ReadinessCheckRow } from '@/hooks/useAssessmentEvidenceBasis';
import { AMBER, EMERALD, NEUTRAL } from '@/lib/amlLabels';

const icon = (status: ReadinessCheckRow['status']) => {
  if (status === 'OK') return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />;
  if (status === 'BLOCKING') return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  if (status === 'ATTENTION') return <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />;
  return <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
};

const itemLabel = (item: Record<string, unknown>): string => {
  const code = item.question_code ?? item.fact_code ?? '';
  const dim = item.dimension_code ? `${item.dimension_code} ` : '';
  const reason = String(item.reason ?? '').replace(/_/g, ' ');
  return `${dim}${code}${reason ? ` — ${reason}` : ''}`.trim();
};

export function AmlReadinessPanel({ assessmentId }: { assessmentId: string }) {
  const { data, isLoading, error } = useAssessmentReadiness(assessmentId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Submission readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Submission readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Readiness could not be read for this assessment.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Submission readiness</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={data.can_submit ? EMERALD : AMBER}>
              {data.can_submit ? 'Ready to submit' : `${data.blocking_check_count} outstanding`}
            </Badge>
            <Badge variant="outline" className={`${NEUTRAL} text-[10px]`}>
              {data.plan_mode === 'GOVERNED_PLAN' ? 'Governed question plan' : 'All mandatory questions'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {data.checks.map((c) => (
            <li key={c.key} className="flex items-start gap-2 text-sm">
              {icon(c.status)}
              <div className="min-w-0">
                <p className="font-medium">
                  {c.label}
                  {c.blocking && c.count > 0 ? (
                    <span className="ml-2 text-xs font-normal text-destructive">{c.count} outstanding</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">{c.detail}</p>
                {c.items?.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {c.items.slice(0, 6).map((item, i) => (
                      <li key={i} className="font-mono text-[11px] text-muted-foreground">
                        {itemLabel(item)}
                      </li>
                    ))}
                    {c.items.length > 6 ? (
                      <li className="text-[11px] text-muted-foreground">+{c.items.length - 6} more</li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          This is the platform's own check. Submission is refused for exactly the items marked as outstanding here.
        </p>
      </CardContent>
    </Card>
  );
}
