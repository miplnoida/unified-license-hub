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
import { renderBrandedEmail, stripUnresolvedTemplateTokens } from "../_shared/email-layout.ts";
import { buildReturnNotificationPayload } from "../_shared/return-notification-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Rule = { type: string; [k: string]: any };

export function render(tpl: string | null | undefined, vars: Record<string, any>): string {
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

async function loadReturn(admin: SupabaseClient, id: string) {
  const { data } = await admin
    .from("returns_filed")
    .select("id, unique_id, entity_id, on_behalf_of_licensee_id, return_configuration_id, sector_id, subsector_id, return_year, return_period, due_date, workflow_status, workflow_id, current_step_id, created_by, updated_by")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  let config_name: string | null = null;
  if ((data as any).return_configuration_id) {
    const { data: cfg } = await admin
      .from("return_configs")
      .select("name")
      .eq("id", (data as any).return_configuration_id)
      .maybeSingle();
    config_name = (cfg as any)?.name || null;
  }
  return { ...(data as any), return_config_name: config_name };
}

async function returnSectorReviewers(
  admin: SupabaseClient,
  args: { sectorId?: string | null; subsectorId?: string | null; returnTypeId?: string | null },
): Promise<string[]> {
  let q = admin
    .from("approval_workflows")
    .select("id")
    .eq("entity_type", "return")
    .eq("is_active", true);
  if (args.sectorId) q = q.or(`sector_id.eq.${args.sectorId},sector_id.is.null`);
  const { data: workflows } = await q;
  const wfIds = (workflows || []).map((r: any) => r.id).filter(Boolean);
  if (wfIds.length === 0) return [];
  const { data: steps } = await admin
    .from("approval_steps")
    .select("approver_role, approver_role_id")
    .in("workflow_id", wfIds);
  const out = new Set<string>();
  for (const step of steps || []) {
    if ((step as any).approver_role) {
      const r = await recipientsForRole(admin, String((step as any).approver_role));
      r.forEach((u) => u && out.add(u));
    }
    if ((step as any).approver_role_id) {
      const { data: udr } = await admin
        .from("user_dynamic_roles")
        .select("user_id")
        .eq("role_id", (step as any).approver_role_id);
      (udr || []).forEach((row: any) => row.user_id && out.add(row.user_id));
    }
  }
  return Array.from(out);
}

async function resolveRecipientEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const [{ data: profile }, { data: preLicenseUser }] = await Promise.all([
    admin.from("profiles").select("email").eq("id", userId).maybeSingle(),
    admin.from("pre_license_users").select("email").eq("id", userId).maybeSingle(),
  ]);
  const email = profile?.email || preLicenseUser?.email || null;
  return typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
}

async function sectorRegulators(
  admin: SupabaseClient,
  args: { sectorId?: string | null; categoryId?: string | null; regulatorId?: string | null },
): Promise<string[]> {
  let regulatorId = args.regulatorId || null;
  if (!regulatorId && args.sectorId) {
    const { data: sector } = await admin
      .from("sectors")
      .select("regulator_id")
      .eq("id", args.sectorId)
      .maybeSingle();
    regulatorId = sector?.regulator_id || null;
  }
  if (!regulatorId) return [];

  let workflowQuery = admin
    .from("approval_workflows")
    .select("id")
    .eq("entity_type", "application")
    .eq("is_active", true)
    .eq("regulator_id", regulatorId);

  if (args.categoryId) workflowQuery = workflowQuery.or(`category_id.eq.${args.categoryId},category_id.is.null`);
  else if (args.sectorId) workflowQuery = workflowQuery.or(`sector_id.eq.${args.sectorId},sector_id.is.null`);

  const { data: workflows } = await workflowQuery;
  const workflowIds = (workflows || []).map((row: any) => row.id).filter(Boolean);
  if (workflowIds.length === 0) return [];

  const { data: steps } = await admin
    .from("approval_steps")
    .select("approver_role, approver_role_id")
    .in("workflow_id", workflowIds);

  const out = new Set<string>();
  for (const step of steps || []) {
    if (step.approver_role) {
      const roleRecipients = await recipientsForRole(admin, String(step.approver_role));
      roleRecipients.forEach((u) => u && out.add(u));
    }
    if (step.approver_role_id) {
      const { data: udr } = await admin
        .from("user_dynamic_roles")
        .select("user_id")
        .eq("role_id", step.approver_role_id);
      (udr || []).forEach((row: any) => row.user_id && out.add(row.user_id));
    }
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
          (await sectorRegulators(admin, {
            sectorId: ctx.payload?.sector_id || ctx.app?.data?.sector_id,
            categoryId: ctx.payload?.category_id || ctx.app?.data?.category_id,
            regulatorId: ctx.payload?.regulator_id || ctx.app?.regulator_id,
          })).forEach((u) => out.add(u));
          break;
        }
        case "return_sector_regulators": {
          (await returnSectorReviewers(admin, {
            sectorId: ctx.payload?.sector_id || (ctx as any).ret?.sector_id,
            subsectorId: ctx.payload?.subsector_id || (ctx as any).ret?.subsector_id,
            returnTypeId: ctx.payload?.return_type_id,
          })).forEach((u) => out.add(u));
          break;
        }
        case "return_licensee_users": {
          const lid = ctx.payload?.licensee_id
            || (ctx as any).ret?.on_behalf_of_licensee_id
            || (ctx as any).ret?.entity_id;
          (await licenseePrimaryUsers(admin, lid)).forEach((u) => out.add(u));
          (await licenseeSecondaryUsers(admin, lid)).forEach((u) => out.add(u));
          break;
        }
        case "return_submitter": {
          const sub = ctx.payload?.submitted_by || (ctx as any).ret?.created_by;
          if (sub) out.add(String(sub));
          break;
        }
        case "workflow_step_approvers": {
          const sid = ctx.payload?.step_id || ctx.app?.current_step_id || (ctx as any).ret?.current_step_id;
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

    // `reminder_window` (e.g. "30d", "15d", "1d", "0d") makes dedupe per-window for cron-driven reminders.
    const { event_key, entity_type, entity_id, payload, reminder_window } = await req.json();
    if (!event_key) {
      return new Response(JSON.stringify({ error: "event_key required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const vars: Record<string, any> = { ...(payload || {}) };
    // Always inject app_url + app_name into template vars for action links
    vars.app_url = vars.app_url || Deno.env.get("APP_BASE_URL") || "";
    vars.app_name = vars.app_name || Deno.env.get("APP_NAME") || "Regulator Portal";

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
    let ret: any = null;
    if (entity_type === "application" && entity_id) {
      app = await loadApplication(admin, entity_id);
      if (app) {
        vars.application_number = vars.application_number || app.application_number;
        vars.applicant_id = vars.applicant_id || app.applicant_id;
        vars.sector_id = vars.sector_id || app.data?.sector_id;
        vars.licensee_id = vars.licensee_id || app.data?.licensee_id;
      }
    }
    if (entity_type === "return" && entity_id) {
      ret = await loadReturn(admin, entity_id);
      if (ret) {
        vars.return_id = vars.return_id || ret.id;
        vars.unique_id = vars.unique_id || ret.unique_id;
        vars.return_config_name = vars.return_config_name || ret.return_config_name;
        vars.return_period = vars.return_period || ret.return_period;
        vars.return_year = vars.return_year || ret.return_year;
        vars.due_date = vars.due_date || ret.due_date;
        vars.sector_id = vars.sector_id || ret.sector_id;
        vars.subsector_id = vars.subsector_id || ret.subsector_id;
        vars.licensee_id = vars.licensee_id || ret.on_behalf_of_licensee_id || ret.entity_id;
        vars.workflow_status = vars.workflow_status || ret.workflow_status;
        if (!vars.cta_url && vars.app_url) {
          vars.cta_url = `${vars.app_url}/admin/returns/queue/${ret.id}`;
          vars.cta_label = vars.cta_label || "View Return";
        }
      }
    }

    const rules: Rule[] = Array.isArray(cfg.recipient_rules) ? cfg.recipient_rules : [];
    const recipients = await resolveRecipients(admin, rules, {
      entity_type,
      entity_id,
      payload: vars,
      app,
      ret,
    } as any);
    summary.recipients = recipients.length;

    const channels: string[] = Array.isArray(cfg.channels) && cfg.channels.length ? cfg.channels : ["in_app"];
    const dedupeWindow = Math.max(0, Number(cfg.dedupe_window_seconds) || 60);
    const dedupeBucket = reminder_window
      ? `rw:${reminder_window}`
      : String(Math.floor(Date.now() / 1000 / Math.max(dedupeWindow, 1)));

    const title = render(cfg.title_template, vars) || event_key;
    const message = render(cfg.message_template, vars) || "";
    const emailSubject = render(cfg.email_subject_template, vars) || title;
    const emailBody = render(cfg.email_body_template, vars) || message;

    const escapeHtml = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    // OTP-style branded card: header, body paragraphs, optional CTA button, footer.
    // Vars consulted (all optional): cta_url, cta_label, app_name, support_email.
    const buildEmailHtml = (heading: string, bodyText: string) => {
      const safeHeading = escapeHtml(heading);
      const paragraphs = String(bodyText || "")
        .split(/\n{2,}/)
        .map((p) => `<p style="color:#475569;margin:0 0 14px;line-height:1.6;font-size:14px;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
        .join("");
      const appName = escapeHtml(vars.app_name || "Unified License Hub");
      const ctaUrl = typeof vars.cta_url === "string" && vars.cta_url ? String(vars.cta_url) : "";
      const ctaLabel = escapeHtml(vars.cta_label || "Open Portal");
      const supportEmail = vars.support_email ? escapeHtml(String(vars.support_email)) : "";
      const ctaBlock = ctaUrl
        ? `<div style="text-align:center;margin:20px 0 8px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#1E3A8A;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:8px;font-family:Arial,sans-serif;">${ctaLabel}</a></div>`
        : "";
      const supportLine = supportEmail
        ? `Need help? Contact <a href="mailto:${supportEmail}" style="color:#1E3A8A;">${supportEmail}</a>.`
        : "";
      return `<div style="background:#f1f5f9;padding:24px 0;font-family:Arial,sans-serif;">
        <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
          <div style="background:#1E3A8A;padding:18px 24px;color:#ffffff;font-weight:700;font-size:16px;letter-spacing:.3px;">${appName}</div>
          <div style="padding:24px;">
            <h2 style="margin:0 0 14px;font-size:18px;color:#0f172a;">${safeHeading}</h2>
            ${paragraphs}
            ${ctaBlock}
          </div>
          <div style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
            <div>${supportLine}</div>
            <div style="margin-top:6px;">This is an automated message from ${appName}. Please do not reply to this email.</div>
          </div>
        </div>
      </div>`;
    };
    const emailHtml = buildEmailHtml(emailSubject, emailBody);

    for (const userId of recipients) {
      for (const channel of channels) {
        const dedupeKey = [event_key, entity_type || "-", entity_id || "-", userId, channel, dedupeBucket].join("|");
        const { data: insertedRow, error: dedupeErr } = await admin
          .from("notification_dispatch_log")
          .insert({
            event_key,
            entity_type: entity_type || null,
            entity_id: entity_id || null,
            recipient_user_id: userId,
            channel,
            dedupe_key: dedupeKey,
            status: "pending",
            reminder_window: reminder_window || null,
            subject: channel === "email" ? emailSubject : title,
            payload: { vars, event_key, entity_type, entity_id },
          })
          .select("id")
          .maybeSingle();
        if (dedupeErr) {
          summary.skipped++;
          continue;
        }
        const logId = insertedRow?.id;
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
            await admin
              .from("notification_dispatch_log")
              .update({ status: "sent", sent_at: new Date().toISOString(), last_attempt_at: new Date().toISOString() })
              .eq("id", logId);
            summary.sent++;
          } else if (channel === "email") {
            const email = await resolveRecipientEmail(admin, userId);
            if (!email) {
              summary.skipped++;
              await admin
                .from("notification_dispatch_log")
                .update({ status: "skipped", error: "no_email", last_attempt_at: new Date().toISOString() })
                .eq("id", logId);
              continue;
            }
            await admin
              .from("notification_dispatch_log")
              .update({ recipient_email: email })
              .eq("id", logId);
            // send-notification updates the log row (sent_at / error / retry_count) when dispatch_log_id is supplied.
            try {
              await admin.functions.invoke("send-notification", {
                body: {
                  type: "email",
                  to: email,
                  subject: emailSubject,
                  body: emailBody,
                  html: emailHtml,
                  dispatch_log_id: logId,
                },
              });
            } catch (e: any) {
              console.error("send-notification email failed", e?.message || e);
              await admin
                .from("notification_dispatch_log")
                .update({ status: "failed", error: String(e?.message || e).slice(0, 500), last_attempt_at: new Date().toISOString() })
                .eq("id", logId);
              summary.failed++;
              continue;
            }
            // Mirror to in-app inbox so users see the email even if SMTP fails silently
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
            summary.sent++;
          }
        } catch (e: any) {
          console.error("dispatch failure", event_key, userId, channel, e?.message || e);
          await admin
            .from("notification_dispatch_log")
            .update({ status: "failed", error: String(e?.message || e).slice(0, 500), last_attempt_at: new Date().toISOString() })
            .eq("id", logId);
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
