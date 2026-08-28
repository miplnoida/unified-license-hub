# F3-B — Registration Controlled Remediation

Authoritative input: `docs/certification/F3-registration-discovery-2026-08-28.md`
Permanent gate: `npm run verify:f3b` (`scripts/verify-f3b-remediation.sql`) — **38 TESTED_PASS / 0 TESTED_FAIL / 0 N-A**

## 1. Registration authority boundary (GAP-F3-01, F3-04)

- `anon` and `authenticated` hold **no** INSERT/UPDATE/DELETE/TRUNCATE on `public.registrations`.
- Trigger `tg_registrations_guard_write` rejects any mutation not made through governed server code.
- Governed applicant surface: `registration_applicant_apply_edit`, `registration_applicant_resubmit`,
  `registration_applicant_withdraw`, with the whitelist published by
  `registration_applicant_editable_fields()` (16 identity/contact/submission fields).
  Status, reviewer, workflow, decision and binding fields are never applicant editable.
- Edits are permitted only in `pending_verification` / `resubmission_required`; withdrawal requires a written reason.
- Empirically proven (gate S1/S2): applicant cannot self-approve, cannot change submitted data,
  cannot touch another entity's registration; legitimate resubmission edits still succeed.

## 2. Edge / RPC authorization (GAP-F3-02, F3-08, F3-14)

- `get-licensee-registration`: the `requireUserPermission(req, 'registration_management', 'view')`
  gate was unreachable inside the `OPTIONS` branch. It now runs before any service-role client is
  created; the internal-role check remains as defence in depth.
- `start_registration_workflow` authorises on request-derived identity (trusted service request,
  record owner, or explicit `registration_review.approve` / `registration_management.workflow_action`
  permission) and is not anonymously executable.
- `check_applicant_name_exists` is no longer executable by `anon` (enumeration oracle closed) and was
  removed from the anon-execute allowlist.
- New trigger functions (`tg_registrations_guard_write`, `tg_registration_approved_handoff`) are
  revoked from PUBLIC/anon/authenticated, keeping the definer-guard gate green.

## 3. Canonical lifecycle (GAP-F3-03, F3-06, F3-13)

Single vocabulary published by `registration_status_vocabulary()`:
`pending_verification, pending_review, in_progress, resubmission_required, approved, rejected, withdrawn`.
`registrations_status_chk` now references that function, so the vocabulary has exactly one source of
truth. No stored registration carries a legacy status. Governed withdrawal added before final decision.

## 4. F3 → F4 handoff contract (GAP-F3-05)

- `register-pre-licensee` no longer creates a licensing application at intake; registration submission
  is entirely F3.
- `public.registration_licensing_handoffs` is the canonical handoff register, produced idempotently by
  `registration_licensing_handoff(registration_id)` via the approval trigger — only on final approval.
- The register is read-only for signed-in users, invisible to `anon`, and unique per registration.

## 5. Integrity, reads, resubmission (GAP-F3-07, 10, 11, 12, 18)

- Grant/policy mismatch fixed: applicants can read `registration_entity_bindings`,
  `registration_journey_events` and `registration_form_submissions`; RLS enabled across the estate.
- Uniqueness: `registrations_registration_number_uidx` (case-insensitive),
  `registrations_one_live_per_user_uidx` (one live registration per user).
- `registration_form_submissions` is wired to the canonical registration and written by the governed
  resubmit RPC (no orphans).
- Entity binding: intake resolution retries, and coverage is measurable via
  `registration_binding_coverage()`.

## 6. Workflow / decision authority (GAP-F3-09)

Registration approval is now maker-checker (Licensing Officer → Approver/Decision-Maker) on the active
`Registration Workflow`; no step is reserved to the platform super administrator. All transitions run
through `perform_registration_workflow_transition`.

## 7. Recorded data-remediation items

| Item | Detail | Disposition |
|------|--------|-------------|
| DR-F3-01 | 1 historical **approved** registration (`REG-2026-000047`) has no canonical entity binding; governed backfill could not resolve it automatically. | Recorded — requires regulator entity-resolution decision. In-flight registrations are gate-enforced to be bound. |

## Verdict

**F3-B READY FOR F3-C CERTIFICATION** — 0 unresolved Critical/High product gaps; 1 recorded data item.
