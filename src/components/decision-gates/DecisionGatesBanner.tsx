import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Blocker {
  kind: 'coordination_flag' | 'coordination_escalation' | 'fit_and_proper';
  flag_type?: string;
  title?: string;
  tier?: string;
  status?: string;
  role_type?: string | null;
  role_title?: string | null;
  latest_outcome?: string;
}

interface Props {
  applicationId?: string | null;
  licenseId?: string | null;
  compact?: boolean;
}

export function DecisionGatesBanner({ applicationId, licenseId, compact }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['decision-gates', applicationId ?? null, licenseId ?? null],
    enabled: !!(applicationId || licenseId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('check_decision_gates', {
        _application_id: applicationId ?? null,
        _license_id: licenseId ?? null,
      });
      if (error) throw error;
      return (data as unknown as Blocker[]) ?? [];
    },
  });

  if (isLoading || !data) return null;

  if (data.length === 0) {
    if (compact) return null;
    return (
      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Decision gates clear</AlertTitle>
        <AlertDescription>No unresolved Fit &amp; Proper or Coordination blockers detected.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Decision blocked by {data.length} unresolved gate{data.length === 1 ? '' : 's'}</AlertTitle>
      <AlertDescription>
        <ul className="mt-2 space-y-1 text-sm">
          {data.map((b, i) => (
            <li key={i} className="flex items-start gap-2">
              <Badge variant="outline" className="mt-0.5 capitalize">
                {b.kind.replace(/_/g, ' ')}
              </Badge>
              <span>
                {b.kind === 'coordination_flag' && `${b.flag_type}: ${b.title ?? 'Unnamed flag'}`}
                {b.kind === 'coordination_escalation' && `Escalation (${b.tier}) — ${b.status}`}
                {b.kind === 'fit_and_proper' && `${b.role_title ?? b.role_type ?? 'Individual'} — latest outcome: ${b.latest_outcome}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs opacity-80">
          Resolve the items above, or ask an administrator to record a Rule Override (<code>decision.gate.override</code>).
        </p>
      </AlertDescription>
    </Alert>
  );
}
