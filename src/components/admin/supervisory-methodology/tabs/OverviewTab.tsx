/**
 * Overview — composition of the version exactly as the server reports it.
 *
 * Every count and every distribution comes from `supervisory_methodology_detail`.
 * Nothing on this screen is a literal from the design documents.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MethodologyDetail, MethodologyReadiness } from '@/hooks/useSupervisoryMethodologyAdmin';
import { CountTile, Field, humanize } from '../labels';
import { ReadinessPanel } from '../ReadinessPanel';

function Distribution({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {entries.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Not classified.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {entries.map(([k, v]) => (
            <li key={k} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{humanize(k)}</span>
              <span className="font-mono text-foreground">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OverviewTab({
  detail,
  readiness,
  readinessLoading,
  readinessError,
}: {
  detail: MethodologyDetail;
  readiness?: MethodologyReadiness;
  readinessLoading: boolean;
  readinessError: unknown;
}) {
  const c = detail.counts ?? {};
  const comp = detail.composition;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <CountTile label="Dimensions" value={c.dimensions ?? 0} hint={`${c.dimensions_inherent ?? 0} inherent · ${c.dimensions_control ?? 0} control`} />
        <CountTile label="Questions" value={c.questions ?? 0} />
        <CountTile label="Semantic profiles" value={c.semantic_profiles ?? 0} />
        <CountTile label="Fact requirements" value={c.fact_requirements ?? 0} />
        <CountTile label="Materiality parameters" value={c.parameters ?? 0} />
        <CountTile label="Reference decisions" value={c.reference_decisions ?? 0} />
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Question composition</CardTitle></CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Distribution title="Question class" data={comp?.by_class ?? {}} />
          <Distribution title="Assessment axis" data={comp?.by_axis ?? {}} />
          <Distribution title="Effectiveness focus" data={comp?.by_focus ?? {}} />
          <Distribution title="Calculation participation" data={comp?.by_participation ?? {}} />
        </CardContent>
        <CardContent className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Scored inherent questions">{comp?.scored_inherent ?? 0}</Field>
          <Field label="Contextual inherent (not scored)">{comp?.contextual_inherent ?? 0}</Field>
          <Field label="Evidence required">{comp?.evidence_required ?? 0}</Field>
          <Field label="Not-applicable permitted">{comp?.na_allowed ?? 0}</Field>
          <Field label="Auto-prefill possible">{comp?.auto_prefill_possible ?? 0}</Field>
          <Field label="Supervisory judgement required">{comp?.judgement_required ?? 0}</Field>
        </CardContent>
      </Card>

      <ReadinessPanel data={readiness} isLoading={readinessLoading} error={readinessError} />
    </div>
  );
}
