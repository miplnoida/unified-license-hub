# Notification Template & Event Configuration Administration

## What already exists (verified)

- `notification_templates` (112 rows): `name, event_type, channel, subject, body, variables, is_active, regulator_id, created_by`. Already referenced by `approval_action_notifications.template_id` (65 rows), `approval_step_entry_notifications.template_id` (0 rows), and read by the dispatcher and `send-notification`.
- `notification_event_configs` (150 rows): `event_key, description, title_template, message_template, email_subject_template, email_body_template, channels[], recipient_rules jsonb, notification_type, severity, dedupe_window_seconds, allow_mute, system_required, is_active`.
- Dispatcher `dispatch-notification-event` resolves 25 recipient rule types (applicant, entity primary/secondary users, role, admin, current_approver, workflow_step_approvers, previous_workflow_actors, sector_regulators, custom_email/direct_email, payload_user, return-specific variants, actor_excluded, sla_process_team_leads), renders `{{tokens}}`, dedupes per `(event_key, entity_id, recipient, channel)`, writes `notifications` + email queue.
- Delivery audit already has the right columns: `notification_dispatch_log.template_id, template_version, rendered_content, rendered_content_ref`; `notifications.template_id, template_version, rendered_content_ref`. There is **no** template versions table yet, and nothing populates `template_version`.
- Admin screen `/admin/notification-templates` (377 lines) is a thin editor that reads/writes `notification_event_configs` and fakes per-channel "templates"; it does not touch `notification_templates` at all. No event-configuration screen exists.
- Workflow designer already has `ActionNotificationsEditor` and `StepEntryNotificationsEditor` bound to `notification_templates`; recipient options there are limited to 6 types.
- RBAC: module `notification_management` has only `view` + `dispatch`; the templates route is currently gated on `settings`.

## Duplication to consolidate

`notification_templates` becomes the **single** template store. `notification_event_configs` keeps event behaviour but its inline `title/message/email_*` templates become fallbacks only — each active channel gets a template binding. No new template table is introduced; `correspondence_templates` and `return_notification_templates` are separate features and are left untouched.

## Plan

### 1. Schema (one migration)

- Extend `notification_templates`: `template_code` (human ID, unique), `module`, `event_key`, `severity`, `status` (draft/active/archived, backfilled from `is_active`), `version int default 1`, `published_version`, `updated_by`, `archived_at`.
- New `notification_template_versions` (immutable): template_id, version, name, subject, body, channel, variables, severity, module, event_key, published_by, published_at, content_hash. Insert-only — a trigger blocks UPDATE/DELETE. Publishing bumps `version` and writes the row.
- New `notification_event_channel_templates`: event_config_id, channel, template_id (+ template_version pin), unique per (event, channel).
- Extend `notification_event_configs`: `category`, `action_required`, `delivery_frequency` (immediate/hourly/daily), `failure_escalation` (jsonb: max_attempts, escalate_after, escalate_to rule), `module`.
- RPCs (SECURITY DEFINER, permission-gated, all writing `audit_logs`): `notification_template_save`, `notification_template_publish`, `notification_template_archive`, `notification_template_clone`, `notification_template_versions_for`, `notification_event_config_save`, `notification_event_config_set_active`, `notification_recipient_rules_validate`, `notification_template_render_preview`, `notification_test_send`.
- `notification_recipient_rules_validate` validates against the dispatcher's real rule vocabulary (see list above) plus required config (role exists, named user exists, email approved/valid) and **rejects activation** of an event whose rules or channels the dispatcher cannot execute.
- RBAC: add `notification_management.manage_templates`, `manage_events`, `test_send`; re-gate `/admin/notification-templates` from `settings` to `notification_management`.

### 2. Dispatcher / delivery (reuse, no rewrite)

- Resolve channel template from `notification_event_channel_templates` → published version snapshot → event-config inline fallback.
- Persist `template_id`, `template_version` and rendered subject/body into `notification_dispatch_log` and `notifications` at dispatch time, so historical records keep the exact content used even after the template changes.
- Honour `delivery_frequency` (feeds the existing digest path) and `failure_escalation` in `notification-retry`/failure sweep.
- Add the missing recipient rules the FRD asks for and the dispatcher lacks: `assigned_officer`, `next_step_role`, `supervisor`, `named_user`, `regulator_team`.

### 3. Screens

**R-01 `/admin/notification-templates`** — rewrite: list (name, template ID, module, event key, channel, severity, status, version, last modified by/date) with filters; editor drawer with variable palette inserted from the event's known tokens; actions Preview, Test send, Clone, Publish, Archive, Version history (side-by-side diff, read-only).

**New `/admin/notification-events`** — event configuration list + editor: event key, source module, notification type, category, severity, action-required, system-required, channels, template per channel, recipient rules builder (typed rows from the supported vocabulary), dedupe window, delivery frequency, failure escalation, active toggle. "Validate" runs the server validator; activation is blocked on failure.

**Workflow designer** — `ActionNotificationsEditor` / `StepEntryNotificationsEditor` keep their tables but select from the same event configs + templates, expose the full recipient vocabulary, and cover stage entry, stage exit, transition, assignment, SLA warning, SLA breach, and external applicant/entity notification. Only event keys the dispatcher can execute are selectable.

**Preview & test** — shared `TemplatePreviewDialog`: safe sample values, unresolved-token warning list, channel availability (SMS shown unavailable while no provider is configured), SMTP/SMS health indicator, recipient-rule validation result, and test send hard-coded server-side to the calling administrator only (never production recipients, logged as a test dispatch).

### 4. Audit

`audit_logs` entries for: template created / updated / published / archived, event config created / updated / activated / deactivated, test notification sent — each with actor, before/after and template version.

### 5. Tests

- pgTAP `supabase/tests/notifications/09_template_versioning.sql`: publish creates immutable version, version rows cannot be updated/deleted, clone starts at draft v1, archive blocks dispatch.
- pgTAP `10_event_config.sql`: invalid/unknown recipient rule rejected, activation blocked when a channel has no template, inactive config dispatches nothing, dedupe window respected, audit rows written, RBAC (non-privileged role denied on every RPC).
- pgTAP `11_historical_content.sql`: dispatch stores template_version + rendered content; editing the template afterwards does not change the historical record.
- Vitest `src/test/notificationTemplateAdmin.test.ts`: token extraction and unresolved-token warnings, test-send recipient forced to self, workflow stage → event-key mapping table, template/channel option gating.
- Register all new files in `.github/workflows/ci.yml`.

## Reporting at completion

Existing systems reused, duplicate template paths consolidated, screens added, test results, and any remaining trigger-wiring gaps (event keys configurable but not yet raised by a module) will be listed explicitly.
