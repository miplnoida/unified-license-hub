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
- When only a sub-sector is supplied, the parent sector is derived server-side
  so that sector-level grants and mandates still resolve correctly.
- A mandate row with `sector_id` set and `sub_sector_id NULL` covers all
  sub-sectors of that sector. A mandate with `sub_sector_id` set covers only
  that sub-sector.

## Migration safety

Both narrowing checks are *inert until configured*:

- no active portfolio for the user → portfolios do not restrict;
- no active mandate for the regulator → mandates do not restrict.

This prevents a silent lock-out of certified P01-P15 behaviour while the
structure is being populated. Rows whose historic mapping cannot be proven are
recorded as `requires_admin_review`, never invented.

## Table access

The seven new tables grant `SELECT` to `authenticated` and are readable only by
users holding `security_management.view`, `role_management.view` or
`user_management.view`. **No write policy exists**: all canonical writes must go
through governed `SECURITY DEFINER` routines executing as `service_role`,
which are audited. `anon` receives no grant.

## Function privileges

Every function added here is `SECURITY DEFINER`, `STABLE`,
`SET search_path = public`, with `EXECUTE` revoked from `PUBLIC` and granted
only to `authenticated` and `service_role`.
