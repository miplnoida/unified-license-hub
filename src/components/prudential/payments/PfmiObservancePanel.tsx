import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import {
  OBSERVANCE_LEVELS,
  labelOf,
  observanceTone,
  usePfmiObservance,
  usePfmiPrinciples,
} from '@/hooks/usePaymentSystems';

const cellTone = (score?: string | null) => {
  if (!score) return 'bg-muted/40 text-muted-foreground';
  if (score === 'observed') return 'bg-emerald-500/15 text-emerald-700';
  if (score === 'broadly_observed') return 'bg-primary/15 text-primary';
  if (score === 'partly_observed') return 'bg-warning/20 text-warning';
  if (score === 'not_observed') return 'bg-destructive/20 text-destructive';
  return 'bg-muted/40 text-muted-foreground';
};

export function PfmiObservancePanel() {
  const { data, isLoading } = usePfmiObservance();
  const { data: principles = [] } = usePfmiPrinciples();

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of data?.principles ?? []) {
      const s = p.regulatory_score ?? p.self_score;
      if (s) counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  if (isLoading) {
    return <div className="py-16 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>;
  }

  const operators = (data?.operators ?? []).filter(o => data?.latest.has(o.id));
  const byAssessment = new Map<string, Map<number, string | null>>();
  for (const p of data?.principles ?? []) {
    if (!byAssessment.has(p.assessment_id)) byAssessment.set(p.assessment_id, new Map());
    byAssessment.get(p.assessment_id)!.set(p.principle_number, p.regulatory_score ?? p.self_score);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        {OBSERVANCE_LEVELS.map(l => (
          <Card key={l.value}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{l.label}</p>
              <p className="text-2xl font-semibold">{summary[l.value] ?? 0}</p>
              <p className="text-xs text-muted-foreground">principle ratings</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">PFMI observance heat map — latest completed assessment per operator</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!operators.length ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No completed PFMI assessments yet. Start an assessment from the operator register.
            </p>
          ) : (
            <table className="w-full text-xs border-separate border-spacing-[2px]">
              <thead>
                <tr>
                  <th className="text-left sticky left-0 bg-background px-2 py-1">Operator</th>
                  <th className="px-2 py-1 text-left">Overall</th>
                  {principles.map(p => (
                    <th key={p.principle_number} className="px-1 py-1 font-mono" title={p.title}>
                      {p.principle_number}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {operators.map(o => {
                  const a = data!.latest.get(o.id)!;
                  const scores = byAssessment.get(a.id) ?? new Map();
                  return (
                    <tr key={o.id}>
                      <td className="sticky left-0 bg-background px-2 py-1 whitespace-nowrap">
                        <Link to={`/prudential/payment-systems/${o.id}`} className="hover:underline font-medium">
                          {o.operator_name}
                        </Link>
                      </td>
                      <td className="px-2 py-1">
                        <Badge variant="outline" className={observanceTone(a.overall_rating)}>
                          {labelOf(OBSERVANCE_LEVELS, a.overall_rating) || 'n/a'}
                        </Badge>
                      </td>
                      {principles.map(p => {
                        const s = scores.get(p.principle_number);
                        return (
                          <td key={p.principle_number}
                            title={`Principle ${p.principle_number}: ${p.title} — ${s ? labelOf(OBSERVANCE_LEVELS, s) : 'Not applicable / not rated'}`}
                            className={`h-6 w-6 text-center rounded ${cellTone(s)}`}>
                            {s ? labelOf(OBSERVANCE_LEVELS, s).charAt(0) : '·'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
