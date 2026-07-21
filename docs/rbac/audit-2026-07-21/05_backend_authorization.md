# 05 · Backend Authorization Architecture

## Current shape

```
              ┌───────────────────────────────────────────────────────┐
              │              public.has_permission()                  │  ← catalog-driven
              │                                                       │
              │  used by: 1 RLS policy, 4 RPCs, 1 storage policy      │  ← today
              │  should be: every non-reference table's RLS + every   │
              │             mutating RPC + every private bucket       │
              └───────────────────────────────────────────────────────┘
                          ▲                              ▲
                          │                              │
                ┌─────────┴──────────┐         ┌─────────┴──────────┐
                │  is_super_admin    │         │  can_view_entity_  │
                │  has_any_permission│         │  returns           │
                │  user_has_entity_  │         │  (assignment gate) │
                │  assignment        │         │                    │
                │  is_assignment_    │         │                    │
                │  only_regulator    │         │                    │
                └────────────────────┘         └────────────────────┘
                          ▲
                          │
      ┌───────────────────┴─────────────────────┐
      │ Legacy role checks still in use:        │
      │  - has_role(uid, 'admin')               │  ← 200+ policies still hard-code this
      │  - profiles.role = 'super_admin'        │  ← several RPCs (technical debt)
      │  - is_super_admin_by_email()            │  ← breakglass, keep for now
      └─────────────────────────────────────────┘
```

## Findings

| Severity | Layer | Finding | Recommendation |
|----------|-------|---------|----------------|
| **Critical** | RLS | Only **1 of 249** public tables composes with `has_permission()`. Most policies check `has_role(auth.uid(), 'admin')` or ownership. Any dynamic role with an admin-ish alias inherits full write. | Migration wave: for each module, replace `has_role(_, 'admin')` with `has_permission(auth.uid(), '<module>', '<action>')` in SELECT / INSERT / UPDATE / DELETE policies. |
| **Critical** | RPC | **294** `SECURITY DEFINER` functions — only 4 call `has_permission`. These run with the definer's privileges, so ownership on the underlying tables no longer protects them; the function *is* the gate. | Add `IF NOT has_permission(...) THEN RAISE EXCEPTION 'permission denied'; END IF;` at the top of every non-trigger `SECURITY DEFINER` function that writes to a business table. |
| **High** | RPC | **6** SECURITY DEFINER functions do **not** pin `search_path`. Any of these is a schema-hijack vector. | Add `SET search_path = public, extensions` to each. Details in `08_rpc_security.md`. |
| **High** | Storage | 8 of 10 buckets are private but only 1 policy references `has_permission`. The rest gate on ownership or role hard-codes. | Rewrite policies to use `has_permission(auth.uid(), '<module>', 'view' or 'upload')` per bucket. |
| **High** | Edge Functions | Deno functions (`complaint-storage-cleanup`, `finalize-complaint`, etc.) use `service_role` and *do not* re-check permissions of the invoking user. | Verify the JWT and call `has_permission` before doing privileged work. Pattern already exists in `create_complaint`. |
| **Medium** | Reports | Report queries execute via `report_source_columns` / `report_sources` without a permission on the underlying business table. | Add per-source `required_permission_module` / `required_permission_action` columns and enforce inside the report runner. |
| **Medium** | Views | Several views join sensitive tables; RLS on views is inherited from the base tables' policies, so any base-table gap leaks through the view. | Audit views after the RLS wave. |
| **Info** | Breakglass | `is_super_admin_by_email()` is intentional. | Keep, but log every hit to `security_event_logs`. |

## Blueprint for the fix wave

For every module `M` with actions `A` in the catalog:

```sql
-- 1. Replace legacy USING clauses
DROP POLICY IF EXISTS "…admin can select…" ON public.<table>;
CREATE POLICY "M_select" ON public.<table>
  FOR SELECT TO authenticated
  USING ( public.is_super_admin(auth.uid())
       OR public.has_permission(auth.uid(), 'M', 'view')
       OR public.user_owns_row(auth.uid(), <table>) );

-- 2. Same for INSERT/UPDATE/DELETE with the matching action.
-- 3. In each RPC that mutates <table>:
IF NOT public.has_permission(auth.uid(), 'M', 'A') THEN
  RAISE EXCEPTION 'permission denied for M.A';
END IF;
```

Once wave 1 lands, the coverage scanner's "RLS" and "RPC" surfaces will light up automatically and the
Overall RBAC posture score in the header will rise from **D+** to at least **B**.
