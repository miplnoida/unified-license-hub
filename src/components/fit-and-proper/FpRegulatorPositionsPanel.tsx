import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Scale } from 'lucide-react';

interface Props { individualId: string }

const STATE_META: Record<string, { label: string; className: string; note: string }> = {
  ALIGNED: {
    label: 'Aligned',
    className: 'bg-success/15 text-success border-success/30',
    note: 'Each regulator reached the same outcome independently.',
  },
  DISAGREEMENT: {
    label: 'Disagreement',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
    note: 'Regulators hold different positions. Positions are preserved as recorded — no consensus is inferred.',
  },
  COORDINATION_PENDING: {
    label: 'Coordination pending',
    className: 'bg-warning/15 text-warning border-warning/30',
    note: 'Positions differ and an open coordination case exists.',
  },
  SINGLE_REGULATOR: {
    label: 'Single regulator',
    className: 'bg-muted text-muted-foreground border-border',
    note: 'Only one regulator has a current determination for this individual.',
  },
};

/**
 * Phase 3G — Twin Peaks independent regulator positions.
 *
 * Renders one column per regulator from `fp_regulator_positions()`. Positions
 * are never collapsed into a single conclusion, and a disagreement stays
 * visible as a disagreement.
 */
export function FpRegulatorPositionsPanel({ individualId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['fp_regulator_positions', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fp_regulator_positions', {
        _individual_id: individualId,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        regulator_id: string | null;
        regulator_name: string | null;
        determination_id: string;
        outcome: string;
        rationale: string | null;
        determined_at: string | null;
        effective_from: string | null;
        condition_count: number;
        coordination_state: string;
      }>;
    },
  });

  const { data: coordCase } = useQuery({
    queryKey: ['fp_coordination_case', individualId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coordination_cases')
        .select('id, title, status')
        .eq('subject_type', 'fp_individual')
        .eq('subject_id', individualId)
        .neq('status', 'closed')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const state = data?.[0]?.coordination_state ?? 'SINGLE_REGULATOR';
  const meta = STATE_META[state] ?? STATE_META.SINGLE_REGULATOR;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4" /> Regulator positions (Twin Peaks)
          </span>
          <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading positions…
          </div>
        )}
        {!isLoading && (data ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">
            No current determination recorded by any regulator for this individual.
          </p>
        )}
        {!isLoading && (data ?? []).length > 0 && (
          <>
            <p className="text-xs text-muted-foreground">{meta.note}</p>
            <div className="grid gap-3 md:grid-cols-2">
              {(data ?? []).map((p) => (
                <div key={p.determination_id} className="border rounded p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">{p.regulator_name ?? 'Unattributed regulator'}</span>
                    <Badge variant="outline">{p.outcome}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.determined_at ? new Date(p.determined_at).toLocaleString() : 'Date not recorded'}
                    {p.effective_from ? ` · effective ${p.effective_from}` : ''}
                    {` · ${p.condition_count ?? 0} condition(s)`}
                  </div>
                  {p.rationale && <div className="text-xs whitespace-pre-wrap">{p.rationale}</div>}
                </div>
              ))}
            </div>
            {coordCase && (
              <div className="text-xs">
                Coordination case:{' '}
                <Link to={`/coordination/${coordCase.id}`} className="underline font-medium">
                  {coordCase.title}
                </Link>{' '}
                ({coordCase.status})
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default FpRegulatorPositionsPanel;
