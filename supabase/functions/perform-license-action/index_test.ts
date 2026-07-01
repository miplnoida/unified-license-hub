import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.env.set("SUPABASE_URL", "https://stub.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "stub-service");
Deno.env.set("SUPABASE_ANON_KEY", "stub-anon");

const { handler } = await import("./index.ts");

Deno.test("perform-license-action: OPTIONS preflight returns 200", async () => {
  const req = new Request("http://localhost/x", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:3000" },
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  await res.text();
});

Deno.test("perform-license-action: missing Authorization uses existing 200 error contract", async () => {
  const req = new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ license_id: "lic", action_type: "suspension", new_status: "suspended" }),
  });
  const res = await handler(req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.code, "UNAUTHORIZED");
});

Deno.test("perform-license-action: audit writes use approved RPC helpers", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  if (/\.from\(["']audit_logs["']\)\.insert/.test(src)) {
    throw new Error("perform-license-action must not insert directly into audit_logs");
  }
  if (!src.includes("logComplianceAudit") || !src.includes("logSecurityEvent")) {
    throw new Error("perform-license-action must use shared audit helpers");
  }
});