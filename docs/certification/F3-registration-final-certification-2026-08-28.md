# F3-C — Registration Final Certification & Freeze

Certification pass only — no remediation performed in this pass.

Authoritative inputs:
- `docs/certification/F3-registration-discovery-2026-08-28.md`
- `docs/certification/F3-registration-remediation-2026-08-28.md`
- `docs/certification/F3-B2-certification-defect-remediation-2026-08-28.md`
- Attempt-1 failure record (superseded, retained in §7 of this document)

| Item | Value |
|------|-------|
| Attempt 1 (NOT CERTIFIED) HEAD | `10f7eee9cfa4e3ec05ff1d59a30cfeb42a48ae98` |
| Attempt 2 (this pass) tested HEAD | `17691627d2d4297a287f6a9a9b44cd78507610c4` |
| F2 freeze HEAD (unchanged) | `b0ff1947676d0a07db1474fbf0498b3d0b8be0cc` |
| F3 freeze HEAD | commit containing this certification record at `17691627d2d4297a287f6a9a9b44cd78507610c4` + `scripts/certify-f3c-retry.sql` and this document (evidence-only additions; no runtime source, schema, migration or configuration change was made in this pass) |

## 1. Regression battery — all green

| Gate | Command | Result |
|------|---------|--------|
| F3-B remediation gate | `npm run verify:f3b` | **38 TESTED_PASS / 0 TESTED_FAIL / 0 N-A** |
| Permission references | `npm run verify:permission-refs` | **PASS — 0 uncatalogued project-owned references** |
| F2-B (frozen) | `npm run verify:f2b` | **63 / 0 / 0 — PASS** |
| F1-C (frozen) | `npm run verify:f1c` | **96 / 0 / 0 — PASS** |
| F0-C (frozen) | `npm run verify:f0c` | **34 / 0 / 0 — PASS** |
| Breadcrumbs | `npm run verify:breadcrumbs` | PASS — 0 uncovered routes |
| Hardening | `npm run verify:hardening` | PASS — 31 passed / 0 failed / 0 skipped |
| Edge authz | `node scripts/verify-edge-authz.mjs` | PASS — user=47 worker=27 webhook=1 machine=1 public=7; every function gated |
| Anon EXECUTE | `npm run verify:anon-execute` | PASS — 7 allowlisted, 0 defects (1105 extension-owned residual) |
| Definer guards | `npm run verify:definer-guards` | PASS |
| Service completeness | `npm run verify:service-completeness` | PASS |
| Frontend suite | `npx vitest run` | **PASS — 140 files / 1281 tests passed** |
| Typecheck | `tsgo --noEmit` | PASS |
| Build | `npm run build` | PASS |
| F3-C retry probes (this pass) | `psql -f scripts/certify-f3c-retry.sql` | **PASS — 39/39, two consecutive identical runs, rollback-clean** |

No frozen F0–F2 regression was observed. F0/F1/F2 contracts remain coherent.

## 2. Attempt-1 defect closure re-proved

| Check | Evidence | Result |
|-------|----------|--------|
| `registration_review` is not a permission module | C1/D-01 — absent from `public.permissions`; also absent from `sec_modules` | PASS |
| No runtime database function references `registration_review` | C1/D-02 — 0 matching routines in `public` | PASS |
| `start_registration_workflow` uses the catalogued pair | C1/D-03 — guard references `registration_management` + `approve`/`workflow_action` | PASS |
| Catalogue holds both permissions | C1/D-04 — `registration_management.approve` and `.workflow_action` catalogued | PASS |
| Authorized staff path succeeds | C3/L-01, L-08, L-15 — governed instance started, maker and checker decisions succeed | PASS |
| Ordinary applicant / unrelated user denied | C3/L-02, L-03 — `WRONG_APPROVER`, status unchanged | PASS |
| Maker-checker behaviour unchanged | C3/L-04, L-09 — wrong-step and maker-as-checker actions denied | PASS |
| Gate fails closed for an uncatalogued project-owned reference | `sec_invalid_permission_references` catalogue lookup evaluated against the attempt-1 pair: `registration_review.approve` → would flag; `registration_management.approve` → catalogued | PASS |

**DEF-F3-C-01 — CLOSED.**

## 3. Public duplicate / privacy boundary re-proved

| Check | Evidence | Result |
|-------|----------|--------|
| `anon` cannot execute `check_applicant_name_exists` | C2/P-01 — 0 anon EXECUTE grants | PASS |
| Absent from the anonymous allowlist | `scripts/anon-execute-allowlist.json` records it as retired; `verify:anon-execute` reports 7 allowlisted / 0 defects | PASS |
| No anonymous name / registration-number oracle remains | C2/P-02 — 0 anon-executable probes matching `applicant_name|registration_number` | PASS |
| Public registration UI does not call it | No source reference under `src/` (only the explanatory comment in `useApplicantNameUniqueness.ts`) | PASS |
| Availability not exposed pre-authentication | UI availability markers removed in F3-B2 (`EntityDetailsStep.tsx`, `ApplicantInfoSection.tsx`) | PASS |
| Server-side duplicate control still authoritative | C2/P-03 — `registrations_registration_number_uidx` and `registrations_one_live_per_user_uidx` enforced in the database | PASS |
| Duplicate errors neutralised at submission | `neutraliseRegistrationSubmitError` in `src/lib/registrationDuplicateMessage.ts`, covered by the frontend suite | PASS |
| Unrelated validation/system errors not replaced | Same suite asserts non-duplicate errors pass through unchanged | PASS |

**Anonymous-name-probe residual — CLOSED.** `authenticated` retains EXECUTE by design (post-authentication duplicate resolution); the declared contract is pre-authentication non-exposure.

## 4. Decision lifecycle exercised (rollback-safe fixtures)

Two fixture registrations were driven through the live governed functions inside a rolled-back transaction
(`scripts/certify-f3c-retry.sql`, stage C3).

| ID | Assertion | Observed |
|----|-----------|----------|
| L-01 | Governed workflow instance created on submission | instance created, step 1 active |
| L-02 | Applicant cannot approve own registration | `WRONG_APPROVER`, status stays `pending_review` |
| L-03 | Unrelated authenticated user cannot act | `WRONG_APPROVER` |
| L-04 | Wrong maker (step-2 approver on step 1) denied | `WRONG_APPROVER` |
| L-05 | Mandatory remarks enforced | `REMARKS_REQUIRED` |
| L-06 | Stale workflow instance rejected | `STALE_INSTANCE` |
| L-07 | Stale step rejected | `STALE_STEP` |
| L-08 | Correct maker advances to checker step | `in_progress`, current step = step 2 |
| L-09 | Maker cannot also perform the checker decision | denied (`WRONG_APPROVER`) |
| L-10 | Checker can return for resubmission | `resubmission_required` |
| L-11 | Governed applicant edit allowed in resubmission state | whitelisted field updated |
| L-12 | Applicant cannot mutate the record directly | `42501 permission denied for table registrations` |
| L-13 | Other user cannot edit another entity's registration | `42501 you may only edit your own registration` |
| L-14 | Governed resubmission returns case to review | status back in review lifecycle |
| L-15 | Checker final approval → `approved` | `approved` |
| L-16 | Terminal state immutable to further workflow actions | `INVALID_STATUS` |
| L-17 | Approved data not editable by applicant | denied |
| L-18 | Withdrawal refused after final decision | denied, status remains `approved` |
| L-19 | Every decision recorded in approval history | 4 recorded actions |
| L-20 | Rejection is terminal and recorded | `rejected` |
| L-21 | Withdrawal allowed before final decision | `withdrawn` |

Canonical status vocabulary confirmed from `public.registration_status_vocabulary()`:
`pending_verification, pending_review, in_progress, resubmission_required, approved, rejected, withdrawn`.

Segregation of duties operates on two layers: role-scoped step authority (`user_can_act_on_workflow_step`) and
`enforce_workflow_transition`'s submitter-cannot-decide rule; both were exercised above.

## 5. F3 → F4 boundary re-proved

| ID | Assertion | Observed |
|----|-----------|----------|
| H-01 | Intake / `pending_review` creates no F4 artefact | 0 handoffs |
| H-02 | `in_progress` creates no F4 artefact | 0 handoffs |
| H-03 | `resubmission_required` creates no F4 artefact | 0 handoffs |
| H-09 | `rejected` creates no F4 artefact | 0 handoffs |
| H-11 | `withdrawn` creates no F4 artefact | 0 handoffs |
| H-04 | Final approval creates exactly one canonical `registration_licensing_handoffs` row | 1 row with bound application |
| H-05 | Handoff binds the correct registration, reference and applicant | reference and `applicant_id` match |
| H-06 | Repeated invocation idempotent | still 1 row, same application, `idempotent=true` |
| H-07 | F3 does not advance the F4 workflow beyond the handoff | application remains `draft` |
| H-08 | Browser roles cannot mutate the handoff artefact | `42501 permission denied` |
| H-10 | Handoff refused for a non-approved registration | `NOT_APPROVED` |

## 6. Gap surface closure (GAP-F3-01…19)

| Gap | Severity at discovery | Disposition |
|-----|----------------------|-------------|
| GAP-F3-01 | Critical | CLOSED — direct DML revoked, guard trigger, governed RPCs (S1/S2, L-02/L-12) |
| GAP-F3-02 | Critical | CLOSED — edge authz reachable and enforced before service-role access (S7, edge-authz gate) |
| GAP-F3-03 | High | CLOSED — single DB-enforced status vocabulary (S3, §4) |
| GAP-F3-04 | High | CLOSED — whitelisted editable fields, state-gated, audited (L-11/L-17) |
| GAP-F3-05 | High | CLOSED — handoff only on final approval, idempotent (§5) |
| GAP-F3-06 | Medium | CLOSED — legacy synonyms and unreachable branches retired |
| GAP-F3-07 | High | CLOSED — grant/policy mismatch fixed, applicant reads work (S5) |
| GAP-F3-08 | High | CLOSED — `start_registration_workflow` authority hardened (C1/D-03, L-02) |
| GAP-F3-09 | Medium | CLOSED — governed workflow / decision-authority integration (S6, §4) |
| GAP-F3-10 | Medium | CLOSED — registration-number uniqueness enforced (C2/P-03) |
| GAP-F3-11 | Medium | CLOSED — mandatory entity bindings on in-flight registrations (S5) |
| GAP-F3-12 | Medium | CLOSED — one live registration per user enforced |
| GAP-F3-13 | High | CLOSED — all lifecycle transitions via canonical server functions |
| GAP-F3-14 | High | CLOSED — anonymous enumeration oracle retired (§3) |
| GAP-F3-15 | Low | CLOSED — dead screens retired |
| GAP-F3-16 | Low | CLOSED — client/server rule duplication removed |
| GAP-F3-17 | Low | CLOSED — permanent `verify:f3b` gate in place |
| GAP-F3-18 | Medium | CLOSED — `registration_form_submissions` wired into the canonical resubmission model |
| GAP-F3-19 | Low | CLOSED — permanent test coverage added (`verify:f3b`, `verify:permission-refs`) |

**0 Critical, 0 High product gaps open. 0 unexplained NOT-TESTED.**

Scores: authorization 4.9 · workflow 4.8 · security 4.9 · data integrity 4.8 · testing 4.8 · **overall F3 4.85**.

### Data remediation item (not a product gap)

**DR-F3-01 — DATA_REMEDIATION_REQUIRED.** `public.registration_binding_coverage()` reports
`total=4, unbound=1, unbound_references=["REG-2026-000047"]` — one historical **approved** registration without a
canonical entity binding. It remains isolated (all other registrations bound; every approved registration including
this one has its F4 handoff artefact: approved=3 with handoffs=3, 0 approved-without-handoff), and recurrence is
structurally prevented by the F3-B binding gate proved in `verify:f3b`. No binding was fabricated. Resolution requires
a regulator entity-resolution decision.

## 7. Attempt-1 history (superseded)

Attempt 1 at `10f7eee9cfa4e3ec05ff1d59a30cfeb42a48ae98` failed on **DEF-F3-C-01**: the F3-B authorization guard in
`public.start_registration_workflow(uuid)` referenced the uncatalogued permission `registration_review.approve`,
regressing the frozen GAP-F0-02 catalogue-integrity gate (`src/test/rbac/catalogueIntegrity.test.ts`), plus a
residual allowlist entry for `check_applicant_name_exists`. Both were closed in F3-B2 and re-proved in §2–§3 above.

## 8. Frozen F3 contracts

1. Applicants never control regulatory decision state: no browser-role DML on `public.registrations`; all mutation
   through governed RPCs plus the `tg_registrations_guard_write` trigger.
2. Applicant edits are restricted to whitelisted identity fields, permitted only in draft/resubmission states, and audited.
3. All lifecycle transitions run through `perform_registration_workflow_transition[_internal]` with role-scoped step
   authority, mandatory remarks, stale-instance/step rejection and terminal-state immutability.
4. Canonical status vocabulary is DB-enforced and exposed via `public.registration_status_vocabulary()`.
5. Registration submission remains entirely F3; exactly one idempotent `registration_licensing_handoffs` row is
   created only on final approval, and the F4 application stays `draft`.
6. Registration-number uniqueness and one-live-registration-per-user are enforced by unique indexes.
7. No pre-authentication applicant-name or registration-number existence oracle exists; duplicate control is
   server-side with neutralised submission messages.
8. Permanent gates: `verify:f3b`, `verify:permission-refs`, plus the F0–F2 gates, all wired into the battery.

---

## Final verdict

**F3 PRODUCT CERTIFIED AND FROZEN — DATA REMEDIATION ITEM RECORDED**

Tested certification HEAD: `17691627d2d4297a287f6a9a9b44cd78507610c4`
F3 freeze HEAD: the commit containing this certification record and `scripts/certify-f3c-retry.sql` (evidence-only
additions on top of the tested HEAD).
DR-F3-01 recorded separately from product gaps. DEF-F3-C-01 CLOSED. Anonymous-name-probe residual CLOSED.
