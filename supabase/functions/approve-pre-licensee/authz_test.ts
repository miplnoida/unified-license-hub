// Deno test — verifies the shared authz gate rejects unauthenticated calls
// with 401 for the `approve-pre-licensee` edge function (module.action = registration_management.approve).
//
// This is a lightweight in-process import test: we import the shared authz
// helper and confirm it produces the 401 Response when no bearer is present.
// It complements the "requireUserPermission" wiring inside index.ts.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { requireUserPermission } from "../_shared/authz.ts";

Deno.test("approve-pre-licensee: rejects requests without an Authorization bearer", async () => {
  const req = new Request("http://localhost/approve-pre-licensee", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const gate = await requireUserPermission(req, "registration_management", "approve");
  assertEquals(gate.ok, false);
  if (!gate.ok) {
    assertEquals(gate.response.status, 401);
    const body = await gate.response.json();
    assertEquals(body.error, "Unauthorized");
  }
});

Deno.test("approve-pre-licensee: rejects malformed Authorization header", async () => {
  const req = new Request("http://localhost/approve-pre-licensee", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "not-a-bearer-token",
    },
    body: JSON.stringify({}),
  });
  const gate = await requireUserPermission(req, "registration_management", "approve");
  assertEquals(gate.ok, false);
  if (!gate.ok) assertEquals(gate.response.status, 401);
});
