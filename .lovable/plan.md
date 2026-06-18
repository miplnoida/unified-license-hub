## Problem

The SLA step config currently shows two dropdowns ("SLA warning template" and "SLA breach template") that both list every template whose channel is `email` or `in_app`. Because the seeded SLA templates exist as separate rows per channel (e.g. `SLA Warning` for in-app and `SLA Warning (Email)` for email, same `event_type = sla.warning`), each dropdown shows duplicate entries for the same event.

Step-action notifications (`ActionNotificationsEditor`) avoid this by:
- filtering templates to `channel === 'email'` only, and
- scoping options to the chosen `event_key`.

The in-app counterpart is resolved automatically by the dispatcher using the event key.

## Fix (UI only, `src/pages/workflows/WorkflowList.tsx`, `SlaExtendedConfig`)

1. Remove the shared `emailTemplates` list that mixes `email` + `in_app`.
2. Build two scoped lists matching the step-action pattern:
   - `warningTemplateOptions = templates.filter(t => t.channel === 'email' && (t.event_type === 'sla.warning' || t.id === step.sla_warning_template_id))`
   - `breachTemplateOptions = templates.filter(t => t.channel === 'email' && (t.event_type === 'sla.breach' || t.id === step.sla_breach_template_id))`
   (The `id ===` clause preserves any legacy value already saved on the step.)
3. Render each dropdown from its scoped list so only one entry per event appears.
4. Update the helper text under the two dropdowns to clarify: "Pick the email template for the SLA event. The matching in-app notification is sent automatically using the same event key."

No changes to:
- Step-actions editor
- Notification Templates admin page
- `notification_event_configs`, `notification_templates`, or the dispatcher
- Save/persist logic for `sla_warning_template_id` / `sla_breach_template_id`

## Verification

- Open a workflow step → SLA Pause, Warning & Escalation panel.
- "SLA warning template" dropdown shows only `SLA Warning (Email)` (one entry).
- "SLA breach template" dropdown shows only `SLA Breached (Email)` (one entry).
- Saving still persists `sla_warning_template_id` / `sla_breach_template_id` on the step (no schema change).
- Runtime SLA dispatch still produces both email + in-app notifications because the dispatcher resolves channels by `event_key`.
