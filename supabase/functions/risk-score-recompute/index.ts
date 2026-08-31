// Phase 5.4 — Composite risk scoring recompute
// Aggregates supervisory signals per licensee and writes a composite score/band.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

interface Weights {
  prudential_breaches: number;
  open_complaints: number;
  overdue_returns: number;
  open_enforcement: number;
  inspection_findings: number;
  fp_alerts: number;
}
interface BandThresholds { medium: number; high: number; critical: number; }

// Caps normalise raw counts into 0..1 before weighting.
const CAPS: Record<keyof Weights, number> = {
  prudential_breaches: 5,
  open_complaints: 10,
  overdue_returns: 5,
  open_enforcement: 3,
  inspection_findings: 5,
  fp_alerts: 3,
};

function periodKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}-Q${q}`;
}

function band(score: number, t: BandThresholds): string {
  if (score >= t.critical) return 'critical';
  if (score >= t.high) return 'high';
  if (score >= t.medium) return 'medium';
  return 'low';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });


  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) return __workerGate.response;
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json().catch(() => ({} as any));
    const singleEntityId: string | undefined = body?.entity_id;
    const pKey: string = body?.period_key || periodKey();

    // Load active weights.
    const { data: wRow } = await supabase
      .from('risk_score_weights')
      .select('weights, band_thresholds')
      .eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const weights: Weights = (wRow?.weights as any) ?? {
      prudential_breaches: 25, open_complaints: 15, overdue_returns: 15,
      open_enforcement: 20, inspection_findings: 15, fp_alerts: 10,
    };
    const thresholds: BandThresholds = (wRow?.band_thresholds as any) ?? { medium: 25, high: 50, critical: 75 };

    // Load licensees.
    let licQ = supabase.from('licensees').select('id, status');
    if (singleEntityId) licQ = licQ.eq('id', singleEntityId);
    const { data: licensees, error: licErr } = await licQ;
    if (licErr) throw licErr;

    const results: any[] = [];

    for (const lic of licensees ?? []) {
      const eid = (lic as any).id as string;

      // Prudential breaches: first collect the entity's return ids, then count
      // unacknowledged breaches against them. This avoids a foreignTable OR
      // filter combined with head:true, which does not return a reliable count.
      const { data: entityReturnRows } = await supabase.from('returns_filed')
        .select('id')
        .or(`entity_id.eq.${eid},on_behalf_of_licensee_id.eq.${eid}`);
      const entityReturnIds = (entityReturnRows ?? []).map((r: any) => r.id);
      let breachCount = 0;
      if (entityReturnIds.length > 0) {
        const { count } = await supabase.from('v_prudential_current_breaches')
          .select('id', { count: 'exact', head: true })
          .is('acknowledged_at', null)
          .in('return_id', entityReturnIds);
        breachCount = count ?? 0;
      }

      // Fetch remaining signal counts in parallel.
      const [complaintsR, overdueR, enforcementR, findingsR, rolesR] = await Promise.all([
        supabase.from('complaints').select('id', { count: 'exact', head: true })
          .eq('licensee_id', eid).neq('status', 'resolved'),
        supabase.from('returns_filed').select('id', { count: 'exact', head: true })
          .or(`entity_id.eq.${eid},on_behalf_of_licensee_id.eq.${eid}`)
          .eq('ontime_status', 'overdue'),
        supabase.from('enforcement_actions').select('id', { count: 'exact', head: true })
          .eq('entity_id', eid).eq('status', 'open'),
        supabase.from('inspection_findings')
          .select('id, inspections!inner(entity_id)', { count: 'exact', head: true })
          .eq('inspections.entity_id', eid)
          .in('severity', ['high', 'critical'])
          .neq('status', 'closed'),
        supabase.from('fp_individual_roles').select('individual_id').eq('licensee_id', eid).eq('is_current', true),
      ]);

      let fpAlerts = 0;
      const individualIds = (rolesR.data ?? []).map((r: any) => r.individual_id).filter(Boolean);
      if (individualIds.length > 0) {
        const { count } = await supabase.from('fp_monitoring_events')
          .select('id', { count: 'exact', head: true })
          .in('individual_id', individualIds)
          .is('acknowledged_at', null);
        fpAlerts = count ?? 0;
      }

      const components = {
        prudential_breaches: breachCount,
        open_complaints: complaintsR.count ?? 0,
        overdue_returns: overdueR.count ?? 0,
        open_enforcement: enforcementR.count ?? 0,
        inspection_findings: findingsR.count ?? 0,
        fp_alerts: fpAlerts,
      };

      // Weighted normalised score 0..100.
      let totalWeight = 0; let accum = 0;
      (Object.keys(weights) as (keyof Weights)[]).forEach((k) => {
        const w = Number(weights[k]) || 0;
        const cap = CAPS[k] || 1;
        const normalised = Math.min(1, (components[k] || 0) / cap);
        accum += w * normalised;
        totalWeight += w;
      });
      const score = totalWeight > 0 ? Math.round((accum / totalWeight) * 100) : 0;
      const b = band(score, thresholds);

      // Mark previous current record as historical then upsert.
      await supabase.from('entity_risk_scores')
        .update({ is_current: false })
        .eq('entity_id', eid).neq('period_key', pKey).eq('is_current', true);

      const { error: upErr } = await supabase.from('entity_risk_scores')
        .upsert({
          entity_id: eid, period_key: pKey, score, band: b,
          components, weights, is_current: true, computed_at: new Date().toISOString(),
        }, { onConflict: 'entity_id,period_key' });
      if (upErr) console.error('upsert error', eid, upErr.message);

      results.push({ entity_id: eid, score, band: b, components });
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, period_key: pKey, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('risk-score-recompute error', e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
