// Server-side prudential evaluation for a filed return.
// Runs configured validation rules, computes ratios, persists ratios,
// detects & persists threshold breaches, and dispatches notifications.
//
// Invoked by the client at return submission (FillReturnPage), by the
// ReturnDetail "Recompute" button, and can be scheduled from cron jobs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---- Safe arithmetic (mirror of src/lib/safeEval.ts semantics) ------------
function safeArith(expr: string): number {
  if (!expr || !expr.trim()) return 0;
  if (/[a-zA-Z_$]/.test(expr)) throw new Error("Invalid expression");
  // eslint-disable-next-line no-new-func
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
      const c = splitCmp(cond);
      const truthy = c
        ? cmp(safeArith(resolve(c.lhs, data, fid)), c.op, safeArith(resolve(c.rhs, data, fid)))
        : !!safeArith(resolve(cond, data, fid));
      if (!truthy) return { passed: true, message: "" };
      const [ta, tb] = target.split(".");
      const key = tb ?? ta;
      const useFid = tb ? ta : fid;
      const val = useFid ? data[useFid]?.[key] : undefined;
      return val === undefined || val === null || val === ""
        ? { passed: false, message: rule.error_message }
        : { passed: true, message: "" };
    }
    const c = splitCmp(rule.expression);
    if (c) {
      const l = safeArith(resolve(c.lhs, data, fid));
      const r = safeArith(resolve(c.rhs, data, fid));
      return cmp(l, c.op, r) ? { passed: true, message: "" } : { passed: false, message: rule.error_message };
    }
    const v = safeArith(resolve(rule.expression, data, fid));
    return v !== 0 && !Number.isNaN(v)
      ? { passed: true, message: "" }
      : { passed: false, message: rule.error_message };
  } catch (e) {
    return { passed: false, message: rule.error_message || (e as Error).message };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get("authorization");
    if (!auth) return new Response(JSON.stringify({ error: "Missing authorization" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: userRes, error: authErr } = await userClient.auth.getUser();
    const actor = userRes?.user;
    if (authErr || !actor) return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const return_id: string | undefined = body.return_id;
    const dispatch_notifications: boolean = body.dispatch_notifications !== false;
    if (!return_id) return new Response(JSON.stringify({ error: "return_id is required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(url, service);

    // Load return + config linkage
    const { data: rf, error: rfErr } = await admin.from("returns_filed")
      .select("id, licensee_id, return_configuration_id, period_end")
      .eq("id", return_id).maybeSingle();
    if (rfErr || !rf) return new Response(JSON.stringify({ error: "Return not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    const cfg = rf.return_configuration_id;

    // Load form data → { [formTemplateId]: { fieldKey: value } }
    const { data: fd = [] } = await admin.from("return_form_data").select("form_template_id, form_data").eq("return_id", return_id);
    const data: FormData = {};
    for (const row of (fd as any[])) {
      if (!row.form_template_id) continue;
      data[row.form_template_id] = (row.form_data ?? {}) as Record<string, unknown>;
    }

    // Load rules, ratios, thresholds
    const [{ data: rules = [] }, { data: ratios = [] }, { data: thresholds = [] }] = await Promise.all([
      admin.from("return_validation_rules").select("*").eq("return_config_id", cfg).eq("is_active", true),
      admin.from("prudential_ratios").select("*").eq("return_config_id", cfg).eq("is_active", true),
      admin.from("prudential_thresholds").select("*").eq("return_config_id", cfg).eq("is_active", true),
    ]);

    // Evaluate rules
    const results = (rules as any[]).map((r) => ({
      rule_id: r.id, name: r.name, severity: r.severity,
      ...evalRule(r, data),
    }));
    const errors = results.filter((r) => !r.passed && r.severity === "error");
    const warnings = results.filter((r) => !r.passed && r.severity === "warning");

    // Compute ratios + persist
    const computed: Array<{ ratio_key: string; label: string; value: number | null; display_format: string; metric_key: string | null }> = [];
    for (const r of ratios as any[]) {
      try {
        const v = safeArith(resolve(r.formula, data));
        computed.push({ ratio_key: r.ratio_key, label: r.label, value: Number.isFinite(v) ? v : null, display_format: r.display_format, metric_key: r.metric_key });
      } catch {
        computed.push({ ratio_key: r.ratio_key, label: r.label, value: null, display_format: r.display_format, metric_key: r.metric_key });
      }
    }
    for (const c of computed) {
      await admin.rpc("record_return_ratio", {
        _return_id: return_id, _ratio_key: c.ratio_key, _label: c.label,
        _value: c.value, _display_format: c.display_format, _computed_by: actor.id,
      });
    }

    // Detect breaches
    const thByKey = new Map((thresholds as any[]).map((t) => [t.metric_key, t]));
    const breaches: Array<{ metric_key: string; level: "warn" | "breach"; value: number; threshold_value: number; comparator: string }> = [];
    for (const c of computed) {
      if (c.value == null) continue;
      const t: any = thByKey.get(c.metric_key || c.ratio_key);
      if (!t) continue;
      const v = c.value;
      const check = (limit: number | null) => {
        if (limit == null) return false;
        if (t.comparator === ">=") return v < limit;
        if (t.comparator === "<=") return v > limit;
        if (t.comparator === "between") { if (t.upper_value == null) return false; return v < limit || v > t.upper_value; }
        return false;
      };
      if (check(t.breach_value)) breaches.push({ metric_key: c.metric_key || c.ratio_key, level: "breach", value: v, threshold_value: t.breach_value, comparator: t.comparator });
      else if (check(t.warn_value)) breaches.push({ metric_key: c.metric_key || c.ratio_key, level: "warn", value: v, threshold_value: t.warn_value, comparator: t.comparator });
    }
    for (const b of breaches) {
      await admin.rpc("record_return_breach", {
        _return_id: return_id, _metric_key: b.metric_key, _level: b.level,
        _value: b.value, _threshold_value: b.threshold_value, _comparator: b.comparator,
      });
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
          ratios: computed.length, breaches: breaches.length,
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
