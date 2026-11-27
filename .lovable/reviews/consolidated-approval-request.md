# Consolidated approval request — 27 Nov 2026 (nothing executed)

Approve any of items A–C independently. Every item is reversible and none touches AML/CFT, permissions or RLS.

## A. Workflow creation (database function) — CRITICAL
- Change: in `create_approval_workflow_with_steps(jsonb,jsonb)`, replace
  `ARRAY(SELECT jsonb_array_elements_text(v_step->'allowed_actions'))::workflow_action_type[]` with `v_step->'allowed_actions'`.
- Why: the column is jsonb and the type no longer exists, so every workflow creation fails.
- Impact: new workflows can be created again. Existing 16 workflows, 55 steps, 10 versions and all applications are untouched. Grants and the admin check stay the same.
- Exact SQL and verbatim rollback: `workflow-create-fix-approval.md`.

## B. Three read functions marked STABLE (database)
```sql
ALTER FUNCTION public.correspondence_thread_feed(jsonb, integer, integer) VOLATILE;
ALTER FUNCTION public.entity360_timeline(uuid, text[], timestamp with time zone, timestamp with time zone, integer, integer) VOLATILE;
ALTER FUNCTION public.fp_regulator_positions(uuid) VOLATILE;
```
- Rollback: the same three statements with `STABLE`.
- Fixes the application Communications tab, Entity 360 Regulatory history, and F&P regulator positions. Only the marker changes; no logic, grants or data change. Details: `batch2-volatility-fix-approval.md`.

## C. Employee provisioning notice (backend function `create-web-user`, needs deploy)
```diff
-      // Fire template-driven notifications for entity user creation. Best-effort.
-      try {
+      // Fire template-driven notifications for entity user creation. Best-effort.
+      // Internal employees are not entity portal users: no licensee "Portal access granted" notice.
+      if (user_type !== "employee") try {
```
- Rollback: redeploy the current file (commit `cde0e18d2`).
- Impact: internal employees no longer trigger the licensee "Portal access granted" notice to themselves and every Super Admin. Licensee primary and secondary creation is unchanged. The credentials email still follows `send_email` (Employee Management sends none). This also unblocks creating a QA employee for ordinary-role testing.

## D. Held — listed only, holds unchanged
Correction-save migration; report-register read grants; returns write grants; SEC-01 Packages A/B/C; public register signed-out search (anon EXECUTE on `public_entity_register_search`, not drafted).
