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

    const isResubmission = app.status === "resubmission_requested" || app.status === "query_raised";

    if (app.status !== "draft" && !isResubmission) {
      return new Response(
        JSON.stringify({ error: `Application is already ${app.status}, cannot submit` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1b. Server-side duplicate-application guard (defense in depth — DB trigger also enforces)
    if (!isResubmission) {
      const sectorId = (app.data as Record<string, unknown> | null)?.sector_id as string | undefined;
      if (sectorId) {
        const { data: setting } = await adminClient
          .from("site_settings")
          .select("value")
          .eq("key", "application_settings")
          .maybeSingle();
        const settingsObj = (setting?.value || {}) as { allow_reapplication?: boolean };
        const allowReapply = settingsObj.allow_reapplication === true;

        if (!allowReapply) {
          const { data: dupes } = await adminClient
            .from("applications")
            .select("id, status, data")
            .eq("applicant_id", user.id)
            .neq("id", application_id)
            .not("status", "in", "(draft,cancelled,rejected,withdrawn)");
          const realDupe = (dupes || []).find((a: { data?: { sector_id?: string } | null }) => a.data?.sector_id === sectorId);
          if (realDupe) {
            return new Response(
              JSON.stringify({
                error: "You already have an active application for this sector. Re-apply is allowed only after cancellation, rejection, or withdrawal.",
                code: "DUPLICATE_SECTOR_APPLICATION",
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

    // 4. Update application status to submitted (with acknowledgment metadata)
    const submittedAt = new Date().toISOString();
    const ackUpdate = ack_text
      ? { ack_by: user.id, ack_at: submittedAt, ack_text: String(ack_text).slice(0, 4000) }
      : {};
    const { error: updateErr } = await adminClient
      .from("applications")
      .update({
        status: "submitted",
        submitted_at: submittedAt,
        ...ackUpdate,
      })
      .eq("id", application_id);

    if (updateErr) {
      return new Response(
        JSON.stringify({ error: "Failed to update application: " + updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Update form responses to submitted
    await adminClient
      .from("form_responses")
      .update({ status: "submitted", submitted_at: new Date().toISOString() })
      .eq("entity_id", application_id)
      .eq("entity_type", "application");

    // 6. Start workflow (find matching workflow)
    let workflowResult = { matched: false, workflowId: null as string | null, firstStepId: null as string | null };

    const { data: existing } = await adminClient
      .from("workflow_instances")
      .select("id, workflow_id, current_step_id, status")
      .eq("entity_id", application_id)
      .eq("entity_type", "application")
      .in("status", ["active", "paused"])
      .limit(1);

    if (existing && existing.length > 0) {
      if (existing[0].status === "paused") {
        const { error: resumeErr } = await adminClient
          .from("workflow_instances")
          .update({ status: "active" })
          .eq("id", existing[0].id)
          .eq("status", "paused");

        if (resumeErr) {
          return new Response(
            JSON.stringify({ error: "Failed to resume workflow: " + resumeErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      await adminClient
        .from("applications")
        .update({
          workflow_id: existing[0].workflow_id,
          current_step_id: existing[0].current_step_id,
        })
        .eq("id", application_id);

      workflowResult = {
        matched: true,
        workflowId: existing[0].workflow_id,
        firstStepId: existing[0].current_step_id,
      };
    } else {
      // Find matching workflow
      const { data: exactWf } = await adminClient
        .from("approval_workflows")
        .select("id, license_type")
        .eq("license_type", app.license_type)
        .eq("entity_type", "application")
        .eq("is_active", true)
        .limit(1);

      let matchedWf = exactWf?.[0] || null;
      if (!matchedWf) {
        const { data: allWf } = await adminClient
          .from("approval_workflows")
          .select("id, license_type")
          .eq("entity_type", "application")
          .eq("is_active", true);
        matchedWf = allWf?.find((w) =>
          app.license_type.toLowerCase().startsWith(w.license_type.toLowerCase())
        ) || null;
      }

      if (matchedWf) {
        const { data: steps } = await adminClient
          .from("approval_steps")
          .select("id")
          .eq("workflow_id", matchedWf.id)
          .order("step_order", { ascending: true })
          .limit(1);

        const firstStepId = steps?.[0]?.id || null;

        const { data: instance } = await adminClient
          .from("workflow_instances")
          .insert({
            workflow_id: matchedWf.id,
            entity_type: "application",
            entity_id: application_id,
            current_step_id: firstStepId,
            status: "active",
          })
          .select("id")
          .single();

        if (instance) {
          await adminClient
            .from("applications")
            .update({ workflow_id: matchedWf.id, current_step_id: firstStepId })
            .eq("id", application_id);

          workflowResult = { matched: true, workflowId: matchedWf.id, firstStepId };
        }
      }
    }

    // 7. Audit log
    await adminClient.from("audit_logs").insert({
      action: isResubmission ? "application_resubmitted" : "application_submitted",
      entity_type: "application",
      entity_id: application_id,
      user_id: user.id,
      new_value: { status: "submitted", workflow_matched: workflowResult.matched, resumed_workflow: isResubmission },
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: workflowResult.matched
          ? isResubmission
            ? "Application resubmitted and workflow resumed"
            : "Application submitted and routed to approval workflow"
          : isResubmission
            ? "Application resubmitted successfully"
            : "Application submitted successfully",
        workflow_matched: workflowResult.matched,
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
