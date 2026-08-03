# Notifications & Communications — FRD Verification Results

Reference: `ABC_FRD_v1(2).docx` · Backend: dev instance · Method: live dispatch

## 1. Summary

| Area | Status |
| --- | --- |
| Notification Centre (NOT-CEN-001) | Verified |
| User preferences + digests | Verified |
| Template & event configuration | Verified |
| Communication Thread Manager (NOT-THR-001) | Fixed this cycle |
| Escalation & Alert Manager (NOT-ESC-001) | Verified |
| Trigger coverage / recipient resolution | Fixed this cycle |
| Channel delivery (email/in-app), retries, health | Verified |
| SMS | Correctly surfaced as unavailable (no provider configured) |

## 2. Defects found and fixed

| # | Defect | Impact | Fix |
| --- | --- | --- | --- |
| D-1 | 34 active event configs had empty `recipient_rules` (incl. `sla.breach`, `return.overdue`, conduct events) | Events resolved to zero recipients — 0 dispatch rows historically | Seeded rules (SLA → assignee/leads/supervisor, returns → entity primary users, conduct → `record_assignee`); added trigger `trg_notification_event_config_requires_recipients` to block activation without rules |
| D-2 | Recipient rule types `thread_participants`, `thread_assigned_officer`, `record_assignee` were referenced by config but not implemented | Rules silently resolved to nobody | Implemented in `dispatch-notification-event/index.ts` |
| D-3 | `post_correspondence_message` inserted directly into `public.notifications` | Bypassed preference gates, email delivery, dispatch log and retries | Refactored to call `notification_enqueue_event` with `correspondence.external_message_sent` / `external_response_received` / `internal_message_posted` |
| D-4 | `overdue-returns-sweep` selected non-existent columns (`licensee_id`, `period_end`) from `returns_filed` | Sweep threw before dispatching — no overdue reminders ever sent | Corrected to `entity_id` / `on_behalf_of_licensee_id` / `period_end_date` |

## 3. Live end-to-end evidence

Events enqueued into `public.notification_event_queue` and processed by the scheduled
`notification-event-queue-worker` (no manual invocation):

| Event key | Queue status | Recipients resolved | Channels logged |
| --- | --- | --- | --- |
| `return.overdue` | `dispatched` | yes | `in_app` delivered, `email` sent |
| `sla.breach` | `dispatched` | yes (multiple) | `in_app` delivered, `email` sent |
| `conduct_alert_created` | `dispatched` | yes | `in_app` delivered, `email` sent |

All rows in `notification_dispatch_log` carry a non-null `recipient_user_id`; no
`failed`/`poison` rows were produced. Attempts = 0 (first-pass success).

## 4. Residual observations (non-blocking)

- Some seeded subject lines render with empty placeholders (e.g. `New conduct alert:`)
  because the sweep payloads omit optional variables. Cosmetic; templates are
  publishable/editable from the admin UI.
- `notification_dispatch_log.template_id` is null for these keys — they use
  built-in fallback rendering rather than a published template row.
- SMS remains unavailable until a provider secret is configured, as specified.

## 5. Trigger completion (this cycle)

Every configured notification event is now emitted from a real business
transaction — database triggers on `applications`, `approval_actions`,
`complaints`, `complaint_correspondence`, `returns_filed`, `return_comments`,
`return_requests`, `return_threshold_breaches`, `return_validation_run_log`,
`declaration_invitations`, `fp_screening_runs`, `fp_manual_screening_tasks`,
`fp_assessments`, `fp_determinations`, `license_certificates`,
`license_actions`, `enforcement_actions`, `entity_user_access`, `licensees`,
`conduct_alerts`, `conduct_actions`, `conduct_monitoring_rules/results`,
`escalation_rules`, `thematic_reviews`, `correspondence_threads`,
`registrations` — plus scheduled sweeps for time-based events
(`notify_returns_due`, `notify_overdue_complaint_investigations`,
`notify_overdue_conduct_actions`, `notify_prudential_remediation_due`,
`notify_workflow_sla_events`).

Unwired active events: **0** (see `10_trigger_matrix.md`, generated from the
live database).

`complaint.rfi_raised` and `complaint.rfi_responded` are deactivated with the
reason recorded on the config: the approved scope has no complaint
information-request transaction.

### Live evidence

| Event | Path | Result |
| --- | --- | --- |
| `complaint.investigation_overdue` | sweep → queue → worker | `in_app` delivered, `email` sent, template v1, no fallback |
| `conduct_action_overdue` | sweep → queue → worker | 6 `in_app` delivered, 6 `email` sent |

All dispatch rows carry a non-null `recipient_user_id` and
`used_fallback_template = false`.
