// Server-side prudential evaluation for a filed return.
// Runs configured validation rules, computes ratios, persists ratios,
// detects & persists threshold breaches, and dispatches notifications.
//
// Invoked by the client at return submission (FillReturnPage), by the
// ReturnDetail "Recompute" button, and can be scheduled from cron jobs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUserPermission } from "../_shared/authz.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- Safe arithmetic (mirror of src/lib/safeEval.ts semantics) ------------
function safeArith(expr: string): number {
  if (!expr || !expr.trim()) return 0;
  if (/[a-zA-Z_$]/.test(expr)) throw new Error("Invalid expression");
   
  const fn = new Function(`"use strict"; return (${expr});`);
  const v = fn();
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Non-numeric");
  return v;
}

type FormData = Record<string, Record<string, unknown>>;

function resolve(expr: string, data: FormData, defaultFormId?: string | null): string {
  return expr.replace(/([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?/g, (m, a: string, b?: string) => {
    if (/^\d+(\.\d+)?$/.test(m)) return m;
    let fid: string | null | undefined;
    let key: string;
    if (b) { fid = a; key = b; } else { fid = defaultFormId; key = a; }
    if (!fid) return m;
    const v = data[fid]?.[key];
    if (v === undefined || v === null || v === "") return "0";
    const n = Number(v);
    return Number.isFinite(n) ? String(n) : "0";
  });
}

const OPS = ["<=", ">=", "==", "!=", "<", ">"] as const;
function splitCmp(expr: string) {
  for (const op of OPS) {
    const i = expr.indexOf(op);
    if (i > 0) return { lhs: expr.slice(0, i), op, rhs: expr.slice(i + op.length) };
  }
  return null;
}
function cmp(l: number, op: string, r: number) {
  switch (op) { case "==": return l === r; case "!=": return l !== r; case "<": return l < r; case "<=": return l <= r; case ">": return l > r; case ">=": return l >= r; }
  return false;
}

// ---- Boolean composition (AND/OR/&&/||) with proper precedence ------------
function stripOuterParens(expr: string): string {
  let s = expr.trim();
  while (s.length >= 2 && s.startsWith("(") && s.endsWith(")")) {
    let depth = 0, matched = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "(") depth++;
      else if (s[i] === ")") { depth--; if (depth === 0 && i < s.length - 1) { matched = false; break; } }
    }
    if (!matched) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}
function splitTopLevel(expr: string, sep: RegExp): string[] {
  const re = new RegExp(sep.source, sep.flags.includes("g") ? sep.flags : sep.flags + "g");
  const parts: string[] = [];
  let depth = 0, last = 0, i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === "(") { depth++; i++; continue; }
    if (c === ")") { depth--; i++; continue; }
    if (depth === 0) {
      re.lastIndex = i;
      const m = re.exec(expr);
      if (m && m.index === i) { parts.push(expr.slice(last, i)); i = last = i + m[0].length; continue; }
    }
    i++;
  }
  parts.push(expr.slice(last));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}
const OR_RE = /\s+OR\s+|\|\|/gi;
const AND_RE = /\s+AND\s+|&&/gi;
function evalBoolean(expr: string, atom: (e: string) => boolean): boolean {
  const s = stripOuterParens(expr);
  const or = splitTopLevel(s, OR_RE);
  if (or.length > 1) return or.some((p) => evalBoolean(p, atom));
  const and = splitTopLevel(s, AND_RE);
  if (and.length > 1) return and.every((p) => evalBoolean(p, atom));
  return atom(stripOuterParens(s));
}
function evalPredicate(expr: string, data: FormData, fid: string | null): boolean {
  const atom = (e: string): boolean => {
    const c = splitCmp(e);
    if (c) {
      const l = safeArith(resolve(c.lhs, data, fid));
      const r = safeArith(resolve(c.rhs, data, fid));
      return cmp(l, c.op, r);
    }
    const v = safeArith(resolve(e, data, fid));
    return v !== 0 && !Number.isNaN(v);
  };
  return evalBoolean(expr, atom);
}

function evalRule(rule: any, data: FormData) {
  const fid = rule.form_id ?? null;
  try {
    if (rule.rule_type === "pattern") {
      const m = String(rule.expression).match(/^\s*([A-Za-z0-9_.-]+)\s*=~\s*\/(.+)\/([a-z]*)\s*$/);
      if (!m) return { passed: false, message: rule.error_message || "Invalid pattern" };
      const [, token, pat, flags] = m;
      const [ta, tb] = token.split(".");
      const key = tb ?? ta;
      const useFid = tb ? ta : fid;
      const raw = useFid ? String(data[useFid]?.[key] ?? "") : "";
      return new RegExp(pat, flags).test(raw)
        ? { passed: true, message: "" }
        : { passed: false, message: rule.error_message };
    }
    if (rule.rule_type === "required_if") {
      const [cond, target] = String(rule.expression).split("=>").map((s: string) => s.trim());
      if (!cond || !target) return { passed: false, message: rule.error_message || "Invalid required_if" };
      const truthy = evalPredicate(cond, data, fid);
      if (!truthy) return { passed: true, message: "" };
      const [ta, tb] = target.split(".");
      const key = tb ?? ta;
      const useFid = tb ? ta : fid;
      const val = useFid ? data[useFid]?.[key] : undefined;
      return val === undefined || val === null || val === ""
        ? { passed: false, message: rule.error_message }
        : { passed: true, message: "" };
    }
    return evalPredicate(rule.expression, data, fid)
      ? { passed: true, message: "" }
      : { passed: false, message: rule.error_message };
  } catch (e) {
    return { passed: false, message: rule.error_message || (e as Error).message };
  }
}

// ---- Ratio-of-ratio dependencies -----------------------------------------
function ratioRefs(formula: string): string[] {
  return Array.from(String(formula).matchAll(/\$([A-Za-z0-9_-]+)/g)).map((m) => m[1]);
}
function substituteRatioRefs(formula: string, values: Map<string, number>): string {
  return String(formula).replace(/\$([A-Za-z0-9_-]+)/g, (_m, key: string) => {
    const v = values.get(key);
    return v !== undefined && Number.isFinite(v) ? String(v) : "0";
  });
}
function topoOrderRatios(ratios: any[]): any[] {
  const byKey = new Map(ratios.map((r) => [r.ratio_key, r]));
  const visited = new Set<string>();
  const stack = new Set<string>();
  const out: any[] = [];
  const visit = (r: any) => {
    if (visited.has(r.ratio_key)) return;
    if (stack.has(r.ratio_key)) throw new Error(`Circular ratio dependency at "${r.ratio_key}"`);
    stack.add(r.ratio_key);
    for (const dep of ratioRefs(r.formula)) {
      const d = byKey.get(dep);
      if (d) visit(d);
    }
    stack.delete(r.ratio_key);
    visited.add(r.ratio_key);
    out.push(r);
  };
  for (const r of ratios) visit(r);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const __authzGate = await requireUserPermission(req, "returns_management", "view");
  if (!__authzGate.ok) return __authzGate.response;
  try {
    const auth = req.headers.get("authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const actor = { id: __authzGate.userId, email: __authzGate.email };

    const body = await req.json().catch(() => ({}));
    const return_id: string | undefined = body.return_id;
    const dispatch_notifications: boolean = body.dispatch_notifications !== false;
    if (!return_id) return new Response(JSON.stringify({ error: "return_id is required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(url, service);

    // Load return + config linkage
    const { data: rf, error: rfErr } = await admin.from("returns_filed")
      .select("id, entity_id, on_behalf_of_licensee_id, return_configuration_id, period_end_date")
      .eq("id", return_id).maybeSingle();

    if (rfErr || !rf) return new Response(JSON.stringify({ error: "Return not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    const cfg = rf.return_configuration_id;

    // Load normalized form data → { [formTemplateId]: { fieldKey: value } }
    const { data: fd = [], error: fdErr } = await admin.from("return_form_data")
      .select("form_id, field_name, field_value")
      .eq("return_id", return_id);
    if (fdErr) throw fdErr;
    const data: FormData = {};
    for (const row of (fd as any[])) {
      if (!row.form_id || !row.field_name) continue;
      if (!data[row.form_id]) data[row.form_id] = {};
      data[row.form_id][row.field_name] = row.field_value ?? "";
    }

    // Load rules, ratios, thresholds
    const [{ data: rules = [] }, { data: ratios = [] }, { data: thresholds = [] }] = await Promise.all([
      admin.from("return_validation_rules").select("*").eq("return_config_id", cfg).eq("is_active", true),
      admin.from("prudential_ratios").select("*").eq("return_config_id", cfg).eq("is_active", true),
      admin.from("prudential_thresholds").select("*").eq("return_config_id", cfg).eq("is_active", true),
    ]);

    // Evaluate rules (tag rule_version from current_version for replay)
    const results = (rules as any[]).map((r) => ({
      rule_id: r.id, rule_name: r.name, severity: r.severity,
      rule_version: r.current_version ?? 1,
      ...evalRule(r, data),
    }));
    const errors = results.filter((r) => !r.passed && r.severity === "error");
    const warnings = results.filter((r) => !r.passed && r.severity === "warning");

    // Persist per-rule execution log (append-only, creates a batch_id)
    let batch_id: string | null = null;
    try {
      const { data: batch } = await admin.rpc("log_validation_run", {
        _return_id: return_id,
        _results: results,
        _context: body.context || "submit",
      });
      batch_id = (batch as string) || null;
    } catch (_) { /* log optional */ }

    // Compute ratios + persist with formula snapshot + version.
    // Detect division-by-zero and missing inputs so we can persist a null_reason.
    // Ratios may reference other ratios via $ratio_key; topologically order
    // so dependencies compute first, then substitute values into dependants.
    type Computed = { ratio_key: string; label: string; value: number | null; display_format: string; metric_key: string | null; version: number; formula: string; null_reason: string | null };
    let orderedRatios: any[];
    let cycleError: string | null = null;
    try {
      orderedRatios = topoOrderRatios(ratios as any[]);
    } catch (e) {
      cycleError = (e as Error).message;
      orderedRatios = ratios as any[];
    }
    const computedByKey = new Map<string, Computed>();
    const computedValues = new Map<string, number>();
    for (const r of orderedRatios) {
      let value: number | null = null;
      let null_reason: string | null = cycleError;
      try {
        if (cycleError) throw new Error(cycleError);
        // A configured ratio without a usable formula is a configuration gap,
        // not a data gap — surface it as NOT_CONFIGURED.
        if (!String(r.formula ?? "").trim()) {
          null_reason = "not_configured";
          throw new Error("not_configured");
        }

        // Resolve field tokens first so ratio substitution can safely
        // insert numeric literals without colliding with `formId.fieldKey` grammar.
        const withFields = resolve(r.formula, data);
        const resolvedFormula = substituteRatioRefs(withFields, computedValues);
        // Missing input detection on original formula
        const tokens = String(r.formula).match(/([A-Za-z_][A-Za-z0-9_.-]*)/g) || [];
        let hasMissing = false;
        for (const tk of tokens) {
          const [a, b] = tk.split(".");
          const fid = b ? a : null; const key = b ?? a;
          if (!fid && !b) continue;
          const raw = fid ? data[fid]?.[key] : undefined;
          if (raw === undefined || raw === null || raw === "") { hasMissing = true; break; }
        }
        // Missing ratio dependency detection
        const missingDep = ratioRefs(r.formula).some((k) => !computedValues.has(k));
        if (/\/\s*0(?:\.0+)?\b/.test(resolvedFormula)) {
          null_reason = "division_by_zero";
        } else {
          const v = safeArith(resolvedFormula);
          if (Number.isFinite(v)) { value = v; computedValues.set(r.ratio_key, v); }
          else null_reason = "non_numeric";
        }
        if (value === null && !null_reason) {
          if (missingDep) null_reason = "missing_ratio_dependency";
          else if (hasMissing) null_reason = "missing_input";
        }
      } catch (_e) {
        null_reason = null_reason || "computation_error";
      }
      computedByKey.set(r.ratio_key, {
        ratio_key: r.ratio_key, label: r.label, value,
        display_format: r.display_format, metric_key: r.metric_key,
        version: r.current_version ?? 1, formula: r.formula, null_reason,
      });
    }
    // Preserve original config order in the output.
    const computed: Computed[] = [];
    for (const r of ratios as any[]) {
      const c = computedByKey.get(r.ratio_key);
      if (c) computed.push(c);
    }
    // F8-W1A (GAP-F8-09): no second ratio-result store is written here.
    // The canonical calculated-ratio store is `return_metric_values`
    // (source_kind = 'CALCULATED'), written by `returns_calculate_metrics` and
    // read by `_prudential_canonical_detect_run` for threshold evaluation and
    // breach detection. `return_calculated_ratios` is retired/read-only, and
    // the `record_return_ratio` writer has been dropped. Ratio values computed
    // above stay in-memory and feed the threshold comparison below unchanged.



    // Detect breaches with Green/Amber/Red classification.
    // Supports comparators: <, >, <=, >=, =, between (warn range = warn_value..upper_value),
    // and outside (breach when v < warn_value OR v > upper_value).
    const thByKey = new Map((thresholds as any[]).map((t) => [t.metric_key, t]));
    const breaches: Array<{ metric_key: string; level: "warn" | "breach"; risk_level: "amber" | "red"; value: number; threshold_value: number; comparator: string; threshold_version: number }> = [];
    for (const c of computed) {
      if (c.value == null) continue;
      const t: any = thByKey.get(c.metric_key || c.ratio_key);
      if (!t) continue;
      const v = c.value;
      const check = (limit: number | null) => {
        if (limit == null) return false;
        // Comparator expresses the REQUIRED condition; a breach is when the
        // value fails that condition. e.g. ">=" limit means "value must be
        // >= limit", so breach when v < limit.
        switch (t.comparator) {
          case ">":  return v <= limit;
          case ">=": return v <  limit;
          case "<":  return v >= limit;
          case "<=": return v >  limit;
          case "=":
          case "==": return v !== limit;
          case "between":
            // Required: limit <= v <= upper_value → breach when outside
            if (t.upper_value == null) return false;
            return v < limit || v > t.upper_value;
          case "outside":
            // Required: v outside [limit, upper_value] → breach when inside
            if (t.upper_value == null) return false;
            return v >= limit && v <= t.upper_value;
          default:   return false;
        }
      };
      if (check(t.breach_value)) breaches.push({ metric_key: c.metric_key || c.ratio_key, level: "breach", risk_level: "red", value: v, threshold_value: t.breach_value, comparator: t.comparator, threshold_version: t.current_version ?? 1 });
      else if (check(t.warn_value)) breaches.push({ metric_key: c.metric_key || c.ratio_key, level: "warn", risk_level: "amber", value: v, threshold_value: t.warn_value, comparator: t.comparator, threshold_version: t.current_version ?? 1 });
    }
    for (const b of breaches) {
      const { data: breachId } = await admin.rpc("record_return_breach", {
        _return_id: return_id, _metric_key: b.metric_key, _level: b.level,
        _value: b.value, _threshold_value: b.threshold_value, _comparator: b.comparator,
        _risk_level: b.risk_level,
      });
      // Per-breach audit row (in addition to aggregate row below).
      try {
        await admin.rpc("log_compliance_audit_as_actor", {
          _actor_id: actor.id, _action_type: "CREATE",
          _object_type: "return_threshold_breach",
          _object_id: (breachId as string) || null,
          _before_value: null, _after_value: b, _justification: null,
          _ai_model_version: null, _ip_address: null, _user_agent: null,
          _metadata: { source: "evaluate-return-prudential", return_id },
        });
      } catch (_) { /* audit best-effort */ }
    }

    // Audit log via existing shared helper (best-effort)
    try {
      await admin.rpc("log_compliance_audit_as_actor", {
        _actor_id: actor.id,
        _action_type: "UPDATE",
        _object_type: "return",
        _object_id: return_id,
        _before_value: null,
        _after_value: null,
        _justification: null,
        _ai_model_version: null,
        _ip_address: null,
        _user_agent: null,
        _metadata: {
          action: errors.length > 0 ? "RETURN_VALIDATION_FAILED" : "RETURN_VALIDATED",
          rules: results.length, errors: errors.length, warnings: warnings.length,
          ratios: computed.length, breaches: breaches.length, batch_id,
        },
      });
    } catch (_) { /* audit is optional */ }

    // Dispatch notifications
    if (dispatch_notifications) {
      const dispatch = async (event_key: string, payload: Record<string, unknown>) => {
        try {
          await admin.functions.invoke("dispatch-notification-event", {
            body: { event_key, entity_type: "return", entity_id: return_id, payload },
          });
        } catch (_) { /* best effort */ }
      };
      await dispatch(errors.length > 0 ? "return.validation_failed" : "return.validation_passed", {
        return_id, error_count: errors.length, warning_count: warnings.length,
      });
      for (const b of breaches) {
        await dispatch(b.level === "breach" ? "return.breach_critical" : "return.breach_warning", {
          return_id, metric_key: b.metric_key, value: b.value, threshold_value: b.threshold_value, comparator: b.comparator,
        });
      }
    }

    // ---- Auto-evaluate prudential stress indicators for this return ----
    // Runs after ratio + breach persistence. Idempotent (unique on indicator_id+return_id).
    // Failures never break the evaluator; they are logged into prudential_data_feed_logs.
    try {
      await admin.from("prudential_data_feed_logs").insert({
        source: "evaluate-return-prudential", feed_type: "stress_evaluation",
        status: "started", related_return_id: return_id, triggered_by: actor.id,
      });
      // F8-W1A: the retired per-return stress variant read the retired ratio
      // store. Resolve the canonical filing for this return and evaluate stress
      // indicators against the canonical metric store instead.
      const { data: canonicalFiling } = await admin
        .from("return_filings").select("id")
        .eq("legacy_return_filed_id", return_id).maybeSingle();
      const canonicalFilingId = (canonicalFiling as any)?.id as string | undefined;
      if (!canonicalFilingId) throw new Error("No canonical filing linked to this return; stress evaluation skipped");
      const { data: stressData, error: stressErr } = await admin.rpc(
        "evaluate_stress_indicators_for_filing", { _return_filing_id: canonicalFilingId }
      );

      if (stressErr) throw stressErr;
      const newEvents = ((stressData as any)?.new_events ?? []) as Array<Record<string, unknown>>;
      const updatedEvents = ((stressData as any)?.updated_events ?? []) as Array<unknown>;

      await admin.from("prudential_data_feed_logs").insert({
        source: "evaluate-return-prudential", feed_type: "stress_evaluation",
        status: "success", related_return_id: return_id, triggered_by: actor.id,
        row_count: newEvents.length + updatedEvents.length, completed_at: new Date().toISOString(),
        metadata: { new: newEvents.length, updated: updatedEvents.length },
      });

      // Resolve entity name once for notification payloads
      let entityName: string | null = null;
      if (newEvents.length) {
        const entId = (newEvents[0] as any).entity_id as string | undefined;
        if (entId) {
          const { data: ent } = await admin.from("licensees").select("name").eq("id", entId).maybeSingle();
          entityName = (ent as any)?.name ?? null;
        }
      }

      if (dispatch_notifications) {
        for (const ev of newEvents) {
          try {
            await admin.functions.invoke("dispatch-notification-event", {
              body: {
                event_key: "prudential_stress_indicator_triggered",
                entity_type: "prudential_stress_event",
                entity_id: ev.event_id,
                payload: { ...ev, entity_name: entityName },
              },
            });
            await admin.from("prudential_stress_events")
              .update({ notified: true })
              .eq("id", ev.event_id);
            await admin.rpc("log_compliance_audit_as_actor", {
              _actor_id: actor.id, _action_type: "CREATE",
              _object_type: "prudential_stress_event", _object_id: ev.event_id,
              _before_value: null, _after_value: ev, _justification: "Auto-triggered by return evaluation",
              _ai_model_version: null, _ip_address: null, _user_agent: null,
              _metadata: { source: "evaluate-return-prudential", return_id },
            });

            // ---- Auto-escalation for indicators flagged escalate=true ----
            // Idempotent: skip if an open escalation already references this event.
            if ((ev as any).escalate === true && ev.event_id) {
              try {
                const { data: existing } = await admin
                  .from("prudential_escalations")
                  .select("id")
                  .eq("related_type", "stress_event")
                  .eq("related_id", ev.event_id)
                  .in("status", ["open", "under_review"])
                  .maybeSingle();
                if (!existing) {
                  const severity = String((ev as any).severity || "medium");
                  const priorityMap: Record<string, string> = {
                    critical: "urgent", high: "high", medium: "normal", low: "low",
                  };
                  const reason =
                    `Auto-escalated: stress indicator "${(ev as any).label || (ev as any).metric_key}" ` +
                    `triggered on return (observed ${(ev as any).observed_value}).`;
                  const { data: esc } = await admin
                    .from("prudential_escalations")
                    .insert({
                      entity_id: (ev as any).entity_id,
                      related_type: "stress_event",
                      related_id: ev.event_id,
                      escalation_type: "stress_indicator_auto",
                      reason,
                      status: "open",
                      priority: priorityMap[severity] || "normal",
                      created_by: actor.id,
                    })
                    .select()
                    .single();
                  if (esc) {
                    await admin.functions.invoke("dispatch-notification-event", {
                      body: {
                        event_key: "prudential_escalation_created",
                        entity_type: "prudential_escalation",
                        entity_id: (esc as any).id,
                        payload: {
                          entity_name: entityName,
                          entity_id: (ev as any).entity_id,
                          reason,
                          severity,
                          auto: true,
                        },
                      },
                    });
                    await admin.rpc("log_compliance_audit_as_actor", {
                      _actor_id: actor.id, _action_type: "CREATE",
                      _object_type: "prudential_escalation",
                      _object_id: (esc as any).id,
                      _before_value: null, _after_value: esc,
                      _justification: "Auto-escalated from stress indicator",
                      _ai_model_version: null, _ip_address: null, _user_agent: null,
                      _metadata: { source: "evaluate-return-prudential", return_id, stress_event_id: ev.event_id },
                    });
                  }
                }
              } catch (_) { /* auto-escalation best-effort */ }
            }
          } catch (_) { /* best-effort per-event */ }
        }
      }
    } catch (e) {
      try {
        await admin.from("prudential_data_feed_logs").insert({
          source: "evaluate-return-prudential", feed_type: "stress_evaluation",
          status: "failed", related_return_id: return_id, triggered_by: actor.id,
          error: e instanceof Error ? e.message : String(e), completed_at: new Date().toISOString(),
        });
      } catch (_) { /* ignore */ }
    }

    // Generate the consolidated analysis row (best-effort — never fails the evaluator).
    // Only run on the authoritative post-submit pass (skip pre-submit gating calls).
    if (dispatch_notifications) {
      try {
        // F8-W1B: pass the in-memory computed ratios so the analysis function
        // never has to read the retired `return_calculated_ratios` store.
        await admin.functions.invoke("generate-return-analysis", {
          body: {
            return_id,
            compute_ai_summary: true,
            ratios: computed.map((c) => ({
              ratio_key: c.ratio_key, value: c.value, null_reason: c.null_reason,
            })),
          },
        });
      } catch (_) { /* analysis is optional in the evaluator response */ }
    }

    return new Response(JSON.stringify({
      ok: true,
      passed: errors.length === 0,
      errors, warnings,
      ratios: computed,
      breaches,
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
