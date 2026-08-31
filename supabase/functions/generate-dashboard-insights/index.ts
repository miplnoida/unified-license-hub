import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { logIntegration } from '../_shared/integration-log.ts';
import { requireUserPermission } from "../_shared/authz.ts";
import { enqueueNotificationEvent } from "../_shared/notification-dispatch.ts";

// Produces 3-5 narrative bullet insights + top 3 recommended actions for the
// Executive Dashboard. Reads current cross-module metrics, feeds them to the
// Lovable AI Gateway, returns strict JSON.
// Never mutates data. In-memory 15-minute cache keyed by regulator.
type Insight = { text: string; severity: 'info' | 'warning' | 'critical'; module?: string };
type Action = { text: string; href: string; module?: string };
type Payload = { insights: Insight[]; actions: Action[]; generated_at: string; source: 'ai' | 'fallback' };

const CACHE = new Map<string, { at: number; payload: Payload }>();
const TTL_MS = 15 * 60 * 1000;

async function safeCount(supa: any, table: string, filter?: (q: any) => any) {
  try {
    let q: any = supa.from(table).select('id', { count: 'exact', head: true });
    if (filter) q = filter(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch { return 0; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });


  const __authzGate = await requireUserPermission(req, "report_management", "view");
  if (!__authzGate.ok) return __authzGate.response;
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const regulatorKey: string = body.regulator_id ?? 'global';
    const force: boolean = body.force === true;

    const cached = CACHE.get(regulatorKey);
    if (!force && cached && Date.now() - cached.at < TTL_MS) {
      return new Response(JSON.stringify({ ok: true, cached: true, ...cached.payload }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const thirtyAgo = new Date(Date.now() - 30 * 864e5).toISOString();
    const [openApps, submittedApps, activeLicenses, openBreaches, openEnforcement,
      openComplaints, criticalRisk, highRisk, upcomingInspections, recentReturns,
      unresolvedFpFindings, twinPeaksBlocked,
      prudentialOpenActions, prudentialOpenEscalations, conductOpenAlerts, conductCriticalComplaints] = await Promise.all([
      safeCount(supa, 'applications', (q) => q.in('status', ['submitted', 'under_review', 'rfi_raised', 'assigned'])),
      safeCount(supa, 'applications', (q) => q.gte('created_at', thirtyAgo)),
      safeCount(supa, 'licenses', (q) => q.eq('status', 'active')),
      safeCount(supa, 'v_prudential_current_breaches', (q) => q.is('acknowledged_at', null)),
      safeCount(supa, 'enforcement_actions', (q) => q.in('status', ['open', 'investigating', 'notice_issued', 'decision_pending'])),
      safeCount(supa, 'complaints', (q) => q.in('status', ['open', 'investigating', 'pending'])),
      safeCount(supa, 'entity_risk_scores', (q) => q.eq('is_current', true).eq('band', 'critical')),
      safeCount(supa, 'entity_risk_scores', (q) => q.eq('is_current', true).eq('band', 'high')),
      safeCount(supa, 'inspections', (q) => q.eq('status', 'scheduled').gte('scheduled_date', new Date().toISOString().slice(0, 10))),
      safeCount(supa, 'returns_filed', (q) => q.gte('created_at', thirtyAgo)),
      safeCount(supa, 'fp_findings', (q) => q.eq('resolution_status', 'needs_review')),
      safeCount(supa, 'twinpeaks_clearances', (q) => q.eq('status', 'blocked')),
      safeCount(supa, 'prudential_actions', (q) => q.in('status', ['open', 'overdue'])),
      safeCount(supa, 'prudential_escalations', (q) => q.in('status', ['open', 'under_review'])),
      safeCount(supa, 'conduct_alerts', (q) => q.eq('status', 'open')),
      safeCount(supa, 'complaints', (q) => q.eq('severity', 'critical')),
    ]);

    const metrics = {
      open_applications: openApps,
      applications_last_30d: submittedApps,
      active_licenses: activeLicenses,
      open_return_breaches: openBreaches,
      open_enforcement: openEnforcement,
      open_complaints: openComplaints,
      critical_risk_entities: criticalRisk,
      high_risk_entities: highRisk,
      upcoming_inspections: upcomingInspections,
      returns_filed_last_30d: recentReturns,
      fp_findings_awaiting_review: unresolvedFpFindings,
      twin_peaks_blocked_apps: twinPeaksBlocked,
      prudential_open_actions: prudentialOpenActions,
      prudential_open_escalations: prudentialOpenEscalations,
      conduct_open_alerts: conductOpenAlerts,
      conduct_critical_complaints: conductCriticalComplaints,
    };

    const apiKey = Deno.env.get('LOVABLE_API_KEY');
    let payload: Payload;

    if (!apiKey) {
      payload = fallback(metrics);
    } else {
      const prompt = `You are a chief regulatory analyst. Given these cross-module metrics, produce 3-5 concise insights (each <=180 chars) and 3 recommended actions with a target route.
Return strict JSON: {"insights":[{"text":string,"severity":"info"|"warning"|"critical","module":string?}],"actions":[{"text":string,"href":string,"module":string?}]}
Metrics: ${JSON.stringify(metrics)}
Allowed href values: /admin/applications, /supervision/breaches, /enforcement, /complaints, /supervision/risk, /inspections, /fpa, /supervision/plans, /conduct, /returns-management, /prudential/actions, /prudential/escalations, /conduct/alerts.`;

      const aiStarted = Date.now();
      try {
        const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              { role: 'system', content: 'Return strict JSON only. No prose.' },
              { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
          }),
        });
        if (!aiRes.ok) throw new Error(`AI gateway ${aiRes.status}`);
        const raw = (await aiRes.json()).choices?.[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(raw);
        const insights: Insight[] = Array.isArray(parsed.insights) ? parsed.insights.slice(0, 5) : [];
        const actions: Action[] = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [];
        payload = {
          insights: insights.length ? insights : fallback(metrics).insights,
          actions: actions.length ? actions : fallback(metrics).actions,
          generated_at: new Date().toISOString(),
          source: 'ai',
        };
        await logIntegration(supa, {
          direction: 'outbound',
          integrationKey: 'ai-gateway.dashboard-insights',
          status: 'success',
          entityType: 'regulator',
          entityId: regulatorKey === 'global' ? null : regulatorKey,
          durationMs: Date.now() - aiStarted,
        });
      } catch (_e) {
        payload = fallback(metrics);
        await logIntegration(supa, {
          direction: 'outbound',
          integrationKey: 'ai-gateway.dashboard-insights',
          status: 'failure',
          entityType: 'regulator',
          entityId: regulatorKey === 'global' ? null : regulatorKey,
          error: (_e as Error)?.message ?? String(_e),
          durationMs: Date.now() - aiStarted,
        });
        await enqueueNotificationEvent(supa, {
          event_key: 'ai.processing_failed',
          entity_type: 'report',
          payload: {
            job_label: 'ai-gateway.dashboard-insights',
            error_message: String((_e as Error)?.message ?? _e).slice(0, 300),
          },
          idempotency_suffix: `${regulatorKey}:${new Date().toISOString().slice(0, 13)}`,
        });
      }
    }

    CACHE.set(regulatorKey, { at: Date.now(), payload });

    // Insight notifications: one per generation window, critical insights escalate.
    const windowBucket = payload.generated_at.slice(0, 13);
    const top = payload.insights[0];
    if (top) {
      await enqueueNotificationEvent(supa, {
        event_key: 'ai.insight_generated',
        entity_type: 'report',
        payload: {
          insight_title: `${payload.insights.length} supervisory insight(s)`,
          insight_summary: top.text,
          requested_by: null,
          module: top.module || 'reporting',
        },
        idempotency_suffix: `${regulatorKey}:${windowBucket}`,
      });
    }
    const critical = payload.insights.find((i) => i.severity === 'critical');
    if (critical) {
      await enqueueNotificationEvent(supa, {
        event_key: 'ai.critical_insight',
        entity_type: 'report',
        payload: {
          insight_title: 'Critical supervisory insight',
          insight_summary: critical.text,
          module: critical.module || 'reporting',
        },
        idempotency_suffix: `${regulatorKey}:critical:${windowBucket}`,
      });
    }

    return new Response(JSON.stringify({ ok: true, cached: false, ...payload }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
});

function fallback(m: Record<string, number>): Payload {
  const ins: Insight[] = [];
  if (m.open_return_breaches > 0)
    ins.push({ text: `${m.open_return_breaches} return-threshold breaches await acknowledgement.`, severity: 'warning', module: 'returns' });
  if (m.critical_risk_entities > 0)
    ins.push({ text: `${m.critical_risk_entities} entities carry a critical risk band — review supervisory plans.`, severity: 'critical', module: 'risk' });
  if (m.open_enforcement > 0)
    ins.push({ text: `${m.open_enforcement} enforcement cases are open; ensure statutory clocks are tracked.`, severity: 'warning', module: 'enforcement' });
  if (m.twin_peaks_blocked_apps > 0)
    ins.push({ text: `${m.twin_peaks_blocked_apps} applications are blocked by twin-peaks clearance disputes.`, severity: 'warning', module: 'licensing' });
  if (m.fp_findings_awaiting_review > 0)
    ins.push({ text: `${m.fp_findings_awaiting_review} F&P findings awaiting analyst triage.`, severity: 'info', module: 'fit_and_proper' });
  if (m.prudential_open_actions > 0)
    ins.push({ text: `${m.prudential_open_actions} prudential actions are open or overdue.`, severity: 'warning', module: 'prudential' });
  if (m.prudential_open_escalations > 0)
    ins.push({ text: `${m.prudential_open_escalations} prudential escalations are open or under review.`, severity: 'critical', module: 'prudential' });
  if (m.conduct_open_alerts > 0)
    ins.push({ text: `${m.conduct_open_alerts} market conduct alerts are open.`, severity: 'warning', module: 'conduct' });
  if (m.conduct_critical_complaints > 0)
    ins.push({ text: `${m.conduct_critical_complaints} complaints are flagged critical severity.`, severity: 'critical', module: 'conduct' });
  if (ins.length === 0)
    ins.push({ text: 'All core supervisory queues are clear. Monitor upcoming filings.', severity: 'info' });

  const acts: Action[] = [
    { text: 'Clear breach acknowledgements', href: '/supervision/breaches', module: 'returns' },
    { text: 'Review critical-risk entities', href: '/supervision/risk', module: 'risk' },
    { text: 'Progress enforcement queue', href: '/enforcement', module: 'enforcement' },
  ];
  return { insights: ins.slice(0, 5), actions: acts, generated_at: new Date().toISOString(), source: 'fallback' };
}
