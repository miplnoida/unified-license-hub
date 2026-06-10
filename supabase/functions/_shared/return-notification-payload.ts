import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

function coalesceText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function buildUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return "";
  return `${baseUrl.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function loadProfileLike(admin: SupabaseClient, userId?: string | null) {
  if (!userId) return { full_name: "", email: "" };
  const [{ data: profile }, { data: pre }] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, entity_name, licensee_id").eq("id", userId).maybeSingle(),
    admin.from("pre_license_users").select("id, full_name, email").eq("id", userId).maybeSingle(),
  ]);
  return {
    full_name: coalesceText(profile?.full_name, pre?.full_name),
    email: coalesceText(profile?.email, pre?.email),
    entity_name: coalesceText((profile as any)?.entity_name),
    licensee_id: (profile as any)?.licensee_id ?? null,
  };
}

async function loadStep(admin: SupabaseClient, stepId?: string | null) {
  if (!stepId) return null;
  const { data } = await admin
    .from("approval_steps")
    .select("id, name, step_order, workflow_id")
    .eq("id", stepId)
    .maybeSingle();
  return data || null;
}

export interface ReturnNotificationPayloadArgs {
  returnId: string;
  eventKey: string;
  payload?: Record<string, unknown>;
  actorId?: string | null;
}

export async function buildReturnNotificationPayload(
  admin: SupabaseClient,
  args: ReturnNotificationPayloadArgs,
): Promise<Record<string, unknown>> {
  const { returnId, eventKey, payload = {}, actorId } = args;

  const { data: ret } = await admin
    .from("returns_filed")
    .select("id, unique_id, entity_id, on_behalf_of_licensee_id, return_configuration_id, sector_id, subsector_id, return_year, return_period, workflow_status, submit_date, due_date, created_by, updated_by, workflow_id, current_step_id")
    .eq("id", returnId)
    .maybeSingle();
  if (!ret) return { ...payload, return_id: returnId };

  const [returnConfigRes, licenseeRes, siteRow, actorRes, submitterRes, currentStep, nextStep, requestRes, sectorRes] = await Promise.all([
    ret.return_configuration_id
      ? admin.from("return_configs").select("id, name, return_type_id").eq("id", ret.return_configuration_id).maybeSingle()
      : Promise.resolve({ data: null }),
    (ret.on_behalf_of_licensee_id || ret.entity_id)
      ? admin.from("licensees").select("id, name, sector_id").eq("id", ret.on_behalf_of_licensee_id || ret.entity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("site_settings").select("value").eq("key", "site_config").maybeSingle(),
    loadProfileLike(admin, String(actorId || payload.actor_id || ret.updated_by || "") || null),
    loadProfileLike(admin, String(payload.submitted_by || ret.created_by || "") || null),
    loadStep(admin, String(payload.step_id || payload.current_step_id || ret.current_step_id || "") || null),
    loadStep(admin, String(payload.new_step_id || "") || null),
    admin.from("return_requests").select("reasons, status, created_at").eq("return_id", returnId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ret.sector_id ? admin.from("sectors").select("id, name, regulator_id").eq("id", ret.sector_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const returnTypeId = (returnConfigRes.data as any)?.return_type_id || payload.return_type_id || null;
  const returnTypeRes = returnTypeId
    ? await admin.from("return_types").select("id, name").eq("id", String(returnTypeId)).maybeSingle()
    : { data: null };

  const siteConfig = (siteRow.data?.value || {}) as Record<string, unknown>;
  const portalUrl = coalesceText(
    payload.portal_url,
    siteConfig.app_base_url,
    Deno.env.get("APP_BASE_URL"),
  );
  const companyName = coalesceText(payload.company_name, siteConfig.app_name, Deno.env.get("APP_NAME"), "Unified License Hub");
  const supportEmail = coalesceText(payload.support_email, siteConfig.support_email);
  const returnDetailUrl = buildUrl(portalUrl, `/entity/returns/${returnId}/view`);
  const returnEditUrl = buildUrl(portalUrl, `/entity/returns/${returnId}/edit`);
  const returnReviewUrl = buildUrl(portalUrl, `/admin/returns/queue/${returnId}`);

  const isLicenseeFacing = [
    "return.submitted.confirmation",
    "return.resubmitted.confirmation",
    "return.edit_requested",
    "return.approved",
    "return.rejected",
    "return.send_back",
    "return.comment_added",
  ].includes(eventKey);

  const ctaUrl = coalesceText(
    payload.cta_url,
    eventKey === "return.edit_requested" ? returnEditUrl :
      (eventKey === "return.submitted" || eventKey === "return.resubmitted" || eventKey === "return.approved_step"
        ? returnReviewUrl
        : returnDetailUrl),
  );
  const ctaLabel = coalesceText(
    payload.cta_label,
    eventKey === "return.edit_requested" ? "Edit Return" :
      eventKey === "return.approved" ? "View Approved Return" :
      eventKey === "return.submitted" || eventKey === "return.resubmitted" || eventKey === "return.approved_step" ? "Review Return" :
      "View Return",
  );

  return {
    ...payload,
    app_name: companyName,
    company_name: companyName,
    support_email: supportEmail,
    portal_url: portalUrl,
    return_detail_url: returnDetailUrl,
    return_edit_url: returnEditUrl,
    return_review_url: returnReviewUrl,
    cta_url: ctaUrl,
    cta_label: ctaLabel,
    return_id: ret.id,
    return_unique_id: coalesceText(payload.return_unique_id, payload.unique_id, ret.unique_id),
    unique_id: coalesceText(payload.unique_id, ret.unique_id),
    return_name: coalesceText(payload.return_name, (returnConfigRes.data as any)?.name),
    return_type_name: coalesceText(payload.return_type_name, (returnTypeRes.data as any)?.name),
    return_period: coalesceText(payload.return_period, ret.return_period),
    return_year: payload.return_year ?? ret.return_year ?? "",
    return_status: coalesceText(payload.return_status, payload.new_status, ret.workflow_status),
    previous_status: coalesceText(payload.previous_status),
    new_status: coalesceText(payload.new_status, ret.workflow_status),
    entity_name: coalesceText(payload.entity_name, (licenseeRes.data as any)?.name, submitterRes.entity_name),
    licensee_name: coalesceText(payload.licensee_name, (licenseeRes.data as any)?.name),
    licensee_email: coalesceText(payload.licensee_email),
    submitted_by: coalesceText(payload.submitted_by, ret.created_by),
    submitted_by_name: coalesceText(payload.submitted_by_name, submitterRes.full_name, submitterRes.email, "Licensee"),
    submitted_by_email: coalesceText(payload.submitted_by_email, submitterRes.email),
    reviewer_name: coalesceText(payload.reviewer_name, actorRes.full_name, actorRes.email),
    reviewer_email: coalesceText(payload.reviewer_email, actorRes.email),
    actor_id: coalesceText(payload.actor_id, actorId),
    actor_name: coalesceText(payload.actor_name, actorRes.full_name, actorRes.email),
    actor_email: coalesceText(payload.actor_email, actorRes.email),
    action_comments: coalesceText(payload.action_comments, payload.comments, payload.reason),
    edit_reason: coalesceText(payload.edit_reason, payload.reason, requestRes.data?.reasons),
    workflow_step_name: coalesceText(payload.workflow_step_name, currentStep?.name),
    next_workflow_step_name: coalesceText(payload.next_workflow_step_name, nextStep?.name),
    submitted_at: coalesceText(payload.submitted_at, ret.submit_date),
    resubmitted_at: coalesceText(payload.resubmitted_at),
    approved_at: coalesceText(payload.approved_at, payload.validated_at),
    rejected_at: coalesceText(payload.rejected_at),
    sector_id: payload.sector_id ?? ret.sector_id ?? null,
    subsector_id: payload.subsector_id ?? ret.subsector_id ?? null,
    return_type_id: returnTypeId,
    regulator_id: payload.regulator_id ?? (sectorRes.data as any)?.regulator_id ?? null,
    licensee_id: payload.licensee_id ?? ret.on_behalf_of_licensee_id ?? ret.entity_id ?? null,
  };
}
