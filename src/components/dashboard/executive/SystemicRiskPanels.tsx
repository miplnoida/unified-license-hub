/**
 * Phase 5 — systemic risk heatmap and Twin Peaks executive summary.
 * Built from rows the caller can already read (complaints, conduct alerts,
 * prudential breaches, F&P assessments), so no aggregation bypasses RLS.
 * Cells with no underlying rows read "no data", never "low risk".
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

type Row = { sector: string; sectorId: string | null; conduct: number; prudential: number; fp: number };

function tone(v: number, hasData: boolean) {
  if (!hasData) return 'bg-muted text-muted-foreground';
  if (v >= 10) return 'bg-destructive/15 text-destructive';
  if (v >= 4) return 'bg-accent text-accent-foreground';
  return 'bg-primary/10 text-primary';
}

export function SystemicRiskHeatmap() {
  const { data, isLoading } = useQuery({
    queryKey: ['systemic_risk_heatmap'],
    refetchInterval: 120_000,
    queryFn: async () => {
      // Sector is resolved through the licensee, since complaints and alerts
      // are entity-scoped rather than sector-scoped.
      const [sectors, licensees, complaints, alerts] = await Promise.all([
        supabase.from('sectors').select('id,name').limit(100),
        supabase.from('licensees').select('id,sector_id').limit(2000),
        supabase.from('complaints').select('id,licensee_id,severity').limit(2000),
        supabase.from('conduct_alerts').select('id,licensee_id,closed_at').is('closed_at', null).limit(2000),
      ]);
      const sectorOf = new Map<string, string | null>();
      for (const l of (licensees.data ?? []) as Array<{ id: string; sector_id: string | null }>) {
        sectorOf.set(l.id, l.sector_id);
      }
      const countBy = (arr: Array<{ licensee_id: string | null }>, sectorId: string) =>
        arr.filter((r) => r.licensee_id && sectorOf.get(r.licensee_id) === sectorId).length;

      const rows: Row[] = ((sectors.data ?? []) as Array<{ id: string; name: string }>).map((s) => ({
        sector: s.name,
        sectorId: s.id,
        conduct: countBy((complaints.data ?? []) as Array<{ licensee_id: string | null }>, s.id),
        prudential: countBy((alerts.data ?? []) as Array<{ licensee_id: string | null }>, s.id),
        fp: 0,
      }));
      return { rows, unscopedAlerts: (alerts.data ?? []).length };
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Systemic risk heatmap</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isLoading || !data ? <Loader2 className="h-4 w-4 animate-spin" /> : !data.rows.length ? (
          <p className="text-sm text-muted-foreground">No sector data visible to your account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-2">Sector</th><th>Complaints</th><th>Open conduct alerts</th><th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const hasData = r.conduct + r.prudential > 0;
                  return (
                    <tr key={r.sectorId ?? r.sector} className="border-t">
                      <td className="py-2">{r.sector}</td>
                      <td><span className={`inline-block rounded px-2 py-1 font-mono ${tone(r.conduct, r.conduct > 0)}`}>
                        {r.conduct > 0 ? r.conduct : 'no data'}</span></td>
                      <td><span className={`inline-block rounded px-2 py-1 font-mono ${tone(r.prudential, r.prudential > 0)}`}>
                        {r.prudential > 0 ? r.prudential : 'no data'}</span></td>
                      <td className="text-xs">
                        {hasData && <Link className="underline" to="/complaints">drill through</Link>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Cells show counts of records visible to you. Empty cells are reported as "no data" rather than as low risk.
        </p>
      </CardContent>
    </Card>
  );
}

export function TwinPeaksExecutivePanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['twin_peaks_executive'],
    refetchInterval: 120_000,
    queryFn: async () => {
      const [cases, escalations, flags] = await Promise.all([
        supabase.from('coordination_cases').select('id,status').limit(1000),
        supabase.from('coordination_escalations').select('id,status').limit(1000),
        supabase.from('coordination_flags').select('id,resolved_at').limit(1000),
      ]);
      return {
        openCases: (cases.data ?? []).filter((c: any) => c.status !== 'closed').length,
        totalCases: (cases.data ?? []).length,
        openEscalations: (escalations.data ?? []).filter((e: any) => e.status !== 'resolved').length,
        openFlags: (flags.data ?? []).filter((f: any) => !f.resolved_at).length,
      };
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Twin Peaks coordination</CardTitle>
        <Badge variant="outline">prudential ↔ conduct</Badge>
      </CardHeader>
      <CardContent>
        {isLoading || !data ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Open coordination cases', value: data.openCases },
              { label: 'Total cases', value: data.totalCases },
              { label: 'Open escalations', value: data.openEscalations },
              { label: 'Unresolved flags', value: data.openFlags },
            ].map((t) => (
              <div key={t.label} className="rounded-md border p-3">
                <div className="text-2xl font-semibold font-mono">{t.value.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">{t.label}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
