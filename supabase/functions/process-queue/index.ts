import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QueueJob {
  id: string;
  type: 'email' | 'report' | 'file_processing';
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __workerGate = requireWorkerInvocation(req);
  if (!__workerGate.ok) return __workerGate.response;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json();
    const { action } = body;

    // ─── Enqueue a job ───
    if (action === "enqueue") {
      const { type, payload, priority } = body;
      const { data, error } = await supabase
        .from("job_queue")
        .insert({
          type,
          payload,
          priority: priority || 0,
          status: "pending",
          attempts: 0,
          max_attempts: 3,
        })
        .select()
        .single();

      if (error) throw error;
      return new Response(JSON.stringify({ success: true, job_id: data.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Process pending jobs ───
    if (action === "process") {
      const batchSize = body.batch_size || 10;

      // Fetch pending jobs ordered by priority
      const { data: jobs, error } = await supabase
        .from("job_queue")
        .select("*")
        .eq("status", "pending")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(batchSize);

      if (error) throw error;

      const results: { id: string; status: string; error?: string }[] = [];

      for (const job of (jobs || []) as QueueJob[]) {
        // Mark as processing
        await supabase
          .from("job_queue")
          .update({ status: "processing", started_at: new Date().toISOString() } as any)
          .eq("id", job.id);

        try {
          switch (job.type) {
            case "email":
              await processEmailJob(supabase, job);
              break;
            case "report":
              await processReportJob(supabase, job);
              break;
            case "file_processing":
              await processFileJob(supabase, job);
              break;
            default:
              throw new Error(`Unknown job type: ${job.type}`);
          }

          await supabase
            .from("job_queue")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
              attempts: job.attempts + 1,
            } as any)
            .eq("id", job.id);

          results.push({ id: job.id, status: "completed" });
        } catch (err) {
          const newAttempts = job.attempts + 1;
          const newStatus = newAttempts >= job.max_attempts ? "failed" : "pending";

          await supabase
            .from("job_queue")
            .update({
              status: newStatus,
              attempts: newAttempts,
              last_error: err instanceof Error ? err.message : String(err),
            } as any)
            .eq("id", job.id);

          results.push({ id: job.id, status: newStatus, error: String(err) });
        }
      }

      return new Response(
        JSON.stringify({ success: true, processed: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── Get queue stats ───
    if (action === "stats") {
      const statuses = ["pending", "processing", "completed", "failed"];
      const counts: Record<string, number> = {};

      for (const s of statuses) {
        const { count } = await supabase
          .from("job_queue")
          .select("*", { count: "exact", head: true })
          .eq("status", s);
        counts[s] = count || 0;
      }

      return new Response(JSON.stringify({ success: true, counts }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Queue error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── Job Processors ───

async function processEmailJob(supabase: any, job: QueueJob) {
  const { recipient_email, subject, body, template_id } = job.payload as any;
  console.log(`[EMAIL JOB ${job.id}] Sending to ${recipient_email}: ${subject}`);
  // Integration point for Resend/SendGrid/SMTP
  // For now, log and mark delivered
  if (template_id) {
    await supabase
      .from("notifications")
      .update({ delivery_status: "delivered" } as any)
      .eq("template_id", template_id)
      .eq("delivery_status", "queued");
  }
}

async function processReportJob(supabase: any, job: QueueJob) {
  const { report_id } = job.payload as any;
  console.log(`[REPORT JOB ${job.id}] Generating report ${report_id}`);

  // Update report status
  await supabase
    .from("reports")
    .update({ status: "generating", generated_at: new Date().toISOString() } as any)
    .eq("id", report_id);

  // Simulate report generation (in production: aggregate data, generate PDF, etc.)
  await supabase
    .from("reports")
    .update({ status: "completed" } as any)
    .eq("id", report_id);
}

async function processFileJob(supabase: any, job: QueueJob) {
  const { file_upload_id, operation } = job.payload as any;
  console.log(`[FILE JOB ${job.id}] Processing file ${file_upload_id}: ${operation}`);

  const scannerUrl = Deno.env.get("FILE_SCAN_PROVIDER_URL");
  const scannerName = Deno.env.get("FILE_SCAN_PROVIDER_NAME") ?? "external-scanner";

  // Fail closed: without a commissioned scanner we must NOT release the file.
  if (!scannerUrl) {
    await supabase.rpc("file_upload_record_scan", {
      _file_upload_id: file_upload_id,
      _verdict: "scan_error",
      _provider: null,
      _detail: "no malware scanning provider configured (FILE_SCAN_PROVIDER_URL unset)",
    });
    console.error(`[FILE JOB ${job.id}] no scanner configured - file held unreleased`);
    throw new Error('Malware scanning provider is not configured; file remains unreleased');
  }

  await supabase.rpc("file_upload_record_scan", {
    _file_upload_id: file_upload_id,
    _verdict: "scanning",
    _provider: scannerName,
    _detail: null,
  });

  const { data: row } = await supabase
    .from("file_uploads")
    .select("file_path, bucket_name, file_name, mime_type")
    .eq("id", file_upload_id)
    .maybeSingle();

  if (!row) {
    console.error(`[FILE JOB ${job.id}] file_uploads row not found`);
    throw new Error('File upload not found');
  }

  try {
    const { data: blob, error: dlError } = await supabase.storage
      .from(row.bucket_name || "secure-documents")
      .download(row.file_path);
    if (dlError || !blob) throw new Error(dlError?.message ?? "download failed");

    const response = await fetch(scannerUrl, {
      method: "POST",
      headers: {
        "Content-Type": row.mime_type || "application/octet-stream",
        "X-File-Name": row.file_name ?? "upload",
        ...(Deno.env.get("FILE_SCAN_PROVIDER_KEY")
          ? { Authorization: `Bearer ${Deno.env.get("FILE_SCAN_PROVIDER_KEY")}` }
          : {}),
      },
      body: await blob.arrayBuffer(),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(`scanner responded ${response.status}`);
    }

    let verdict = "scan_error";
    let detail = body.slice(0, 500);
    try {
      const parsed = JSON.parse(body) as { infected?: boolean; verdict?: string; detail?: string };
      if (typeof parsed.infected === "boolean") {
        verdict = parsed.infected ? "infected" : "clean";
      } else if (parsed.verdict && ["clean", "infected", "suspicious"].includes(parsed.verdict)) {
        verdict = parsed.verdict;
      }
      detail = parsed.detail ?? detail;
    } catch {
      // non-JSON scanner response: keep scan_error (fail closed)
    }

    const { error: verdictError } = await supabase.rpc("file_upload_record_scan", {
      _file_upload_id: file_upload_id,
      _verdict: verdict,
      _provider: verdict === "clean" ? scannerName : scannerName,
      _detail: detail,
    });
    if (verdictError) throw new Error('Could not persist malware scan verdict');
    if (verdict === 'scan_error') throw new Error('Scanner returned no valid verdict');
    console.log(`[FILE JOB ${job.id}] scan verdict: ${verdict}`);
  } catch (err) {
    await supabase.rpc("file_upload_record_scan", {
      _file_upload_id: file_upload_id,
      _verdict: "scan_error",
      _provider: scannerName,
      _detail: err instanceof Error ? err.message.slice(0, 500) : "unknown scan failure",
    });
    console.error(`[FILE JOB ${job.id}] scan failed:`, err);
    throw err;
  }
}
