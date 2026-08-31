// Consolidated Analysis engine — turns persisted ratios + breaches into a
// scored, categorised, peer-compared analysis row. Deterministic derivations
// are computed here; the AI summary comes from the Lovable AI Gateway.
//
// Invoked at the tail of `evaluate-return-prudential` (fire-and-forget) and
// directly from the supervisor UI's "Regenerate analysis" button.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logIntegration } from "../_shared/integration-log.ts";
import { requireUserPermission } from "../_shared/authz.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// -------- Scoring (pure) --------------------------------------------------
type Category = "capital" | "liquidity" | "asset_quality" | "profitability" | "concentration" | "other";
type RiskLevel = "green" | "amber" | "red";
type RatioInput = { ratio_key: string; label: string; category: Category; value: number | null; display_format: string; null_reason: string | null; recommendation_template: string | null };
type BreachInput = { metric_key: string; risk_level: RiskLevel; level: "warn" | "breach"; value: number; threshold_value: number; comparator: string };
type TrendPoint = { return_id: string; period_end: string | null; ratios: Record<string, number | null> };

const RISK_SCORE: Record<RiskLevel, number> = { green: 100, amber: 60, red: 20 };
const CORE: Category[] = ["capital", "liquidity", "asset_quality", "profitability"];

function categoryScore(ratios: RatioInput[], m: Map<string, BreachInput>): number {
  if (ratios.length === 0) return 100;
  let s = 0;
  for (const r of ratios) {
    if (r.value === null) { s += 50; continue; }
    s += RISK_SCORE[m.get(r.ratio_key)?.risk_level ?? "green"];
  }
  return Math.round((s / ratios.length) * 100) / 100;
}

function buildSummary(cat: Category, ratios: RatioInput[], m: Map<string, BreachInput>) {
  const inCat = ratios.filter((r) => r.category === cat);
  const metrics = inCat.map((r) => {
    const b = m.get(r.ratio_key);
    return {
      key: r.ratio_key, label: r.label, value: r.value, unit: r.display_format,
      risk_level: r.value === null ? "amber" : (b?.risk_level ?? "green"),
      threshold: b?.threshold_value ?? null, null_reason: r.null_reason,
    };
  });
  const reds = metrics.filter((x) => x.risk_level === "red").length;
  const ambers = metrics.filter((x) => x.risk_level === "amber").length;
  const nulls = metrics.filter((x) => x.value === null).length;
  const facts: string[] = [];
  if (reds) facts.push(`red_breach_count=${reds}`);
  if (ambers) facts.push(`amber_breach_count=${ambers}`);
  if (nulls) facts.push(`missing_ratios=${nulls}`);
  return { category: cat, score: categoryScore(inCat, m), metrics, commentary_facts: facts };
}

function deriveEarlyWarnings(ratios: RatioInput[], breaches: BreachInput[], trend: TrendPoint[]) {
  const out: Array<{ metric_key: string; level: RiskLevel; reason: string; evidence: Record<string, unknown>[] }> = [];
  const bMap = new Map(breaches.map((b) => [b.metric_key, b] as const));
  for (const [key, b] of bMap) {
    if (b.risk_level !== "amber") continue;
    const series = trend.map((t) => t.ratios[key]).filter((v): v is number => typeof v === "number");
    let streak = 0;
    for (const v of series) {
      const bad = (b.comparator === ">" || b.comparator === ">=") ? v >= b.threshold_value
                : (b.comparator === "<" || b.comparator === "<=") ? v <= b.threshold_value
                : false;
      streak = bad ? streak + 1 : 0;
      if (streak >= 2) {
        out.push({ metric_key: key, level: "amber", reason: "consecutive_amber", evidence: [{ streak, comparator: b.comparator, threshold: b.threshold_value }] });
        break;
      }
    }
  }
  const keys = new Set<string>(); ratios.forEach((r) => keys.add(r.ratio_key));
  for (const key of keys) {
    const series = trend.map((t) => t.ratios[key]).filter((v): v is number => typeof v === "number");
    if (series.length < 2) continue;
    const oldest = series[0], newest = series[series.length - 1];
    if (oldest === 0) continue;
    const change = (newest - oldest) / Math.abs(oldest);
    if (Math.abs(change) >= 0.2) {
      out.push({ metric_key: key, level: Math.abs(change) >= 0.5 ? "red" : "amber", reason: "trend_deterioration",
        evidence: [{ oldest, newest, change_pct: Math.round(change * 10000) / 100 }] });
    }
  }
  const clusters: Record<string, string[]> = {};
  for (const r of ratios) if (r.value === null && r.null_reason) (clusters[r.null_reason] ??= []).push(r.ratio_key);
  for (const [reason, ks] of Object.entries(clusters)) {
    if (ks.length >= 3) out.push({ metric_key: ks[0], level: "amber", reason: "null_reason_cluster", evidence: [{ null_reason: reason, ratios: ks }] });
  }
  return out;
}

function pickRecommendations(ratios: RatioInput[], m: Map<string, BreachInput>) {
  const out: Array<{ category: Category; metric_key: string; level: RiskLevel; text: string; source_template: string }> = [];
  for (const r of ratios) {
    const b = m.get(r.ratio_key);
    if (!b || !r.recommendation_template?.trim()) continue;
    const text = r.recommendation_template
      .replace(/\{value\}/g, r.value == null ? "—" : String(r.value))
      .replace(/\{threshold\}/g, String(b.threshold_value))
      .replace(/\{label\}/g, r.label);
    out.push({ category: r.category, metric_key: r.ratio_key, level: b.risk_level, text, source_template: r.recommendation_template });
  }
  return out;
}

// -------- HTTP handler ----------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const __authzGate = await requireUserPermission(req, "returns_management", "view");
  if (!__authzGate.ok) return __authzGate.response;
  try {
    const auth = req.headers.get("authorization");
    if (!auth) return json({ error: "Missing authorization" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const actor = { id: __authzGate.userId, email: __authzGate.email };

    const body = await req.json().catch(() => ({}));
    const return_id: string | undefined = body.return_id;
    const computeAi: boolean = body.compute_ai_summary !== false;
    if (!return_id) return json({ error: "return_id is required" }, 400);

    const admin = createClient(url, service);

    // Load return + config
    const { data: rf, error: rfErr } = await admin.from("returns_filed")
      .select("id, entity_id, on_behalf_of_licensee_id, return_configuration_id, sector_id, period_end_date, unique_id")
      .eq("id", return_id).maybeSingle();
    if (rfErr) return json({ error: `Return lookup failed: ${rfErr.message}` }, 500);
    if (!rf) return json({ error: "Return not found" }, 404);


    // F8-W1B: this function no longer reads the retired `return_calculated_ratios`
    // store (retired read-only in F8-W1A, writer `record_return_ratio` dropped).
    // Ratio values are supplied by the caller (`evaluate-return-prudential`),
    // which computes them in-memory from the same `prudential_ratios`
    // configuration during the authoritative post-submit pass. No ratio value is
    // recalculated, re-derived or persisted here.
    const suppliedRatios: Array<{ ratio_key: string; value: number | null; null_reason?: string | null }> =
      Array.isArray(body.ratios) ? body.ratios : [];

    const [{ data: breachRows = [] }, { data: cfgRatios = [] }] = await Promise.all([
      admin.from("v_prudential_current_breaches").select("*").eq("return_id", return_id).order("detected_at", { ascending: false }),
      admin.from("prudential_ratios").select("*").eq("return_config_id", rf.return_configuration_id),
    ]);

    // Value per ratio_key, exactly as computed by the canonical evaluator.
    const latestByKey = new Map<string, any>();
    for (const r of suppliedRatios) if (r?.ratio_key && !latestByKey.has(r.ratio_key)) latestByKey.set(r.ratio_key, r);

    // Assemble ratio inputs merged with config metadata
    const cfgByKey = new Map<string, any>((cfgRatios as any[]).map((c) => [c.ratio_key, c]));
    const ratios: RatioInput[] = [];
    for (const cfg of cfgRatios as any[]) {
      const latest = latestByKey.get(cfg.ratio_key);
      ratios.push({
        ratio_key: cfg.ratio_key,
        label: cfg.label,
        category: (cfg.category as Category) ?? "other",
        value: latest?.value ?? null,
        display_format: cfg.display_format ?? "decimal",
        null_reason: latest?.null_reason ?? null,
        recommendation_template: cfg.recommendation_template ?? null,
      });
    }

    // Latest breach per metric_key
    const latestBreachByKey = new Map<string, any>();
    for (const b of (breachRows as any[])) if (!latestBreachByKey.has(b.metric_key)) latestBreachByKey.set(b.metric_key, b);
    const breaches: BreachInput[] = Array.from(latestBreachByKey.values()).map((b) => ({
      metric_key: b.metric_key,
      risk_level: (b.risk_level as RiskLevel) ?? (b.level === "breach" ? "red" : "amber"),
      level: b.level, value: Number(b.value), threshold_value: Number(b.threshold_value), comparator: b.comparator,
    }));

    // Trend: historical ratio series is NOT reconstructed here. The retired
    // ratio store is the only place legacy per-return ratio history exists, and
    // the legacy `prudential_ratios.ratio_key` space has no governed mapping to
    // canonical `regulatory_metrics.code`, so a canonical trend cannot be
    // derived without a client-approved metric mapping. The analysis therefore
    // reports the current period only and states why the trend is absent.
    const trend: TrendPoint[] = [];
    const trend_unavailable_reason =
      "legacy_ratio_keys_not_mapped_to_canonical_metrics";

    // Peer snapshot per ratio (best-effort — RPC may error for empty peer group)
    const peer: Array<{ ratio_key: string; label: string; my_value: number | null; distribution: any }> = [];
    for (const r of ratios) {
      try {
        const { data: snap } = await (admin as any).rpc("peer_ratio_snapshot", {
          _period_end: rf.period_end_date, _ratio_key: r.ratio_key, _sector_id: rf.sector_id,
        });
        peer.push({ ratio_key: r.ratio_key, label: r.label, my_value: r.value, distribution: snap ?? null });
      } catch { /* peer RPC unavailable for this metric */ }
    }

    // Deterministic derivations
    const bMap = new Map(breaches.map((b) => [b.metric_key, b] as const));
    const capital       = buildSummary("capital",       ratios, bMap);
    const liquidity     = buildSummary("liquidity",     ratios, bMap);
    const asset_quality = buildSummary("asset_quality", ratios, bMap);
    const profitability = buildSummary("profitability", ratios, bMap);
    const concentration = buildSummary("concentration", ratios, bMap).metrics.filter((m) => m.risk_level !== "green");
    const scores = { capital: capital.score, liquidity: liquidity.score, asset_quality: asset_quality.score, profitability: profitability.score };
    const health_score = Math.round((CORE.map((c) => (scores as any)[c]).reduce((a, b) => a + b, 0) / 4) * 100) / 100;
    const heatmap = [capital, liquidity, asset_quality, profitability].map((s) => {
      const worst = s.metrics.reduce<RiskLevel>((acc, m) => (m.risk_level as RiskLevel) === "red" ? "red" : ((m.risk_level as RiskLevel) === "amber" && acc !== "red" ? "amber" : acc), "green");
      return { category: s.category, risk_level: worst };
    });
    const early_warnings = deriveEarlyWarnings(ratios, breaches, trend);
    const recommendations = pickRecommendations(ratios, bMap);

    // AI summary (Lovable Gateway) — 3 sentences, plain English, from JSON only.
    let ai_summary: string | null = null;
    let ai_error: string | null = null;
    if (computeAi && lovableKey) {
      const payload = {
        unique_id: rf.unique_id, period_end: rf.period_end_date, health_score,
        capital, liquidity, asset_quality, profitability,
        concentration_risks: concentration, early_warnings, recommendations,
      };
      const aiStarted = Date.now();
      try {
        const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${lovableKey}` },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are a prudential regulator. Given the JSON payload only, write EXACTLY three sentences summarising the return's health, top risks, and what the supervisor should look at first. Plain English. No headings, no lists, no invented numbers." },
              { role: "user", content: JSON.stringify(payload) },
            ],
            temperature: 0.2,
          }),
        });
        if (resp.status === 402 || resp.status === 429) {
          ai_error = `ai_gateway_${resp.status}`;
        } else if (!resp.ok) {
          ai_error = `ai_gateway_${resp.status}`;
        } else {
          const j = await resp.json();
          ai_summary = j?.choices?.[0]?.message?.content?.trim() ?? null;
        }
      } catch (e) { ai_error = (e as Error).message; }
      await logIntegration(admin, {
        direction: "outbound",
        integrationKey: "ai-gateway.return-analysis",
        status: ai_error ? "failure" : "success",
        actorId: actor.id,
        entityType: "return",
        entityId: return_id,
        error: ai_error,
        durationMs: Date.now() - aiStarted,
      });
    } else if (computeAi && !lovableKey) {
      ai_error = "missing_lovable_api_key";
    }

    // Persist row
    const inputs = {
      cfg_ratio_count: (cfgRatios as any[]).length,
      supplied_ratio_count: suppliedRatios.length,
      breach_count: breaches.length,
      trend_len: trend.length,
      trend_unavailable_reason,
      ratio_source: "evaluate-return-prudential:in-memory",
      ai_error,
    };
    const { data: inserted, error: insErr } = await admin.from("return_consolidated_analysis").insert({
      return_id, return_config_id: rf.return_configuration_id, sector_id: rf.sector_id,
      health_score,
      capital_summary: capital, liquidity_summary: liquidity,
      asset_quality_summary: asset_quality, profitability_summary: profitability,
      concentration_risks: concentration, trend, peer, heatmap,
      early_warnings, recommendations, ai_summary, inputs,
      computed_by: actor.id,
    }).select("*").single();
    if (insErr) return json({ error: insErr.message }, 500);

    // Audit
    try {
      await admin.rpc("log_compliance_audit_as_actor", {
        _actor_id: actor.id, _action_type: "UPDATE", _object_type: "return", _object_id: return_id,
        _before_value: null, _after_value: null, _justification: null, _ai_model_version: null,
        _ip_address: null, _user_agent: null,
        _metadata: { action: "ANALYSIS_GENERATED", analysis_id: inserted.id, health_score, ai_error },
      });
    } catch (_) { /* audit optional */ }

    // Notifications: analysis_complete always; escalation on red or low health
    const hasRed = heatmap.some((h) => h.risk_level === "red") || (early_warnings.some((w) => w.level === "red"));
    const needsEscalation = hasRed || health_score < 50;
    const dispatch = async (event_key: string) => {
      try {
        await admin.functions.invoke("dispatch-notification-event", {
          body: {
            event_key, entity_type: "return", entity_id: return_id,
            payload: { return_id, unique_id: rf.unique_id, analysis_id: inserted.id, health_score },
          },
        });
      } catch (_) { /* best effort */ }
    };
    await dispatch("return.analysis_complete");
    if (needsEscalation) await dispatch("return.supervisor_escalation");

    return json({ ok: true, analysis: inserted });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Internal error" }, 500);
  }
});
