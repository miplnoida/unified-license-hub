// Tests for perform-workflow-action edge function input validation.
// Run with the supabase test_edge_functions tool.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Stub env BEFORE importing the handler module — it reads env at request time
// (not import time), but `createClient` is constructed inside the handler, so
// we just need any non-empty values to satisfy the `!`-asserts.
Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");

const { handler } = await import("./index.ts");

async function jsonOf(res: Response): Promise<any> {
  return await res.json();
}

Deno.test("perform-workflow-action: OPTIONS preflight returns 200", async () => {
  const req = new Request("http://localhost/x", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:3000" },
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000");
  await res.text();
});

Deno.test("perform-workflow-action: missing Authorization → 401 UNAUTHORIZED", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application_id: "a1", action_type: "approve" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const body = await jsonOf(res);
  assertEquals(body.code, "UNAUTHORIZED");
});

// The remaining 400-paths require the auth check to pass first, which calls
// supabase.auth.getUser() against the stub URL — that will fail with network
// error, yielding 401. So we cannot directly exercise BAD_REQUEST paths here
// without a live Supabase. Instead we assert the action allowlist constant
// directly to lock in the exact set of accepted actions and prevent reintroducing
// the removed synthetic actions (request_info / delegate).
Deno.test("perform-workflow-action: action allowlist excludes synthetic actions", async () => {
  // Re-read source to verify the allowlist set matches the expected list.
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // The accepted actions are declared as a Set literal at the top.
  const match = src.match(/ACCEPTED_ACTIONS\s*=\s*new\s+Set\(\[([^\]]+)\]/);
  if (!match) throw new Error("ACCEPTED_ACTIONS literal not found");
  const list = match[1]
    .split(",")
    .map((s) => s.replace(/['"\s]/g, ""))
    .filter(Boolean)
    .sort();
  assertEquals(list, ["approve", "escalate", "reject", "request_more_info", "request_resubmission", "return_for_correction", "send_back"]);
  // Defense in depth — the removed synthetic actions must NOT be in the source.
  if (list.includes("request_info")) throw new Error("request_info must not be in ACCEPTED_ACTIONS");
  if (list.includes("delegate")) throw new Error("delegate must not be in ACCEPTED_ACTIONS");
});
