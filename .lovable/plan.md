## Problem

The Admin → Notification Templates page only shows `sla.configuration_updated` (In-App + Email). There are no entries for **SLA Warning** or **SLA Breach**, even though templates were previously seeded into `notification_templates`.

**Root cause:** The admin list reads from `notification_event_configs`, but the prior SLA seeds were written to a different table (`notification_templates`). So the admin UI cannot see them.

## Plan

Seed two new rows in `notification_event_configs` so they appear in the Notification Templates admin list with both Email and In-App channels:

1. **SLA Warning** — `event_key = sla.warning`
   - Description: "SLA Warning"
   - Channels: `['email', 'in_app']`
   - Email subject: `SLA warning: {{step_name}} at {{elapsed_percent}}% of SLA`
   - Email/Message body: greeting + workflow, step, entity, elapsed %, remaining hours, link
   - In-app title: `SLA warning on {{step_name}}`
   - `notification_type`: `warning`, `is_active: true`

2. **SLA Breach** — `event_key = sla.breach`
   - Description: "SLA Breached"
   - Channels: `['email', 'in_app']`
   - Email subject: `SLA BREACHED: {{step_name}} overdue by {{overdue_hours}}h`
   - Email/Message body: workflow, step, entity, SLA hours, overdue hours, escalation role, link
   - In-app title: `SLA breached on {{step_name}}`
   - `notification_type`: `error`, `is_active: true`

Use a safe upsert-style insert (skip if a row with the same `event_key` already exists) to avoid duplicating `sla.configuration_updated` or any prior seed.

## Out of scope (unchanged)

- Workflow step editor dropdowns continue to read from `notification_templates` (already populated).
- No changes to dispatch logic, recipient rules, or `sla.configuration_updated` behavior (team-lead-only routing stays as-is).
- No UI changes.

## Verification

- Open `/admin/notification-templates` → see new rows: "SLA Warning" (Email + In-App) and "SLA Breached" (Email + In-App) alongside existing `sla.configuration_updated`.
- Stats cards reflect new counts.
- Edit/duplicate/delete on the new rows works via the existing handlers.
