// Complaint Storage Cleanup
// Deletes orphaned staged attachments (DB row + storage object).
// Failed storage deletions are recorded in complaint_storage_cleanup_deadletter.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type OrphanRow = {
  deleted_evidence_id: string;
  file_upload_id: string | null;
  bucket_name: string | null;
  file_path: string | null;
};

async function deleteWithRetry(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  path: string,
  maxAttempts = 3,
): Promise<{ ok: boolean; error?: string; attempts: number }> {
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { error } = await admin.storage.from(bucket).remove([path]);
    if (!error) return { ok: true, attempts: attempt };
    lastError = error.message ?? String(error);
    await new Promise((r) => setTimeout(r, 200 * attempt));
  }
  return { ok: false, error: lastError, attempts: maxAttempts };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);

  try {
    const { data, error } = await admin.rpc(
      "cleanup_orphaned_complaint_evidence",
      { _older_than: "24:00:00" },
    );
    if (error) throw error;

    const rows = (data ?? []) as OrphanRow[];
    let deleted = 0;
    let deadlettered = 0;

    for (const row of rows) {
      if (!row.bucket_name || !row.file_path) continue;
      const res = await deleteWithRetry(admin, row.bucket_name, row.file_path);
      if (res.ok) {
        deleted++;
      } else {
        deadlettered++;
        await admin.from("complaint_storage_cleanup_deadletter").insert({
          evidence_id: row.deleted_evidence_id,
          file_upload_id: row.file_upload_id,
          bucket_name: row.bucket_name,
          file_path: row.file_path,
          attempts: res.attempts,
          last_error: res.error,
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        rows_returned: rows.length,
        objects_deleted: deleted,
        deadlettered,
        duration_ms: Date.now() - startedAt,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[complaint-storage-cleanup] error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message ?? String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
