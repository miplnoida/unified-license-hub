// Legacy entrypoint retained for existing callers/cron history.
// All digest logic now lives in `notification-digest-run` (period aware,
// duplicate-safe, driven by notification_event_configs + user preferences).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireWorkerInvocation } from "../_shared/workerAuth.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const gate = requireWorkerInvocation(req);
  if (!gate.ok) return gate.response;

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const { data, error } = await supabase.functions.invoke("notification-digest-run", {
      body: { period: body.period ?? "daily", period_start: body.period_start ?? null },
    });
    if (error) throw new Error(error.message);
    return new Response(JSON.stringify({ delegated: true, ...(data ?? {}) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
