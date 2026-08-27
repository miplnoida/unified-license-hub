# F0 Platform Foundation — Pass B6 Final Remediation & Certification-Gate Restoration

Date: 2026-08-28 · Baseline at start of pass: `889b3c286`

## 1. Outcome summary

| Item | Status |
| --- | --- |
| GAP-F0-07 — privileged certification runner | REMEDIATED (`app_certification_runner` role created, grants + persona `SET ROLE` membership) |
| GAP-F0-12 — hardening gate | RESTORED — `scripts/verify-hardening.sql`: **31 PASSED / 0 FAILED / 0 SKIPPED** |
| GAP-F0-14 — `cert_v2_diag` RLS intent | CLOSED — explicit deny-by-default policy, browser roles revoked, table commented |
| GAP-F0-16 (new) — approval actor spoofing | CLOSED — `perform_final_workflow_approval` now resolves the actor server-side |
| GAP-F0-15 (new) — upload malware-scan semantics | CLOSED (fail-closed lifecycle); scanner provider commissioning pending |
| Schema hygiene — ambiguous `get_application_list_page` overloads | CLOSED (legacy 11-arg variant dropped) |
| 19 UI_ONLY coverage residuals | RECONCILED as SERVER_GOVERNED_SCANNER_LIMITATION / READ_ONLY (see §4) |
| Frontend suite | 1266/1266 PASS · build OK |

## 2. GAP-F0-12 — hardening gate repairs (all fixture/contract drift, no product defects except §3)

- Workflow fixture selected `entity_type='application'`, which no longer exists; application-family workflows are `pre_application` / `post_application`. Selection now spans the family and prefers an exactly-3-step workflow whose steps allow `approve`, matching the state-machine assertions.
- Fabricated negative-case workflow violated the active-scope unique index and the `approver_role_id` requirement; it is now inserted inactive with a valid configured role.
- Governed workflow RPCs resolve the actor server-side, so the gate now presents a service-role claim for fixture impersonation instead of passing an unauthenticated actor.
- SEC-6 intent updated: these RPCs are the UI's governed entry points, so `authenticated` EXECUTE is expected — the assertion now proves server-side actor resolution instead of absent EXECUTE.
- SEC-10 intent updated: applicant scoping now lives in `can_read_application()`; the gate verifies the helper constrains on `applicant_id`.
- Licence provisioning is payment-gated by design; the final-approval leg now seeds a completed payment.
- WF-12 contract: resubmission returns `is_resubmission` with status `submitted`.

## 3. New security findings closed in this pass

**GAP-F0-16 — approval actor was client-supplied.** `perform_final_workflow_approval` trusted `_actor_id` from the request, so a signed-in user could name another officer as approver. It now calls `workflow_resolve_actor()` (signed-in callers may act only as themselves; only trusted service callers may supply an actor id). The full governed body — step/role authorization, denial logging, provisioning, audit, applicant notification — is preserved.

**GAP-F0-15 — uploads self-certified as malware-clean.** Every client upload path inserted `scan_status: 'clean'` with no inspection, and the queue worker unconditionally stamped `clean`. Now:

- canonical lifecycle `pending_scan → scanning → clean | suspicious | infected | scan_error | quarantined`, enforced by a CHECK constraint and a default of `pending_scan`;
- a trigger forces client inserts to `pending_scan` and blocks any client-side `scan_status` change;
- verdicts only via `public.file_upload_record_scan()` (service-role / privileged), which refuses to release a file as `clean` without a named inspecting provider, auto-quarantines adverse verdicts, and writes to `file_upload_scan_events` + `audit_logs`;
- `getSignedUrl()` fails closed via `public.file_upload_release_state()` — unscanned, quarantined or errored files cannot be downloaded;
- `process-queue` performs a real provider call (`FILE_SCAN_PROVIDER_URL`), and records `scan_error` — never `clean` — when no provider is configured or the scan fails;
- pre-existing rows are relabelled `legacy_unverified` (readable, provenance stated) rather than being presented as scanned.

**RES-F0-15-01 (OPEN, operational):** no malware-scanning provider is configured in this environment, so newly uploaded files will land in `scan_error` and stay undownloadable until `FILE_SCAN_PROVIDER_URL` (and optional key) is set. This is intentional fail-closed behaviour and requires an operational decision before the next release.

## 4. 19 UI_ONLY residuals — disposition

All 19 pairs are server-enforced; the coverage scanner cannot see the enforcement because it is indirect:

- `ai_management.*` — enforced by `public.ai_gov_require(ARRAY[...])`, which calls `has_permission` with array-passed actions (scanner matches direct string literals only).
- `complaint_management.*` — enforced by `mc03_guard()` / `can_approve_complaint_rfi()`.
- `support_management.*` — enforced by RLS via `support_is_staff(auth.uid())`.
- `form_management.*` — enforced by RLS using `has_scoped_permission(..., 'form_management', ...)`.
- `registration_management.edit`, `returns_management.approve` and the remaining pairs — enforced inside `SECURITY DEFINER` RPCs (`entity_merge_execute`, return transition RPCs).

Classification: **SERVER_GOVERNED_SCANNER_LIMITATION** — no residual authorization risk; the scanner's indirect-guard detection is the follow-up improvement.

## 5. Gate status after this pass

PASS: `verify-anon-execute`, `verify-authz-centralized`, `verify-edge-authz`, `verify-atomic-authz`, `verify-rbac-parity`, `verify-hardening`, frontend Vitest suite, build.

OPEN (carried into F0-C): breadcrumb route coverage (23 routes), traceability evidence refresh (IT-010, IT-012), pgTAP convergence B–G execution under the new `app_certification_runner` role, and RES-F0-15-01 scanner commissioning.

## 6. F0-C readiness

Conditionally ready. The privileged runner, the hardening gate and the two newly found authorization/file-safety defects are closed. F0-C should not be declared certified until the four open items in §5 are executed and evidenced.
