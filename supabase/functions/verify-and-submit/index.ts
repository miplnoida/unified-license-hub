import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Create user-scoped client to get the authenticated user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    if (app.applicant_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "You do not own this application" }),
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
        JSON.stringify({ error: `Application is already ${app.status}, cannot submit` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1b. Server-side duplicate-application & re-application guard
    //     (defense in depth — frontend + DB triggers also enforce).
    //     Match key: (applicant + sector + sub_sector + category).
    if (!isResubmission) {
      const appDataObj = (app.data as Record<string, unknown> | null) || {};
      const sectorId = appDataObj.sector_id as string | undefined;
      const subSectorId = appDataObj.sub_sector_id as string | undefined;
      const categoryId = appDataObj.category_id as string | undefined;

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

      if (sectorId && subSectorId && categoryId) {
        const { data: peers } = await adminClient
          .from("applications")
          .select("id, status, data")
          .eq("applicant_id", user.id)
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
        adminClient.from("profiles").select("email, full_name").eq("id", user.id).maybeSingle(),
        adminClient.from("pre_license_users").select("email, full_name").eq("id", user.id).maybeSingle(),
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
        applicant_id: user.id,
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

      // Applicant confirmation
      adminClient.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: applicantEventKey,
          entity_type: "application",
          entity_id: application_id,
          ...(isResubmission ? { reminder_window: `resubmit:${resubmittedAt}` } : {}),
          payload: {
            ...extendedPayload,
            cta_url: appDetailUrl || portalUrl,
            cta_label: applicantCtaLabel,
          },
        },
      }).catch((e) => console.error("[notify] applicant dispatch failed", e?.message || e));

      // Reviewer/workflow notification
      adminClient.functions.invoke("dispatch-notification-event", {
        body: {
          event_key: reviewerEventKey,
          entity_type: "application",
          entity_id: application_id,
          ...(isResubmission ? { reminder_window: `resubmit:${resubmittedAt}` } : {}),
          payload: {
            ...extendedPayload,
            reviewer_name: "Reviewer",
            cta_url: appDetailUrl || portalUrl,
            cta_label: reviewerCtaLabel,
          },
        },
      }).catch((e) => console.error("[notify] reviewer dispatch failed", e?.message || e));
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
