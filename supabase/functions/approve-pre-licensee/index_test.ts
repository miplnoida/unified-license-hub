// Tests for approve-pre-licensee edge function input validation.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");

const { handler } = await import("./index.ts");

Deno.test("approve-pre-licensee: OPTIONS preflight returns 200", async () => {
  const req = new Request("http://localhost/x", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:3000" },
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  await res.text();
});

Deno.test("approve-pre-licensee: missing Authorization → 401 UNAUTHORIZED", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application_id: "a1" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.code, "UNAUTHORIZED");
});

// Source-level assertion: this function must NOT mutate workflow state.
// The atomic RPC `perform_final_workflow_approval` owns all approval DB writes;
// approve-pre-licensee is provisioning-only and verifies the application is
// already in the 'approved' status before continuing.
Deno.test("approve-pre-licensee: source verifies app.status === 'approved' before provisioning", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  // Must check status is already approved.
  if (!/app\.status\s*!==\s*["']approved["']/.test(src)) {
    throw new Error("approve-pre-licensee must reject non-approved applications (NOT_APPROVED guard missing)");
  }
  // Must NOT update the applications table — workflow ownership is in the RPC.
  if (/from\(["']applications["']\)\s*\.\s*update/.test(src)) {
    throw new Error("approve-pre-licensee must not call applications.update — that is owned by perform_final_workflow_approval RPC");
  }
});
