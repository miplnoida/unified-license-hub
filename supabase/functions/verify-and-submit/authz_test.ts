// Deno test — verifies the shared authn gate rejects unauthenticated calls
// with 401 for the `verify-and-submit` edge function.
//
// This is a lightweight in-process import test: we import the shared authz
// helper and confirm it produces the 401 Response when no bearer is present.
// It complements the "requireUserPermission" wiring inside index.ts.

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireAuthenticatedUser } from "../_shared/authz.ts";

Deno.test("verify-and-submit: uses authentication plus record-level submission authority", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "const __authzGate = await requireAuthenticatedUser(req)");
  assertStringIncludes(source, '"can_submit_application"');
  assertEquals(source.includes('requireUserPermission(req, "licensing", "submit")'), false);
});

Deno.test("verify-and-submit: closed applications return a structured business response", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const closedGuard = source.slice(
    source.indexOf('if (app.status !== "draft"'),
    source.indexOf("// 1a. LICENCE ENTITLEMENT"),
  );
  assertStringIncludes(closedGuard, 'code: "APPLICATION_NOT_EDITABLE"');
  assertStringIncludes(closedGuard, "status: 200");
});

Deno.test("verify-and-submit: rejects requests without an Authorization bearer", async () => {
  const req = new Request("http://localhost/verify-and-submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const gate = await requireAuthenticatedUser(req);
  assertEquals(gate.ok, false);
  if (!gate.ok) {
    assertEquals(gate.response.status, 401);
    const body = await gate.response.json();
    assertEquals(body.error, "Unauthorized");
  }
});

Deno.test("verify-and-submit: rejects malformed Authorization header", async () => {
  const req = new Request("http://localhost/verify-and-submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "not-a-bearer-token",
    },
    body: JSON.stringify({}),
  });
  const gate = await requireAuthenticatedUser(req);
  assertEquals(gate.ok, false);
  if (!gate.ok) assertEquals(gate.response.status, 401);
});
