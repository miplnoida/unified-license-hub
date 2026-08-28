# F2-C — Users, Entity Identity & Onboarding — Final Certification & Freeze

- **Date:** 2026-08-28
- **Certification HEAD:** `e0554a3625693e0ed6912f8d301e1f0a0d931228`
- **Scope:** F2 estate (user lifecycle, entity identity, onboarding journeys, membership authority, onboarding tokens)
- **Protected baselines:** F0 (frozen), F1 (frozen)
- **Verdict:** **F2 NOT CERTIFIED — RETURN TO F2-B**

---

## 1. Stage 0 — Rebaseline of protected contracts

| Gate | Command | Expected | Observed | Result |
|---|---|---|---|---|
| F0 product certification | `npm run verify:f0c` | 34 pass / 0 fail | 34 TESTED_PASS / 0 TESTED_FAIL | PASS |
| F1 product certification | `npm run verify:f1c` | 96 pass / 0 fail | 96 TESTED_PASS / 0 TESTED_FAIL | PASS |
| F2-B remediation gate | `npm run verify:f2b` | 63 pass / 0 fail | 63 TESTED_PASS / 0 TESTED_FAIL (see DEF-F2-C-02) | PASS |
| Listing/export hardening | `npm run verify:hardening` | all pass | 31 PASSED / 0 FAILED / 0 SKIPPED | PASS |
| Anonymous EXECUTE (GAP-F0-08) | `npm run verify:anon-execute` | 0 defects | 8 allowlisted, 1105 extension-owned residual, 0 defects | PASS |
| Definer guards (F0-B7) | `npm run verify:definer-guards` | PASS | PASS | PASS |
| Service configuration completeness | `npm run verify:service-completeness` | 0 incoherent rows | 0 rows | PASS |
| Frontend suite | `npm run test` | all pass | 140 files / 1281 tests passed | PASS |
| **Breadcrumb coverage (F0 contract)** | `npm run verify:breadcrumbs` | 0 uncovered routes | **1 uncovered: `/register/authority-pending`** | **FAIL** |

A frozen-contract gate fails at the certification HEAD. Under the Track-A charter this is a
stop condition: F2 cannot be certified or frozen while an F0 gate is red, and the defect is
recorded rather than silently remediated inside a certification pass.

---

## 2. Registered defects

### DEF-F2-C-01 — Breadcrumb coverage regression on a frozen F0 contract (High — blocking)

- **Introduced by:** F2-B (GAP-F2-03 dead-route remediation).
- **Evidence:** `verify:breadcrumbs` → `Routes checked: 339, Uncovered: 1 — /register/authority-pending`.
- **Cause:** `/register/authority-pending` is declared in `src/routes/publicRoutes.tsx` and is the
  documented resume route returned by `public.onboarding_request_membership_by_token()`, but it has
  no rule in `src/lib/breadcrumbs/breadcrumbRouteRegistry.ts` and no navigation-snapshot href. Every
  sibling public registration route (`/register/entity`, `/register/applicant`, `/register/account`,
  `/register/legacy`) carries a registry rule.
- **User-visible impact:** the authority-pending screen renders a humanised URL-segment trail instead
  of a governed breadcrumb — exactly the failure mode the F0 contract exists to prevent.
- **Required fix (F2-B):** add a breadcrumb registry rule for `/register/authority-pending`
  (parent `/register`, public audience) and re-prove `verify:breadcrumbs`.

### DEF-F2-C-02 — Non-deterministic F2-B gate observation (Low — non-blocking)

- On the first execution of `verify:f2b` in this pass the summary reported
  `62 TESTED_PASS / 1 TESTED_FAIL`; eight consecutive subsequent executions reported
  `63 TESTED_PASS / 0 TESTED_FAIL` and the failing assertion could not be reproduced or identified.
- **Risk:** at least one F2-B assertion appears sensitive to live-data or timing state, so the gate is
  not provably deterministic. Certification requires reproducible evidence.
- **Recommended fix (F2-B):** persist the full assertion table to an artifact on every run and make
  data-derived assertions (live-count and token-expiry comparisons) fixture-scoped.

---

## 3. F2 substantive evidence (verified, unaffected by the blockers)

### 3.1 Entity identity convergence

| Check | Observed |
|---|---|
| Governed identity registry size | 37 tables |
| Entities without a canonical party (`licensees.party_id IS NULL`) | 0 |
| Entities bound to a non-`ORGANIZATION` party | 0 |
| Duplicate legal names permitted (F2-B.1) | yes — global unique index removed; identity established by authoritative identifiers plus entity resolution |
| Missing-name fabrication ("Unnamed entity") | removed; `licensees_ensure_party_binding` raises `23514`, `licensees_name_present_chk` enforced |
| Orphan profiles (no `auth.users` row) | 0 |

### 3.2 Privilege contract (registry-derived census, `has_table_privilege`)

| Assertion | Observed |
|---|---|
| `anon` holding any non-SELECT privilege on an identity registry | none |
| `anon` SELECT beyond the registry allowlist | none |
| `authenticated` write privileges outside declared `authenticated_writes` | none — census returns exactly `licensees(UPDATE)`, `profiles(UPDATE)`, `registrations(UPDATE)`, `registration_form_submissions(INSERT,UPDATE)`, each declared with a recorded retention justification |
| Identity registries with RLS disabled | none |

### 3.3 Onboarding token boundary

- `public.onboarding_resolution_tokens` stores `token_hash` only; no raw-token column exists.
- Rows failing the SHA-256 hex shape: **0**.
- `onboarding_issue_token()` requires `auth.uid()` and returns the raw value only to the caller.
- `onboarding_redeem_token()` enforces single use, expiry, owner match and kind match in the shared
  primitive, with distinct error codes for used (`22023`), expired (`22023`) and unknown (`42501`).
- `authenticated_select_allowed = false` for the token store: it is never browser-readable.

### 3.4 Journeys and authority

- **FORM_FIRST** and **ENTITY_FIRST** journeys are both live and DB-vocabulary driven
  (`RegistrationJourneyChoice`, `EntityIdentification`, `UserAccountStep`).
- Membership authority is catalogue-driven: `entity_membership_status_catalogue` marks only
  `APPROVED` as `is_authority_sufficient`; `VERIFIED`, `REQUESTED`, `PENDING_VERIFICATION`,
  `REJECTED`, `REVOKED`, `EXPIRED` are insufficient.
- `entity_membership_approve()` requires `entity_membership.approve` and writes an audit record.
- `onboarding_registration_handoff_ready()` rejects anonymous callers and returns explicit blockers
  (verified live: `No user holds approved authority to act for this entity`).

### 3.5 Recorded data-remediation items (not code defects)

| Item | Observed |
|---|---|
| `identity_data_remediation_register` findings | 2, each with an owner note |
| Entities with no owning human | 38 (matches the recorded figure; operational backfill) |

---

## 4. Verdict

**F2 NOT CERTIFIED — RETURN TO F2-B.**

The F2 substantive contracts (identity convergence, privilege lockdown, token hardening,
authority vocabulary, journey coverage) all hold. Certification is withheld solely because the
frozen F0 breadcrumb-coverage contract is red at this HEAD (DEF-F2-C-01), with DEF-F2-C-02 recorded
as a gate-determinism follow-up. Both are narrow and expected to close in a single F2-B pass,
after which F2-C may be retried without re-opening F2 scope.
