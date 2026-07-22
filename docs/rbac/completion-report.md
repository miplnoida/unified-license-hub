# Roles & Permissions — Completion Report

Last updated: 2026-07-22 (closure sprint).

This report is the single source of truth for what is completed, what is
verified in CI, what is still a known limitation, and what has been
formally deprecated. It supersedes every previous phase-report and no
longer includes historical narrative — see git history for that.

## Status legend

| Column        | Meaning                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| **Completed** | Code / migration merged.                                                |
| **Tested**    | Automated test (pgTAP, Vitest, or Deno) covers the surface.             |
| **CI**        | The test runs on every push in `.github/workflows/ci.yml`.              |
| **Limit**     | Known gap documented in "Known limitations" below.                      |

## Coverage matrix

| Area                                                              | Completed | Tested | CI  | Limit |
| ----------------------------------------------------------------- | :-------: | :----: | :-: | :---: |
| Catalog: zero `enforced: false`                                   | ✅        | ✅     | ✅  |       |
| `has_permission(user, module, action)` — single authority          | ✅        | ✅     | ✅  |       |
| `has_scoped_permission(...)` — All/Assigned/Sector/Institution/Own | ✅        | ✅     | ✅  |       |
| Assignment resolver (`is_record_assigned_to_user`)                 | ✅        | ✅     | ✅  |       |
| Selector validation (scope_config trigger)                         | ✅        | ✅     | ✅  |       |
| Inactive-role rejection at assignment time                         | ✅        | ✅     | ✅  |       |
| Permission dependency guard (Edit requires View)                   | ✅        | ✅     | ✅  |       |
| Atomic role save (`rbac_save_role` transactional)                  | ✅        | ✅     | ✅  |       |
| Atomic role delete (`rbac_delete_role`)                            | ✅        | ✅     | ✅  |       |
| Sensitive-privilege isolation (never in templates)                 | ✅        | ✅     | ✅  |       |
| `enforce_permission(module, action)`                               | ✅        | ✅     | ✅  |       |
| `enforce_action(module, action, meta)` — universal action gate     | ✅        | ✅     | ✅  |       |
| `record_export_intent(module, action, meta)` — export gate         | ✅        | ✅     | ✅  |       |
| **Shared workflow guard `enforce_workflow_transition`**            | ✅        | ✅     | ✅  |       |
| SoD: actor ≠ submitter on approve/reject/close/issue/revoke/suspend | ✅       | ✅     | ✅  |       |
| SoD override via `<module>.override_workflow`                       | ✅       | ✅     | ✅  |       |
| Persona matrix (13 canonical personas)                              | ✅       | ✅     | ✅  |       |
| Custom-role no-op / metadata-only / scope-only / reorder preserves permissions | ✅ | ✅ | ✅ |     |
| Only intentional permission edit changes `role_permissions`         | ✅       | ✅     | ✅  |       |
| RBAC parity oracle (UI ↔ catalog ↔ scope)                          | ✅        | ✅     | ✅  |       |
| No legacy namespace aliases                                        | ✅        | ✅     | ✅  |       |
| Centralised authorization (no ad-hoc scans in components)          | ✅        | ✅     | ✅  |       |
| Atomic authz (no unallowlisted check-then-mutate patterns)          | ✅       | ✅     | ✅  |       |
| Route/menu coverage tests                                          | ✅        | ✅     | ✅  |       |
| Edge-function authz markers (`user` / `worker` / `public`)          | ✅       | ✅     | ✅  |       |
| Edge-function tests — highest-risk mutating endpoints              | ✅        | ✅     | ✅  | L1    |
| Storage policies on `storage.objects` (per-bucket)                 | ✅        | ✅     | ✅  |       |
| Signed-URL policy parity with direct-read policies                  | ✅       | ✅     | ✅  | L2    |
| Export/download data-filtering happens under RLS                    | ✅       | ✅     | ✅  | L3    |
| Background jobs restricted to worker token / service role           | ✅       | ✅     | ✅  |       |

## Enforcement gates in CI

`.github/workflows/ci.yml` fails the build when any of the following breaks:

1. `verify-rbac-parity.mjs` — UI ↔ catalog ↔ scope drift.
2. `verify-no-alias-namespaces.mjs` — legacy namespace re-introduction.
3. `verify-authz-centralized.mjs` — ad-hoc permission scans in components.
4. `verify-atomic-authz.mjs` — new check-then-mutate flows without a documented allowlist entry.
5. `verify-edge-authz.mjs` — Edge Function without an authorization marker.
6. Catalog `enforced: false` count `!= 0` (inline `bun` assertion).
7. Vitest: `authorize`, `roleValidation`, `accessLevels`, `sensitivePrivilegeProofs`, `personaMatrix` (13 personas), route/menu coverage, RBAC test suite.
8. Required pgTAP files present (see workflow YAML for the current list — includes `283_custom_role_noop`, `284_custom_role_full_regression`, and `290_workflow_guard`).
9. `supabase test db` — full pgTAP suite runs against a fresh DB reset.
10. Deno edge-function tests.

## Shared workflow guard — `public.enforce_workflow_transition`

Every workflow RPC across applications, registration, licensing, returns,
prudential, inspections, enforcement, complaints, Fit & Proper,
correspondence, and coordination is expected to call:

```sql
PERFORM public.enforce_workflow_transition(
  _module         => '<module>',
  _action         => '<approve|reject|close|issue|revoke|suspend|...>',
  _record_id      => <row id>,
  _submitter_id   => <original submitter, if known>,
  _from_state     => '<previous state>',
  _to_state       => '<next state>',
  _meta           => jsonb_build_object(...)
);
```

The guard is `SECURITY DEFINER`, pinned `search_path = public`, and:

1. Rejects unauthenticated callers with `42501`.
2. Delegates entitlement to `public.enforce_permission(module, action)`.
3. Blocks `actor == submitter` on state-changing actions unless the actor
   holds `<module>.override_workflow`.
4. Writes an `audit_logs` row: `workflow.<module>.<action>` with the
   transition and submitter recorded in `changes`.

Tests: `supabase/tests/rbac/290_workflow_guard.sql` (6 assertions —
allow, SoD block, non-SoD action, argument validation, audit-write,
unauthenticated deny).

Scope/state-machine/assignment checks remain inside each module's
domain-specific RPC because they require module-specific column lookups.
The guard is the shared identity + permission + SoD + audit spine; the
module RPC is responsible for the module-specific pre- and post-conditions.

## Custom-role regression

`supabase/tests/rbac/283_custom_role_noop.sql` and
`supabase/tests/rbac/284_custom_role_full_regression.sql` together prove:

- description-only save preserves permissions
- status-only save preserves permissions
- name / metadata-only save preserves permissions
- scope-only save preserves permissions
- reordered `permission_ids` preserves permissions
- no-op save (identical payload) preserves permissions
- combined metadata (description + status + scope) preserves permissions
- only an intentional edit of `permission_ids` mutates `role_permissions`

Comparisons use sorted permission-UUID arrays so ordering never causes a
false pass.

## Persona matrix

`src/test/personaMatrix.test.ts` covers 13 personas against the shipped
role templates: Licensing Officer, Registration Officer, Complaint Officer,
Complaint Supervisor, Returns Officer, Returns Supervisor, Prudential
Analyst, Market Conduct Analyst, Inspector, Enforcement Officer, Auditor,
Read-only User, Administrator. Each persona asserts allowed and denied
actions across every module the brief lists and further proves the persona
never silently receives a `SENSITIVE_ACTION_NAMES` privilege that the
template did not explicitly declare.

## Known limitations

**L1 — Edge-function test breadth.**  Deno tests exist for the highest-risk
mutating functions (complaint sweeps, storage cleanup, `perform-*-action`,
`create-web-user`, `approve-pre-licensee`, `verify-and-submit`) and every
privileged function carries an authorization marker verified by
`verify-edge-authz.mjs`. Full 401/403/200 triads for every remaining `user`-kind
function are being added incrementally; new functions must ship with a test
in the same PR per `docs/rbac/edge-function-authorization.md`.

**L2 — Signed-URL minting.**  Signed URLs generated by the standard
Supabase client inherit the storage `SELECT` policy on
`storage.objects`, so the same `has_scoped_permission` predicate applies.
A dedicated `create_signed_url` RPC that re-checks module.action and logs
each mint is planned but not required for correctness — a caller who
cannot read the object directly cannot mint a URL for it.

**L3 — Export/download data filtering.**  Every export path goes through
`record_export_intent`, and the queried tables are RLS-protected, so the
returned rows are already filtered to the authorized set. Server-side
row materialisation (fully bypassing the client dataset assembly) is
tracked as a future optimisation but is not a security gap.

## Deprecated

- Legacy `authorizedAction()` / `authorizedExport()` calls followed by a
  direct client-side mutation are still permitted, but only for the
  baseline listed in `scripts/atomic-authz-allowlist.json`. New sites
  MUST refactor to a single `SECURITY DEFINER` RPC that fuses the
  permission check and the mutation. `verify-atomic-authz.mjs` fails CI
  for any new occurrence.
- Namespace aliases (`applications`, `licenses`, `returns`, `complaints`,
  `market-conduct`, `fit-and-proper`, etc.) are removed from the catalog
  and the code base. `verify-no-alias-namespaces.mjs` fails CI on
  reintroduction.

## How to extend

- **Adding a workflow action to any module:** call
  `enforce_workflow_transition` at the top of the module's RPC, then add a
  pgTAP row (allow + SoD deny + audit) modelled on
  `290_workflow_guard.sql`.
- **Adding a new module:** add its entry to
  `src/lib/rbac/catalog.json` with `enforced: true`, extend
  `roleTemplates.ts` if a preset is warranted, and add a persona in
  `personaMatrix.test.ts`. CI will fail until the persona has both allow
  and deny assertions.
- **Adding a new Edge Function:** apply the appropriate marker
  (`requireUserPermission` / `requireWorkerInvocation` /
  `markPublicFunction`) and add a row in
  `docs/rbac/edge-function-permission-map.tsv`. CI enforces both.

## Final verdict

The Roles & Permissions implementation meets the closure criteria:
`enforced:false == 0`, all privileged operations are gated by the
central authority (`has_permission` + `enforce_permission` + scope
resolvers), workflow transitions share a single guard with SoD, the
persona matrix covers 13 canonical personas, the custom-role regression
suite protects against silent permission churn, and every gate above is
enforced in CI. Remaining items are tracked under **Known limitations**
above and are hardening improvements rather than open security gaps.
