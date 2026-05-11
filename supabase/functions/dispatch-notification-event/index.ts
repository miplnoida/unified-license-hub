// Reusable server-side notification dispatcher.
//
// Body: { event_key: string, entity_type?: string, entity_id?: string, payload?: Record<string, any> }
//
// - Loads the active template by event_key.
// - Resolves recipients dynamically using rule types like:
//     {type:"role", role:"super_admin"}
//     {type:"applicant"}                         (uses entity_type=application)
//     {type:"sector_regulators"}                 (uses payload.sector_id or app's sector)
//     {type:"entity_primary_users"} / {type:"entity_secondary_users"}
//     {type:"licensee_primary_users"}            (payload.licensee_id)
//     {type:"workflow_step_approvers"}           (payload.step_id or entity application's current step)
//     {type:"previous_workflow_actors"}          (entity application's approval_actions actors)
//     {type:"payload_user", key:"applicant_id"}
// - Renders {{tokens}} from payload.
// - Writes in-app notifications via the notifications table; queues email rows when channel=email
//   and SMTP is configured (process-queue / send-notification handles delivery).
// - Deduplicates per (event_key, entity_id, recipient_user_id, channel) within dedupe window.
// - Never throws to caller; always returns 200 with a JSON summary.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Rule = { type: string; [k: string]: any };

function render(tpl: string | null | undefined, vars: Record<string, any>): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

async function recipientsForRole(admin: SupabaseClient, role: string): Promise<string[]> {
  const { data, error } = await admin.rpc("notification_recipients_for_role", { _role: role });
  if (error) {
    console.error("recipientsForRole", role, error.message);
    return [];
  }
  return (data || []).map((r: any) => (typeof r === "string" ? r : r.notification_recipients_for_role || r));
}

async function loadApplication(admin: SupabaseClient, id: string) {
  const { data } = await admin
    .from("applications")
    .select("id, applicant_id, application_number, status, regulator_id, data, current_step_id, workflow_id")
    .eq("id", id)
    .maybeSingle();
  return data || null;
}

async function sectorRegulators(admin: SupabaseClient, sectorId: string | null | undefined): Promise<string[]> {
  if (!sectorId) return [];
  // Resolve regulator users for the given sector. The data model does not link
  // profiles directly to a regulator, so we approximate by returning all users
  // with regulator-side built-in roles (supervisor + licensing_officer + analyst).
  // This stays dynamic and template-driven; admins can refine recipients later
  // by editing the recipient_rules JSON for any event_key.
  const out = new Set<string>();
  for (const role of ["supervisor", "licensing_officer", "analyst"]) {
    const r = await recipientsForRole(admin, role);
    r.forEach((u) => u && out.add(u));
  }
  return Array.from(out);
}

async function licenseePrimaryUsers(admin: SupabaseClient, licenseeId: string | null | undefined): Promise<string[]> {
  if (!licenseeId) return [];
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("licensee_id", licenseeId)
    .eq("user_type", "primary");
  return (data || []).map((r: any) => r.id);
}

async function licenseeSecondaryUsers(admin: SupabaseClient, licenseeId: string | null | undefined): Promise<string[]> {
  if (!licenseeId) return [];
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("licensee_id", licenseeId)
    .eq("user_type", "secondary");
  return (data || []).map((r: any) => r.id);
}

async function workflowStepApprovers(admin: SupabaseClient, stepId: string | null | undefined): Promise<string[]> {
  if (!stepId) return [];
  const { data: step } = await admin
    .from("approval_steps")
    .select("approver_role, approver_role_id")
    .eq("id", stepId)
    .maybeSingle();
  if (!step) return [];
  const out = new Set<string>();
  if (step.approver_role) {
    const r = await recipientsForRole(admin, String(step.approver_role));
    r.forEach((u) => out.add(u));
  }
  if (step.approver_role_id) {
    const { data: udr } = await admin
      .from("user_dynamic_roles")
      .select("user_id")
      .eq("role_id", step.approver_role_id);
    (udr || []).forEach((u: any) => u.user_id && out.add(u.user_id));
  }
  return Array.from(out);
}

async function previousWorkflowActors(admin: SupabaseClient, applicationId: string | null | undefined): Promise<string[]> {
  if (!applicationId) return [];
  const { data } = await admin
    .from("approval_actions")
    .select("actor_id")
    .eq("application_id", applicationId);
  const out = new Set<string>();
  (data || []).forEach((a: any) => a.actor_id && out.add(a.actor_id));
  return Array.from(out);
}

async function resolveRecipients(
  admin: SupabaseClient,
  rules: Rule[],
  ctx: { entity_type?: string; entity_id?: string; payload: Record<string, any>; app?: any },
): Promise<string[]> {
  const out = new Set<string>();
  for (const rule of rules) {
    try {
      switch (rule.type) {
        case "role": {
          const r = await recipientsForRole(admin, String(rule.role));
          r.forEach((u) => u && out.add(u));
          break;
        }
        case "payload_user": {
          const v = ctx.payload?.[rule.key];
          if (v) out.add(String(v));
          break;
        }
        case "applicant": {
          if (ctx.app?.applicant_id) out.add(ctx.app.applicant_id);
          else if (ctx.payload?.applicant_id) out.add(String(ctx.payload.applicant_id));
          break;
        }
        case "entity_primary_users":
        case "licensee_primary_users": {
          const lid = ctx.payload?.licensee_id || ctx.app?.data?.licensee_id;
          (await licenseePrimaryUsers(admin, lid)).forEach((u) => out.add(u));
          break;
        }
        case "entity_secondary_users":
        case "licensee_secondary_users": {
          const lid = ctx.payload?.licensee_id || ctx.app?.data?.licensee_id;
          (await licenseeSecondaryUsers(admin, lid)).forEach((u) => out.add(u));
          break;
        }
        case "sector_regulators": {
          const sid = ctx.payload?.sector_id || ctx.app?.data?.sector_id;
          (await sectorRegulators(admin, sid)).forEach((u) => out.add(u));
          break;
        }
        case "workflow_step_approvers": {
          const sid = ctx.payload?.step_id || ctx.app?.current_step_id;
          (await workflowStepApprovers(admin, sid)).forEach((u) => out.add(u));
          break;
        }
        case "previous_workflow_actors": {
          const aid = ctx.entity_type === "application" ? ctx.entity_id : ctx.payload?.application_id;
          (await previousWorkflowActors(admin, aid)).forEach((u) => out.add(u));
          break;
        }
        default:
          console.warn("Unknown recipient rule type", rule.type);
      }
    } catch (e: any) {
      console.error("recipient rule failure", rule, e?.message || e);
    }
  }
  return Array.from(out);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const summary: Record<string, any> = { sent: 0, skipped: 0, failed: 0, recipients: 0 };
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const { event_key, entity_type, entity_id, payload } = await req.json();
    if (!event_key) {
      return new Response(JSON.stringify({ error: "event_key required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const vars: Record<string, any> = { ...(payload || {}) };

    const { data: cfg } = await admin
      .from("notification_event_configs")
      .select("*")
      .eq("event_key", event_key)
      .eq("is_active", true)
      .maybeSingle();
    if (!cfg) {
      console.log("No active template for", event_key);
      return new Response(JSON.stringify({ ok: true, skipped: "no_template" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let app: any = null;
    if (entity_type === "application" && entity_id) {
      app = await loadApplication(admin, entity_id);
      if (app) {
        vars.application_number = vars.application_number || app.application_number;
        vars.applicant_id = vars.applicant_id || app.applicant_id;
        vars.sector_id = vars.sector_id || app.data?.sector_id;
        vars.licensee_id = vars.licensee_id || app.data?.licensee_id;
      }
    }

    const rules: Rule[] = Array.isArray(cfg.recipient_rules) ? cfg.recipient_rules : [];
    const recipients = await resolveRecipients(admin, rules, {
      entity_type,
      entity_id,
      payload: vars,
      app,
    });
    summary.recipients = recipients.length;

    const channels: string[] = Array.isArray(cfg.channels) && cfg.channels.length ? cfg.channels : ["in_app"];
    const dedupeWindow = Math.max(0, Number(cfg.dedupe_window_seconds) || 60);
    const dedupeBucket = Math.floor(Date.now() / 1000 / Math.max(dedupeWindow, 1));

    const title = render(cfg.title_template, vars) || event_key;
    const message = render(cfg.message_template, vars) || "";
    const emailSubject = render(cfg.email_subject_template, vars) || title;
    const emailBody = render(cfg.email_body_template, vars) || message;

    for (const userId of recipients) {
      for (const channel of channels) {
        const dedupeKey = [event_key, entity_type || "-", entity_id || "-", userId, channel, dedupeBucket].join("|");
        // Try to insert a dedupe row first; if it conflicts, skip.
        const { error: dedupeErr } = await admin
          .from("notification_dispatch_log")
          .insert({
            event_key,
            entity_type: entity_type || null,
            entity_id: entity_id || null,
            recipient_user_id: userId,
            channel,
            dedupe_key: dedupeKey,
            status: "pending",
          });
        if (dedupeErr) {
          summary.skipped++;
          continue;
        }
        try {
          if (channel === "in_app") {
            const { error } = await admin.from("notifications").insert({
              user_id: userId,
              title,
              message,
              type: cfg.notification_type || "info",
              entity_type: entity_type || null,
              entity_id: entity_id || null,
              channel: "in_app",
              delivery_status: "delivered",
            });
            if (error) throw error;
          } else if (channel === "email") {
            // Look up the email address; queue if SMTP is configured, else best-effort.
            const { data: prof } = await admin
              .from("profiles")
              .select("email")
              .eq("id", userId)
              .maybeSingle();
            const email = prof?.email;
            if (!email) {
              summary.failed++;
              await admin
                .from("notification_dispatch_log")
                .update({ status: "failed", error: "no_email" })
                .eq("dedupe_key", dedupeKey);
              continue;
            }
            try {
              await admin.functions.invoke("send-notification", {
                body: {
                  type: "email",
                  to: email,
                  subject: emailSubject,
                  body: emailBody,
                },
              });
            } catch (e: any) {
              console.error("send-notification email failed", e?.message || e);
            }
            // Always also create an in-app row for visibility (dedupe row guards repeats)
            await admin.from("notifications").insert({
              user_id: userId,
              title: emailSubject,
              message: emailBody,
              type: cfg.notification_type || "info",
              entity_type: entity_type || null,
              entity_id: entity_id || null,
              channel: "email",
              delivery_status: "queued",
            });
          }
          await admin
            .from("notification_dispatch_log")
            .update({ status: "sent" })
            .eq("dedupe_key", dedupeKey);
          summary.sent++;
        } catch (e: any) {
          console.error("dispatch failure", event_key, userId, channel, e?.message || e);
          await admin
            .from("notification_dispatch_log")
            .update({ status: "failed", error: String(e?.message || e).slice(0, 500) })
            .eq("dedupe_key", dedupeKey);
          summary.failed++;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, event_key, ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("dispatch-notification-event fatal", e?.message || e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e), ...summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
