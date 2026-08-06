import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Radio, ShieldCheck, ShieldAlert, FlaskConical } from 'lucide-react';

/**
 * Screening provider status for Fit & Proper reviewers.
 *
 * Makes the provenance of every screening result auditable on screen: which
 * external provider is registered, whether it is live or a sandbox simulator,
 * and whether its circuit is currently healthy. Reads a security-definer view
 * so analysts get this without settings access.
 */
export interface ProviderStatusRow {
  integration_key: string;
  name: string | null;
  environment: string | null;
  enabled: boolean | null;
  status: string | null;
  provider_verified: boolean | null;
  circuit_state: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error: string | null;
  has_credential: boolean | null;
}

export function useScreeningProviderStatus() {
  return useQuery({
    queryKey: ['fp_screening_provider_status'],
    queryFn: async (): Promise<ProviderStatusRow[]> => {
      const { data, error } = await supabase.rpc('fp_screening_provider_status');
      if (error) throw error;
      return (data ?? []) as ProviderStatusRow[];
    },
    staleTime: 60_000,
  });
}

const LABEL: Record<string, string> = {
  sanctions_screening: 'Sanctions / PEP',
  aml_screening: 'AML / adverse media',
};

function readiness(p: ProviderStatusRow) {
  if (!p.enabled || !p.has_credential) return 'not_configured' as const;
  if ((p.circuit_state ?? 'closed') === 'open') return 'unhealthy' as const;
  if (!p.provider_verified) return 'sandbox' as const;
  return 'live' as const;
}

export function FpScreeningProviderBanner() {
  const { data, isLoading } = useScreeningProviderStatus();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking screening providers…
      </div>
    );
  }
  const rows = data ?? [];
  if (rows.length === 0) return null;

  const states = rows.map(readiness);
  const anyProblem = states.some((s) => s === 'not_configured' || s === 'unhealthy');
  const allSandbox = states.every((s) => s === 'sandbox');

  const tone = anyProblem
    ? 'border-amber-200 bg-amber-50/70'
    : allSandbox
    ? 'border-indigo-200 bg-indigo-50/60'
    : 'border-emerald-200 bg-emerald-50/60';

  return (
    <Card className={tone}>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          {anyProblem ? (
            <ShieldAlert className="h-4 w-4 text-amber-700" />
          ) : allSandbox ? (
            <FlaskConical className="h-4 w-4 text-indigo-700" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-700" />
          )}
          <span>
            {anyProblem
              ? 'External screening is not fully available — findings below may be incomplete'
              : allSandbox
              ? 'External screening runs against a SANDBOX provider — results are simulated, not real intelligence'
              : 'External screening providers are live'}
          </span>
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {rows.map((p) => {
            const state = readiness(p);
            return (
              <div key={p.integration_key} className="flex flex-wrap items-center gap-2 text-xs">
                <Radio className="h-3 w-3 text-muted-foreground" />
                <span className="font-medium">{LABEL[p.integration_key] ?? p.integration_key}</span>
                <Badge
                  variant="outline"
                  className={
                    state === 'live'
                      ? 'bg-emerald-100 text-emerald-800 text-[10px]'
                      : state === 'sandbox'
                      ? 'bg-indigo-100 text-indigo-800 text-[10px]'
                      : state === 'unhealthy'
                      ? 'bg-red-100 text-red-800 text-[10px]'
                      : 'bg-slate-100 text-slate-700 text-[10px]'
                  }
                >
                  {state === 'live'
                    ? 'live provider'
                    : state === 'sandbox'
                    ? 'sandbox'
                    : state === 'unhealthy'
                    ? 'circuit open'
                    : 'not configured'}
                </Badge>
                {p.name && <span className="text-muted-foreground">{p.name}</span>}
                {p.environment && (
                  <span className="text-muted-foreground font-mono">{p.environment}</span>
                )}
                {state === 'unhealthy' && p.last_error && (
                  <span className="text-red-700 truncate max-w-[16rem]" title={p.last_error}>
                    {p.last_error}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
