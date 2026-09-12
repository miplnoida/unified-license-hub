import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuthenticatedUser } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Applicants do not hold internal staff RBAC permissions. Authenticate the
  // caller here, then enforce submission authority against the application
  // through can_submit_application below and the governed submission RPC.
  const __authzGate = await requireAuthenticatedUser(req);
  if (!__authzGate.ok) return __authzGate.response;

  try {
    // Validate JWT from authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // User-scoped client for RLS-respecting RPC calls / function invokes.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const user = { id: __authzGate.userId, email: __authzGate.email };

    // Parse request body
    const { application_id, ack_text } = await req.json();
    if (!application_id) {
      return new Response(
        JSON.stringify({ error: "application_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client for privileged operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verify application exists and belongs to the user
    const { data: app, error: appErr } = await adminClient
      .from("applications")
      .select("id, applicant_id, status, license_type, data, regulator_id")
      .eq("id", application_id)
      .single();

    if (appErr || !app) {
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // F5-B2 / GAP-F5-02: submission authority is an entity capability, not
    // row ownership. The creator may submit; so may any APPROVED entity member
    // holding the `submit` capability for the application's entity. The
    // governed RPC re-checks this, so this is a fail-fast mirror only.
    const { data: maySubmit, error: authzErr } = await userClient.rpc(
      "can_submit_application" as never,
      { _application_id: application_id } as never,
    );

    if (authzErr || maySubmit !== true) {
      return new Response(
        JSON.stringify({
          error: "You are not authorised to submit this filing for this entity",
          code: "FORBIDDEN",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }


    const isResubmission = [
      "resubmission_requested",
      "resubmission_required",
      "query_raised",
      "returned_for_correction",
      "info_requested",
    ].includes(app.status);

    if (app.status !== "draft" && app.status !== "in_progress" && !isResubmission) {
      return new Response(
        JSON.stringify({
          error: `This application is ${app.status} and is not open for submission. Please start a new application.`,
          code: "APPLICATION_NOT_EDITABLE",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1a. LICENCE ENTITLEMENT + SERVICE COMPATIBILITY GATE (post-licence only).
    //     F5-B2 / GAP-F5-01 + GAP-F5-15: the licence is the only trusted input.
    //     Taxonomy stored on the row is never used for authorisation — the
    //     licence-bound predicates derive it server-side, and the service must
    //     be configured for that licence's scope. The governed RPC re-checks
    //     both, so a direct API call cannot bypass either.
    {
      const d = (app.data as Record<string, unknown> | null) || {};
      const isPostLicense = !!d.service_id || String(d.type || "") === "post_license";
      if (isPostLicense) {
        const licenseId = (d.license_id as string | undefined) ?? null;
        const serviceId = (d.service_id as string | undefined) ?? null;

        if (!licenseId) {
          return new Response(
            JSON.stringify({
              error: "This post-licence filing is not bound to a licence",
              code: "LICENSE_REQUIRED",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        if (serviceId) {
          const { data: compatible, error: compatErr } = await userClient.rpc(
            "service_license_compatible",
            { _service_id: serviceId, _license_id: licenseId },
          );
          if (compatErr || compatible !== true) {
            return new Response(
              JSON.stringify({
                error: "The selected service is not available for the scope of this licence",
                code: "SERVICE_LICENSE_INCOMPATIBLE",
              }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
        }

        const { data: allowed, error: entErr } = await userClient.rpc("can_act_on_specific_license", {
          _license_id: licenseId,
          _licensee_id: null,
          _sector_id: null,
          _sub_sector_id: null,
          _category_id: null,
        });
        if (entErr || allowed !== true) {
          return new Response(
            JSON.stringify({
              error:
                "This service is unavailable because the related licence is not currently approved, issued and in good standing.",
              code: "LICENSE_ENTITLEMENT_REQUIRED",
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }




    // 1b. Server-side duplicate-application & re-application guard
    //     (defense in depth — frontend + DB triggers also enforce).
    //     Match key: (applicant + sector + sub_sector + category).
    if (!isResubmission) {
      const appDataObj = (app.data as Record<string, unknown> | null) || {};
      const sectorId = appDataObj.sector_id as string | undefined;
      const subSectorId = appDataObj.sub_sector_id as string | undefined;
      const categoryId = appDataObj.category_id as string | undefined;
      // Renewal applications intentionally repeat the same sector/sub-sector/
      // category as the original license. Skip the duplicate-active /
      // duplicate-approved guards for valid renewal submissions.
      const isRenewal = appDataObj.is_renewal === true && !!appDataObj.renewal_of_license_id;

      const { data: setting } = await adminClient
        .from("site_settings")
        .select("value")
        .eq("key", "application_settings")
        .maybeSingle();
      const settingsObj = (setting?.value || {}) as {
        allow_reapplication?: boolean;
        allow_reapplication_after_final?: boolean;
      };
      // New single switch; fall back to the legacy `_after_final` key.
      const allowReapply =
        typeof settingsObj.allow_reapplication === "boolean"
          ? settingsObj.allow_reapplication
          : (typeof settingsObj.allow_reapplication_after_final === "boolean"
            ? settingsObj.allow_reapplication_after_final
            : true);

      if (!isRenewal && sectorId && subSectorId && categoryId) {
        const { data: peers } = await adminClient
          .from("applications")
          .select("id, status, data")
          .eq("applicant_id", app.applicant_id)
          .neq("id", application_id);

        const sameTriple = (peers || []).filter(
          (a: { data?: { sector_id?: string; sub_sector_id?: string; category_id?: string } | null }) =>
            a.data?.sector_id === sectorId &&
            a.data?.sub_sector_id === subSectorId &&
            a.data?.category_id === categoryId,
        );

        const peerIds = sameTriple.map((a) => a.id);
        const paymentSummaryByApp = new Map<string, { hasSuccessfulPayment: boolean; latestPaymentStatus: string | null }>();

        if (peerIds.length > 0) {
          const { data: peerPayments } = await adminClient
            .from("payments")
            .select("application_id, status, created_at")
            .in("application_id", peerIds)
            .order("created_at", { ascending: false });

          for (const payment of ((peerPayments || []) as Array<{ application_id: string; status: string | null }>)) {
            const existing = paymentSummaryByApp.get(payment.application_id) || {
              hasSuccessfulPayment: false,
              latestPaymentStatus: null,
            };
            const normalizedPaymentStatus = ((payment.status as string) || "").toLowerCase();
            if (!existing.latestPaymentStatus) {
              existing.latestPaymentStatus = normalizedPaymentStatus || null;
            }
            if (["completed", "success", "paid"].includes(normalizedPaymentStatus)) {
              existing.hasSuccessfulPayment = true;
            }
            paymentSummaryByApp.set(payment.application_id, existing);
          }
        }

        // When Allow Re-Application is ON, the user is explicitly permitted
        // to submit a parallel application for the same sector/sub-sector/
        // category — skip the duplicate-active check entirely. Only enforce
        // it when the admin setting is OFF.
        if (!allowReapply) {
          const ACTIVE = new Set([
            "submitted", "in_progress", "in_review", "pending_review",
            "under_review", "forwarded", "query_raised", "resubmission_requested", "resubmission_required", "returned_for_correction", "info_requested",
            "awaiting_approval",
          ]);

          const activeDupe = sameTriple.find((a) => {
            const normalizedStatus = ((a.status as string) || "").toLowerCase();
            const paymentSummary = paymentSummaryByApp.get(a.id);
            return ACTIVE.has(normalizedStatus) || (
              ["payment_pending", "awaiting_payment", "pending_payment"].includes(normalizedStatus)
              && !!paymentSummary?.hasSuccessfulPayment
            );
          });
          if (activeDupe) {
            return new Response(
              JSON.stringify({
                error: "You already have an active application for this sector, sub-sector, and service. You cannot submit another until it is finalised.",
                code: "DUPLICATE_ACTIVE_APPLICATION",
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }

        const pendingPay = sameTriple.find((a) => {
          const normalizedStatus = ((a.status as string) || "").toLowerCase();
          const paymentSummary = paymentSummaryByApp.get(a.id);
          if (paymentSummary?.hasSuccessfulPayment) return false;

          return ["payment_pending", "awaiting_payment", "pending_payment"].includes(normalizedStatus)
            || ["pending", "processing", "initiated"].includes(paymentSummary?.latestPaymentStatus || "");
        });
        if (pendingPay) {
          return new Response(
            JSON.stringify({
              error: "You have an application with pending payment for this sector, sub-sector, and service. Please complete payment first.",
              code: "PENDING_PAYMENT_APPLICATION",
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (!allowReapply) {
          const approvedDupe = sameTriple.find((a) => ((a.status as string) || "").toLowerCase() === "approved");
          if (approvedDupe) {
            return new Response(
              JSON.stringify({
                error: "You already have an Approved application for this sector, sub-sector, and service. Please use the renewal flow if available; a fresh application is not permitted.",
                code: "DUPLICATE_APPROVED_APPLICATION",
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          const rejectedDupe = sameTriple.find((a) => ((a.status as string) || "").toLowerCase() === "rejected");
          if (rejectedDupe) {
            return new Response(
              JSON.stringify({
                error: "Your previous application for this sector, sub-sector, and service was Rejected. Re-application is not allowed.",
                code: "DUPLICATE_REJECTED_APPLICATION",
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
    }

    // 2. Verify payment exists and is completed (accept both 'completed' and 'success' for legacy compatibility)
    const { data: payments, error: payErr } = await adminClient
      .from("payments")
      .select("id, status, amount")
      .eq("application_id", application_id)
      .in("status", ["completed", "success", "paid"])
      .limit(1);

    if (payErr || !payments || payments.length === 0) {
      return new Response(
        JSON.stringify({ error: "No completed payment found for this application. Please complete payment first." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Verify form responses exist (check both form_responses table AND inline forms_data)
    const appData = app.data as Record<string, unknown> | null;
    const formTemplateIds = (appData?.form_template_ids as string[]) || [];
    if (formTemplateIds.length > 0) {
      // Check inline forms_data (used by pre/post licensee flows)
      const formsData = (appData?.forms_data as Record<string, unknown>) || {};
      const inlineCount = Object.keys(formsData).filter(
        (k) => formsData[k] && typeof formsData[k] === "object" && Object.keys(formsData[k] as object).length > 0
      ).length;

      // Check form_responses table (used by other flows)
      const { count } = await adminClient
        .from("form_responses")
        .select("*", { count: "exact", head: true })
        .eq("entity_id", application_id)
        .eq("entity_type", "application");

      const totalSubmitted = Math.max(inlineCount, count || 0);

      if (totalSubmitted < formTemplateIds.length) {
        return new Response(
          JSON.stringify({ error: `Incomplete forms: ${totalSubmitted}/${formTemplateIds.length} submitted` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 4. Delegate every workflow-locked field write to the trusted RPC.
    //    The RPC sets app.workflow_mutation_context='trusted' so the
    //    prevent_direct_application_workflow_mutation trigger lets the
    //    status / submitted_at / workflow_id / current_step_id transitions
    //    through. The RPC also handles workflow attach/resume + audit +
    //    approval_actions + applicant notification atomically.
    //
    //    We invoke the RPC with the user's auth context so auth.uid() inside
    //    the function resolves to the applicant. SECURITY DEFINER on the
    //    function still re-checks ownership and status preconditions.
    const { data: rpcResult, error: rpcErr } = await userClient.rpc(
      "submit_application" as never,
      { _application_id: application_id, _ack_text: ack_text ?? null } as never,
    );

    if (rpcErr) {
      return new Response(
        JSON.stringify({ error: "Failed to submit application: " + rpcErr.message }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = (rpcResult ?? {}) as Record<string, unknown>;
    if (result.error) {
      const httpStatus = typeof result.http === "number" ? (result.http as number) : 200;
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: httpStatus, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2a. Reconcile pinned form requirements with the applicant's submitted
    //     form responses so the licensing readiness gate (`forms_documents`)
    //     reflects what was actually filed. Non-fatal: readiness stays
    //     fail-closed if this cannot run.
    try {
      await adminClient.rpc("application_reconcile_form_requirements" as never, {
        _application_id: application_id,
      } as never);
    } catch (_e) {
      // deliberately non-fatal
    }



    // 2b. Resubmission after an information request: flag still-open RFIs as
    //     responded so the reviewer queue and the paused SLA clock resume
    //     without manual reconciliation. Non-fatal.
    if (isResubmission) {
      try {
        const { data: openRfis } = await adminClient
          .from("application_rfis")
          .select("id, raised_at")
          .eq("application_id", application_id)
          .eq("status", "open")
          .order("raised_at", { ascending: true });

        await adminClient
          .from("application_rfis")
          .update({ status: "responded", updated_at: new Date().toISOString() })
          .eq("application_id", application_id)
          .eq("status", "open");

        // Reviewer signal: did the applicant actually change any form data
        // after the information request was raised?
        const earliestRaisedAt = (openRfis ?? [])[0]?.raised_at as string | undefined;
        if (earliestRaisedAt) {
          const { count } = await adminClient
            .from("audit_logs")
            .select("id", { count: "exact", head: true })
            .eq("entity_type", "application")
            .eq("entity_id", application_id)
            .in("action", ["application.form_data_updated", "application.draft_updated"])
            .gte("created_at", earliestRaisedAt);

          await adminClient.from("audit_logs").insert({
            action: "application.resubmitted.form_change_check",
            entity_type: "application",
            entity_id: application_id,
            user_id: user.id,
            new_value: {
              form_data_changed: (count ?? 0) > 0,
              rfi_raised_at: earliestRaisedAt,
              changes_recorded: count ?? 0,
            },
          });
        }
      } catch (rfiSyncError) {
        console.error("[verify-and-submit] failed to mark open RFIs responded", rfiSyncError);
      }
    }




    // Diagnostic (no PII / no form data): submission + workflow attach summary.
    console.log(
      "[verify-and-submit] submitted",
      JSON.stringify({
        application_id,
        license_type: app.license_type,
        workflow_id: result.workflow_id ?? null,
        first_step_id: result.first_step_id ?? null,
        workflow_attached: !!result.workflow_attached,
        is_resubmission: !!result.is_resubmission,
      }),
    );

    // Best-effort repair: if the RPC could not attach a workflow (e.g. the
    // resolver returned no match at submission time), try the repair helper.
    // This is fully non-blocking and never rolls back submission state.
    if (!result.workflow_attached) {
      try {
        const { data: repaired } = await adminClient.rpc(
          "repair_application_workflow" as never,
          { _application_id: application_id } as never,
        );
        console.log(
          "[verify-and-submit] post-submit repair result",
          JSON.stringify(repaired ?? null),
        );
      } catch (repairErr) {
        console.error(
          "[verify-and-submit] post-submit repair failed (non-fatal):",
          repairErr instanceof Error ? repairErr.message : repairErr,
        );
      }
    }

    // 4a2. Submission acknowledgement (FRD 6.1).
    //      Idempotent: one acknowledgement per (application, submitted_at), so
    //      retries/refreshes cannot create duplicates. Non-fatal for submission.
    try {
      const { error: ackErr } = await userClient.functions.invoke("application-acknowledgement", {
        body: { action: "ensure", application_id },
      });
      if (ackErr) {
        console.error("[acknowledgement] ensure failed (non-fatal):", ackErr.message);
      }
    } catch (ackEx) {
      console.error(
        "[acknowledgement] ensure threw (non-fatal):",
        ackEx instanceof Error ? ackEx.message : ackEx,
      );
    }

    // 4b. Advisory AI Analyst Assessment.
    //     Non-blocking for the applicant: failures are swallowed.
    //     Reliability pattern: insert a `pending` row synchronously so the
    //     analyst UI always sees an in-progress assessment, then dispatch the
    //     heavier AI generation via EdgeRuntime.waitUntil so the runtime keeps
    //     the background promise alive after the HTTP response is returned
    //     (plain fire-and-forget can be cancelled when the function exits).
    let assessmentId: string | null = null;
    try {
      const { data: seedRow, error: seedErr } = await adminClient
        .from("application_ai_assessments")
        .insert({
          application_id,
          status: "pending",
          prompt_version: "v1",
          model_provider: "lovable-ai-gateway",
          model_name: "google/gemini-2.5-flash",
        })
        .select("id")
        .single();
      if (seedErr) throw seedErr;
      assessmentId = (seedRow?.id as string) || null;
      console.log("[ai-assessment] pending row created id=", assessmentId);
    } catch (seedErr) {
      console.error(
        "[ai-assessment] pending row insert failed (non-fatal):",
        seedErr instanceof Error ? seedErr.message : seedErr,
      );
    }

    const dispatchAiAssessment = adminClient.functions
      .invoke("generate-application-ai-assessment", {
        body: { application_id, assessment_id: assessmentId },
      })
      .then(({ error }: { error: unknown }) => {
        if (error) {
          console.error(
            "[ai-assessment] generation returned error (non-fatal):",
            (error as { message?: string })?.message || error,
          );
        }
      })
      .catch((e: unknown) =>
        console.error(
          "[ai-assessment] dispatch failed (non-fatal):",
          (e as { message?: string })?.message || e,
        ),
      );

    try {
      // @ts-expect-error - EdgeRuntime is provided by Supabase Edge Functions runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
        // @ts-expect-error - EdgeRuntime is provided by Supabase Edge Functions runtime
        EdgeRuntime.waitUntil(dispatchAiAssessment);
      }
    } catch (waitErr) {
      console.error(
        "[ai-assessment] waitUntil unavailable (non-fatal):",
        waitErr instanceof Error ? waitErr.message : waitErr,
      );
    }


    // 5. Fire-and-forget notification dispatch.

    //    Two distinct event keys are used so applicant and reviewers get
    //    purpose-specific subjects, bodies, and CTA buttons. Template content
    //    lives entirely in notification_event_configs — nothing is hardcoded
    //    here beyond resolving display-friendly variables. Duplicate sends
    //    are blocked by notification_dispatch_log.dedupe_key (unique).
    try {
      const appData = (app.data as Record<string, unknown> | null) || {};
      const sectorId = appData.sector_id as string | undefined;
      const subSectorId = appData.sub_sector_id as string | undefined;
      const categoryId = appData.category_id as string | undefined;

      const [appRow, applicantProfile, applicantPre, sectorRow, subSectorRow, categoryRow, siteRow] = await Promise.all([
        adminClient.from("applications").select("application_number, submitted_at, current_step_id").eq("id", application_id).maybeSingle(),
        adminClient.from("profiles").select("email, full_name").eq("id", app.applicant_id).maybeSingle(),
        adminClient.from("pre_license_users").select("email, full_name").eq("id", app.applicant_id).maybeSingle(),
        sectorId ? adminClient.from("sectors").select("name").eq("id", sectorId).maybeSingle() : Promise.resolve({ data: null }),
        subSectorId ? adminClient.from("sub_sectors").select("name").eq("id", subSectorId).maybeSingle() : Promise.resolve({ data: null }),
        categoryId ? adminClient.from("categories").select("name").eq("id", categoryId).maybeSingle() : Promise.resolve({ data: null }),
        adminClient.from("site_settings").select("value").eq("key", "site_config").maybeSingle(),
      ]);

      const applicantEmail = applicantProfile.data?.email || applicantPre.data?.email || null;
      const applicantName = applicantProfile.data?.full_name || applicantPre.data?.full_name || "Applicant";
      const siteValue = (siteRow.data?.value || {}) as Record<string, unknown>;
      const portalUrl = (siteValue.app_base_url as string) || Deno.env.get("APP_BASE_URL") || "";
      const supportEmail = (siteValue.support_email as string) || "";
      const companyName = (siteValue.app_name as string) || Deno.env.get("APP_NAME") || "Unified License Hub";
      const appDetailUrl = portalUrl ? `${portalUrl.replace(/\/$/, "")}/applications/${application_id}` : "";

      const basePayload = {
        applicant_id: app.applicant_id,
        applicant_name: applicantName,
        applicant_email: applicantEmail,
        application_id,
        application_number: appRow.data?.application_number ?? "",
        license_type: app.license_type ?? "",
        sector_id: sectorId ?? null,
        sub_sector_id: subSectorId ?? null,
        category_id: categoryId ?? null,
        sector_name: sectorRow.data?.name ?? "",
        sub_sector_name: subSectorRow.data?.name ?? "",
        category_name: categoryRow.data?.name ?? "",
        submitted_at: appRow.data?.submitted_at
          ? new Date(appRow.data.submitted_at as string).toLocaleString()
          : new Date().toLocaleString(),
        current_workflow_step: "",
        portal_url: portalUrl,
        application_detail_url: appDetailUrl,
        support_email: supportEmail,
        company_name: companyName,
        app_name: companyName,
        regulator_id: app.regulator_id ?? null,
      };

      // Resolve current step name (best-effort)
      if (appRow.data?.current_step_id) {
        const { data: stepRow } = await adminClient
          .from("approval_steps")
          .select("name, step_order")
          .eq("id", appRow.data.current_step_id)
          .maybeSingle();
        basePayload.current_workflow_step = stepRow?.name || (stepRow?.step_order ? `Step ${stepRow.step_order}` : "");
      }

      // Choose event keys + labels based on whether this was a resubmission
      const applicantEventKey = isResubmission
        ? "application.resubmitted.applicant"
        : "application.submitted.applicant";
      const reviewerEventKey = isResubmission
        ? "application.resubmitted.reviewer"
        : "application.submitted.reviewer";
      const applicantCtaLabel = isResubmission ? "View Resubmitted Application" : "View Application";
      const reviewerCtaLabel = isResubmission ? "Review Resubmitted Application" : "Review Application";

      // Resubmission-specific payload extras
      const appDataAny = (app.data as Record<string, unknown> | null) || {};
      const resubmissionComments =
        (appDataAny.resubmission_comments as string) ||
        (appDataAny.resubmission_remarks as string) ||
        (appDataAny.applicant_remarks as string) ||
        "";
      const resubmittedAt = appRow.data?.submitted_at
        ? new Date(appRow.data.submitted_at as string).toISOString()
        : new Date().toISOString();
      const extendedPayload = {
        ...basePayload,
        previous_status: app.status,
        current_status: "submitted",
        resubmitted_at: appRow.data?.submitted_at
          ? new Date(appRow.data.submitted_at as string).toLocaleString()
          : new Date().toLocaleString(),
        resubmission_comments: resubmissionComments,
        resubmission_version: resubmittedAt,
      };

      // Dispatch is AWAITED (not fire-and-forget): an un-awaited invoke can be
      // dropped when the isolate is torn down after the response is returned,
      // which silently lost submission notifications. If a direct dispatch
      // fails we fall back to the durable notification_event_queue so the
      // queue worker retries it instead of the event being lost.
      const dispatchTargets = [
        {
          event_key: applicantEventKey,
          payload: {
            ...extendedPayload,
            cta_url: appDetailUrl || portalUrl,
            cta_label: applicantCtaLabel,
          },
        },
        {
          event_key: reviewerEventKey,
          payload: {
            ...extendedPayload,
            reviewer_name: "Reviewer",
            cta_url: appDetailUrl || portalUrl,
            cta_label: reviewerCtaLabel,
          },
        },
      ];

      for (const target of dispatchTargets) {
        let dispatched = false;
        try {
          const { error: dispatchErr } = await adminClient.functions.invoke(
            "dispatch-notification-event",
            {
              body: {
                event_key: target.event_key,
                entity_type: "application",
                entity_id: application_id,
                ...(isResubmission ? { reminder_window: `resubmit:${resubmittedAt}` } : {}),
                payload: target.payload,
              },
            },
          );
          if (dispatchErr) throw dispatchErr;
          dispatched = true;
        } catch (e) {
          console.error(
            "[notify] direct dispatch failed, enqueueing",
            target.event_key,
            e instanceof Error ? e.message : e,
          );
        }

        if (!dispatched) {
          const { error: enqueueErr } = await adminClient.rpc("notification_enqueue_event", {
            _event_key: target.event_key,
            _entity_type: "application",
            _entity_id: application_id,
            _payload: target.payload,
            _idempotency_suffix: isResubmission ? `resubmit:${resubmittedAt}` : "submit",
            _correlation_id: null,
            _reminder_window: isResubmission ? `resubmit:${resubmittedAt}` : null,
          });
          if (enqueueErr) {
            console.error("[notify] enqueue fallback failed", target.event_key, enqueueErr.message);
          }
        }
      }

    } catch (notifyErr) {
      // Never fail the submission because of email/notification problems.
      console.error("[notify] submission dispatch error (non-fatal):", notifyErr instanceof Error ? notifyErr.message : notifyErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: result.message ?? (isResubmission
          ? "Application resubmitted successfully"
          : "Application submitted successfully"),
        workflow_matched: result.workflow_attached === true,
        resumed_workflow: result.resumed === true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
