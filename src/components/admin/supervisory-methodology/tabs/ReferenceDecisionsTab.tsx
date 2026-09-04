/**
 * MIPL reference decisions.
 *
 * A reference decision is a methodology-design decision recorded by the
 * reference author. It is never a regulator approval, and the two are shown as
 * separate columns so nobody can read one as the other.
 */
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSupervisoryMethodologyReferenceDecisions } from '@/hooks/useSupervisoryMethodologyAdmin';
import { EmptyPanel, ErrorPanel, formatDate, humanize } from '../labels';

function ReferenceStatusBadge({ status }: { status: string }) {
  const key = (status ?? '').toUpperCase();
  const text = key === 'REFERENCE_APPROVED' ? 'MIPL reference approved'
    : key === 'AWAITING_SUPERVISORY_APPROVAL' ? 'Awaiting supervisory approval'
    : key === 'WITHDRAWN' ? 'Withdrawn'
    : key === 'SUPERSEDED' ? 'Superseded'
    : humanize(key);
  const tone = key === 'REFERENCE_APPROVED' ? 'border-primary/40 bg-primary/10 text-primary'
    : key === 'AWAITING_SUPERVISORY_APPROVAL' ? 'border-warning/40 bg-warning/10 text-warning'
    : 'border-border bg-muted text-muted-foreground';
  return <Badge variant="outline" className={tone}>{text}</Badge>;
}

export function ReferenceDecisionsTab({ methodologyId }: { methodologyId: string }) {
  const { data, isLoading, error } = useSupervisoryMethodologyReferenceDecisions(methodologyId);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (error) return <ErrorPanel error={error} />;
  if (!data || data.total_count === 0) {
    return <EmptyPanel title="No MIPL reference decision is recorded for this version." />;
  }

  return (
    <div className="space-y-3">
      <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
        {data.total_count} reference {data.total_count === 1 ? 'decision' : 'decisions'} recorded.
        {' '}Reference approval is the methodology author's design decision. A regulator approval is a separate decision and is
        recorded in the Regulator Approval tab — {data.regulator_approved_count} of these decisions carries one.
      </p>
      {data.rows.map((d) => (
        <Card key={d.id}>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <CardTitle className="text-base">
                <span className="font-mono">{d.decision_code}</span>
                {d.title ? <span className="ml-2 font-normal">{d.title}</span> : null}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-1.5">
                <ReferenceStatusBadge status={d.status} />
                {d.approval_scope ? <Badge variant="secondary">{humanize(d.approval_scope)}</Badge> : null}
                <Badge variant="outline" className={d.regulator_approval_recorded
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-border bg-muted text-muted-foreground'}>
                  {d.regulator_approval_recorded ? 'Regulator approval recorded' : 'No regulator approval recorded'}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {d.decision_text ? <p className="text-foreground">{d.decision_text}</p> : null}
            {d.rationale ? <p className="text-muted-foreground">{d.rationale}</p> : null}
            <dl className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Decision source</dt>
                <dd className="text-sm">{humanize(d.decision_source)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Recorded by</dt>
                <dd className="text-sm">{d.recorded_by_name ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Recorded date</dt>
                <dd className="text-sm">{formatDate(d.recorded_at)}</dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Adoption recorded</dt>
                <dd className="text-sm">{d.customer_adoption_recorded ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
