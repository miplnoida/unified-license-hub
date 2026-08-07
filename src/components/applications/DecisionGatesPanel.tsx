/**
 * Outstanding mandatory gates (LIC-DEC-001)
 *
 * Read-only view of the server-side decision readiness computation
 * (`public.decision_gate_status`). The same function is enforced server-side in
 * `perform-workflow-action`, so what an approver sees here is exactly what the
 * workflow engine will allow.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, CircleSlash, Loader2, ShieldAlert } from 'lucide-react';

interface Gate {
  key: string;
  label: string;
  blocking: boolean;
  passed: boolean;
  detail: string;
}

interface GateStatus {
  ready: boolean;
  blocking_unmet: number;
  gates: Gate[];
}

export function useDecisionGateStatus(applicationId: string) {
  return useQuery({
    queryKey: ['decision_gate_status', applicationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('decision_gate_status' as any, {
        _application_id: applicationId,
      });
      if (error) throw error;
      return data as unknown as GateStatus;
    },
  });
}

export function DecisionGatesPanel({ applicationId }: { applicationId: string }) {
  const { data, isLoading, error } = useDecisionGateStatus(applicationId);

  return (
    <Card className={data && !data.ready ? 'border-destructive/40' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Outstanding mandatory gates
            </CardTitle>
            <CardDescription>
              Server-enforced conditions for a final determination. Blocking gates must pass before an approval is
              accepted.
            </CardDescription>
          </div>
          {data && (
            <Badge variant={data.ready ? 'outline' : 'destructive'}>
              {data.ready ? 'Decision ready' : `${data.blocking_unmet} blocking`}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Evaluating gates…
          </p>
        )}
        {error && <p className="text-sm text-muted-foreground">Gate status unavailable.</p>}
        {data && (
          <ul className="divide-y divide-border/60">
            {(data.gates ?? []).map((g) => (
              <li key={g.key} className="flex items-start gap-3 py-2">
                {g.passed ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-green-600 shrink-0" />
                ) : (
                  <CircleSlash className={`mt-0.5 h-4 w-4 shrink-0 ${g.blocking ? 'text-destructive' : 'text-amber-600'}`} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{g.label}</p>
                  <p className="text-xs text-muted-foreground">{g.detail}</p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {g.blocking ? 'Blocking' : 'Advisory'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default DecisionGatesPanel;
