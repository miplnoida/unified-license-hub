# SLA Manager — fix the real defects

Findings below are all confirmed against the running app and the live backend.

## What is actually broken

1. **The SLA sweep never runs (worst issue).** The scheduled job posts to the sweep function with `Authorization: Bearer ` + an empty setting (`app.settings.service_role_key` is empty, length 0), so every run returns **401 Unauthorized worker invocation**. Result: **60 active stages are already past due, but the Breached count is 0** and 0 escalation tiers have ever been dispatched. Three other jobs (F&P cycle scheduler, F&P 6-hour monitoring sweep, hourly scheduled reports) use the same broken pattern and are also silently 401-ing.
2. **Escalation Chains throws a red error toast on open.** The auto-seed effect fires before the tier list finishes loading, so it re-inserts tiers that already exist: `duplicate key value violates unique constraint "sla_escalation_tiers_process_type_tier_key"` (HTTP 409). Reproduced in the browser.
3. **Only one process type is configurable.** The Escalation Chains process dropdown and the Business Calendar "Assigned Process Types" list are both derived from existing SLA configuration rows — and there is exactly **1** SLA configuration in the database. So escalation tiers and calendar assignments can only be set for `pre_application`, even though the engine runs 5 process types.
4. **Live Stages & Breaches is hard to use as evidence.** No case reference or link to the underlying application/return/complaint, timestamps use raw locale strings instead of the app's standard date+time format, the list is silently capped at 500 rows with no total or refresh, and paused time always shows "0 min".
5. **SLA Configuration table quirks.** When a row's process type isn't a runtime type the stage Select is given an empty-string value (invalid for the component), "Custom stage name…" re-selects the same name and doesn't persist, and the validation message says "business hours" even when the unit is days.
6. Console noise: the "Function components cannot be given refs" warning appears for *every* component on every page (dev tooling), not an SLA bug — no code change.

## Fix plan

### Backend — make the sweep actually run
- Add a DB helper that mirrors the working pattern already used by the notification workers: issue a short-lived worker token and post it as `x-worker-token`.
- Reschedule `sla-escalation-sweep-15min` to use it, and do the same for the three other jobs stuck on the empty service-role setting.
- Verify: run the sweep once manually, confirm the response body reports breached counts, then confirm past-due stages flip to `breached` and Tier 1 escalation dispatches appear.

### Escalation Chains
- Only seed default tiers after the initial load resolves, and seed with a conflict-ignoring insert so a race can never produce a 409 or an error toast.
- Drive the process dropdown from the five runtime process types (not from existing SLA rows), so tiers can be configured for application, pre_application, registration, return and complaint.
- Show tier validation inline instead of as destructive toasts on every keystroke-blur.

### Business Calendar
- Drive "Assigned Process Types" from the runtime process types too, so calendars can be assigned before any SLA row exists.

### Live Stages & Breaches
- Add an entity/case column with a link through to the underlying record, plus a Refresh button and a "showing X of Y" indicator.
- Use the shared date+time formatter, and show paused time as `—` when there is none.
- Keep the tab read-only (state is owned by the engine and the sweep).

### SLA Configuration
- Replace the invalid empty Select value with an explicit "unset" option, make the custom-stage path persist the typed name, and correct the duration validation wording to reflect the selected unit.

## Verification
- Reload each of the five tabs in the running app and confirm no red toasts and no page errors.
- Confirm Live Stages shows a non-zero Breached count after the sweep runs, with escalation tiers listed.
- Confirm tiers and calendar assignments can be saved for a process type that has no SLA configuration row yet.
