import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUserPermission } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RowIn {
  row_number: number;
  applicant_email?: string;
  license_type?: string;
  regulator_id?: string;
  data?: Record<string, unknown>;
}

interface RowResult {
  row_number: number;
  status: "ok" | "error";
  errors: string[];
  applicant_id?: string;
  license_type?: string;
  application_id?: string;
  application_number?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });


  const __authzGate = await requireUserPermission(req, "complaint_management", "create");
  if (!__authzGate.ok) return __authzGate.response;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }
    // Identity comes from the gate's verified token claims. A second
    // auth.getUser() round-trip can fail with "session not found" after a
    // refresh-token rotation and would surface as a bogus 401.
    const originatorId = __authzGate.userId;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "validate");
    const workflowTypeKey = String(body?.workflow_type_key || "").trim();
    const rows: RowIn[] = Array.isArray(body?.rows) ? body.rows : [];

    if (!workflowTypeKey) return json({ error: "workflow_type_key required" }, 400);
    if (rows.length === 0) return json({ error: "No rows supplied" }, 400);
    if (rows.length > 500) return json({ error: "Max 500 rows per batch" }, 400);

    // Workflow type gate
    const { data: wf, error: wfErr } = await admin
      .from("approval_workflow_types")
      .select("key, display_label, bulk_intake_enabled, is_active")
      .eq("key", workflowTypeKey)
      .maybeSingle();
    if (wfErr) return json({ error: wfErr.message }, 500);
    if (!wf) return json({ error: `Workflow type '${workflowTypeKey}' not found` }, 400);
    if (!wf.is_active) return json({ error: `Workflow type '${workflowTypeKey}' is not active` }, 400);
    if (!wf.bulk_intake_enabled) {
      return json({ error: `Bulk intake is not enabled for '${wf.display_label}'` }, 400);
    }

    // Resolve applicant_email → profile id in a single batch query
    const emails = Array.from(
      new Set(
        rows
          .map((r) => (r.applicant_email || "").trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    const emailToId = new Map<string, string>();
    if (emails.length > 0) {
      const { data: profs } = await admin
        .from("profiles")
        .select("id, email")
        .in("email", emails);
      for (const p of (profs ?? []) as any[]) {
        if (p.email) emailToId.set(String(p.email).toLowerCase(), p.id);
      }
    }

    const results: RowResult[] = [];
    for (const r of rows) {
      const errs: string[] = [];
      const licenseType = (r.license_type || "").trim();
      if (!licenseType) errs.push("license_type is required");

      let applicantId: string | undefined;
      const email = (r.applicant_email || "").trim().toLowerCase();
      if (email) {
        applicantId = emailToId.get(email);
        if (!applicantId) errs.push(`No profile found for email '${email}'`);
      } else {
        applicantId = originatorId;
      }

      results.push({
        row_number: r.row_number,
        status: errs.length ? "error" : "ok",
        errors: errs,
        applicant_id: applicantId,
        license_type: licenseType,
      });
    }

    if (action === "validate") {
      return json({
        workflow_type: wf,
        total: rows.length,
        errors: results.filter((r) => r.status === "error").length,
        rows: results,
      });
    }

    // action === 'commit' — only insert rows that validated
    if (action !== "commit") return json({ error: "Unknown action" }, 400);
    if (results.some((r) => r.status === "error")) {
      return json({ error: "Refusing to commit — some rows have errors", rows: results }, 200);
    }

    let created = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const meta = results[i];
      const { data: ins, error: insErr } = await admin
        .from("applications")
        .insert({
          applicant_id: meta.applicant_id!,
          license_type: meta.license_type!,
          status: "draft",
          data: r.data ?? {},
          regulator_id: r.regulator_id || null,
          assigned_to: originatorId,
          assigned_by: originatorId,
          assigned_at: new Date().toISOString(),
        })
        .select("id, application_number")
        .single();
      if (insErr) {
        meta.status = "error";
        meta.errors.push(insErr.message);
      } else {
        meta.application_id = ins.id;
        meta.application_number = ins.application_number;
        created++;
      }
    }

    // Best-effort audit log
    await admin.from("audit_logs").insert({
      action: "application.bulk_intake",
      entity_type: "application",
      entity_id: null,
      user_id: originatorId,
      new_values: { workflow_type: workflowTypeKey, created, total: rows.length },
    });

    return json({ created, total: rows.length, rows: results });
  } catch (e) {
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
