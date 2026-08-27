# F0 Platform Foundation — F0-C Retry: Final Product Certification & Freeze

Date: 2026-08-28 · Baseline tree: `4a2656997` (clean) · Evidence gate: `scripts/verify-f0c-certification.sql` (`npm run verify:f0c`)

Authoritative inputs: `F0-platform-foundation-E2E-certification-freeze-2026-08-28.md` (first F0-C, NOT CERTIFIED), `F0-B7-security-delta-remediation-2026-08-28.md` (delta remediation).

---

## 1. Baseline

No protected F0 contract changed after B7. Only additions this pass: the certification evidence gate and its `package.json` entry.

Regression gates re-run at this baseline:

| Gate | Result |
| --- | --- |
| Frontend Vitest suite | 1266 / 1266 PASS |
| Build + typecheck (`tsgo`) | PASS |
| `verify:hardening` | 31 PASSED / 0 FAILED / 0 SKIPPED |
| `verify:anon-execute` | PASS — 8 allowlisted, 0 defects |
| `verify:definer-guards` | PASS — 0 vacuous `current_user` guards, 0 anon/authenticated trigger functions |
| `verify:edge-authz` | PASS |
| `verify:atomic-authz` | PASS |
| `verify:rbac-parity` | PASS |
| `verify:breadcrumb-coverage` / route coverage | PASS |
| `verify:traceability` | PASS |
| pgTAP convergence B–G (`app_certification_runner`) | 59 / 59 ok |
| `verify:f0c` (this pass) | 34 TESTED_PASS / 0 TESTED_FAIL / 0 N/A |

No regression detected.

## 2. Re-test of the defects that stopped the previous F0-C

Executed as a real signed-in applicant persona under `SET LOCAL ROLE authenticated` with a matching JWT `sub`.

| ID | Assertion | Result | Evidence |
| --- | --- | --- | --- |
| D-01 | Applicant forged malware-clean verdict (DEF-F0-C-01) | TESTED_PASS | `42501 not_authorized: scan verdicts are recorded by the scanning worker only` |
| D-02 | File remains unreleased after the forgery attempt | TESTED_PASS | `released=false, scan_status=pending_scan` |
| D-03 | Owner direct `UPDATE` of `scan_status` | TESTED_PASS | `42501 scan_status may only be changed by the scanning worker` |
| D-04 | Applicant prudential EWI evaluation (DEF-F0-C-02) | TESTED_PASS | `not authorised to evaluate early warning indicators for this entity` |
| D-05 | Authorized (trusted service) prudential caller | TESTED_PASS | ALLOWED |
| D-06 | Trigger functions executable by anon/authenticated (DEF-F0-C-03) | TESTED_PASS | count = 0 |
| D-07 | Conduct authority helper for an unauthorized persona | TESTED_PASS | `can_approve_conduct_closure = false` |
| D-08 | SECURITY DEFINER routines authorizing on `current_user` | TESTED_PASS | 0 |
| D-09 | Entity identity snapshot append-only protection | TESTED_PASS | client `INSERT` → `42501` |

## 3. Certification matrix (deferred stages, now executed)

| ID | Surface / control | Result | Evidence |
| --- | --- | --- | --- |
| A-01 | Anonymous boundary — licensee register | TESTED_PASS | `42501 permission denied for table licensees` |
| A-02 | Role add — applicant self-grant of `super_admin` | TESTED_PASS | RLS refusal |
| A-03 | Governed role assignment RPC, unprivileged caller | TESTED_PASS | `42501 not_authorized` |
| A-04/05/06 | Audit immutability — client INSERT / UPDATE / DELETE on `audit_logs` | TESTED_PASS | `42501 permission denied` on all three |
| A-07 | Security-event log write from a client persona | TESTED_PASS | refused (closed event-type vocabulary) |
| A-08 | RLS isolation — licensee register | TESTED_PASS | visible 1 of 54 |
| A-09 | RLS isolation — return filings | TESTED_PASS | visible 0 of 93 |
| A-10 | Workflow step guard, persona not assigned to step | TESTED_PASS | `can_act=false`, `WRONG_APPROVER` |
| A-11 | Actor spoofing on `perform_final_workflow_approval` | TESTED_PASS | `{"code":"ACTOR_MISMATCH","http":403}` |
| A-12 | Multi-role resolution / permission union | TESTED_PASS | external 2 roles; internal 2 roles → 101 permissions |
| A-13 | Delegation expiry / revocation sweep | TESTED_PASS | sweep present, 0 expired-but-active rules |
| A-14 | Decision authority resolver | TESTED_PASS (control present) | mode `OFF`, `requires_review=true`, **0 rules configured** → residual RES-F0-DA-01 |
| A-15 | RLS enabled on every public table | TESTED_PASS | 0 tables without RLS |
| A-16 | Anonymous RPC boundary | TESTED_PASS | 0 defects, 8 allowlisted |
| A-17 | Machine/worker boundary — scan-verdict writer not anon-executable | TESTED_PASS | anon EXECUTE = false |

Direct-URL protection, route/module truth and UI action authorization are covered by the frontend suite (1266 tests, incl. `src/test/rbac/actionCoverage.test.ts`), `verify:rbac-parity` and the route/breadcrumb gate — all green at this baseline.

**ENVIRONMENT_BLOCKED (stated, not claimed as passed):** the Playwright `e2e/cert-v2/*` browser suite was not executed in this pass — no live persona browser sessions are available in this sandbox. Its server-side negative expectations (`05-server-enforcement.spec.ts`) are nonetheless proven directly at the database by A-01…A-17 above.

## 4. Secure-upload product certification (no scanner mocked)

| ID | Control | Result |
| --- | --- | --- |
| U-01 | Client insert claiming `scan_status='clean'` is forced to `pending_scan` | TESTED_PASS |
| U-02 | CLEAN release without a named inspecting provider is refused | TESTED_PASS (`provider_required`) |
| U-03 | `scanning` / `scan_error` / `suspicious` / `infected` / `quarantined` never released | TESTED_PASS (all `released=false`) |
| U-04 | Adverse verdict auto-quarantines | TESTED_PASS |
| U-05 | Every verdict appends a scan event and an audit record | TESTED_PASS (+5 / +5) |
| U-06 | Provider-attributed CLEAN verdict releases the file | TESTED_PASS |
| U-07 | Verdict vocabulary is closed | TESTED_PASS (unsupported verdict rejected) |
| U-08 | Lifecycle enforced by CHECK constraint | TESTED_PASS |

Classification: **PRODUCT_CONTROL_CERTIFIED — PROVIDER_COMMISSIONING_REQUIRED_AT_F20.**

No live malware inspection was tested; no scanner was mocked. The integration contract requires an actual provider verdict before any file can become `clean`.

## 5. Residuals / F20 blockers

- **RES-F0-15-01 (MANDATORY F20 RELEASE BLOCKER, operational):** commission a real `FILE_SCAN_PROVIDER_URL` (plus key if required) and run benign-file and AV-test-signature live validation before production release. Until then uploads land in `scan_error` and stay undownloadable (intentional fail-closed).
- **RES-F0-DA-01 (operational configuration):** `decision_authority_rules` is empty; the resolver runs in mode `OFF` and returns `requires_review=true`. The control is present and fails safe, but the ruleset must be configured per regulator before authority enforcement can be relied upon.
- **RES-F0-E2E-01 (environment):** Playwright browser certification suite not executable in this sandbox; server-side equivalents proven.

## 6. Scorecard (lowest material dimension governs)

| Dimension | Score |
| --- | --- |
| RBAC / permission catalogue | 4.9 |
| RLS / data isolation | 4.9 |
| Authority & workflow integrity | 4.8 |
| Audit immutability & security events | 4.9 |
| Anonymous / machine boundaries | 4.9 |
| Secure upload (product control) | 4.8 |
| Testing & regression | 4.8 |
| E2E coverage | 4.8 |
| **Overall (lowest material)** | **4.8** |

0 Critical / 0 High product gaps open.

## 7. Protected-contract freeze list

Frozen at `4a2656997`; changes require a new F0 delta pass:

- `public.request_role()`, `public.is_trusted_service_request()`, `public.workflow_resolve_actor()`
- `public.file_upload_record_scan()`, `public.file_upload_release_state()`, `file_uploads.scan_status` lifecycle CHECK + guard trigger, `file_upload_scan_events`
- `public.perform_final_workflow_approval()`, `public.user_can_act_on_workflow_step()`
- `public.has_role()`, `public.has_permission()`, `public.has_scoped_permission()`, `public.sec_get_user_context()`, `public.sec_user_permissions()`
- `public.sec_anon_execute_allowlist` + `scripts/anon-execute-allowlist.json`, `public.sec_anon_executable_functions`
- `public.resolve_decision_authority()`, `public.expire_delegation_rules()`
- audit/security-event append-only grants and policies; `entity_identity_snapshots` append-only policy
- gates: `verify-hardening`, `verify-anon-execute`, `verify-definer-guards`, `verify-edge-authz`, `verify-atomic-authz`, `verify-rbac-parity`, `verify-breadcrumb-coverage`, `verify-traceability`, `verify-f0c-certification`

## 8. Verdict

**F0 PRODUCT CERTIFIED AND FROZEN — F20 COMMISSIONING BLOCKER RECORDED.**

Remaining blockers are operational/commissioning only (RES-F0-15-01, RES-F0-DA-01, RES-F0-E2E-01). Full regression is green.

STOP — F1 not started.
