# F3-C — Registration Final Certification (Attempt 1)

Certification pass only — no remediation performed.

Authoritative inputs:
- `docs/certification/F3-registration-discovery-2026-08-28.md`
- `docs/certification/F3-registration-remediation-2026-08-28.md`

Rebaselined HEAD: `10f7eee9cfa4e3ec05ff1d59a30cfeb42a48ae98`

## 1. Regression battery

| Gate | Command | Result |
|------|---------|--------|
| F3-B remediation gate | `npm run verify:f3b` | **38 TESTED_PASS / 0 TESTED_FAIL / 0 N-A** |
| F2-B (frozen) | `npm run verify:f2b` | 63 / 0 / 0 — PASS |
| F1-C (frozen) | `npm run verify:f1c` | 96 / 0 / 0 — PASS |
| F0-C (frozen) | `npm run verify:f0c` | 34 / 0 / 0 — PASS |
| Breadcrumbs | `npm run verify:breadcrumbs` | PASS (0 uncovered) |
| Hardening | `npm run verify:hardening` | PASS |
| Edge authz | `node scripts/verify-edge-authz.mjs` | PASS — user=47 worker=27 webhook=1 machine=1 public=7, 0 ungated |
| Anon EXECUTE | `npm run verify:anon-execute` | PASS — 7 allowlisted, 0 defects (1105 extension-owned residual) |
| Definer guards | `npm run verify:definer-guards` | PASS |
| Service completeness | `npm run verify:service-completeness` | PASS |
| Typecheck | `tsgo --noEmit` | PASS |
| Build | `npm run build` | PASS |
| **Frontend suite** | `npx vitest run` | **FAIL — 1 failed / 1280 passed (140 files, 1 failed)** |

## 2. Certification blocker

### DEF-F3-C-01 — F3-B introduced an uncatalogued permission reference (regresses the frozen GAP-F0-02 gate)

- Failing gate: `src/test/rbac/catalogueIntegrity.test.ts` — *"every referenced permission exists in the catalogue"*.
- Uncatalogued reference: **`registration_review.approve`**, introduced by the F3-B authorization guard inside
  `public.start_registration_workflow(uuid)` (also referenced by `public.get_registration_reviewer_remarks(uuid)`).
- Live catalogue truth: module `registration_review` **does not exist**. The registration module is
  `registration_management`, whose permissions are `view, create, edit, approve, reject, workflow_action`.
- Consequence: that guard branch can never evaluate true — it is a silent-deny reference of exactly the class the
  frozen F0 catalogue-integrity gate exists to prevent. Normal operation still functions through the
  `registration_management.workflow_action` branch and the owner / trusted-service branches, so this is a
  correctness/authorization-hygiene defect rather than an availability outage — but it is a **frozen-contract
  regression**, and per the F3-C charter a frozen-contract regression is a STOP.
- Correct disposition (for F3-B, not this pass): reference the catalogued pair
  `registration_management.approve` (or add `registration_review` to `public.sec_permissions` and resync
  `src/lib/rbac/catalog.json` + `docs/rbac/permission-disposition.json`).

### Residual documentation drift observed (not the blocker)

`scripts/anon-execute-allowlist.json` still carries `check_applicant_name_exists` as
`PUBLIC_RPC_REQUIRED`, while F3-B correctly revoked anon EXECUTE on it (`verify:f3b` S7/G-01 proves
`anon-executable=false`, and the DB-side registry reports 7 allowlisted). The checked-in JSON and its static
test therefore document a public journey that no longer exists. Recorded for F3-B.

## 3. Evidence gathered before the STOP

The following were exercised and are recorded as certification evidence; they are **not** a certification, because
the pass halted on DEF-F3-C-01.

### 3.1 Registration authority boundary (gate S1/S2)

- `anon` and `authenticated` hold no INSERT/UPDATE/DELETE/TRUNCATE on `public.registrations`; the
  `tg_registrations_guard_write` trigger rejects ungoverned mutation. TESTED_PASS.
- Applicant self-approval, cross-registration edit, and mutation of submitted regulatory data all denied
  (`42501`). TESTED_PASS.
- Applicant-editable surface is exactly the 16 identity/contact/submission fields published by
  `registration_applicant_editable_fields()`; no status, reviewer, workflow, binding or decision field leaks
  (leaked=0). TESTED_PASS.
- Governed edit refused outside `pending_verification` / `resubmission_required`
  (`42501: registration in 'approved' status cannot be edited by the applicant`). TESTED_PASS.
- Governed withdrawal requires a written reason (`22023`). TESTED_PASS.
- No applicant registration RPC is anon-executable. TESTED_PASS.

### 3.2 Staff workflow and maker-checker (gate S6)

- Exactly 1 active governed `registration` workflow; 2 configured steps (maker → checker). TESTED_PASS.
- 0 steps reserved to the platform super administrator — no super-admin bypass required for normal operation.
  TESTED_PASS.
- All transitions run through `perform_registration_workflow_transition`. TESTED_PASS.
- Persona-level maker/checker separation exercise: **NOT RE-EXERCISED IN THIS PASS** — deferred because the pass
  halted; it remains covered by the F3-B remediation evidence.

### 3.3 Edge / RPC security (live negative tests, this pass)

`POST /functions/v1/get-licensee-registration`:

| Case | Result |
|------|--------|
| no token | `401 {"error":"Unauthorized","code":"UNAUTHORIZED"}` |
| random/malformed bearer | `401 UNAUTHORIZED` |
| anon publishable key as bearer | `401 UNAUTHORIZED` |

The `requireUserPermission(req, 'registration_management', 'view')` gate now runs before any service-role client
is constructed (source-verified), so service-role reads occur only post-authorization.

- `start_registration_workflow` not reachable anonymously (`42501: permission denied for function`) and guards on
  request-derived identity. TESTED_PASS (with DEF-F3-C-01 caveat on one guard branch).
- Anonymous applicant-name enumeration oracle closed. TESTED_PASS.
- No newly exposed SECURITY DEFINER / anon EXECUTE surface (definer-guards + anon-execute gates green).

### 3.4 Canonical status lifecycle (gate S3)

Single vocabulary published by `registration_status_vocabulary()` and enforced by `registrations_status_chk`:
`pending_verification, pending_review, in_progress, resubmission_required, approved, rejected, withdrawn`.
Statuses outside the vocabulary are rejected; 0 stored registrations carry a legacy status. TESTED_PASS.

### 3.5 F3 → F4 boundary (gate S4)

- Registration intake creates no licensing application (`register-pre-licensee` no longer creates one).
- `public.registration_licensing_handoffs` is the canonical register, produced idempotently by
  `registration_licensing_handoff()` via the approval trigger; unique per registration; 0 handoffs exist for a
  non-approved registration; browser roles cannot mutate the register. TESTED_PASS.

### 3.6 Integrity and surfaces (gate S5)

- `registrations_registration_number_uidx` (case-insensitive) and `registrations_one_live_per_user_uidx` present.
- RLS enabled across the registration estate; applicant satellite reads owner-scoped with no grant/policy
  mismatch (unreadable=0).
- `registration_form_submissions` wired to the canonical registration (orphans=0) and written by the governed
  resubmit RPC.
- Entity binding: 0 unbound in-flight registrations; coverage routine reports `total=4, unbound=1`.

## 4. GAP-F3-01…19 — final disposition at this HEAD

| Gap | Disposition | Evidence |
|-----|-------------|----------|
| GAP-F3-01 Applicant self-approval | TESTED_PASS | S1/S2 — direct DML revoked, guard trigger, self-approval denied |
| GAP-F3-02 Unreachable edge authz gate | TESTED_PASS | Gate moved pre-service-role; live 401 negative tests |
| GAP-F3-03 Competing status vocabularies | TESTED_PASS | S3/C-01…C-04 |
| GAP-F3-04 Applicant mutation of submitted data | TESTED_PASS | S2/B-01…B-04 |
| GAP-F3-05 Premature F4 application at intake | TESTED_PASS | S4/D-01…D-05 |
| GAP-F3-06 Legacy/unreachable trigger branches | TESTED_PASS | S3, canonical transition function only |
| GAP-F3-07 Grant/policy mismatch on satellites | TESTED_PASS | S5/E-01, E-02 |
| GAP-F3-08 `start_registration_workflow` authorization | **BLOCKED — DEF-F3-C-01** | guard references uncatalogued `registration_review.approve` |
| GAP-F3-09 Super-admin-only decision authority | TESTED_PASS | S6/F-01…F-04 |
| GAP-F3-10 Registration-number uniqueness | TESTED_PASS | S5/E-03 |
| GAP-F3-11 Duplicate live registrations | TESTED_PASS | S5/E-04 |
| GAP-F3-12 Orphan form submissions | TESTED_PASS | S5/E-07 |
| GAP-F3-13 Missing governed withdrawal | TESTED_PASS | S2/B-05, vocabulary includes `withdrawn` |
| GAP-F3-14 Anonymous name-enumeration oracle | TESTED_PASS (doc residual) | S7/G-01; `anon-execute-allowlist.json` drift recorded |
| GAP-F3-15 Dead/legacy screens | TESTED_PASS | breadcrumb + route registry gates green |
| GAP-F3-16 Client/server rule duplication | TESTED_PASS | applicant path routed through governed RPCs |
| GAP-F3-17 Trigger functions callable via API roles | TESTED_PASS | S7/G-04, definer-guards gate |
| GAP-F3-18 Mandatory entity binding | TESTED_PASS | S5/E-05, E-06 (0 unbound in-flight) |
| GAP-F3-19 Missing permanent gate | TESTED_PASS | `verify:f3b` wired, 38/38 deterministic |

### DR-F3-01 — historical approved registration without entity binding

`REG-2026-000047` (approved, pre-remediation) remains **DATA_REMEDIATION_REQUIRED**. Recurrence is
structurally prevented: intake resolves and retries binding, in-flight unbound count is gate-enforced at 0, and
coverage is continuously measurable via `registration_binding_coverage()`. No entity binding has been invented.

## 5. Threshold assessment

| Dimension | Score | Note |
|-----------|-------|------|
| Authorization | 4.5 | DEF-F3-C-01 — silent-deny permission reference in a governed guard |
| Workflow / decision authority | 4.8 | maker-checker proven, no super-admin bypass |
| Data integrity | 4.8 | uniqueness, bindings, no orphans; 1 recorded historical data item |
| Security | 4.7 | edge/anon/definer gates green; catalogue-integrity gate red |
| Testing | 4.5 | permanent F3 gate deterministic, but frontend suite red at HEAD |
| **Overall F3** | **4.6** | below the 4.7 threshold |

Critical/High product gaps unresolved: **1 (GAP-F3-08 via DEF-F3-C-01)**.

## Verdict

**F3 NOT CERTIFIED — RETURN TO F3-B**

No F3 freeze HEAD is recorded. F0, F1 and F2 freezes remain intact and green at this HEAD.
