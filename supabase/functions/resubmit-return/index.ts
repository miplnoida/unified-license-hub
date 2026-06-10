import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

/**
 * Licensee-side: resubmit a return after an edit request.
 * Closes the open return_requests row and reopens the workflow instance.
 */
function jsonResponse(req: Request, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return jsonResponse(req, 401, { error: "Missing authorization header", code: "UNAUTHORIZED" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: authErr } = await userClient.auth.getUser();
    const caller = userRes?.user;
    if (authErr || !caller) return jsonResponse(req, 401, { error: "Invalid token", code: "UNAUTHORIZED" });

    let body: any; try { body = await req.json(); } catch { body = {}; }
    const return_id: string | undefined = body.return_id;
    const comments: string = (body.comments || "").toString();
    if (!return_id) return jsonResponse(req, 400, { error: "return_id is required", code: "BAD_REQUEST" });

    const admin = createClient(supabaseUrl, serviceKey);
    const { data, error } = await admin.rpc("resubmit_return", {
      _return_id: return_id, _actor_id: caller.id, _comments: comments,
    });
    if (error) return jsonResponse(req, 500, { error: error.message, code: "DB_ERROR" });
    const result = (data || {}) as Record<string, unknown>;
    if (result.error) {
      const status = typeof result.http === "number" ? (result.http as number) : 422;
      return jsonResponse(req, status, result);
    }
    return jsonResponse(req, 200, result);
  } catch (e) {
    return jsonResponse(req, 500, { error: e instanceof Error ? e.message : "Internal", code: "INTERNAL" });
  }
});
