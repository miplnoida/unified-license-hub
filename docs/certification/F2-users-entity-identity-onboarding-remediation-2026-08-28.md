# F2-B — Users, Entity Identity & Onboarding Remediation

Date: 2026-08-28
Track: F2 (Users, Entity Identity & Onboarding)
Predecessors: F0 CERTIFIED AND FROZEN, F1 CERTIFIED AND FROZEN
Input: `docs/certification/F2-users-entity-identity-onboarding-discovery-2026-08-28.md` (GAP-F2-01…10)
Permanent gate: `npm run verify:f2b` → `scripts/verify-f2b-remediation.sql`

**Verdict: F2-B READY FOR F2-C** — gate result 54 TESTED_PASS / 0 TESTED_FAIL / 0 N-A.

---

## 1. Scope discipline

No F0 or F1 frozen contract was modified. The remediation touches only the F2
estate: user identity records, canonical entity identity, entity membership /
authority, onboarding journey state and onboarding tokens. All configuration
privilege work reuses the F1-B3 privilege contract pattern rather than
re-litigating it.

---

## 2. Gap disposition

| Gap | Title | Disposition | Evidence |
| --- | --- | --- | --- |
| GAP-F2-01 | Identity estate granted destructive privileges to `anon` / `authenticated` | REMEDIATED | S1 A-01…A-08, P-01…P-08 |
| GAP-F2-02 | Two competing entity truths (`licensees` vs RDM party layer) | REMEDIATED | S2 B-01…B-08 |
| GAP-F2-03 | Dead onboarding routes and unrouted/unused screens | REMEDIATED | S6 F-06 + `src/test/f2IdentityVocabulary.test.ts` |
| GAP-F2-04 | Missing uniqueness / ownership keys | REMEDIATED | S3 C-01…C-05 |
| GAP-F2-05 | Authenticated users without an identity record | REMEDIATED | S4 D-01…D-04 |
| GAP-F2-06 | Onboarding tokens stored raw, single-use not enforced | REMEDIATED | S5 E-01…E-07 |
| GAP-F2-07 | Onboarding/membership vocabulary hard-coded in the UI | REMEDIATED | S6 F-01…F-06 |
| GAP-F2-08 | Dead identity screens carried in source | REMEDIATED | files deleted (see §4) |
| GAP-F2-09 | Capabilities present in the database with no access path | CLASSIFIED (register) | S7 G-01…G-03 |
| GAP-F2-10 | Onboarding → registration handoff prerequisites unproven | REMEDIATED | S7 G-06…G-08 |

---

## 3. What was changed in the database

### 3.1 Privilege lockdown (GAP-F2-01)

A registry, `public.identity_governed_tables` (32 tables), records for every
identity table its domain, its canonical write path, whether public (not
signed-in) reads are allowed and with what justification, and which direct
signed-in writes are retained and why.

All privileges were revoked from `anon`, `authenticated` and `PUBLIC` across the
estate and re-granted from the audited census only:

- `anon`: `SELECT` on the public registration catalogues only
  (`registration_journey_types`, `registration_form_configs`).
- `authenticated`: `SELECT` on read-active tables; direct `UPDATE` retained only
  for `profiles`, `licensees` and `registrations` (self-service surfaces still
  bound by RLS).
- `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, `MAINTAIN`: revoked for all
  non-service roles, everywhere.
- `service_role` retains privileged backend access for edge functions.

Empirical negative probes prove the contract at runtime, not just in catalogue
metadata: public and signed-in `TRUNCATE`, `DELETE` and `UPDATE` attempts on the
identity core are refused with `42501`, while the allowlisted public read of the
registration journey catalogue still succeeds.

### 3.2 Canonical entity identity (GAP-F2-02)

`public.licensees.id` is now the single canonical entity identifier, and every
entity is mandatorily bound to an `ORGANIZATION` party:

- 29 previously unbound entities were bound to new organisation records; 38
  `PERSON` parties were backfilled with person rows.
- `licensees.party_id` is `NOT NULL`.
- `trg_licensees_ensure_party_binding` and `trg_parties_ensure_projection`
  converge new records at creation, so divergence cannot re-appear. The gate
  proves this empirically by inserting an entity with no binding and asserting it
  is converged (probe rolled back).

### 3.3 Uniqueness and ownership keys (GAP-F2-04)

Unique indexes: lowercased e-mail on `profiles` and `pre_license_users`,
lowercased entity legal name for non-merged entities, and one entity binding per
registration. The gate empirically proves a duplicate entity name is rejected.

### 3.4 Token handling (GAP-F2-06)

`onboarding_resolution_tokens` no longer stores a raw token: the plaintext column
is dropped, replaced by a mandatory unique SHA-256 `token_hash`. Issue hashes
before storage; `onboarding_redeem_token` now enforces single use atomically
(`consumed_at IS NULL` → `SET consumed_at = now()`) alongside expiry and step
scope. Neither primitive is callable without signing in.

### 3.5 Governed vocabularies (GAP-F2-07)

`onboarding_stage_catalogue` and `entity_membership_status_catalogue` were seeded
from the live database constraints and are asserted to match them exactly, so the
catalogue can never drift from what the database will actually accept. Exactly one
membership status is marked authority-sufficient.

### 3.6 Registers and handoff (GAP-F2-09, GAP-F2-10)

- `identity_capability_register` classifies each identity capability as wired,
  backlog or demoted, with a mandatory decision note.
- `identity_data_remediation_register` records the remaining data findings with
  observed counts; the gate re-derives the counts from live data so the evidence
  cannot go stale.
- `identity_integrity_report()` and `onboarding_registration_handoff_ready()` are
  staff-only reporting/prerequisite checks.

---

## 4. What was changed in the application

- `/register/authority-pending` — the resume route returned by the live journey
  RPCs — is now a real route (`src/pages/registration/AuthorityPendingPage.tsx`).
- Dead screens `VerificationPending.tsx` and `RegistrationFormFill.tsx` deleted.
- `src/hooks/useOnboardingVocabulary.ts` exposes the governed catalogues.
- `OnboardingWorkspace.tsx`, `EntityMemberships.tsx` and
  `EntityIdentification.tsx` no longer carry hard-coded stage or membership
  status lists, and journey routing decisions (pending vs resolved authority)
  are derived from catalogue rows.

---

## 5. Defect found and fixed during gate construction

**DEF-F2-B-01 (High) — handoff readiness check could not report its blockers.**
`onboarding_registration_handoff_ready` accumulated blocker text into a `text[]`
without a cast, so Postgres resolved the concatenation as array-to-array and the
function aborted with `malformed array literal` on every entity that actually had
a blocker. The function was only ever exercised on ready entities before. Fixed by
casting each blocker to `text`; execute is granted to signed-in users and
`service_role` only. Proven by S7 G-08, which asserts a real blocked entity now
returns `ready=false` with a non-empty blocker list.

---

## 6. Permanent gate

`npm run verify:f2b` — 55 registry-derived assertions across seven stages, all
read-mostly (probe writes are rolled back). No table name is hard-coded in the
privilege stages: they are derived from `identity_governed_tables`, so adding a
new identity table without registering and locking it down fails the gate.

Frontend guardrails: `src/test/f2IdentityVocabulary.test.ts` (vocabulary and
route truth), alongside the existing
`src/test/registrationTwoRouteArchitecture.test.ts` and
`src/test/onboardingAuditGuardrails.test.ts` suites (18/18 pass).

---

## 7. Residual business items (not product gaps)

These are data/business decisions, deliberately not auto-resolved:

- Entities with no owning human (recorded in
  `identity_data_remediation_register`) require regulator-side authority
  assignment; the handoff readiness check now blocks them explicitly.
- Capabilities marked *backlog* in `identity_capability_register`
  (entity identity snapshots, entity merges) await F2-C scope confirmation.

---

**Verdict: F2-B READY FOR F2-C.**
