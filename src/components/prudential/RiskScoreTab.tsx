import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { RiskScoreExplainer, BAND_STYLE, type Band, type RiskScoreRow } from '@/components/prudential/RiskScoreExplainer';

/**
 * Entity-scoped risk score view for the 360 supervisory profile.
 * Read-only: shows the latest composite score, its drivers and history.
 */
export function RiskScoreTab({ entityId, entityName }: { entityId: string; entityName?: string }) {
  const { data: latest, isLoading, error } = useQuery({
    queryKey: ['entity_risk_scores', 'latest', entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const { data, error: err } = await (supabase.from('entity_risk_scores') as any)
        .select('id, entity_id, period_key, score, band, components, weights, computed_at')
        .eq('entity_id', entityId)
        .order('period_key', { ascending: false })
        .limit(1);
      if (err) throw err;
      return (data?.[0] ?? null) as RiskScoreRow | null;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Composite risk score
          {latest?.band && (
            <Badge className={BAND_STYLE[(latest.band as Band) ?? 'low']}>{latest.band}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          How this entity's supervisory risk score is calculated, what drives it, and how it has moved over time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading risk score…
          </div>
        ) : error ? (
          <p className="py-6 text-sm text-destructive">Could not load the risk score. Please try again.</p>
        ) : !latest ? (
          <p className="py-6 text-sm text-muted-foreground">
            No risk score has been calculated for this entity yet. Scores appear here once the periodic
            risk scoring run has covered this entity.
          </p>
        ) : (
          <RiskScoreExplainer row={latest} entityName={entityName} showProfileLink={false} />
        )}
      </CardContent>
    </Card>
  );
}

export default RiskScoreTab;
