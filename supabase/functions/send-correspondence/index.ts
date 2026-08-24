// Send correspondence: render template with source-record context, log dispatch,
// and create an in-app notification for the recipient. Actual email delivery is
// deferred to the existing notification/email pipeline.
//
// Body:
// {
//   template_id?: string,               // optional; if omitted, subject+body required
//   subject?: string,                   // override template subject
//   body?: string,                      // override template body
//   channel?: 'email'|'sms'|'letter',   // default template.channel or 'email'
//   source_type: string,                // application|enforcement|complaint|fp_assessment|return|licensee
//   source_id: string,
//   recipient_user_id?: string,
//   recipient_email?: string,
//   recipient_name?: string,
//   recipient_phone?: string,
//   context?: Record<string, any>       // additional tokens
// }
//
// Returns: { ok: true, dispatch_id }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { requireUserPermission } from "../_shared/authz.ts";

function render(tpl: string | null | undefined, vars: Record<string, any>): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const parts = String(k).split(".");
    let v: any = vars;
    for (const p of parts) v = v == null ? v : v[p];
    return v == null ? "" : String(v);
  });
}

async function loadSource(admin: any, source_type: string, source_id: string) {
  const table =
    source_type === "application" ? "applications"
    : source_type === "enforcement" ? "enforcement_actions"
    : source_type === "complaint" ? "complaints"
    : source_type === "fp_assessment" ? "fp_assessments"
    : source_type === "return" ? "returns_filed"
    : source_type === "licensee" ? "licensees"
    : null;
  if (!table) return null;
  const { data } = await admin.from(table).select("*").eq("id", source_id).maybeSingle();
  return data || null;
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;

  const __authzGate = await requireUserPermission(req, "correspondence_management", "dispatch");
  if (!__authzGate.ok) return __authzGate.response;
  const cors = buildCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const userId = __authzGate.userId;

    const admin = createClient(SUPABASE_URL, SERVICE);

    const body = await req.json().catch(() => ({}));
    const {
      template_id,
      subject: overrideSubject,
      body: overrideBody,
      channel: overrideChannel,
      source_type,
      source_id,
      recipient_user_id,
      recipient_email,
      recipient_name,
      recipient_phone,
      context = {},
    } = body || {};

    if (!source_type || !source_id) {
      return new Response(JSON.stringify({ ok: false, error: "source_type and source_id are required" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    let template: any = null;
    if (template_id) {
      const { data } = await admin.from("correspondence_templates").select("*").eq("id", template_id).maybeSingle();
      template = data;
    }
    const subject = overrideSubject ?? template?.subject ?? "";
    const rawBody = overrideBody ?? template?.body ?? "";
    if (!rawBody) {
      return new Response(JSON.stringify({ ok: false, error: "no body or template" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const channel = overrideChannel || template?.channel || "email";

    const record = await loadSource(admin, source_type, source_id);
    const vars = {
      ...(record || {}),
      recipient_name: recipient_name || "",
      recipient_email: recipient_email || "",
      today: new Date().toISOString().slice(0, 10),
      source_type,
      source_id,
      ...context,
    };
    const renderedSubject = render(subject, vars);
    const renderedBody = render(rawBody, vars);

    let resolvedEmail = recipient_email || null;
    let resolvedName = recipient_name || null;
    if (recipient_user_id && (!resolvedEmail || !resolvedName)) {
      const { data: prof } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", recipient_user_id)
        .maybeSingle();
      if (prof) {
        resolvedEmail = resolvedEmail || (prof as any).email;
        resolvedName = resolvedName || (prof as any).full_name;
      }
    }

    const { data: dispatch, error: insErr } = await admin
      .from("correspondence_dispatches")
      .insert({
        template_id: template?.id || null,
        source_type,
        source_id,
        recipient_user_id: recipient_user_id || null,
        recipient_email: resolvedEmail,
        recipient_phone: recipient_phone || null,
        recipient_name: resolvedName,
        channel,
        subject: renderedSubject,
        body: renderedBody,
        status: "sent",
        sent_by: userId,
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insErr) {
      return new Response(JSON.stringify({ ok: false, error: insErr.message }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // In-app notification for the recipient (if we know a user id)
    if (recipient_user_id) {
      await admin.from("notifications").insert({
        user_id: recipient_user_id,
        title: renderedSubject || "New correspondence",
        message: renderedBody.slice(0, 500),
        type: "correspondence",
        channel: "in_app",
        entity_type: source_type,
        entity_id: source_id,
      });
    }

    return new Response(JSON.stringify({ ok: true, dispatch_id: dispatch.id }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-correspondence error", e?.message);
    return new Response(JSON.stringify({ ok: false, error: e?.message || "unknown" }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
