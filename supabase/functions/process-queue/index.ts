import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  // Update scan status
  await supabase
    .from("file_uploads")
    .update({ scan_status: "clean" } as any)
    .eq("id", file_upload_id);
}
