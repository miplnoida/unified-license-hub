# Regulatory Scope Authorization

Backend contract for the operating-authority layer. Frontend guards remain
cosmetic; every decision below is resolved in Postgres.

## Effective authorization model

A business action on a record is permitted only when **all** of the following
hold (evaluated in this order by `public.regulatory_scope_allows`):

1. `public.has_permission(user, module, action)` — active canonical role grants
   the permission. (`sec_user_roles → sec_role_permissions → sec_permissions`.)
2. The role grant's scope allows the record. Grants are evaluated
   **independently** via `public.user_scope_grants_for`; a qualifying `all`,
   `regulators[]`, `sectors[]`, `sub_sectors[]`, `institutions[]`, `assigned`,
   `team` or `own` grant each stands on its own and none is collapsed away.
3. An active staff portfolio allows the record **where a portfolio is
   configured** for that user (`public.staff_portfolio_allows`).
4. The regulator/sector/sub-sector combination is supported by an active
   regulator mandate **where mandates are recorded** for that regulator
   (`public.regulator_mandate_supports`).
5. Case/entity assignment requirements are satisfied (module-specific;
   `assigned` and `team` grants resolve through
   `public.user_has_entity_assignment` / `public.user_team_covers_entity`).
6. Maker-checker, conflict and decision-body rules are satisfied
   (module-specific; unchanged by this layer).

## Narrowing-only invariant

Steps 3-6 can only *remove* authority. There is no code path in which a
mandate, team membership, portfolio or entity assignment produces `true` when
step 1 produced `false`. Any future routine that needs assignment-derived
authority must still call `has_permission` first.

## Bypass

`public.is_super_admin(user)` — the single break-glass Super Administrator —
short-circuits to `true`. No other role, including ordinary `admin`, bypasses
business authority. Service-role code paths (governed RPCs, sweeps) must
re-derive `auth.uid()` and call `regulatory_scope_allows` explicitly.

## Sub-sector semantics

- A grant restricted to `sub_sectors[]` is satisfied only by the exact
  sub-sector; the parent sector is not sufficient.
- Classification is derived server-side from the record's entity
  (`public.entity_regulatory_scope`); callers never assert their own
  regulator / sector / sub-sector.
- A mandate row with `sector_id` set and `sub_sector_id NULL` covers all
  sub-sectors of that sector. A mandate with `sub_sector_id` set covers only
  that sub-sector.

## Mandate activation (fail-closed once configured)

`regulator_mandate_supports` is **inert until activated**: while the
`(regulator, regulatory_function)` pair has no `ACTIVE` row in
`public.regulator_mandate_enforcement`, the mandate layer returns `true`. That
is not a grant — authority still requires step 1. Once activated, the absence of
a covering mandate for the exact dimensions **denies**, and a mandate belonging
to a different regulatory function never satisfies the check.

## Entity assignment and assignment administration

- `user_has_entity_assignment(user, entity, function)` is function-aware: an
  assignment held for one regulatory function confers no authority for another
  (twin-peaks isolation).
- `user_team_covers_entity` requires an active team, an active membership and a
  function-compatible team.
- Administering assignments (`licensee_management.assign_supervision`) is a
  separate permission from performing the supervisory function, but the
  administrator's narrowing layers are evaluated against the **target**
  function via `regulatory_assignment_scope_allows`, which is never wider than
  the module-level check.
- Lead / alternate nominees must be active internal staff, must satisfy the
  permissions declared in
  `public.regulatory_function_assignment_requirements`, and — where the
  assignment carries a `team_id` — must be active members of that team.

## Migration safety

Both narrowing checks are *inert until configured*:

- no active portfolio for the user → portfolios do not restrict;
- no `ACTIVE` mandate enforcement for the regulator + function → mandates do not
  restrict.

This prevents a silent lock-out of certified P01-P15 behaviour while the
structure is being populated. Rows whose historic mapping cannot be proven are
recorded as `requires_admin_review`, never invented.

## Table access

The operating-structure tables grant `SELECT` to `authenticated` and are
readable only by users holding `security_management.view`,
`role_management.view` or `user_management.view`. **No write policy exists** for
`authenticated` or `anon` on `entity_supervision_assignments` or
`regulatory_function_assignment_requirements`: all canonical writes go through
governed `SECURITY DEFINER` routines executing as `service_role`, which are
audited. `anon` receives no grant at all.

## Function privileges

Every function added here is `SECURITY DEFINER`, `STABLE`,
`SET search_path = public`, with `EXECUTE` revoked from `PUBLIC` and granted
only to `authenticated` and `service_role`.

## Executed verification

| Suite | Assertions | Result |
| --- | --- | --- |
| `supabase/tests/regulatory/01_phase_1_1_authority.sql` | 40 | 40 passed |
| `supabase/tests/regulatory/02_phase_2_entity_supervision.sql` | 59 | 59 passed |

