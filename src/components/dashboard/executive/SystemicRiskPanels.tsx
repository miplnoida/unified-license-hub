/**
 * Phase 5 / Phase 11 — systemic risk heatmap and Twin Peaks executive summary.
 *
 * The conduct column is built from complaints the caller can already read.
 * The prudential column is no longer a conduct-alert proxy: it comes from
 * `public.prudential_sector_risk()`, which scores each sector from
 * unacknowledged return threshold breaches (w3), severe open EWI alerts (w4),
 * adverse supervisory assessments (w5), high/critical group risk signals (w3)
 * and open high-severity supervisory actions (w2), normalised per entity.
 * Bands: CRITICAL >= 8, HIGH >= 4, MEDIUM >= 1.5, LOW > 0, and
 * INSUFFICIENT_DATA when no evidence rows exist — never LOW by default.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

type PrudentialBand = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

interface PrudentialRow {
  sector_id: string;
  sector_name: string;
  entity_count: number;
  ratio_breaches: number;
  severe_ewi: number;
  adverse_assessments: number;
  group_risk_signals: number;
  open_actions: number;
  evidence_count: number;
  score: number | null;
  band: PrudentialBand;
}

type Row = {
  sector: string;
  sectorId: string | null;
  conduct: number;
  prudential: PrudentialRow | null;
};

function tone(v: number, hasData: boolean) {
  if (!hasData) return 'bg-muted text-muted-foreground';
  if (v >= 10) return 'bg-destructive/15 text-destructive';
  if (v >= 4) return 'bg-accent text-accent-foreground';
  return 'bg-primary/10 text-primary';
}

function bandTone(band: PrudentialBand) {
  if (band === 'INSUFFICIENT_DATA') return 'bg-muted text-muted-foreground';
  if (band === 'CRITICAL' || band === 'HIGH') return 'bg-destructive/15 text-destructive';
  if (band === 'MEDIUM') return 'bg-accent text-accent-foreground';
  return 'bg-primary/10 text-primary';
}

const BAND_LABEL: Record<PrudentialBand, string> = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INSUFFICIENT_DATA: 'insufficient data',
};

export function SystemicRiskHeatmap() {
  const { data, isLoading } = useQuery({
    queryKey: ['systemic_risk_heatmap'],
    refetchInterval: 120_000,
    queryFn: async () => {
      // Sector is resolved through the licensee, since complaints are
      // entity-scoped rather than sector-scoped.
      const [sectors, licensees, complaints, prudential] = await Promise.all([
        supabase.from('sectors').select('id,name').limit(100),
        supabase.from('licensees').select('id,sector_id').limit(2000),
        supabase.from('complaints').select('id,licensee_id,severity').limit(2000),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).rpc('prudential_sector_risk', { _lookback_days: 365 }),
      ]);
      const sectorOf = new Map<string, string | null>();
      for (const l of (licensees.data ?? []) as Array<{ id: string; sector_id: string | null }>) {
        sectorOf.set(l.id, l.sector_id);
      }
      const countBy = (arr: Array<{ licensee_id: string | null }>, sectorId: string) =>
        arr.filter((r) => r.licensee_id && sectorOf.get(r.licensee_id) === sectorId).length;

      const prudentialRows = (prudential?.error ? [] : ((prudential?.data ?? []) as PrudentialRow[]));
      const prudentialBySector = new Map<string, PrudentialRow>();
      prudentialRows.forEach((r) => prudentialBySector.set(r.sector_id, r));

      const rows: Row[] = ((sectors.data ?? []) as Array<{ id: string; name: string }>).map((s) => ({
        sector: s.name,
        sectorId: s.id,
        conduct: countBy((complaints.data ?? []) as Array<{ licensee_id: string | null }>, s.id),
        prudential: prudentialBySector.get(s.id) ?? null,
      }));
      return {
        rows,
        prudentialDenied: Boolean(prudential?.error),
      };
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
                  <th className="py-2">Sector</th><th>Complaints</th><th>Prudential risk</th><th>Evidence</th><th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => {
                  const p = r.prudential;
                  const band: PrudentialBand = p?.band ?? 'INSUFFICIENT_DATA';
                  return (
                    <tr key={r.sectorId ?? r.sector} className="border-t">
                      <td className="py-2">{r.sector}</td>
                      <td><span className={`inline-block rounded px-2 py-1 font-mono ${tone(r.conduct, r.conduct > 0)}`}>
                        {r.conduct > 0 ? r.conduct : 'no data'}</span></td>
                      <td>
                        <span className={`inline-block rounded px-2 py-1 font-mono ${bandTone(band)}`}>
                          {band === 'INSUFFICIENT_DATA' ? 'insufficient data' : `${BAND_LABEL[band]} · ${p?.score ?? 0}`}
                        </span>
                      </td>
                      <td className="text-xs text-muted-foreground font-mono">
                        {p && p.evidence_count > 0
                          ? `br ${p.ratio_breaches} · ewi ${p.severe_ewi} · asmt ${p.adverse_assessments} · grp ${p.group_risk_signals} · act ${p.open_actions}`
                          : '—'}
                      </td>
                      <td className="text-xs">
                        {r.conduct > 0 && <Link className="underline" to="/complaints">complaints</Link>}
                        {p && p.evidence_count > 0 && (
                          <>
                            {r.conduct > 0 && ' · '}
                            <Link className="underline" to="/supervision/risk">prudential</Link>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Complaint counts reflect records visible to you. Prudential bands are computed from breach, early-warning,
          assessment, group and supervisory-action evidence; sectors without evidence are reported as
          "insufficient data" rather than as low risk.
          {data?.prudentialDenied && ' Prudential scoring is hidden because your account lacks prudential supervision view rights.'}
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
