# F8A-B3 — Person Identity Linkage, Appointment/F&P Bridge, Person 360

**Certification record — 2026-08-30**

| Field | Value |
| --- | --- |
| Certified code HEAD | `bb502daf6b3ba2a2124683b6d83edb3f7ce4dd7c` (+ this closure pass) |
| Protected B2 baseline | `54758e439999ce186a0c5dafa047aae03855c8f1` |
| Gate | `npm run verify:f8a-b3` — **67/67**, 0 failed |
| Verdict | **B3 CERTIFIED** |

---

## 1. Scope

B3 delivers canonical person identity linkage on the existing
`parties` / `persons` spine, the appointment ↔ Fit & Proper bridge, the
person-identity resolution queue, and the internal Person 360 surface. It
adds no second person master and no address or graph-visualisation work
(B4/B5 remain unstarted).

## 2. Canonical authorization vocabulary

The B3 resolution surfaces are governed **exclusively** by permissions that
already exist in the catalogue:

| Surface | Permission |
| --- | --- |
| `entity_appointment_resolve_fp_bridge(uuid)` | `licensee_management.edit` **or** `fit_and_proper.edit` |
| `fp_link_person_manual(uuid, uuid, text)` | `fit_and_proper.edit` |
| `fp_person_identity_queue(int)` | `fit_and_proper.view` |
| `person_relationship_network`, `person_360_overview` | `entity_structure.view` / `fit_and_proper.view`, regulator-scoped |
| Routes `/persons/:partyId`, `/persons/identity-queue` | `entity_structure.view` (`sec_routes`), `licensee_management` module guard |

### Retired vocabulary — `entity_structure.edit`

An earlier B3 draft checked `entity_structure.edit`, which is **not** a
catalogued permission. Because an uncatalogued pair resolves to `false` for
every caller, it authorized nothing; it was nevertheless stale vocabulary and
has been removed rather than promoted into the catalogue.

- `entity_structure.edit` was **not** added to the catalogue.
- No compatibility alias, hidden module/action, or frontend fallback was added.
- No role received a broader permission.
- No admin bypass or fallback permission was introduced; fail-closed
  behaviour (`PERMISSION_DENIED`, SQLSTATE `42501`) is unchanged, and
  administrative access flows only through the canonical RBAC model
  (`is_super_admin` plus catalogued permissions).

**Census — original occurrences (2, both executable):**

| Location | Classification |
| --- | --- |
| `supabase/migrations/20260830142826_*.sql:198` | executable — original B3 function body |
| `supabase/migrations/20260830143143_*.sql:34` | executable — intermediate redefinition |

Both were amended in place to `licensee_management.edit`, so a clean replay of
repository history produces the canonical implementation.

**Final executable occurrence count: 0** — across SQL migrations, live
function definitions, RPC bodies, TypeScript/React authorization guards,
permission constants and catalogues, role seeds, tests, and executable
certification sources. Remaining `entity_structure` references elsewhere are
the catalogued `view` / `propose` / `approve` / `apply` / `review` actions and
are unrelated.

### Forward corrective migration

**Not required.** Migration `20260830143932_b92c0f25-*.sql` was already
committed and already recreates `entity_appointment_resolve_fp_bridge` with the
canonical permission checks, so existing environments that had executed the
earlier migrations are already repaired. The correction was not duplicated.

### Clean-replay validation

`scripts/rc1/db/migration-chain.sh fresh` aborts at its built-in 200-failure
cap (long-standing chain drift predating B3, earliest failures dated
2026-03-10) and therefore never reaches the B3 segment. `scripts/rc1/db/replay-continue.sh`
resumes the same disposable cluster past that cap. Result:

```
CONTINUE_FROM=20260830142826_...sql   APPLIED=3 FAILED=2
```

The replayed `entity_appointment_resolve_fp_bridge` definition is
**byte-identical** to live:

```
replayed md5 = 01d7920496d2c7df37a4214e88d6ebf4
live     md5 = 01d7920496d2c7df37a4214e88d6ebf4
```

Zero stale references and zero stale catalogue rows in the replayed database
(`STALE_FN_COUNT=0`, `STALE_CATALOGUE=0`). The two segment failures are
upstream drift consequences (`fp_individual_party_links` and the
`entity_structure.view` seed row were never created because their migrations
fell inside the pre-existing 200-failure window), not B3 defects.

## 3. Authorization evidence

`scripts/verify-f8a-b3.sql` section **J** proves the model behaviourally
against live identities. Each probe targets a random id so authorization is the
only variable, and nothing is mutated.

| Assertion | Proof |
| --- | --- |
| J-01 | `entity_structure.edit` absent from `sec_permissions` |
| J-02 | zero `public` routines check `entity_structure.edit` |
| J-03 | bridge checks `licensee_management` + `fit_and_proper`, never `entity_structure` |
| J-04 | manual linkage governed by `fit_and_proper.edit` |
| J-05 | **positive** — `licensee_management.edit` passes the bridge guard (domain error, not `42501`) |
| J-06 | **positive** — `fit_and_proper.edit` passes the bridge guard |
| J-07 | **positive** — `fit_and_proper.edit` passes the manual-linkage guard |
| J-08 | **negative** — an unrelated `edit` permission is denied the bridge (`42501`) |
| J-09 | **negative** — an unrelated `edit` permission is denied manual linkage |
| J-10 | **negative** — anonymous callers are denied, fail-closed |

Sections H-01…H-06 additionally retain the unauthenticated, unprivileged and
out-of-regulator-scope denials, including restricted-branch reporting.

## 4. Regression battery

| Check | Result |
| --- | --- |
| `src/test/rbac/catalogueIntegrity.test.ts` | **PASS** 4/4 |
| `src/test/routeCoverage.test.ts` | **PASS** |
| RBAC suites (`src/test/rbac/`) + route guards | **PASS** 78/78 across 12 files |
| Full frontend suite | **PASS** 1317/1317 across 144 files |
| `verify:f8a-b3` | **PASS** 67/67 |
| `verify:f8a-b2` | **PASS** 96/96 |
| `verify:f8a-b1` | **PASS** 64/64 |
| `verify:user-manual` | **PASS** 56/56 |
| Breadcrumb coverage | **PASS** 343 covered / 0 uncovered |
| Navigation icons | **PASS** 215 active items, all approved |
| `verify-authz-centralized` / `-edge-authz` / `-no-alias-namespaces` / `-runtime-ownership` / `-atomic-authz` | **PASS** |
| `npx tsgo --noEmit` | **PASS** |
| Clean migration replay (B3 segment) | **PASS** — byte-identical to live |

Two defects were found and repaired during this closure pass:

1. `/persons/:partyId` and `/persons/identity-queue` were guarded by the
   `licensee_management` module but absent from `ROUTE_MODULE_MAP`. Added
   `['/persons', 'licensee_management']` so guard and map agree.
2. `nav_person_identity_queue` carried the unapproved icon `UserSearch`
   (a sidebar placeholder dot). Corrected to the approved `UserCheck`.

## 5. Live data census

| Object | Rows |
| --- | --- |
| `licensees` | 54 |
| `parties` (`PERSON`) | 38 |
| `persons` | 38 |
| `entity_appointments` | 38 |
| appointments with `person_party_id` | 38 |
| appointments with `fp_individual_id` | 0 |
| `fp_individuals` | 35 |
| `fp_individual_party_links` | 0 |
| unlinked `fp_individuals` | 35 |
| `ownership_interests` | 0 |
| ownership held by a `PERSON` party | 0 |

The 35 unlinked F&P records are the **correct** conservative outcome: B3 links
only on deterministic appointment evidence and refuses to choose between
candidates, so every unresolved record surfaces in the person-identity queue
for an audited, permissioned decision. No linkage was fabricated to improve the
census.

## 6. Frozen contracts preserved

B1 relationship/change-set governance and B2 ownership semantics are unchanged:
`ownership_interests`, `owned_party_id`, bounded deterministic traversal
(default 300 / hard 1000), `entity_ownership_network`, `entity_ubo_resolve`,
distinct economic and voting percentages, governed effective-dated UBO policy,
no hard-coded threshold, no automatic natural-person UBO, per-branch regulator
scope, no sensitive-identity leakage, legal-arrangement party kinds, and
cycle/depth/node limits. Proven by B1 64/64 and B2 96/96, plus B3 sections
I-01/I-02.

## 7. Out of scope — not started

F8A-B4 (normalized/common-address intelligence), F8A-B5 (graph visualisation),
F8A-B6 (final 20-entity certification), F8 Prudential remediation, and F9
Fit & Proper redesign.

## 8. Verdict

**B3 CERTIFIED.** No remaining blockers.
