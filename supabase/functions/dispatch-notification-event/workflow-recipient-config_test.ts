import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dynamicApproverRoleIds,
  hasExplicitSpecificApprovers,
  specificApproverUserIds,
} from "./workflow-recipient-config.ts";

Deno.test("specific-user workflow steps resolve only configured users", () => {
  const step = {
    approver_type: "specific_users",
    approver_config: { user_ids: ["user-1", "user-2"] },
    approver_role: "admin",
    approver_role_id: "role-admin",
  };

  assertEquals(specificApproverUserIds(step), ["user-1", "user-2"]);
  assertEquals(dynamicApproverRoleIds(step), []);
  assertEquals(hasExplicitSpecificApprovers(step), true);
});

Deno.test("role-based workflow steps resolve every configured dynamic role", () => {
  const step = {
    approver_type: "role_based_user",
    approver_config: { role_ids: ["role-1", "role-2"] },
    approver_role_id: "role-1",
  };

  assertEquals(dynamicApproverRoleIds(step), ["role-1", "role-2"]);
  assertEquals(specificApproverUserIds(step), []);
  assertEquals(hasExplicitSpecificApprovers(step), false);
});

Deno.test("legacy dynamic role remains a supported fallback", () => {
  assertEquals(dynamicApproverRoleIds({ approver_role_id: "legacy-role" }), ["legacy-role"]);
});