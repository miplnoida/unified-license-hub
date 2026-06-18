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

async function loadRegistration(admin: SupabaseClient, id: string) {
  const { data } = await admin
    .from("registrations")
    .select("id, user_id, registration_reference, applicant_name, email, sector_id, category_id, status")
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

async function resolveStepActionNotificationOverrides(
  admin: SupabaseClient,
  args: {
    stepId?: string | null;
    actionType?: string | null;
    explicitRow?: {
      event_key?: string | null;
      recipient_type?: string | null;
      recipient_config?: Record<string, any> | null;
      template_id?: string | null;
    } | null;
  },
): Promise<{
  eventRows: Array<{
    event_key: string;
    recipient_type: string;
    recipient_config: Record<string, any>;
    template_id: string | null;
  }>;
  templateMap: Map<string, { subject: string | null; body: string; channel: string; name: string }>;
}> {
  const explicitRow = args.explicitRow;
  if (explicitRow?.event_key && explicitRow?.recipient_type) {
    const templateIds = explicitRow.template_id ? [String(explicitRow.template_id)] : [];
    const templateMap = new Map<string, { subject: string | null; body: string; channel: string; name: string }>();
    if (templateIds.length > 0) {
      const { data: templates } = await admin
        .from("notification_templates")
        .select("id, name, subject, body, channel")
        .in("id", templateIds);
      for (const template of (templates || []) as any[]) {
        templateMap.set(String(template.id), {
          subject: template.subject ?? null,
          body: String(template.body || ""),
          channel: String(template.channel || "in_app"),
          name: String(template.name || "Template"),
        });
      }
    }
    return {
      eventRows: [{
        event_key: String(explicitRow.event_key),
        recipient_type: String(explicitRow.recipient_type),
        recipient_config: (explicitRow.recipient_config || {}) as Record<string, any>,
        template_id: explicitRow.template_id ? String(explicitRow.template_id) : null,
      }],
      templateMap,
    };
  }

  if (!args.stepId || !args.actionType) {
    return { eventRows: [], templateMap: new Map() };
  }

  const { data: rows } = await admin
    .from("approval_action_notifications")
    .select("event_key, recipient_type, recipient_config, template_id")
    .eq("step_id", args.stepId)
    .eq("action_type", args.actionType)
    .eq("is_enabled", true);

  const eventRows = ((rows || []) as any[]).map((row) => ({
    event_key: String(row.event_key),
    recipient_type: String(row.recipient_type),
    recipient_config: (row.recipient_config || {}) as Record<string, any>,
    template_id: row.template_id ? String(row.template_id) : null,
  }));

  const templateIds = Array.from(new Set(eventRows.map((row) => row.template_id).filter(Boolean))) as string[];
  const templateMap = new Map<string, { subject: string | null; body: string; channel: string; name: string }>();

  if (templateIds.length > 0) {
    const { data: templates } = await admin
      .from("notification_templates")
      .select("id, name, subject, body, channel")
      .in("id", templateIds);

    for (const template of (templates || []) as any[]) {
      templateMap.set(String(template.id), {
        subject: template.subject ?? null,
        body: String(template.body || ""),
        channel: String(template.channel || "in_app"),
        name: String(template.name || "Template"),
      });
    }
  }

  return { eventRows, templateMap };
}

function buildRecipientRulesForOverride(row: {
  recipient_type: string;
  recipient_config?: Record<string, any>;
}): Rule[] {
  const cfg = row.recipient_config || {};
  switch (row.recipient_type) {
    case "applicant":
      return [{ type: "applicant" }];
    case "current_approver":
      return [{ type: "workflow_step_approvers" }];
    case "previous_actor":
      return [{ type: "previous_workflow_actors" }];
    case "role": {
      const role = typeof cfg.role === "string" ? cfg.role : typeof cfg.role_name === "string" ? cfg.role_name : "";
      return role ? [{ type: "role", role }] : [];
    }
    case "admin":
      return [{ type: "role", role: "admin" }, { type: "role", role: "super_admin" }];
    case "custom_email": {
      const email = typeof cfg.email === "string" ? cfg.email.trim().toLowerCase() : "";
      return email ? [{ type: "direct_email", email }] : [];
    }
    default:
      return [];
  }
}

function buildOverrideConfig(
  baseCfg: Record<string, any>,
  row: { recipient_type: string; recipient_config: Record<string, any>; template_id: string | null },
  templateMap: Map<string, { subject: string | null; body: string; channel: string; name: string }>,
) {
  const template = row.template_id ? templateMap.get(row.template_id) : null;
  const recipientRules = buildRecipientRulesForOverride(row);
  return {
    ...baseCfg,
    recipient_rules: recipientRules,
    channels: template?.channel ? [template.channel] : (Array.isArray(baseCfg.channels) && baseCfg.channels.length ? baseCfg.channels : ["in_app"]),
    title_template: template?.subject || baseCfg.title_template,
    message_template: template?.body || baseCfg.message_template,
    email_subject_template: template?.subject || baseCfg.email_subject_template,
    email_body_template: template?.body || baseCfg.email_body_template,
  };
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

async function entityUsers(admin: SupabaseClient, entityId: string | null | undefined): Promise<string[]> {
  if (!entityId) return [];
  const [{ data: directProfiles }, { data: mappedUsers }] = await Promise.all([
    admin.from("profiles").select("id").eq("licensee_id", entityId),
    admin.from("entity_user_access").select("user_id").eq("entity_id", entityId).eq("is_active", true),
  ]);
  const out = new Set<string>();
  (directProfiles || []).forEach((row: any) => row.id && out.add(row.id));
  (mappedUsers || []).forEach((row: any) => row.user_id && out.add(row.user_id));
  return Array.from(out);
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
  const excludedEmails = new Set<string>();
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
        case "sla_process_team_leads": {
          const pt = ctx.payload?.process_type;
          if (pt) {
            const { data } = await admin
              .from("sla_process_team_leads")
              .select("user_id")
              .eq("process_type", String(pt));
            (data || []).forEach((r: any) => r.user_id && out.add(String(r.user_id)));
          }
          break;
        }
        case "direct_email": {
          const email = typeof rule.email === "string" ? rule.email.trim().toLowerCase() : "";
          if (email) out.add(`email:${email}`);
          break;
        }
        case "applicant": {
          if (ctx.app?.applicant_id) out.add(ctx.app.applicant_id);
          else if (ctx.payload?.applicant_id) out.add(String(ctx.payload.applicant_id));
          else if ((ctx as any).registration?.user_id) out.add(String((ctx as any).registration.user_id));
          else if ((ctx as any).registration?.email) out.add(`email:${String((ctx as any).registration.email).trim().toLowerCase()}`);
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
        case "return_entity_users": {
          const entityId = ctx.payload?.entity_id || (ctx as any).ret?.entity_id;
          (await entityUsers(admin, entityId)).forEach((u) => out.add(u));
          break;
        }
        case "return_workflow_current_step_approvers": {
          const sid = ctx.payload?.step_id || ctx.payload?.current_step_id || (ctx as any).ret?.current_step_id;
          const approvers = await workflowStepApprovers(admin, sid);
          if (approvers.length === 0) {
            (await returnSectorReviewers(admin, {
              sectorId: ctx.payload?.sector_id || (ctx as any).ret?.sector_id,
              subsectorId: ctx.payload?.subsector_id || (ctx as any).ret?.subsector_id,
              returnTypeId: ctx.payload?.return_type_id,
            })).forEach((u) => out.add(u));
          } else {
            approvers.forEach((u) => out.add(u));
          }
          break;
        }
        case "return_workflow_next_step_approvers": {
          const sid = ctx.payload?.new_step_id || ctx.payload?.next_step_id;
          const approvers = await workflowStepApprovers(admin, sid);
          if (approvers.length === 0) {
            (await returnSectorReviewers(admin, {
              sectorId: ctx.payload?.sector_id || (ctx as any).ret?.sector_id,
              subsectorId: ctx.payload?.subsector_id || (ctx as any).ret?.subsector_id,
              returnTypeId: ctx.payload?.return_type_id,
            })).forEach((u) => out.add(u));
          } else {
            approvers.forEach((u) => out.add(u));
          }
          break;
        }
        case "return_regulator_admins":
        case "return_admins": {
          const admins = await recipientsForRole(admin, "admin");
          const supers = await recipientsForRole(admin, "super_admin");
          [...admins, ...supers].forEach((u) => u && out.add(u));
          break;
        }
        case "actor_excluded": {
          const actorId = String(ctx.payload?.actor_id || "");
          if (actorId) {
            const actorEmail = await resolveRecipientEmail(admin, actorId);
            if (actorEmail) excludedEmails.add(actorEmail);
          }
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
  const filtered: string[] = [];
  const seenEmails = new Set<string>();
  for (const userId of Array.from(out)) {
    if (userId.startsWith("email:")) {
      const directEmail = userId.slice("email:".length).trim().toLowerCase();
      if (!directEmail || excludedEmails.has(directEmail) || seenEmails.has(directEmail)) continue;
      seenEmails.add(directEmail);
      filtered.push(userId);
      continue;
    }
    const email = await resolveRecipientEmail(admin, userId);
    if (email && excludedEmails.has(email)) continue;
    if (email && seenEmails.has(email)) continue;
    if (email) seenEmails.add(email);
    filtered.push(userId);
  }
  return filtered;
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
    let vars: Record<string, any> = { ...(payload || {}) };
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
    let registration: any = null;
    if (entity_type === "application" && entity_id) {
      app = await loadApplication(admin, entity_id);
      if (app) {
        vars.application_number = vars.application_number || app.application_number;
        vars.applicant_id = vars.applicant_id || app.applicant_id;
        vars.sector_id = vars.sector_id || app.data?.sector_id;
        vars.licensee_id = vars.licensee_id || app.data?.licensee_id;
      }
    }
    if (entity_type === "registration" && entity_id) {
      registration = await loadRegistration(admin, entity_id);
      if (registration) {
        vars.registration_id = vars.registration_id || registration.id;
        vars.registration_reference = vars.registration_reference || registration.registration_reference;
        vars.registration_number = vars.registration_number || registration.registration_reference;
        vars.applicant_id = vars.applicant_id || registration.user_id;
        vars.applicant_name = vars.applicant_name || registration.applicant_name;
        vars.applicant_email = vars.applicant_email || registration.email;
        vars.sector_id = vars.sector_id || registration.sector_id;
        vars.category_id = vars.category_id || registration.category_id;
      }
    }
    if (entity_type === "return" && entity_id) {
      ret = await loadReturn(admin, entity_id);
      vars = await buildReturnNotificationPayload(admin, {
        returnId: entity_id,
        eventKey: String(event_key),
        payload: vars,
        actorId: typeof vars.actor_id === "string" ? vars.actor_id : null,
      });
    }

    // Resolve step/workflow names from any step ids in the payload so templates
    // using {{step_name}}, {{previous_step_name}}, {{next_step_name}},
    // {{workflow_name}} render correctly even when callers don't pre-populate them.
    try {
      const stepIdsToLoad = new Set<string>();
      const currentStepId =
        (typeof vars.step_id === "string" && vars.step_id) ||
        (typeof vars.current_step_id === "string" && vars.current_step_id) ||
        (app?.current_step_id ? String(app.current_step_id) : "") ||
        ((ret as any)?.current_step_id ? String((ret as any).current_step_id) : "") ||
        "";
      const nextStepId = typeof vars.new_step_id === "string" ? vars.new_step_id : (typeof vars.next_step_id === "string" ? vars.next_step_id : "");
      const prevStepId = typeof vars.previous_step_id === "string" ? vars.previous_step_id : "";
      if (currentStepId) stepIdsToLoad.add(currentStepId);
      if (nextStepId) stepIdsToLoad.add(nextStepId);
      if (prevStepId) stepIdsToLoad.add(prevStepId);
      if (stepIdsToLoad.size > 0) {
        const { data: stepRows } = await admin
          .from("approval_steps")
          .select("id, name, step_key, step_level, workflow_id")
          .in("id", Array.from(stepIdsToLoad));
        const stepMap = new Map<string, any>();
        (stepRows || []).forEach((s: any) => stepMap.set(String(s.id), s));
        const workflowIds = Array.from(new Set((stepRows || []).map((s: any) => s.workflow_id).filter(Boolean))) as string[];
        const wfMap = new Map<string, string>();
        if (workflowIds.length > 0) {
          const { data: wfRows } = await admin
            .from("approval_workflows")
            .select("id, name")
            .in("id", workflowIds);
          (wfRows || []).forEach((w: any) => wfMap.set(String(w.id), String(w.name || "")));
        }
        const cur = currentStepId ? stepMap.get(currentStepId) : null;
        if (cur) {
          vars.step_name = vars.step_name || cur.name || "";
          vars.step_key = vars.step_key || cur.step_key || "";
          vars.step_level = vars.step_level ?? cur.step_level ?? "";
          if (cur.workflow_id) vars.workflow_name = vars.workflow_name || wfMap.get(String(cur.workflow_id)) || "";
        }
        const nxt = nextStepId && nextStepId !== currentStepId ? stepMap.get(nextStepId) : null;
        if (nxt) {
          vars.next_step_name = vars.next_step_name || nxt.name || "";
          vars.next_step_key = vars.next_step_key || nxt.step_key || "";
        }
        const prv = prevStepId ? stepMap.get(prevStepId) : null;
        if (prv) {
          vars.previous_step_name = vars.previous_step_name || prv.name || "";
          vars.previous_step_key = vars.previous_step_key || prv.step_key || "";
        }
      }
    } catch (stepLookupErr) {
      console.warn("step/workflow name lookup failed:", (stepLookupErr as any)?.message || stepLookupErr);
    }

    const shouldUseActionOverrides = vars.action_notification_override === true;
    const overrideStepId = shouldUseActionOverrides && typeof vars.step_id === "string" ? vars.step_id : null;
    const overrideActionType = shouldUseActionOverrides && typeof vars.action_type === "string" ? vars.action_type : null;
    const explicitOverrideRow = shouldUseActionOverrides ? {
      event_key: typeof event_key === "string" ? event_key : null,
      recipient_type: typeof vars.recipient_type === "string" ? vars.recipient_type : null,
      recipient_config: (vars.recipient_config && typeof vars.recipient_config === "object") ? vars.recipient_config as Record<string, any> : null,
      template_id: typeof vars.template_id === "string" ? vars.template_id : null,
    } : null;
    const { eventRows, templateMap } = shouldUseActionOverrides
      ? await resolveStepActionNotificationOverrides(admin, {
          stepId: overrideStepId,
          actionType: overrideActionType,
          explicitRow: explicitOverrideRow,
        })
      : { eventRows: [], templateMap: new Map<string, { subject: string | null; body: string; channel: string; name: string }>() };

    const dispatchConfigs = shouldUseActionOverrides && eventRows.length > 0
      ? eventRows.map((row) => ({
          eventKey: row.event_key,
          cfg: buildOverrideConfig(cfg as Record<string, any>, row, templateMap),
        }))
      : [{ eventKey: String(event_key), cfg: cfg as Record<string, any> }];

    for (const dispatchCfg of dispatchConfigs) {
      const rules: Rule[] = Array.isArray(dispatchCfg.cfg.recipient_rules) ? dispatchCfg.cfg.recipient_rules : [];
      const recipients = await resolveRecipients(admin, rules, {
        entity_type,
        entity_id,
        payload: vars,
        app,
        ret,
        registration,
      } as any);
      summary.recipients += recipients.length;
      console.log("dispatch-notification-event", { event_key: dispatchCfg.eventKey, entity_type, entity_id, recipient_count: recipients.length });

      const channels: string[] = Array.isArray(dispatchCfg.cfg.channels) && dispatchCfg.cfg.channels.length ? dispatchCfg.cfg.channels : ["in_app"];
      const dedupeWindow = Math.max(0, Number(dispatchCfg.cfg.dedupe_window_seconds) || 60);
      const dedupeBucket = reminder_window
        ? `rw:${reminder_window}`
        : String(Math.floor(Date.now() / 1000 / Math.max(dedupeWindow, 1)));

      const title = stripUnresolvedTemplateTokens(render(dispatchCfg.cfg.title_template, vars) || String(dispatchCfg.eventKey));
      const message = stripUnresolvedTemplateTokens(render(dispatchCfg.cfg.message_template, vars) || "");
      // Reviewer-supplied subject/body overrides take precedence when the
      // workflow action was confirmed through the Email Preview dialog.
      const subjectOverride = typeof vars.subject_override === "string" && vars.subject_override.length > 0 ? vars.subject_override : null;
      const bodyOverride = typeof vars.body_override === "string" && vars.body_override.length > 0 ? vars.body_override : null;
      const emailSubject = subjectOverride ?? stripUnresolvedTemplateTokens(render(dispatchCfg.cfg.email_subject_template, vars) || title);
      const emailBody = bodyOverride ?? stripUnresolvedTemplateTokens(render(dispatchCfg.cfg.email_body_template, vars) || message);
      const emailHtml = renderBrandedEmail({
        appName: String(vars.app_name || "Unified License Hub"),
        heading: emailSubject,
        paragraphs: emailBody ? emailBody.split(/\n{2,}/) : [],
        ctaUrl: typeof vars.cta_url === "string" ? vars.cta_url : "",
        ctaLabel: typeof vars.cta_label === "string" ? vars.cta_label : "Open Portal",
        supportEmail: typeof vars.support_email === "string" ? vars.support_email : "",
      });

      for (const userId of recipients) {
        for (const channel of channels) {
        const dedupeKey = [event_key, entity_type || "-", entity_id || "-", userId, channel, dedupeBucket].join("|");
        const { data: insertedRow, error: dedupeErr } = await admin
          .from("notification_dispatch_log")
          .insert({
            event_key: dispatchCfg.eventKey,
            entity_type: entity_type || null,
            entity_id: entity_id || null,
            recipient_user_id: userId.startsWith("email:") ? null : userId,
            channel,
            dedupe_key: dedupeKey,
            status: "pending",
            reminder_window: reminder_window || null,
            subject: channel === "email" ? emailSubject : title,
            payload: { vars, event_key: dispatchCfg.eventKey, entity_type, entity_id },
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
            if (userId.startsWith("email:")) {
              summary.skipped++;
              await admin
                .from("notification_dispatch_log")
                .update({ status: "skipped", error: "direct_email_in_app_unsupported", last_attempt_at: new Date().toISOString() })
                .eq("id", logId);
              continue;
            }
            const { error } = await admin.from("notifications").insert({
              user_id: userId,
              title,
              message,
              type: dispatchCfg.cfg.notification_type || "info",
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
            const email = userId.startsWith("email:")
              ? userId.slice("email:".length)
              : await resolveRecipientEmail(admin, userId);
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
              user_id: userId.startsWith("email:") ? null : userId,
              title: emailSubject,
              message: emailBody,
              type: dispatchCfg.cfg.notification_type || "info",
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
