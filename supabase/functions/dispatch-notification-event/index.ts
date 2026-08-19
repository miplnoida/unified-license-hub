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
import { loadEmailBranding, detailsFromVars } from "../_shared/email-branding.ts";
import { buildReturnNotificationPayload } from "../_shared/return-notification-payload.ts";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";
import { SMS_UNAVAILABLE_REASON } from "../_shared/smsProvider.ts";
import {
  dynamicApproverRoleIds,
  hasExplicitSpecificApprovers,
  specificApproverUserIds,
  type WorkflowRecipientStep,
} from "./workflow-recipient-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Rule = { type: string; [k: string]: any };

// Severity / category / module classification — mirrors the SQL helpers
// public.notification_severity_for / notification_category_for / notification_module_for
export function classifySeverity(eventKey: string, type?: string | null): string {
  const k = eventKey || "";
  if (/(breach|revoked|suspended|failed|failure|critical|enforcement|system_health)/i.test(k)) return "critical";
  if (/(escalat|overdue|rejected|adverse|warning|expiring|near_due|sla)/i.test(k)) return "high";
  if (/(rfi|approval|assigned|submitted|resubmit|payment|due|reminder|comment|appeal)/i.test(k)) return "medium";
  if (type === "error") return "critical";
  if (type === "warning") return "high";
  if (type === "success") return "low";
  return "medium";
}

export function classifyCategory(eventKey: string, type?: string | null): string {
  const k = eventKey || "";
  if (/(rfi|approval|assigned|action_required|due|payment_required|resubmission|vote|acknowledg)/i.test(k)) return "action_required";
  if (/(breach|escalat|overdue|alert|warning|expiring|near_due|sla|threshold|pattern)/i.test(k)) return "alert";
  if (/(system|integration|scheduler|form_version|maintenance)/i.test(k)) return "system";
  if (type === "error") return "alert";
  return "info";
}

export function classifyModule(eventKey: string, entityType?: string | null): string {
  const s = `${eventKey || ""}${entityType || ""}`;
  if (/(licen|registration|appeal)/i.test(s)) return "licensing";
  if (/(application|form|payment)/i.test(s)) return "applications";
  if (/(fp_|fit_and_proper|fitandproper)/i.test(s)) return "fit_and_proper";
  if (/(prudential|return|ratio|threshold)/i.test(s)) return "prudential";
  if (/(complaint|conduct)/i.test(s)) return "conduct";
  if (/(enforcement|inspection)/i.test(s)) return "enforcement";
  if (/(report)/i.test(s)) return "reporting";
  if (/(correspondence|thread|message)/i.test(s)) return "communications";
  return "system";
}

// Short preview stored alongside the full message (NOT-CEN-001).
export function buildPreview(message: string | null | undefined, limit = 160): string {
  const flat = String(message || "").replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

// Safe deep-link metadata. Only a route hint is stored — the destination route
// keeps enforcing its own RBAC/RLS, so this never grants access by itself.
/**
 * Local mirror of public.notification_source_route. The database function is the
 * canonical resolver (see `resolveSourceRoute`); this map is only used when the
 * RPC is unavailable so a dispatch is never blocked by a link lookup.
 */
export function buildSourceRoute(entityType?: string | null, entityId?: string | null): string | null {
  if (!entityType || !entityId) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(entityId)) return null;
  const map: Record<string, string> = {
    application: `/applications/${entityId}`,
    applications: `/applications/${entityId}`,
    registration: `/admin/registrations/${entityId}`,
    license: `/licenses/${entityId}`,
    licensee: `/admin/licensees/${entityId}`,
    license_appeal: `/admin/license-appeals?appeal=${entityId}`,
    return: `/returns-mgmt/${entityId}`,
    return_filed: `/returns-mgmt/${entityId}`,
    returns_filed: `/returns-mgmt/${entityId}`,
    compliance_return: `/compliance/${entityId}`,
    complaint: `/complaints/${entityId}`,
    correspondence: `/correspondence/manager?thread=${entityId}`,
    correspondence_thread: `/correspondence/manager?thread=${entityId}`,
    escalation: `/escalations?escalation=${entityId}`,
    fp_individual: `/fpa/individuals/${entityId}`,
    fp_assessment: `/fpa/assessments/${entityId}`,
    fp_finding: `/fpa/findings/${entityId}`,
    fp_condition: `/fpa/entity/condition/${entityId}`,
    fp_appeal: `/fpa/entity/appeal/${entityId}`,
    fp_monitoring_event: `/fpa/entity/monitoring_event/${entityId}`,
    fp_determination: `/fpa/entity/determination/${entityId}`,
    prudential_assessment: `/prudential/assessments/${entityId}`,
    enforcement_action: `/enforcement/${entityId}`,
    inspection: `/inspections/${entityId}`,
    payment: `/payments/${entityId}`,
    report: `/reports/${entityId}`,
    form_template: `/admin/forms/${entityId}`,
  };
  return map[entityType.toLowerCase()] ?? null;
}

/** Canonical route resolution: the database function decides, the map is fallback. */
export async function resolveSourceRoute(
  admin: SupabaseClient,
  entityType?: string | null,
  entityId?: string | null,
): Promise<string | null> {
  if (!entityType || !entityId) return null;
  try {
    const { data, error } = await admin.rpc("notification_source_route", {
      _entity_type: entityType,
      _entity_id: entityId,
    });
    if (error) throw error;
    if (typeof data === "string" && data.length > 0) return data;
    if (data === null) return null;
  } catch (e: any) {
    console.error("notification_source_route failed (using local mirror)", e?.message || e);
    return buildSourceRoute(entityType, entityId);
  }
  return null;
}

/** Tokens present in the wording but absent from the render payload. */
export function unresolvedTokens(tpl: string | null | undefined, vars: Record<string, any>): string[] {
  if (!tpl) return [];
  const found = new Set<string>();
  for (const m of tpl.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const key = m[1];
    const v = vars[key];
    if (v === undefined || v === null || String(v) === "") found.add(key);
  }
  return [...found];
}


type EffectivePreference = {
  in_app: boolean;
  email: boolean;
  sms: boolean;
  digest: string;
  muted: boolean;
  severity: string;
  system_required: boolean;
};

// Resolves per-event preferences through the DB resolver, which already enforces
// the mandatory-notification guarantees (critical always in-app, critical/high
// immediate, system-required cannot be disabled).
async function effectivePreference(
  admin: SupabaseClient,
  userId: string,
  eventKey: string,
): Promise<EffectivePreference | null> {
  try {
    const { data, error } = await admin.rpc("notification_effective_preference", {
      _user_id: userId,
      _event_key: eventKey,
    });
    if (error) throw error;
    return (data || null) as EffectivePreference | null;
  } catch (e: any) {
    console.error("effectivePreference failed (fail-open)", eventKey, e?.message || e);
    return null;
  }
}

export function channelAllowed(pref: EffectivePreference | null, channel: string): boolean {
  if (!pref) return true; // fail open: never silently drop regulatory notifications
  if (pref.muted && pref.severity === "low" && !pref.system_required) return false;
  if (channel === "in_app") return pref.in_app !== false;
  if (channel === "email") return pref.email !== false;
  if (channel === "sms") return pref.sms === true;
  return true;
}


/**
 * Renders a stored notification template.
 *
 * Beyond simple `{{token}}` substitution this also normalises markup that
 * historically leaked into delivered emails:
 *   - literal `\n` / `\t` escape text stored in the template body,
 *   - Mustache-style conditional sections `{{#key}}…{{/key}}` (and inverted
 *     `{{^key}}…{{/key}}`), which are resolved on truthiness of the variable.
 */
export function render(tpl: string | null | undefined, vars: Record<string, any>): string {
  if (!tpl) return "";
  const truthy = (k: string) => {
    const v = vars[k];
    return !(v === undefined || v === null || v === false || v === "" || (Array.isArray(v) && v.length === 0));
  };

  let out = String(tpl)
    // literal escape sequences stored as text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ");

  // Resolve conditional sections (repeat to support nesting).
  for (let pass = 0; pass < 5; pass++) {
    const before = out;
    out = out.replace(
      /\{\{\s*([#^])\s*([\w.]+)\s*\}\}([\s\S]*?)\{\{\s*\/\s*\2\s*\}\}/g,
      (_m, kind, key, body) => {
        const keep = kind === "#" ? truthy(key) : !truthy(key);
        return keep ? body : "";
      },
    );
    if (out === before) break;
  }
  // Drop any stray section tags left behind by malformed templates.
  out = out.replace(/\{\{\s*[#^/]\s*[\w.]+\s*\}\}/g, "");

  return out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => {
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
    // FRD recipient vocabulary now selectable in the workflow designer.
    case "assigned_officer":
      return [{ type: "assigned_officer" }];
    case "next_step_role": {
      const role = typeof cfg.role === "string" ? cfg.role : typeof cfg.role_name === "string" ? cfg.role_name : "";
      return [{ type: "next_step_role", ...(role ? { role } : {}) } as Rule];
    }
    case "supervisor":
      return [{ type: "supervisor" }];
    case "named_user": {
      const userId = typeof cfg.user_id === "string" ? cfg.user_id : "";
      return userId ? [{ type: "named_user", user_id: userId } as Rule] : [];
    }
    case "entity_primary_users":
      return [{ type: "entity_primary_users" }];
    case "entity_secondary_users":
      return [{ type: "entity_secondary_users" }];
    case "regulator_team": {
      const regulatorId = typeof cfg.regulator_id === "string" ? cfg.regulator_id : "";
      return [{ type: "regulator_team", ...(regulatorId ? { regulator_id: regulatorId } : {}) } as Rule];
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
    .select("approver_type, approver_config, approver_role, approver_role_id")
    .eq("id", stepId)
    .maybeSingle();
  if (!step) return [];
  const out = new Set<string>();

  const configuredUsers = specificApproverUserIds(step as WorkflowRecipientStep);
  if (configuredUsers.length > 0) return configuredUsers;

  if (step.approver_type === "specific_users") return [];

  const dynamicRoleIds = dynamicApproverRoleIds(step as WorkflowRecipientStep);
  for (const roleId of dynamicRoleIds) {
    const { data: udr } = await admin
      .from("user_dynamic_roles")
      .select("user_id")
      .eq("role_id", roleId);
    (udr || []).forEach((u: any) => u.user_id && out.add(u.user_id));
  }

  if (dynamicRoleIds.length === 0 && step.approver_role) {
    const r = await recipientsForRole(admin, String(step.approver_role));
    r.forEach((u) => out.add(u));
  }
  return Array.from(out);
}

async function workflowStepUsesSpecificApprovers(
  admin: SupabaseClient,
  stepId: string | null | undefined,
): Promise<boolean> {
  if (!stepId) return false;
  const { data: step } = await admin
    .from("approval_steps")
    .select("approver_type, approver_config")
    .eq("id", stepId)
    .maybeSingle();
  return hasExplicitSpecificApprovers((step as WorkflowRecipientStep | null) ?? null);
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

/** FRD recipient rule: the officer a record is currently assigned to. */
async function assignedOfficer(
  ctx: { payload: Record<string, any>; app?: any; entity_type?: string; entity_id?: string },
): Promise<string[]> {
  const candidate = ctx.payload?.assigned_officer_id
    || ctx.payload?.assigned_to
    || ctx.payload?.assigned_user_id
    || ctx.app?.assigned_to;
  return candidate ? [String(candidate)] : [];
}

/** FRD recipient rule: approvers of the role that owns the NEXT workflow step. */
async function nextStepRoleRecipients(
  admin: SupabaseClient,
  rule: Rule,
  ctx: { payload: Record<string, any> },
): Promise<string[]> {
  const stepId = ctx.payload?.new_step_id || ctx.payload?.next_step_id;
  if (stepId) {
    const approvers = await workflowStepApprovers(admin, String(stepId));
    if (approvers.length > 0) return approvers;
  }
  if (rule.role) return await recipientsForRole(admin, String(rule.role));
  return [];
}

/** FRD recipient rule: supervisory staff (app_role = supervisor). */
async function supervisorRecipients(admin: SupabaseClient): Promise<string[]> {
  return await recipientsForRole(admin, "supervisor");
}

/** FRD recipient rule: every internal user attached to a regulator division. */
async function regulatorTeam(
  admin: SupabaseClient,
  regulatorId: string | null | undefined,
): Promise<string[]> {
  if (!regulatorId) return [];
  const { data } = await admin.from("profiles").select("id").eq("regulator_id", regulatorId);
  return (data || []).map((r: any) => r.id).filter(Boolean);
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
          const currentStepId = ctx.payload?.step_id || ctx.app?.current_step_id;
          if (await workflowStepUsesSpecificApprovers(admin, currentStepId)) break;
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
        case "assigned_officer": {
          (await assignedOfficer(ctx as any)).forEach((u) => out.add(u));
          break;
        }
        case "next_step_role": {
          (await nextStepRoleRecipients(admin, rule, ctx as any)).forEach((u) => out.add(u));
          break;
        }
        case "supervisor": {
          (await supervisorRecipients(admin)).forEach((u) => out.add(u));
          break;
        }
        case "named_user": {
          if (rule.user_id) out.add(String(rule.user_id));
          break;
        }
        case "regulator_team": {
          const rid = rule.regulator_id
            || ctx.payload?.regulator_id
            || ctx.app?.regulator_id;
          (await regulatorTeam(admin, rid)).forEach((u) => out.add(u));
          break;
        }
        case "custom_email": {
          const email = typeof rule.email === "string" ? rule.email.trim().toLowerCase() : "";
          if (email) out.add(`email:${email}`);
          break;
        }
        case "thread_participants": {
          const threadId = ctx.payload?.thread_id
            || (ctx.entity_type === "correspondence_thread" ? ctx.entity_id : null);
          if (threadId) {
            const scope = typeof rule.scope === "string" ? rule.scope : "all";
            let q = admin
              .from("correspondence_thread_participants")
              .select("user_id, is_internal")
              .eq("thread_id", String(threadId))
              .not("user_id", "is", null);
            if (scope === "internal") q = q.eq("is_internal", true);
            if (scope === "external") q = q.eq("is_internal", false);
            const { data } = await q;
            (data || []).forEach((r: any) => r.user_id && out.add(String(r.user_id)));
          }
          break;
        }
        case "thread_assigned_officer": {
          const threadId = ctx.payload?.thread_id
            || (ctx.entity_type === "correspondence_thread" ? ctx.entity_id : null);
          if (ctx.payload?.assigned_officer_id) out.add(String(ctx.payload.assigned_officer_id));
          else if (threadId) {
            const { data } = await admin
              .from("correspondence_threads")
              .select("assigned_officer_id")
              .eq("id", String(threadId))
              .maybeSingle();
            if (data?.assigned_officer_id) out.add(String(data.assigned_officer_id));
          }
          break;
        }
        case "record_assignee": {
          // Generic assignee resolver for conduct / complaint style records.
          // Reads well-known payload keys first, then falls back to an
          // allow-listed table lookup keyed off the dispatch entity.
          const payloadKeys = [
            "assigned_to", "assigned_investigator", "investigator_id",
            "assigned_officer_id", "assignee_id", "owner_id",
          ];
          let found = false;
          for (const key of payloadKeys) {
            const v = ctx.payload?.[key];
            if (v) { out.add(String(v)); found = true; }
          }
          if (!found && ctx.entity_id) {
            const lookup: Record<string, { table: string; column: string }> = {
              conduct_alert: { table: "conduct_alerts", column: "assigned_to" },
              conduct_investigation: { table: "conduct_investigations", column: "assigned_investigator" },
              conduct_action: { table: "conduct_actions", column: "assigned_to" },
              complaint: { table: "complaints", column: "investigator_id" },
              correspondence_thread: { table: "correspondence_threads", column: "assigned_officer_id" },
            };
            const target = lookup[String(ctx.entity_type || "")];
            if (target) {
              const { data } = await admin
                .from(target.table)
                .select(target.column)
                .eq("id", String(ctx.entity_id))
                .maybeSingle();
              const v = (data as any)?.[target.column];
              if (v) out.add(String(v));
            }
          }
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

  // Accept either a worker/cron invocation (service key or worker token) OR a
  // signed-in user session — the client fires business events (submissions,
  // payments, screening, appeals) through this dispatcher with its user JWT.
  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) {
    const authHeader = req.headers.get("Authorization") || "";
    let authorizedUser = false;
    if (authHeader.startsWith("Bearer ")) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data, error } = await userClient.auth.getUser();
        authorizedUser = !error && !!data?.user?.id;
      } catch {
        authorizedUser = false;
      }
    }
    if (!authorizedUser) return __workerGate.response;
  }

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

    // Channel -> template bindings configured in the Notification Event admin screen.
    // The published template snapshot wins over the event config's inline templates,
    // and the resolved (template_id, template_version) is stamped on every audit row
    // so historical notifications keep the exact wording that was dispatched.
    type ChannelTemplate = {
      template_id: string;
      template_version: number | null;
      subject: string | null;
      body: string | null;
      /** Tokens the template declares as required; drives placeholder integrity. */
      variables: string[];
    };
    const channelTemplates = new Map<string, ChannelTemplate>();
    try {
      const { data: bindings } = await admin
        .from("notification_event_channel_templates")
        .select("channel, template_id, template_version")
        .eq("event_config_id", (cfg as any).id);
      for (const b of bindings || []) {
        const version = b.template_version ?? null;
        let snapshot: any = null;
        if (version != null) {
          const { data: v } = await admin
            .from("notification_template_versions")
            .select("subject, body, version, variables")
            .eq("template_id", b.template_id)
            .eq("version", version)
            .maybeSingle();
          snapshot = v;
        }
        if (!snapshot) {
          const { data: v } = await admin
            .from("notification_template_versions")
            .select("subject, body, version, variables")
            .eq("template_id", b.template_id)
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle();
          snapshot = v;
        }
        if (!snapshot) {
          const { data: t } = await admin
            .from("notification_templates")
            .select("subject, body, published_version, status, variables")
            .eq("id", b.template_id)
            .maybeSingle();
          if (t && t.status === "active") {
            snapshot = { subject: t.subject, body: t.body, version: t.published_version, variables: t.variables };
          }
        }
        if (snapshot) {
          channelTemplates.set(String(b.channel), {
            template_id: String(b.template_id),
            template_version: snapshot.version ?? null,
            subject: snapshot.subject ?? null,
            body: snapshot.body ?? null,
            variables: Array.isArray(snapshot.variables) ? snapshot.variables.map(String) : [],
          });
        }
      }

    } catch (bindErr: any) {
      console.error("channel template binding lookup failed", bindErr?.message || bindErr);
    }

    const deliveryFrequency = String((cfg as any).delivery_frequency || "immediate");
    const failureEscalation = (cfg as any).failure_escalation && typeof (cfg as any).failure_escalation === "object"
      ? (cfg as any).failure_escalation as Record<string, any>
      : {};



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
        const { data: stepRows, error: stepErr } = await admin
          .from("approval_steps")
          .select("id, name, step_order, workflow_id")
          .in("id", Array.from(stepIdsToLoad));
        if (stepErr) console.error("step lookup error:", stepErr.message);
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
          vars.step_order = vars.step_order ?? cur.step_order ?? "";
          vars.step_level = vars.step_level ?? cur.step_order ?? "";
          if (cur.workflow_id) vars.workflow_name = vars.workflow_name || wfMap.get(String(cur.workflow_id)) || "";
        }
        const nxt = nextStepId && nextStepId !== currentStepId ? stepMap.get(nextStepId) : null;
        if (nxt) {
          vars.next_step_name = vars.next_step_name || nxt.name || "";
          vars.next_step_order = vars.next_step_order ?? nxt.step_order ?? "";
        }
        const prv = prevStepId ? stepMap.get(prevStepId) : null;
        if (prv) {
          vars.previous_step_name = vars.previous_step_name || prv.name || "";
          vars.previous_step_order = vars.previous_step_order ?? prv.step_order ?? "";
        }
      }
    } catch (stepLookupErr) {
      console.error("step/workflow name lookup failed:", (stepLookupErr as any)?.message || stepLookupErr);
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

      const inAppTpl = channelTemplates.get("in_app");
      const emailTpl = channelTemplates.get("email");
      const smsTpl = channelTemplates.get("sms");
      const title = stripUnresolvedTemplateTokens(
        render(inAppTpl?.subject || dispatchCfg.cfg.title_template, vars) || String(dispatchCfg.eventKey),
      );
      const message = stripUnresolvedTemplateTokens(
        render(inAppTpl?.body || dispatchCfg.cfg.message_template, vars) || "",
      );
      // Reviewer-supplied subject/body overrides take precedence when the
      // workflow action was confirmed through the Email Preview dialog.
      const subjectOverride = typeof vars.subject_override === "string" && vars.subject_override.length > 0
        ? stripUnresolvedTemplateTokens(render(vars.subject_override, vars))
        : null;
      const bodyOverride = typeof vars.body_override === "string" && vars.body_override.length > 0
        ? stripUnresolvedTemplateTokens(render(vars.body_override, vars))
        : null;
      const emailSubject = subjectOverride
        ?? stripUnresolvedTemplateTokens(render(emailTpl?.subject || dispatchCfg.cfg.email_subject_template, vars) || title);
      const emailBody = bodyOverride
        ?? stripUnresolvedTemplateTokens(render(emailTpl?.body || dispatchCfg.cfg.email_body_template, vars) || message);
      const templateForChannel = (channel: string): ChannelTemplate | undefined =>
        channel === "email" ? emailTpl : channel === "sms" ? smsTpl : inAppTpl;
      const templateIdFor = (channel: string): string | null =>
        templateForChannel(channel)?.template_id
        ?? (typeof dispatchCfg.cfg.template_id === "string" ? dispatchCfg.cfg.template_id : null);
      const templateVersionFor = (channel: string): number | null =>
        templateForChannel(channel)?.template_version ?? null;
      // FRD: every audit row must state whether a published template was used or
      // whether the built-in emergency wording had to be substituted.
      const usedFallbackFor = (channel: string): boolean => !templateForChannel(channel);
      const emailBranding = await loadEmailBranding(admin);
      const emailHtml = renderBrandedEmail({
        appName: String(vars.app_name || emailBranding.appName),
        logoUrl: emailBranding.logoUrl,
        tagline: emailBranding.tagline,
        brandColor: emailBranding.brandColor,
        heading: emailSubject,
        paragraphs: emailBody ? emailBody.split(/\n{2,}/) : [],
        details: detailsFromVars(vars as Record<string, unknown>),
        ctaUrl: typeof vars.cta_url === "string" ? vars.cta_url : "",
        ctaLabel: typeof vars.cta_label === "string" ? vars.cta_label : "Open Portal",
        supportEmail: typeof vars.support_email === "string" && vars.support_email ? vars.support_email : emailBranding.supportEmail,
        supportPhone: emailBranding.supportPhone,
        footerText: emailBranding.footerText || undefined,
      });

      const severity = classifySeverity(event_key, dispatchCfg.cfg.notification_type);
      const category = classifyCategory(event_key, dispatchCfg.cfg.notification_type);
      const module = classifyModule(event_key, entity_type);
      const sourceReference = [vars.application_number, vars.registration_reference, vars.unique_id, vars.reference, vars.complaint_reference]
        .find((v) => typeof v === "string" && v.length > 0) as string | undefined;
      const sourceRoute = await resolveSourceRoute(admin, entity_type, entity_id);
      // Placeholder integrity: a published template that references a token the
      // payload does not carry must fail loudly (retryable) rather than silently
      // rendering an incomplete regulatory message.
      const missingTokensFor = (channel: string): string[] => {
        const tpl = channel === "email" ? emailTpl : channel === "sms" ? smsTpl : inAppTpl;
        if (!tpl || tpl.variables.length === 0) return [];
        const missing = new Set([
          ...unresolvedTokens(tpl.subject, vars),
          ...unresolvedTokens(tpl.body, vars),
        ]);
        // Only tokens the template declares are treated as required; system tokens
        // (cta_url, support_email, …) stay optional and are stripped as before.
        return [...missing].filter((t) => tpl.variables.includes(t));
      };



      for (const userId of recipients) {
        const isDirectEmail = userId.startsWith("email:");
        const pref = isDirectEmail ? null : await effectivePreference(admin, userId, dispatchCfg.eventKey);
        for (const channel of channels) {
        const dedupeKey = [event_key, entity_type || "-", entity_id || "-", userId, channel, dedupeBucket].join("|");
        const { data: insertedRow, error: dedupeErr } = await admin
          .from("notification_dispatch_log")
          .insert({
            event_key: dispatchCfg.eventKey,
            entity_type: entity_type || null,
            entity_id: entity_id || null,
            recipient_user_id: isDirectEmail ? null : userId,
            channel,
            dedupe_key: dedupeKey,
            status: "queued",
            queued_at: new Date().toISOString(),
            provider: channel === "email" ? "smtp" : "in_app",
            reminder_window: reminder_window || null,
            subject: channel === "email" ? emailSubject : title,
            rendered_content: channel === "email" ? emailBody : message,
            template_id: templateIdFor(channel),
            template_version: templateVersionFor(channel),
            used_fallback_template: usedFallbackFor(channel),
            payload: {
              vars,
              event_key: dispatchCfg.eventKey,
              entity_type,
              entity_id,
              delivery_frequency: deliveryFrequency,
              failure_escalation: failureEscalation,
            },
          })
          .select("id")
          .maybeSingle();
        if (dedupeErr) {
          summary.skipped++;
          continue;
        }
        const logId = insertedRow?.id;

        // Placeholder integrity gate: fail safe and retryable, naming the tokens.
        const missingTokens = missingTokensFor(channel);
        if (missingTokens.length > 0) {
          summary.skipped++;
          console.error("unresolved_required_placeholder", dispatchCfg.eventKey, channel, missingTokens);
          await admin
            .from("notification_dispatch_log")
            .update({
              status: "failed",
              error: `unresolved_required_placeholder: ${missingTokens.join(",")}`,
              error_details: {
                reason: "unresolved_required_placeholder",
                channel,
                missing_tokens: missingTokens,
              },
              attempts: 1,
              retry_count: 0,
              failed_at: new Date().toISOString(),
              last_attempt_at: new Date().toISOString(),
              next_attempt_at: new Date(Date.now() + 15 * 60_000).toISOString(),
            })
            .eq("id", logId);
          continue;
        }

        // Preference gate — mandatory notifications are already forced on by the resolver.

        if (!channelAllowed(pref, channel)) {
          summary.skipped++;
          await admin
            .from("notification_dispatch_log")
            .update({
              status: "skipped",
              error: "recipient_preference_opted_out",
              error_details: { reason: "recipient_preference_opted_out", channel, preference: pref },
              last_attempt_at: new Date().toISOString(),
            })
            .eq("id", logId);
          continue;
        }

        // Delivery frequency rule from the event configuration. Non-immediate
        // frequencies hand the email off to the hourly/daily digest worker; the
        // in-app record is still written so the inbox stays current. Critical and
        // high severity events are always immediate (regulatory requirement).
        if (
          channel === "email"
          && deliveryFrequency !== "immediate"
          && severity !== "critical"
          && severity !== "high"
        ) {
          summary.skipped++;
          await admin
            .from("notification_dispatch_log")
            .update({
              status: "skipped",
              error: "deferred_to_digest",
              error_details: { reason: "deferred_to_digest", frequency: deliveryFrequency, channel },
              last_attempt_at: new Date().toISOString(),
            })
            .eq("id", logId);
          continue;
        }


        try {
          if (channel === "in_app") {
            if (isDirectEmail) {
              summary.skipped++;
              await admin
                .from("notification_dispatch_log")
                .update({ status: "skipped", error: "direct_email_in_app_unsupported", last_attempt_at: new Date().toISOString() })
                .eq("id", logId);
              continue;
            }
            const { data: createdRow, error } = await admin.from("notifications").insert({
              user_id: userId,
              title,
              message,
              preview: buildPreview(message),
              type: dispatchCfg.cfg.notification_type || "info",
              entity_type: entity_type || null,
              entity_id: entity_id || null,
              source_reference: sourceReference || null,
              source_route: sourceRoute,
              channel: "in_app",
              status: "unread",
              delivery_status: "delivered",
              event_key,
              dedupe_key: `${dedupeKey}|inapp`,
              severity,
              category,
              module,
              system_required: pref?.system_required === true,
              action_required: category === "action_required",
              template_id: templateIdFor("in_app"),
              template_version: templateVersionFor("in_app"),
              metadata: { event_key: dispatchCfg.eventKey, reminder_window: reminder_window || null },
            }).select("id").maybeSingle();
            if (error) throw error;
            await admin
              .from("notification_dispatch_log")
              .update({
                status: "delivered",
                notification_id: createdRow?.id || null,
                sent_at: new Date().toISOString(),
                delivered_at: new Date().toISOString(),
                last_attempt_at: new Date().toISOString(),
              })
              .eq("id", logId);
            if (createdRow?.id) {
              await admin.rpc("log_notification_audit", {
                _action: "NOTIFICATION_CREATED",
                _notification_ids: [createdRow.id],
                _metadata: { event_key: dispatchCfg.eventKey, channel: "in_app", severity, category },
              });
            }
            summary.sent++;
          } else if (channel === "email") {
            const email = isDirectEmail
              ? userId.slice("email:".length)
              : await resolveRecipientEmail(admin, userId);
            if (!email) {
              summary.skipped++;
              await admin
                .from("notification_dispatch_log")
                .update({ status: "skipped", error: "no_email", error_details: { reason: "no_email" }, last_attempt_at: new Date().toISOString() })
                .eq("id", logId);
              continue;
            }
            await admin
              .from("notification_dispatch_log")
              .update({ recipient_email: email, status: "processing" })
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
                .update({
                  status: "failed",
                  error: String(e?.message || e).slice(0, 500),
                  error_details: { message: String(e?.message || e).slice(0, 500), channel: "email" },
                  failed_at: new Date().toISOString(),
                  last_attempt_at: new Date().toISOString(),
                })
                .eq("id", logId);
              summary.failed++;
              continue;
            }
            // Mirror to in-app inbox so users see the email even if SMTP fails silently
            const { data: emailRow } = await admin.from("notifications").insert({
              user_id: isDirectEmail ? null : userId,
              title: emailSubject,
              message: emailBody,
              preview: buildPreview(emailBody),
              type: dispatchCfg.cfg.notification_type || "info",
              entity_type: entity_type || null,
              entity_id: entity_id || null,
              source_reference: sourceReference || null,
              source_route: sourceRoute,
              channel: "email",
              status: "unread",
              delivery_status: "queued",
              event_key,
              dedupe_key: `${dedupeKey}|email`,
              severity,
              category,
              module,
              system_required: pref?.system_required === true,
              template_id: templateIdFor("email"),
              template_version: templateVersionFor("email"),
              metadata: { event_key: dispatchCfg.eventKey, recipient_email: email },
            }).select("id").maybeSingle();
            if (emailRow?.id) {
              await admin.from("notification_dispatch_log").update({ notification_id: emailRow.id }).eq("id", logId);
              await admin.rpc("log_notification_audit", {
                _action: "NOTIFICATION_CREATED",
                _notification_ids: [emailRow.id],
                _metadata: { event_key: dispatchCfg.eventKey, channel: "email", severity, category },
              });
            }
            summary.sent++;
          } else if (channel === "sms") {
            // No SMS provider is configured for this deployment. Record the
            // attempt honestly as skipped rather than leaving a queued row that
            // would look like a pending or successful send.
            summary.skipped++;
            await admin
              .from("notification_dispatch_log")
              .update({
                status: "skipped",
                provider: "none",
                error: SMS_UNAVAILABLE_REASON,
                error_details: { reason: SMS_UNAVAILABLE_REASON, channel: "sms" },
                last_attempt_at: new Date().toISOString(),
              })
              .eq("id", logId);
            continue;
          } else {
            summary.skipped++;
            await admin
              .from("notification_dispatch_log")
              .update({
                status: "skipped",
                error: "unsupported_channel",
                error_details: { reason: "unsupported_channel", channel },
                last_attempt_at: new Date().toISOString(),
              })
              .eq("id", logId);
            continue;
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
