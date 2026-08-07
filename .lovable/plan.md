# Phase 6 — Licensing Residual Gaps

Scope is Phase 6 only. Work stops after Phase 6 for manual review.

## Verified current state (inspected this turn)

- `applications` stores only `ack_by`, `ack_at`, `ack_text`. There is no acknowledgement artifact table, no acknowledgement document, and no delivery-state tracking. `verify-and-submit` passes `ack_text` into the submit RPC and nothing else.
- Sufficiency engine exists and is server-side: `sufficiency_rules`, `sufficiency_rule_sets`, `sufficiency_rule_set_items`, `sufficiency_evaluations`, `sufficiency_evaluation_results`, `sufficiency_overrides`, plus the `evaluate-application-sufficiency` edge function and `applications.sufficiency_status`. There is no record of a reviewer's final sufficiency determination (decision, reason, actor, timestamp) and no reviewer checklist.
- Legal review exists only as `application_legal_notes` (opinion + recommendation + conditions, restricted, audited). There is no referral object: no assigned reviewer, referral reason, requested date, due date, return-to-case or completion state.
- `decision_artifacts` already carries version, template id/version, rendered output, checksum, issuer, timestamp, and is append-only (trigger + restrictive policies). No change planned.
- Notification/outbox infrastructure already exists (`notification_outbox`, `notification_dispatch_log`, `dispatch-notification-event`) and will be reused for delivery, not replaced.

Classification: 6.1 MISSING (artifact + delivery states), 6.2 PARTIAL (determination + checklist), 6.3 PARTIAL (referral lifecycle), 6.4 ALREADY IMPLEMENTED — manual verification only.

## What will be built

### 6.1 Submission acknowledgement
- New `application_acknowledgements`: application, submission version, reference (application number), applicant/entity snapshot, licence/service, submitted timestamp, rendered document, checksum, status (`GENERATED`, `DELIVERY_PENDING`, `DELIVERED`, `DELIVERY_FAILED`, `PROVIDER_NOT_CONFIGURED`), provider reference, failure reason, retry count. Append-only; one row per (application, submission version) so refreshes cannot duplicate.
- Server-side generation inside the existing submit path (`verify-and-submit`) using the same pdf-lib approach as `preview-decision-documents`, stored in the existing document/storage infrastructure and referenced by the row.
- Delivery is requested through the existing notification event dispatch; the acknowledgement status is derived from the real provider/outbox result. Missing provider maps to `PROVIDER_NOT_CONFIGURED`, never to "sent".
- Applicant-facing acknowledgement panel (reusing `SubmissionAcknowledgement`) shows reference, timestamp, entity, licence, version, status, and a download of the persisted document.

### 6.2 Sufficiency / completeness review
- New `sufficiency_determinations`: evaluation reference, decision (`sufficient`, `insufficient`, `deferred`), reason, checklist responses, actor, timestamp; append-only history.
- New security-definer RPC to record a determination. It re-evaluates server-side and refuses `sufficient` while unresolved blockers (not overridden), open RFIs, incomplete mandatory documents/forms, missing declarations, or unmet payment state remain. Frontend checkboxes only feed the checklist; they cannot decide the outcome.
- Reviewer checklist rendered from the same rule set that the engine used, in the existing sufficiency panel.

### 6.3 Legal / specialist review
- New `application_legal_referrals`: application, referral reason, specialism, assigned reviewer, requested date, due date (reusing Phase 1 SLA), evidence/document links, status (`referred`, `in_review`, `returned`, `completed`), returned-to-case actor/time.
- Existing `application_legal_notes` becomes the opinion record attached to a referral; earlier recommendations are preserved (no overwrite) and rendered as history.
- Referral queue for legal/specialist reviewers and a case-side panel showing referral state and opinion history.

### 6.4 Document history
- Verification only: confirm every issued artifact exposes version, template, rendered output, actor, timestamp, status, checksum. No behaviour change unless a defect is proven.

## Tests
- pgTAP `supabase/tests/phase6/`: acknowledgement uniqueness/append-only and state transitions; determination gating (blocked while blockers/open RFIs exist); legal referral lifecycle and opinion immutability; RLS persona matrix (applicant vs licensing officer vs legal vs other-entity direct-ID access); regulator cannot modify submitted applicant data.
- Deno integration test for the submit → acknowledgement → notification path including provider failure and provider-not-configured.
- Vitest for client state mapping (statuses, checklist derivation, referral history ordering).

## Technical notes
- All migrations additive; existing RLS, append-only triggers, and service-role boundaries preserved.
- Reused: notification dispatch/outbox and retry, document storage, workflow engine, Phase 1 SLA and override registry, existing sufficiency engine, existing legal notes table.
- No new retry engine, no mock provider success, no weakened policies.

Output after completion: `PHASE 6 IMPLEMENTED — MANUAL VERIFICATION REQUIRED`, with files changed, DB changes, tests and assertion counts, reuse statement, remaining gaps, and click-by-click verification steps. Then stop.
