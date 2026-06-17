
# External Portal Access — Entity-Scoped Capabilities

Adds a new capability layer for external users (applicant, pre_licensee, licensee_primary, licensee_secondary) that is **completely separate** from the internal employee module-permission system. Internal `AdminRoute` / `ModuleRoute` / `permissionModules.ts` flow is left untouched.

The existing `entity_user_access` table (primary/secondary linkage between user ↔ licensee) is kept as-is. A new sibling table `external_portal_access` stores per-portal-area capability toggles, so we don't disturb existing licensee-switching/PPoC logic.

---

## 1. Database (one additive migration)

**New table `public.external_portal_access`**

Columns: `id`, `user_id` (auth.users), `entity_id` (licensees, nullable for pre-license applicants), `portal_area` (enum: `licensing | returns | complaints | fp_declarations`), capability booleans (`can_submit`, `can_upload_documents`, `can_view_status`, `can_respond_rfi`, `can_submit_returns`, `can_submit_complaints`, `can_submit_fp_declarations`), `status` (`active|inactive`), `created_by`, `created_at`, `updated_at`.
Unique: `(user_id, entity_id, portal_area)` (entity_id treated via coalesce for null).

**Helper functions (SECURITY DEFINER, `search_path=public`)**
- `public.has_portal_capability(_user uuid, _entity uuid, _area text, _capability text) returns boolean` — single source of truth used by RLS and the client RPC.
- `public.user_entity_ids(_user uuid) returns setof uuid` — active entity_ids the user is linked to (via existing `entity_user_access` + `external_portal_access`).

**RLS on `external_portal_access`**
- SELECT: row's `user_id = auth.uid()` AND `status='active'`, OR `has_role(auth.uid(),'admin'|'super_admin')`.
- ALL (write): admin/super_admin only. (Internal employees with the existing `user_management` module are allowed via the same `enforce_dynamic` pattern already used elsewhere — reusing `usePermissions` server-side function if present.)

**Tighten RLS on existing portal-data tables** (additive policies only — do not drop existing ones, just add restrictive `FOR SELECT TO authenticated USING …` clauses scoped to external roles using `has_role`):
- `applications`, `file_uploads`, `documents`, `compliance_returns`, `complaints`, `licenses`, `registrations`, `payments` — external roles can read only rows where:
  - `submitted_by = auth.uid()` (owner), OR
  - `licensee_id IN (select public.user_entity_ids(auth.uid()))`.
- Internal tables explicitly denied to external roles (add `... AND NOT has_external_role(auth.uid())` to SELECT, or a restrictive policy): `workflow_instances`, `approval_actions` (non-applicant rows), `return_audit_log`, `audit_logs`, `compliance_audit_logs`, `report_*`, `inspections`, `enforcement_actions`, `risk_ratings`, `delegation_rules`.

A new SECURITY DEFINER helper `public.has_external_role(_user uuid) returns boolean` checks the four external roles.

**Audit events** logged into existing `audit_logs` via trigger on `external_portal_access`: `EXTERNAL_PORTAL_ACCESS_GRANTED` (INSERT), `EXTERNAL_PORTAL_ACCESS_UPDATED` (UPDATE), `EXTERNAL_PORTAL_ACCESS_REVOKED` (status→inactive or DELETE).

GRANTs:
```
GRANT SELECT ON public.external_portal_access TO authenticated;
GRANT ALL    ON public.external_portal_access TO service_role;
```

---

## 2. Registration approval hook

Edit edge function `supabase/functions/perform-registration-workflow-action` (and `approve-pre-licensee`) so that, after the existing role assignment on final approval, it also inserts default capability rows into `external_portal_access`. No admin/module permissions are ever granted to external users.

Defaults:
- `pre_licensee` / `applicant` → `licensing` portal: `can_submit`, `can_upload_documents`, `can_view_status`, `can_respond_rfi`.
- `licensee_primary` → `licensing` + `returns` (`can_submit_returns`) + `complaints` (`can_submit_complaints`) + `fp_declarations` (`can_submit_fp_declarations`), all with view/upload/RFI.
- `licensee_secondary` → no defaults; capabilities granted explicitly by admin or primary.

`entity_id` is populated from the approved licensee. Idempotent via `ON CONFLICT (user_id, entity_id, portal_area) DO UPDATE`.

---

## 3. Frontend — portal guard

New file `src/components/auth/PortalRoute.tsx` exporting:
- `<PortalRoute area="returns" capability="can_submit_returns">…</PortalRoute>`
- `canAccessPortal(userId, entityId, area, capability)` helper backed by a new hook `useExternalPortalAccess()` (TanStack Query against `external_portal_access` filtered by `auth.uid()`).

Wire `PortalRoute` around external-facing dashboard routes only (returns submission, complaints submit, F&P declarations, licensing application start). Existing `AdminRoute`/`ModuleRoute`/`InternalRoute` are untouched.

---

## 4. Frontend — external dashboard cards

Update the external user dashboard (the licensee/applicant dashboard pages — not the admin hub) to render portal cards (Licensing, Returns, Complaints, F&P, My Licenses, My RFIs) only when the corresponding capability row is `status='active'`. Cards remain hidden otherwise; RLS is the hard gate.

No change to admin dashboard or sidebar.

---

## 5. Admin management UI

New page `src/pages/admin/ExternalPortalAccess.tsx` (route `/admin/external-portal-access`, behind existing `AdminRoute` + appropriate module key in `permissionModules.ts`):
- Search by user email or entity name.
- Table listing access rows grouped by user.
- Edit dialog: select portal area, toggle capability booleans, activate/deactivate.
- All writes call existing audit logger; triggers fire `EXTERNAL_PORTAL_ACCESS_*` events.

Add a sidebar/Admin Hub entry under the existing "Access Control" group.

---

## 6. Out of scope (explicitly unchanged)

- Internal employee dynamic roles, `permissionModules.ts`, `useUserDynamicPermissions`.
- Existing `entity_user_access` table and PPoC/licensee-switching flow.
- Existing approval workflow, SLA, audit log module, master data flows.
- No change to internal data routes/queues — only additive RLS restricting external roles further.

---

## Technical notes

- New table is sibling to `entity_user_access`; we don't repurpose access_type because the existing enum is primary/secondary, not portal-area.
- All RLS uses SECURITY DEFINER helpers to avoid recursion.
- Migration is fully additive; no destructive ALTER on existing policies — new policies are added with descriptive names (`*_external_scope`) so they can be reverted in isolation.
- Tests: add vitest cases for `canAccessPortal` + a SQL smoke script under `scripts/` checking that an applicant cannot SELECT workflow_instances.
