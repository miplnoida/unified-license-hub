# Regulatory Operating Structure

Operating-authority layer that sits **beside** — never instead of — the canonical
`sec_roles` / `sec_permissions` / `sec_user_roles` RBAC model.

## Separation of concerns

| Question | Authority source |
| --- | --- |
| WHAT may a user do? | canonical RBAC permission (`sec_*`) |
| WHERE may they do it? | `regulator_mandates` + `staff_portfolios` (+ `staff_portfolio_scopes`) |
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
  from existing modules; no legal thresholds or policy invented.
- `regulator_mandates` — `regulator_id`, `regulatory_function_id`, optional
  `sector_id` / `sub_sector_id`, `responsibility_type`
  (`LEAD | JOINT | SUPPORT | ADVISORY`), effective dates, status
  (`active | inactive | requires_admin_review`). A trigger validates that a
  sub-sector belongs to the declared sector and that a sub-sector implies a
  sector.
- `regulatory_teams` / `regulatory_team_members` (`lead | deputy | member |
  observer`) / `regulatory_team_mandates`. A trigger rejects a team mandate
  whose mandate belongs to a different regulator than the team.
- `staff_portfolios` (user, regulator, function, optional team, effective
  dates, status) and `staff_portfolio_scopes` with concrete
  `sector_id` / `sub_sector_id` / `entity_id` — no free text.

Legacy fields are untouched: `sectors.regulator_id` and
`profiles.regulator_id` remain, the latter as the user's *home* regulator only.

## Authorization functions (implemented)

| Function | Purpose |
| --- | --- |
| `user_scope_grants_for(user, module, action)` | Returns **independent** grants: `all`, `sectors[]`, `sub_sectors[]`, `institutions[]`, `regulators[]`, `assigned`, `team`, `own`. Falls back to the legacy resolver only when no `sec_*` grant qualifies. |
| `staff_portfolio_allows(user, regulator, sector, sub_sector, entity)` | Narrowing check. Returns `true` when the user has no portfolio configured (portfolios then do not restrict), otherwise requires a matching active portfolio and, where scopes exist, a matching concrete scope row. |
| `regulator_mandate_supports(regulator, sector, sub_sector)` | Returns `true` when the regulator has no mandates recorded yet (migration-safe), otherwise requires an active covering mandate. |
| `user_team_covers_entity(user, entity)` | Team-based entity coverage via the team code recorded on the entity supervision assignment (compatibility bridge until the assignment carries `team_id`). |
| `regulatory_scope_allows(user, module, action, regulator, sector, sub_sector, entity, owner)` | Canonical composite check: permission → role scope → portfolio → mandate. |

`user_scope_for()` is **retained unchanged** as a compatibility facade; callers
migrate to `user_scope_grants_for()` incrementally.

## Coverage types

`sec_scope_types` gains `regulator`, `sub_sector` and `team`. They are enforced
by `regulatory_scope_allows()` from the moment they exist — no UI-only
selector was shipped. A sub-sector-restricted grant is never satisfied by its
parent sector alone.

## Not yet implemented (see the gap register)

Governed entity-supervision routines, examination-aware authorization, appeal
panel/vote RPCs and quorum-by-participation, regulator-aware F&P committee
administration, the Administration → Regulatory Operating Structure UI,
Staff 360, coverage checks, and the negative-test suites.
