# Fix: Regulator sees all returns instead of only mapped entities

## Root cause (verified)

`returns_filed` has multiple SELECT policies, and Postgres RLS OR's them. The intended gate is `Internal staff view returns for assigned entities` which calls `can_view_entity_returns(uid, entity_id, workflow_status, status)` — this correctly requires super_admin, `returns_management.view_all_entities`, or an active `lead/regulator_officer/alternate_regulator_id` assignment on `licensees` for a submitted-lifecycle return.

However, another SELECT policy exists:

```
external_returns_filed_select_capability_gate:
  auth.uid() IS NOT NULL
  AND (
    NOT has_external_role(auth.uid())
    OR external_can_access_return_filed_values(..., 'can_view_status')
    OR external_can_access_return_filed_values(..., 'can_submit_returns')
  )
```

`has_external_role` only returns true for applicant / pre_licensee / licensee_primary / licensee_secondary. Every internal user (analyst, license_analyst, supervisor, etc.) satisfies `NOT has_external_role(...)`, so this policy grants SELECT on **every row** of `returns_filed`, bypassing the entity-assignment gate. That is why a mapped `license_analyst` sees all returns.

## Fix

Rewrite `external_returns_filed_select_capability_gate` so it is a capability gate for **external users only**, and does not grant blanket access to internal users. Internal access continues to flow through `Internal staff view returns for assigned entities` (assignment + submitted lifecycle) and `Return creator can view own return`.

### Migration

```sql
DROP POLICY IF EXISTS external_returns_filed_select_capability_gate ON public.returns_filed;

CREATE POLICY external_returns_filed_select_capability_gate
ON public.returns_filed
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND has_external_role(auth.uid())
  AND (
    external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_view_status')
    OR external_can_access_return_filed_values(auth.uid(), entity_id, on_behalf_of_licensee_id, created_by, 'can_submit_returns')
  )
);
```

Result:
- Super admins / `view_all_entities` holders: unchanged (allowed by internal-staff policy).
- Assigned internal regulators (incl. `license_analyst`): only returns for their mapped entities in submitted lifecycle (via `can_view_entity_returns`).
- Unassigned internal users without base permission: no rows (matches intent).
- External roles (applicant / licensee_*): unchanged — still gated by capabilities.
- PPOC users: unchanged (separate PPOC SELECT policy).
- Creators of a return: unchanged (own-return policy).

## Verification

1. Re-run existing pgTAP suite `supabase/tests/regulator_access/01_can_view_entity_returns.sql`.
2. Add pgTAP cases:
   - `license_analyst` mapped to entity A: sees only A's submitted returns; 0 rows from entity B.
   - Same user, draft/TEMP return on entity A: not visible.
   - Internal user with no assignment and no `view_all_entities`: 0 rows.
   - External licensee_primary: still sees own entity's returns.
3. Live smoke: log in as the affected regulator, open `/admin/returns/queue`, confirm only mapped entity's submitted returns appear.

## Out of scope

No frontend changes. `usePermissions` assignment-based menu unlock stays as-is — the list is now correctly filtered server-side.
