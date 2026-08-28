# F2-C RETRY — Users, Entity Identity & Onboarding — Final Certification & Freeze

- **Date:** 2026-08-28
- **Certification HEAD:** `0802c0bd12ba7a2b5087c19bc661d4e87eec375d`
- **Branch:** `main` (== `origin/main`); working tree **CLEAN** (only git-ignored `artifacts/` logs written)
- **Commits since the F2-B2 remediation HEAD:** none — `0802c0bd…` *is* HEAD, so no reclassification or rescoped rebaseline was required
- **Previous (failed) certification:** `docs/certification/F2-users-entity-identity-onboarding-final-certification-2026-08-28.md` (preserved unchanged)
- **Remediation input:** `docs/certification/F2-B2-certification-defect-remediation-2026-08-28.md`
- **Verdict:** **F2 PRODUCT CERTIFIED AND FROZEN — DATA REMEDIATION ITEMS RECORDED**

---

## 1. Protected F0 baseline

| Gate | Observed | Result |
|---|---|---|
| `verify:f0c` | 34 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | PASS |
| `verify:breadcrumbs` | Routes 339, Registry rules 266, Nav hrefs 188, **Uncovered 0**, 0 stale/orphan rules | PASS |
| `verify:hardening` | 31 PASSED / 0 FAILED / 0 SKIPPED | PASS |
| `verify:anon-execute` | 8 allowlisted, 1105 extension-owned residual, **0 defects** | PASS |
| `verify:definer-guards` | PASS | PASS |
| `verify:service-completeness` | 0 incoherent rows | PASS |

All totals match the frozen F0 baseline exactly; no protected contract changed or weakened.

## 2. Protected F1 baseline

| Gate | Observed | Result |
|---|---|---|
| `verify:f1c` | 96 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | PASS |

## 3. F2-B determinism retest (DEF-F2-C-02)

Three consecutive runs during this pass, each preserved (git-ignored):

| Run | Artifact | Summary | G-05 |
|---|---|---|---|
| 1 | `artifacts/f2c-retry-f2b-run-1.log` | 63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | `live=38 recorded=38` |
| 2 | `artifacts/f2c-retry-f2b-run-2.log` | 63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | `live=38 recorded=38` |
| 3 | `artifacts/f2c-retry-f2b-run-3.log` | 63 TESTED_PASS / 0 TESTED_FAIL / 0 N-A | `live=38 recorded=38` |

Gate mechanics verified by inspection:

- `package.json` → `verify:f2b` runs under `set -o pipefail` and tees full output to `artifacts/verify-f2b-latest.log`, preserving the psql exit code.
- Summary block emits `F2-B FAILED ASSERTION [stage id] description -- detail` for every failed assertion and `F2-B NOT-APPLICABLE ASSERTION [...]` for every N/A assertion before raising.
- S7 G-05 reads live and recorded counts in a single SQL statement (race window removed) and prints both.
- S2/S3 fixture-sensitive probes remain inside inner `F2B_PROBE_ROLLBACK` subtransactions within an outer transaction ending in `ROLLBACK`.
- Assertion count unchanged: **63**.

## 4. Breadcrumb closure (DEF-F2-C-01)

Registry contains exactly the intended additive rule
(`src/lib/breadcrumbs/breadcrumbRouteRegistry.ts:24`):

```ts
{ pattern: '/register/authority-pending', label: 'Authority pending', parent: '/register', audience: 'public' },
```

- Single canonical mechanism — no second breadcrumb source added; sibling registration rules unchanged.
- Route unchanged (`src/routes/publicRoutes.tsx:53`).
- Resume behaviour unchanged: `onboarding_stage_catalogue.AUTHORITY_PENDING.resume_route = /register/authority-pending`.
- Live render at `/register/authority-pending`: trail resolves as **Home > Register > Authority pending**; page renders its governed sign-in/resume surface. No workflow semantics altered.

## 5. Frontend / typecheck / build

| Check | Observed |
|---|---|
| `npm run test` | 140 files / 1281 tests passed |
| `tsgo --noEmit` | clean |
| `npm run build` | built OK (chunk-size advisories only) |

## 6. Entity identity convergence (live census)

| Check | Observed |
|---|---|
| Governed identity registries | 37 (unchanged; all rows carry domain, canonical write path, privilege declaration; 0 incoherent rows) |
| `licensees.party_id IS NULL` | 0 |
| Canonical parties not `ORGANIZATION` | 0 |
| Orphan profiles (no `auth.users` row) | 0 |
| Global unique index on normalised `licensees.name` | 0 (duplicate legal names remain supported; identity via authoritative identifiers + entity resolution — coexistence re-proved by `verify:f2b`) |
| "Unnamed entity" fabrication | 0 occurrences |

## 7. Privilege contract (registry-derived, `has_table_privilege`)

| Assertion | Observed |
|---|---|
| `anon` non-SELECT privileges on identity registries | 0 |
| `anon` SELECT outside declared allowlist | 0 |
| Identity registries with RLS disabled | 0 |
| `authenticated` writes outside declared `authenticated_writes` | 0 |

Declared `authenticated` write exceptions — live privileges match the recorded contract exactly, each with a retention justification:

| Registry | Live | Declared | Justified |
|---|---|---|---|
| `licensees` | UPDATE | UPDATE | yes |
| `profiles` | UPDATE | UPDATE | yes |
| `registrations` | UPDATE | UPDATE | yes |
| `registration_form_submissions` | INSERT, UPDATE | INSERT, UPDATE | yes |

No silent widening.

## 8. Onboarding token boundary

- Columns of `public.onboarding_resolution_tokens`: `id, user_id, token_kind, entity_id, case_id, payload, consumed_at, expires_at, created_at, token_hash` — **hash-only; no raw-token column**.
- Rows failing the SHA-256 hex shape: **0**.
- `authenticated` SELECT on the token store: **false** (never browser-readable).
- `onboarding_issue_token()` requires `auth.uid()` and returns raw material only to the caller.
- `onboarding_redeem_token()` enforces single use (`consumed_at`), expiry (`expires_at`), owner match (`user_id`) and kind match (`token_kind`), with distinct codes: used/expired `22023`, unknown `42501`. Re-proved by the S5 assertions of `verify:f2b` on all three runs.

## 9. Registration journeys

| Journey | Enabled | Public | Entry route |
|---|---|---|---|
| `FORM_FIRST` | true | true | `/register/applicant` |
| `ENTITY_FIRST` | true | true | `/register/entity` |

DB vocabulary remains authoritative for `RegistrationJourneyChoice`, `EntityIdentification` and `UserAccountStep`
(`src/test/f2IdentityVocabulary.test.ts` green in the frontend suite). No third implicit lifecycle exists.

## 10. Authority contract

| Status | Authority sufficient |
|---|---|
| `APPROVED` | **true** |
| `VERIFIED`, `REQUESTED`, `PENDING_VERIFICATION`, `REJECTED`, `REVOKED`, `EXPIRED` | false |

`entity_membership_approve()` still requires the governed `entity_membership.approve` permission and writes an audit record.

## 11. Handoff readiness

- Anonymous caller: `set role anon; select public.onboarding_registration_handoff_ready(...)` → `ERROR: permission denied for function onboarding_registration_handoff_ready` (denied).
- Entity without `APPROVED` authority: explicit blocker `No user holds approved authority to act for this entity` (S6 assertions, all three runs).
- Entity with `APPROVED` authority: eligible per canonical rules. No widening through `VERIFIED` or any intermediate state.

## 12. Data remediation register (remains explicitly open)

| Finding | Recorded | Live | Class | Owner note |
|---|---|---|---|---|
| `ENTITY_WITHOUT_OWNING_HUMAN` | 38 | 38 | onboarding_closure | yes |
| `REGISTRATION_WITHOUT_ENTITY_BINDING` | 1 | 1 | handoff | yes |

Counts match; no backfill performed in this pass; both remain open operational items, not certification passes.

## 13. Contract drift

- **F0 functional drift:** NONE (all six F0 gates at baseline totals).
- **F1 functional drift:** NONE (96/96).
- **F2 remediation-only drift:** expected and narrow — one additive breadcrumb registry rule and evidence-only changes to `scripts/verify-f2b-remediation.sql` / the `verify:f2b` script entry. No product behaviour changed.

## 14. Certification defect register

| Defect | Status |
|---|---|
| DEF-F2-C-01 — breadcrumb coverage regression | **CLOSED** |
| DEF-F2-C-02 — F2-B gate determinism | **CLOSED** |
| New blocking defects | **0** |

---

## 15. Final matrix

```text
F2-C RETRY — FINAL CERTIFICATION

Certification HEAD:              0802c0bd12ba7a2b5087c19bc661d4e87eec375d
Working Tree:                    CLEAN
F0:                              34/34
F1:                              96/96
F2-B Run 1:                      63/63
F2-B Run 2:                      63/63
F2-B Run 3:                      63/63
F2-B N-A:                        0
Breadcrumb Coverage:             0 uncovered (339 routes / 266 rules)
Hardening:                       PASS (31/0/0)
Anon Execute:                    0 defects
Definer Guards:                  PASS
Service Completeness:            PASS
Frontend:                        PASS (140 files / 1281 tests)
Typecheck:                       PASS
Build:                           PASS
Entity Party Completeness:       PASS
Organization Party Type:         PASS
Orphan Profiles:                 0
Privilege Census:                PASS
Token Hash-Only:                 PASS
FORM_FIRST:                      PASS
ENTITY_FIRST:                    PASS
Authority-Sufficient Status:     APPROVED ONLY
Authority-Pending Route:         PASS
Authority-Pending Breadcrumb:    PASS
Registration Handoff:            PASS
Data Remediation Register:       PASS
ENTITY_WITHOUT_OWNING_HUMAN:     38/38
REGISTRATION_WITHOUT_ENTITY_BINDING: 1/1
DEF-F2-C-01:                     CLOSED
DEF-F2-C-02:                     CLOSED
New Blocking Defects:            0
```

---

## 16. Verdict

```text
F2-C RESULT: PASS

F2 — USERS, ENTITY IDENTITY & ONBOARDING: CERTIFIED
F2: FROZEN
DEF-F2-C-01: CLOSED
DEF-F2-C-02: CLOSED
DATA REMEDIATION: REMAINS EXPLICIT / NOT HIDDEN

READY TO PROCEED TO THE NEXT TRACK-A PHASE
```
