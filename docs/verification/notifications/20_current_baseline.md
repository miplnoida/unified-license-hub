# Notifications & Communications — Measured Baseline

Generated: 2026-08-03T09:34:32.539Z
Generator: `scripts/notification-trigger-scan.mjs` (queries the live database; no figures copied from earlier documents)
Approved scope: In-App + Email. SMS is excluded from implementation, testing and all percentages.

## Configuration and wiring

| Measure | Value |
| --- | --- |
| active event configs | 212 |
| inactive event configs | 2 |
| active no trigger call site | 47 |
| active wired never dispatched | 123 |
| active invalid recipient rules | 0 |
| active no in app binding | 0 |
| active no email binding | 0 |
| active no published version | 0 |
| dispatch rows | 814 |
| dispatch null template id | 788 |
| dispatch null template version | 788 |
| dispatch fallback rendered | 0 |
| dispatch unresolved placeholders | 1 |
| notifications rows | 951 |
| notifications missing source route | 931 |
| correspondence threads | 0 |
| correspondence messages | 0 |
| escalations | 13 |
| escalation tier events | 13 |
| queue rows | 9 |
| queue pending | 0 |
| queue dead | 0 |
| dispatch poisoned | 0 |
| template versions | 419 |
| event channel bindings | 398 |

## Email delivery records by status

| Status | Count |
| --- | --- |
| sent | 384 |

## Audit records by action (notification domain)

| Action | Count |
| --- | --- |
| NOTIFICATION_CREATED | 44 |

## Active events with no backend trigger call site

- `application.ai_overridden` (application) — call site: frontend-only:1
- `application.rfi_raised` (application) — call site: frontend-only:1
- `application.rfi_responded` (application) — call site: frontend-only:1
- `conduct_action_cancelled` (conduct_action_cancelled) — call site: frontend-only:1
- `conduct_action_completed` (conduct_action_completed) — call site: frontend-only:1
- `conduct_action_created` (conduct_action_created) — call site: frontend-only:1
- `conduct_action_waived` (conduct_action_waived) — call site: frontend-only:1
- `conduct_alert_acknowledged` (conduct_alert_acknowledged) — call site: frontend-only:2
- `conduct_alert_closed` (conduct_alert_closed) — call site: frontend-only:2
- `conduct_evidence_access_denied` (conduct_evidence_access_denied) — call site: frontend-only:1
- `conduct_evidence_uploaded` (conduct_evidence_uploaded) — call site: frontend-only:1
- `conduct_investigation_assigned` (conduct_investigation_assigned) — call site: frontend-only:1
- `conduct_investigation_closed` (conduct_investigation_closed) — call site: frontend-only:1
- `conduct_investigation_opened` (conduct_investigation_opened) — call site: frontend-only:1
- `correspondence.reply_received` (correspondence) — call site: frontend-only:1
- `correspondence.response_sent` (correspondence) — call site: frontend-only:1
- `form_version.published` (form_version) — call site: frontend-only:1
- `form_version.upcoming` (form_version) — call site: frontend-only:1
- `fp_appeal_decided` (fp_appeal_decided) — call site: frontend-only:2
- `fp_finding_assigned` (fp_finding_assigned) — call site: frontend-only:2
- `fp_finding_resolved` (fp_finding_resolved) — call site: frontend-only:1
- `license.renewal_approved` (license) — call site: frontend-only:1
- `license.renewal_requested` (license) — call site: frontend-only:1
- `license_appeal.acknowledged` (license_appeal) — call site: frontend-only:1
- `license_appeal.decided` (license_appeal) — call site: frontend-only:1
- `license_appeal.filed` (license_appeal) — call site: frontend-only:1
- `license_appeal.panel_assigned` (license_appeal) — call site: frontend-only:1
- `payment.received` (payment) — call site: frontend-only:2
- `payment.required` (payment) — call site: frontend-only:1
- `prudential_action_assigned` (prudential_action_assigned) — call site: frontend-only:1
- `prudential_action_completed` (prudential_action_completed) — call site: frontend-only:1
- `prudential_action_overdue` (prudential_action_overdue) — call site: frontend-only:1
- `prudential_assessment_approved` (prudential_assessment_approved) — call site: frontend-only:1
- `prudential_assessment_reviewed` (prudential_assessment_reviewed) — call site: frontend-only:1
- `prudential_assessment_submitted` (prudential_assessment_submitted) — call site: frontend-only:1
- `prudential_escalation_resolved` (prudential_escalation_resolved) — call site: frontend-only:1
- `registration.correction_required` (registration) — call site: frontend-only:1
- `registration.new_submission` (registration) — call site: frontend-only:1
- `registration.pending_review` (registration) — call site: frontend-only:1
- `registration.rejected` (registration) — call site: frontend-only:1
- `registration.resubmitted` (registration) — call site: frontend-only:2
- `registration.step_assigned` (registration) — call site: frontend-only:1
- `registration.step_entered` (registration) — call site: frontend-only:1
- `registration.workflow_completed` (registration) — call site: frontend-only:1
- `registration.workflow_started` (registration) — call site: frontend-only:1
- `sla.configuration_updated` (sla) — call site: frontend-only:1
- `user.invited` (user) — call site: frontend-only:1

Machine-readable copy: `20_current_baseline.csv`.
