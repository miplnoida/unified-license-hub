# Tenant Model Refactor — Users, Entities, Primary Users, Employees, Roles

This is a large, cross-cutting change. To keep risk low and the codebase shippable at every step, the work is broken into 5 phases. Each phase ends in a working app — you can stop or re-prioritize after any phase.

> Before starting, I need a couple of decisions from you (see **Open questions** at the bottom). The rest of the plan assumes the most likely answers, but I'll adjust before touching the database.

---

## Goal — the target model

```text
Entity (tenant / licensed organization)
  ├── exactly ONE active Primary User   (via entity_user_access, access_type='primary_user')
  ├── many Employees                    (via entity_user_access, access_type='employee')
  ├── many PPOCs                        (via ppoc_entity_mappings — kept separate)
  └── other contacts                    (access_type='secondary_contact', etc.)

User (login account = profiles row)
  ├── global Roles                      (user_dynamic_roles — source of truth)
  ├── may be Primary User of 0..N entities
  ├── may be Employee of 0..N entities
  └── login context only                (user_type: 'internal' | 'licensee' | 'pre_licensee' | 'applicant')
```

Key rules enforced at DB + API + UI:
- One active `primary_user` mapping per entity.
- A user can be primary for many entities.
- Employee creation never grants entity ownership.
- Roles are global; same role set applies across every entity the user can access.
- PPOC ≠ Primary User (separate `access_type`).

---

## Phase 1 — Data model (migration)

New table `entity_user_access`:

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid → profiles.id | |
| entity_id | uuid → licensees.id | "Entity" = `licensees` row |
| access_type | enum | `primary_user`, `employee`, `secondary_contact` |
| is_active | boolean | default true |
| start_date / end_date | timestamptz | optional |
| created_by, created_at, updated_at | | |

Constraint: **partial unique index** on `(entity_id) WHERE access_type='primary_user' AND is_active=true` → guarantees max one active primary per entity.

New table `employee_profiles` (only if you confirm — see Q3):
- `user_id`, `entity_id`, `employee_code`, `designation`, `department`, `status`.

`profiles.user_type` semantics tightened:
- `primary` / `secondary` → kept as legacy column (do not break existing code), but no longer used to *decide* who is the primary user. Source of truth becomes `entity_user_access`.
- New employees created from Employee Management get `user_type='primary'` only if they are the first user of an entity tenant; for **internal/admin/regulator employees**, we stop sending `user_type:'primary'` and send `'internal_employee'` (added to `user_type` enum).

Backfill (logged, reversible):
- For every `licensees` row, find the existing `profiles` with `licensee_id = licensee.id AND user_type='primary'` → insert `entity_user_access(access_type='primary_user', is_active=true)`.
- Secondaries → `access_type='secondary_contact'`.
- PPOC mappings stay where they are; we do NOT copy them into `entity_user_access` (PPOC ≠ Primary).

RLS:
- Internal roles: full read; admins/super_admins: write.
- Licensee primary/secondary: read mappings of their own entity.
- Helper function `is_primary_user_of(entity_id, user_id)` for use in other RLS policies that currently rely on `user_type`.

---

## Phase 2 — Employee Management fix (smallest, highest value)

`src/pages/admin/UserManagement.tsx` (the "Employee Management" page) and `supabase/functions/create-web-user`:

1. Stop sending `user_type:'primary'` for internal employees. Send `user_type:'internal_employee'` (or omit entirely and rely on roles).
2. Page copy: "Employee Management — Manage internal/admin/regulator employee accounts, profiles, roles, and access."
3. Remove any "Primary User" affordance from this screen. Add a banner linking to the new Primary User assignment screen.
4. Multi-role assignment via `user_dynamic_roles` (already supported — keep working).
5. Backend (`create-web-user`): reject the combination `user_type='primary' + no licensee_id` to prevent the current bug from recurring.

`src/components/entity-detail/WebUsersTab.tsx` continues to create **licensee** primary/secondary users — that flow is correct and stays, but now also writes the matching `entity_user_access` row in addition to `profiles.user_type` (transitional dual-write).

---

## Phase 3 — Primary User assignment flow

New section inside `src/pages/admin/LicenseeDetail.tsx` → "Primary User" tab (or a new card in the existing Web Users tab):

- Shows current active Primary User.
- "Change Primary User" → modal:
  - Pick existing user (search) **or** create new.
  - On submit: SweetAlert2 confirm — *"This entity already has an active Primary User. Assigning a new Primary User will deactivate the existing one."*
  - Calls new RPC `assign_primary_user(entity_id, user_id)` which atomically: deactivates current primary mapping, inserts new active mapping, writes audit log.
- "Entities managed" view on user detail (added to admin user view).

Frontend errors map to spec:
- *Each entity can have only one active Primary User.*
- *This user is already the active Primary User for this entity.*
- *Please assign a replacement Primary User before deactivating the current one.*

---

## Phase 4 — PPOC alignment + Entity Detail polish

- PPOC management (`src/pages/admin/PpocManagement.tsx`) unchanged in storage, but UI labels clarified: "PPOC ≠ Primary User".
- `LicenseeDetail` shows four distinct sections: Entity details · Active Primary User · Employees · PPOC mappings · Other access.
- Admin user detail (in `UserManagement` row drilldown) shows: profile, global roles, entity access list, "Primary user of: …", "Employee of: …".

---

## Phase 5 — Cleanup, tests, docs

- Remove dead code paths that read `profiles.user_type='primary'` to identify ownership; replace with `entity_user_access` queries (search & swap, ~10–15 spots based on a quick scan).
- Add Vitest unit tests:
  - `assign_primary_user` deactivates the previous mapping.
  - `create-web-user` for internal employee does NOT create a primary mapping.
  - One-active-primary constraint blocks duplicates at DB level.
- Update README/admin docs.

---

## What stays the same (no behavioral change)

- Login & auth flows.
- Existing role permission checks (`has_role`, `user_dynamic_roles`).
- PPOC sector restrictions (recently added).
- Pre-licensee and applicant flows.
- All existing `profiles.user_type` values continue to satisfy current RLS — we add new values, never repurpose old ones.

---

## Open questions (need your call before Phase 1)

1. **Entity table** — Use the existing `licensees` table as "Entity" (recommended, no rename), or introduce a new `entities` table? If rename, every page using `licensees` needs touching; recommend keep `licensees`.
2. **Internal employees & entities** — Should internal regulator/admin employees be tied to a "regulator entity" (using `regulators` table), or have no entity at all? Current code treats them as standalone. Recommend: no entity required.
3. **`employee_profiles` table** — Add a dedicated `employee_profiles` table (employee_code, designation, department), or keep those fields on `profiles` (which already has `department`, `position`)? Recommend: keep on `profiles` to avoid a second source of truth.
4. **Backfill scope** — OK to auto-create `entity_user_access` rows from existing `profiles.user_type` data, with a one-time audit log? (Reversible.)

Once you confirm 1–4 (or just say "use your recommendations"), I'll start with Phase 1's migration.
