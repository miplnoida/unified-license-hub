## Goal

Replace the per-user manual capability grants on **External Portal Access** with a **role-template based** system, while keeping internal Role Management untouched. External users will inherit portal capabilities through assigned external role templates, scoped to their entity.

## Architecture

Two separate, dynamic permission systems:

```text
Internal (unchanged)              External (new)
-------------------------         -------------------------------------
roles                             external_portal_roles
permissions                       external_portal_role_capabilities
role_permissions                  external_user_portal_roles
user_dynamic_roles                (cache) external_portal_access
→ admin/workflow/reports          → licensing/returns/complaints/F&P portals
```

## 1. Database migration (additive)

New tables:

- **`external_portal_roles`** — `role_key` unique, `name`, `description`, `applies_to_roles text[]`, `is_system`, `is_active`, audit cols.
- **`external_portal_role_capabilities`** — FK role, `portal_area`, the 7 capability booleans, `unique(role_id, portal_area)`.
- **`external_user_portal_roles`** — FK user (`profiles.id`), nullable `entity_id` (licensees), FK role, `status`, `assigned_by/at`, `unique(user_id, entity_id, external_role_id)`.

For each: GRANTs to `authenticated` + `service_role`, RLS enabled, policies:

- Read own assignments (`auth.uid() = user_id`) for `external_user_portal_roles`.
- Admin (`has_role(auth.uid(), 'super_admin'|'admin')`) full manage on all 3 tables.
- Authenticated read on role templates + capabilities (needed by client resolver).

Updated function: **`has_portal_capability(_user_id, _entity_id, _area, _capability)`** — security definer; resolves via:

```text
external_user_portal_roles (active, matches user_id + entity_id or NULL)
  → external_portal_role_capabilities (matching portal_area)
  → capability column = true
```

Falls back to existing `external_portal_access` row if no template assignment exists (backward compat cache).

Seed system role `applicant_regulated_entity_user` ("Applicant / Regulated Entity User") with capabilities exactly as specified (licensing/returns/complaints/fp_declarations).

Backfill: for each existing `external_portal_access` row with no matching assignment, create an `external_user_portal_roles` row pointing at the seeded system template — existing access preserved.

## 2. Auto-assignment

- **`register-pre-licensee`** edge function → after creating profile, insert `external_user_portal_roles(user_id, entity_id=null, role=applicant_regulated_entity_user, status=active)`.
- **`approve-pre-licensee`** edge function → when licensee entity is created, update the assignment's `entity_id` to the new licensee id (or insert if missing).
- Licensee primary on entity creation: same template, scoped to entity.
- No assignments are made to internal roles.

## 3. UI redesign — `src/pages/admin/ExternalPortalAccess.tsx`

Three tabs (shadcn `Tabs`):

**A. External Portal Roles**
- List role templates (system + custom), badge system roles as protected.
- Create/Edit dialog: name, key, description, `applies_to_roles` multi-select (applicant/pre_licensee/licensee_primary/licensee_secondary), then for each portal area a switch grid of its valid capabilities.
- Show explicit restrictions notice (cannot access internal workflow, findings, other entities).
- System roles: edit capabilities allowed, delete/rename disabled.

**B. User Assignments**
- Filter by external role (applicant/pre_licensee/licensee_primary/licensee_secondary), search by user/entity.
- Assign dialog: pick user → pick entity (optional) → pick role template → status.
- Table shows assignments with inherited capabilities (read-only chips), activate/deactivate action.

**C. Effective Access**
- Search user (+ optional entity).
- Renders final capabilities per portal area, with "granted by: <role template> on <entity>" attribution rows.

New hooks under `src/hooks/`:
- `useExternalPortalRoles.ts` — CRUD on roles + capabilities.
- `useExternalUserPortalRoles.ts` — CRUD on assignments, plus effective-access resolver.

New lib `src/lib/externalPortalRoles.ts` — constants, capability groupings, types.

Existing `useExternalPortalAccess` hook keeps working (used by external pages); resolver now consults templates first via the updated RPC, so client-side `hasCapability` continues unchanged for end-users.

## 4. Internal Role Management

`src/pages/admin/RoleManagement.tsx`: add a one-line banner — "Internal employee/admin permissions only. External portal roles are managed in External Portal Access." No functional change.

## 5. RLS

No changes to existing entity-scoped RLS on `applications`, `licenses`, `compliance_returns`, `complaints`, `documents`, `file_uploads`, `payments` — they already use `auth.uid()` / entity links. The new resolver only changes how capability checks are answered.

## 6. Tests

- Unit test for `has_portal_capability` resolver order (template > legacy cache).
- Lint + build.

## Acceptance

- Admin defines templates; assigns by role+entity, not by capability per user.
- Pre-licensee registration auto-assigns the seeded system template.
- Existing `external_portal_access` users continue working via backfill.
- Internal Role Management untouched apart from clarifying banner.
- External users still cannot reach internal modules (no new internal grants made anywhere).

## Files touched

- `supabase/migrations/<new>.sql` (tables, RLS, GRANTs, resolver, seed, backfill)
- `supabase/functions/register-pre-licensee/index.ts`
- `supabase/functions/approve-pre-licensee/index.ts`
- `src/pages/admin/ExternalPortalAccess.tsx` (rewrite to 3-tab UI)
- `src/pages/admin/RoleManagement.tsx` (add scope banner)
- `src/hooks/useExternalPortalRoles.ts` (new)
- `src/hooks/useExternalUserPortalRoles.ts` (new)
- `src/lib/externalPortalRoles.ts` (new)
- memory: add `mem://features/external-portal-roles`
