// Tests for the shared CORS helper.
// Run with: deno test --allow-net --allow-env supabase/functions/_shared/cors_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCorsHeaders, handleCorsPreflight, isOriginAllowed } from "./cors.ts";

Deno.test("isOriginAllowed: null origin is allowed (server-to-server)", () => {
  assertEquals(isOriginAllowed(null), true);
});

Deno.test("isOriginAllowed: localhost is allowed by default", () => {
  Deno.env.delete("ALLOWED_ORIGINS");
  assertEquals(isOriginAllowed("http://localhost:3000"), true);
  assertEquals(isOriginAllowed("http://127.0.0.1:5173"), true);
});

Deno.test("isOriginAllowed: lovable.app subdomains are allowed by default", () => {
  Deno.env.delete("ALLOWED_ORIGINS");
  assertEquals(isOriginAllowed("https://abc-123.lovable.app"), true);
  assertEquals(isOriginAllowed("https://preview--app.lovableproject.com"), true);
});

Deno.test("isOriginAllowed: unknown origin is rejected by default", () => {
  Deno.env.delete("ALLOWED_ORIGINS");
  assertEquals(isOriginAllowed("https://evil.example.com"), false);
});

Deno.test("isOriginAllowed: env ALLOWED_ORIGINS overrides defaults", () => {
  Deno.env.set("ALLOWED_ORIGINS", "https://app.example.com,https://admin.example.com");
  try {
    assertEquals(isOriginAllowed("https://app.example.com"), true);
    assertEquals(isOriginAllowed("https://admin.example.com"), true);
    assertEquals(isOriginAllowed("http://localhost:3000"), false);
  } finally {
    Deno.env.delete("ALLOWED_ORIGINS");
  }
});

Deno.test("isOriginAllowed: wildcard '*' allows everything", () => {
  Deno.env.set("ALLOWED_ORIGINS", "*");
  try {
    assertEquals(isOriginAllowed("https://anything.com"), true);
  } finally {
    Deno.env.delete("ALLOWED_ORIGINS");
  }
});

Deno.test("buildCorsHeaders: returns origin echo for allowed origin", () => {
  Deno.env.delete("ALLOWED_ORIGINS");
  const req = new Request("http://localhost/x", { headers: { origin: "http://localhost:3000" } });
  const h = buildCorsHeaders(req);
  assertEquals(h["Access-Control-Allow-Origin"], "http://localhost:3000");
  assertEquals(h["Vary"], "Origin");
});

Deno.test("buildCorsHeaders: returns 'null' for disallowed origin", () => {
  Deno.env.delete("ALLOWED_ORIGINS");
  const req = new Request("http://localhost/x", { headers: { origin: "https://evil.example.com" } });
  const h = buildCorsHeaders(req);
  assertEquals(h["Access-Control-Allow-Origin"], "null");
});

Deno.test("handleCorsPreflight: returns null for non-OPTIONS", () => {
  const req = new Request("http://localhost/x", { method: "POST" });
  assertEquals(handleCorsPreflight(req), null);
});

Deno.test("handleCorsPreflight: returns 200-ish response for OPTIONS", async () => {
  const req = new Request("http://localhost/x", {
    method: "OPTIONS",
    headers: { origin: "http://localhost:3000" },
  });
  const res = handleCorsPreflight(req);
  if (!res) throw new Error("preflight should return a response");
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000");
  // drain body to satisfy Deno test resource leak detector
  await res.text();
});
