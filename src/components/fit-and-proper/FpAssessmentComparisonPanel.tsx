import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { FP_CHANGE_META, type FpChangeClass } from '@/lib/fp/comparison';
import { GitCompare, Loader2 } from 'lucide-react';

interface Props { assessmentId: string }

/**
 * Phase 3D — prior-assessment comparison.
 *
 * Read-only view over `fp_assessment_comparison()`; no prior evidence is
 * mutated or overwritten.
 */
export function FpAssessmentComparisonPanel({ assessmentId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['fp_assessment_comparison', assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_assessment_comparison', {
        _assessment_id: assessmentId,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        check_type: string;
        title: string;
        change_class: FpChangeClass;
        current_severity: string | null;
        prior_severity: string | null;
        prior_assessment_id: string | null;
      }>;
    },
  });

  const priorId = data?.find((r) => r.prior_assessment_id)?.prior_assessment_id ?? null;
  const counts = (data ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.change_class] = (acc[r.change_class] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <GitCompare className="h-4 w-4" /> Comparison with prior assessment
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Comparing…
          </div>
        )}
        {!isLoading && (data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No findings to compare — this assessment has no findings and no prior assessment history.
          </p>
        )}
        {!isLoading && (data ?? []).length > 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(FP_CHANGE_META) as FpChangeClass[])
                .filter((k) => counts[k])
                .map((k) => (
                  <Badge key={k} variant="outline" className={FP_CHANGE_META[k].className}>
                    {FP_CHANGE_META[k].label}: {counts[k]}
                  </Badge>
                ))}
              <span className="text-xs text-muted-foreground">
                {priorId ? 'Compared against the previous assessment' : 'No prior assessment — all findings are new'}
              </span>
            </div>
            <div className="divide-y border rounded">
              {(data ?? []).map((r, i) => (
                <div key={`${r.check_type}-${r.title}-${i}`} className="p-2 flex items-start gap-2 text-sm">
                  <Badge variant="outline" className={`${FP_CHANGE_META[r.change_class]?.className} shrink-0`}>
                    {FP_CHANGE_META[r.change_class]?.label ?? r.change_class}
                  </Badge>
                  <div className="flex-1">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.check_type} · severity {r.prior_severity ?? '—'} → {r.current_severity ?? '—'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default FpAssessmentComparisonPanel;
