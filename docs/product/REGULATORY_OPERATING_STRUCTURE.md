# Regulatory Operating Structure

Operating-authority layer that sits **beside** — never instead of — the canonical
`sec_roles` / `sec_permissions` / `sec_user_roles` RBAC model.

## Separation of concerns

| Question | Authority source |
| --- | --- |
| WHAT may a user do? | canonical RBAC permission (`sec_*`) |
| WHERE may they do it? | `regulator_mandates` (+ `regulator_mandate_enforcement`) and `staff_portfolios` (+ `staff_portfolio_scopes`) |
| WHICH organisational unit? | `regulatory_teams` / `regulatory_team_members` |
| WHICH regulated entity do they own? | `entity_supervision_assignments` |
| WHICH case do they work? | case teams / case assignments (per-process tables) |
| WHICH formal decision body? | appeal panels, F&P committees |

**Invariant:** a mandate, team, portfolio or entity assignment can only ever
*narrow* authority. None of them can grant a permission the user's canonical
roles do not already grant. Enforced in
`public.regulatory_scope_allows()` — step 1 is `has_permission()`, and every
later step can only return `false`.

Only the break-glass Super Administrator (`public.is_super_admin`) bypasses
business authority. Ordinary administration does **not**.

## Phase 1 data model (implemented)

- `regulatory_functions` — governed catalogue of supervisory functions, each
  mapped to an existing business module key (`module_key`) with a coverage
  level of `sector | institution | global`. Seeded with 12 functions derived
  from existing modules; no legal thresholds or policy invented. The module →
  function mapping is resolved server-side only, by
  `public.regulatory_function_for_module(_module)`.
- `regulator_mandates` — `regulator_id`, `regulatory_function_id`, optional
  `sector_id` / `sub_sector_id`, `responsibility_type`
  (`LEAD | JOINT | SUPPORT | ADVISORY`), effective dates, status
  (`active | inactive | requires_admin_review`). A trigger validates that a
  sub-sector belongs to the declared sector and that a sub-sector implies a
  sector.
- `regulator_mandate_enforcement` — explicit per-regulator, per-function
  activation switch. Mandates are **inert until activated** (see below).
- `regulatory_teams` / `regulatory_team_members` (`lead | deputy | member |
  observer`) / `regulatory_team_mandates`. A trigger rejects a team mandate
  whose mandate belongs to a different regulator than the team.
- `staff_portfolios` (user, regulator, function, optional team, effective
  dates, status) and `staff_portfolio_scopes` with concrete
  `sector_id` / `sub_sector_id` / `entity_id` — no free text.

Legacy fields are untouched: `sectors.regulator_id` and
`profiles.regulator_id` remain, the latter as the user's *home* regulator only.

## Phase 2 / 2.1 — canonical entity supervision (implemented)

- `entity_supervision_assignments` carries `regulator_id`,
  `regulatory_function_id`, `team_id`, `lead_supervisor_user_id` and
  `alternate_supervisor_user_id`. One current primary assignment per
  **entity + regulatory function**, so twin-peaks ownership (e.g. prudential and
  market conduct on the same entity) is preserved without cross-function leakage.
- Writes are only possible through governed `SECURITY DEFINER` routines —
  `assign_entity_supervision`, `transfer_entity_supervision`,
  `end_entity_supervision_assignment`. Direct `INSERT/UPDATE/DELETE` is revoked
  from `anon` and `authenticated`; history is never destroyed.
- Lead / alternate eligibility is governed configuration, not a bare `view`
  permission: `regulatory_function_assignment_requirements` declares the
  permissions each role must hold, evaluated by
  `public.user_meets_assignment_eligibility`. The nominee must also be an
  active internal staff identity, and where `team_id` is set must be an active
  member of that team (`regulatory_team_membership_active`).
- Assignment administration is a **separate** authority from performing the
  supervisory function, but the administrator's narrowing layers are evaluated
  against the **target** regulatory function via
  `public.regulatory_assignment_scope_allows`.

## Authorization functions (implemented)

| Function | Purpose |
| --- | --- |
| `user_scope_grants_for(user, module, action)` | Returns **independent** grants: `all`, `sectors[]`, `sub_sectors[]`, `institutions[]`, `regulators[]`, `assigned`, `team`, `own`. Falls back to the legacy resolver only when no `sec_*` grant qualifies. |
| `regulatory_function_for_module(module)` | Canonical module → regulatory-function resolver. |
| `entity_regulatory_scope(entity)` | Derives an entity's regulator / sector / sub-sector server-side; callers never pass classification in. |
| `staff_portfolio_allows(user, regulator, sector, sub_sector, entity)` | Narrowing check. Returns `true` when the user has no portfolio configured (portfolios then do not restrict), otherwise requires a matching active portfolio and, where scopes exist, a matching concrete scope row. |
| `regulator_mandate_supports(regulator, function, sector, sub_sector)` | Inert (returns `true`) until the regulator + function pair is `ACTIVE` in `regulator_mandate_enforcement`; once active, requires a covering mandate for the exact dimensions, and a mandate for another function never satisfies it. |
| `user_team_covers_entity(user, entity)` | Team-based entity coverage, restricted to active teams/memberships and function-compatible teams. |
| `user_has_entity_assignment(user, entity, function)` | Function-aware ownership check — an assignment for one function never confers authority for another. |
| `regulatory_scope_allows(user, module, action, regulator, sector, sub_sector, entity, owner)` | Canonical composite check: permission → role scope → portfolio → mandate. |
| `regulatory_assignment_scope_allows(user, module, action, target_function, entity, regulator)` | Target-function-aware authority for assignment administration; never wider than the module-level check. |

`user_scope_for()` is **retained unchanged** as a compatibility facade; callers
migrate to `user_scope_grants_for()` incrementally.

## Coverage types

`sec_scope_types` gains `regulator`, `sub_sector` and `team`. They are enforced
by `regulatory_scope_allows()` from the moment they exist — no UI-only
selector was shipped. A sub-sector-restricted grant is never satisfied by its
parent sector alone.

## Verification

Executed pgTAP suites (run against the live database, not merely present on disk):

| Suite | Assertions | Result |
| --- | --- | --- |
| `supabase/tests/regulatory/01_phase_1_1_authority.sql` | 40 | 40 passed |
| `supabase/tests/regulatory/02_phase_2_entity_supervision.sql` | 59 | 59 passed |

Both suites include negative tests proving zero authority widening, mandate
inert-then-enforced semantics, cross-function isolation and closed direct DML.

## Not yet implemented (see the gap register)

Governed entity-supervision routines are in place; still outstanding are
examination-aware authorization, appeal panel/vote RPCs and
quorum-by-participation, regulator-aware F&P committee administration, the
Administration → Regulatory Operating Structure UI, Staff 360 and coverage
dashboards.
