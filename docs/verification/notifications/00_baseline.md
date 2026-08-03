# Notifications & Communications — Measured Baseline

All figures below were read from the dev backend, not inferred.

## Event configuration

| Metric | Before this cycle | After |
| --- | --- | --- |
| Active event configs | 214 | 214 |
| Configs with empty `recipient_rules` | 1 (`workflow.sla_escalation`) | 0 |
| Configs using an unsupported recipient rule type | 62 (validator false positives) | 0 |
| Published templates | 419 | 419 |
| Immutable template versions (`notification_template_versions`) | 0 | 419 |
| Event/channel template bindings (`notification_event_channel_templates`) | 0 | 398 |
| Active configs missing a template binding | 214 | 0 |
| Configs with `sms` enabled | 0 (hard-blocked by trigger) | 0 |

`notification_event_config_validate()` now returns 214 rows; 53 are fully clean and the
remaining 161 carry only the informational `no_trigger_history` issue (the business
trigger has never fired in this environment — Phase 4 scope).

## Template integrity

- `notification_template_snapshot()` writes an immutable row into
  `notification_template_versions` on publish; rendered content on
  `notification_dispatch_log` is immutable once written.
- `trg_notification_event_config_requires_templates` blocks activating an event
  whose enabled channels are not all bound to a published template, unless the
  event is explicitly flagged `fallback_allowed` (reserved for emergency
  system-health alerts).
- `trg_notification_event_config_requires_recipients` blocks activating an event
  with no recipient rules.
- `notification_dispatch_log.used_fallback_template` records, per delivery,
  whether built-in wording was substituted for a published template.

## Live verification (real dispatch, scheduled worker, no manual invocation)

Event `return.overdue` enqueued via `notification_enqueue_event` and processed by
the cron-scheduled `notification-event-queue-worker`:

| channel | status | template bound | template_version | used_fallback_template |
| --- | --- | --- | --- | --- |
| in_app | delivered | yes | 1 | false |
| email | sent | yes | 1 | false |

Prior to this cycle **all 788 dispatch rows had `template_id = NULL`** — i.e. every
notification ever sent used fallback wording. That is now closed.

## Known remaining scope

- 161 active events have no trigger history; wiring and exercising each business
  trigger is Phase 4.
- SMS remains **blocked by external configuration** (no provider); it is hard-disabled
  rather than silently failing.
- Email `delivered` / `bounced` / `opened` remain **partially implemented**: SMTP
  acceptance is recorded as `sent`; true delivery confirmation needs a provider callback.
