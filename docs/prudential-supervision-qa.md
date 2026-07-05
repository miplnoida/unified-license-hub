# Script 3 — Prudential Supervision: QA Checklist

**Last verified:** 2026-07-05
**Commit tested:** post-c40742a hardening pass
**Environment:** Lovable preview (`id-preview--62decc67…lovable.app`)
**Verifier:** Lovable agent (automated typecheck + code review)

Status legend: ✅ Passed · ⚠️ Pending live-data verification · ❌ Failed · N/A

Run through each item after every deployment that touches the prudential module.

## Automated checks

- ✅ `bunx tsgo --noEmit` — passes (no type errors after this hardening pass)
- ✅ GitHub Actions CI workflow (`.github/workflows/ci.yml`) added — installs, typechecks, builds, runs tests.
- ✅ Supabase migration `evaluate_stress_indicators_for_return` replaced with sector/subsector-aware version; RPC `prudential_entity_audit_history` added; 11 notification event configs seeded (idempotent).

## Server-side automation

- ✅ `evaluate-return-prudential` edge function auto-invokes `evaluate_stress_indicators_for_return` after ratio + breach persistence.
- ✅ New stress events logged to `prudential_data_feed_logs` (started/success/failed).
- ✅ New stress events fire `prudential_stress_indicator_triggered` notification via `dispatch-notification-event` and audit into `compliance_audit_logs`.
- ✅ `prudential_stress_events.notified` flipped to `true` only after successful dispatch.
- ⚠️ Requires live return submission to confirm end-to-end (deploy + submit one return).



## Dashboard

- [ ] `/prudential` loads with the widget grid (entities, high-risk, breaches, actions, escalations, stress events, feed failures).
- [ ] Sector risk distribution chart renders.
- [ ] Top 10 entities by breach count lists real entities and links to their profile.
- [ ] "Sweep overdue actions" flips due actions to `overdue`, writes an audit row per action, and dispatches `prudential_action_overdue` notifications.

## Entity Universe

- [ ] `/prudential/entities` shows all licensees with columns: license status, systemic importance, latest rating, worst breach, breach count, open actions, overdue actions, open escalations, stress open, last return.
- [ ] Filters (risk, license status, action state, escalation state, latest return status) narrow the table.
- [ ] Search filters by entity name via server query.
- [ ] Row "Open" link goes to `/prudential/entities/:id`.

## Entity Profile

- [ ] `Overview` tab shows latest return, latest rating, worst breach, open/overdue action counts, open escalations, and recent stress events.
- [ ] `Historical Returns` lists all returns with an "Evaluate stress" per-row action; the RPC runs, logs a feed row, and dispatches notifications on any new events.
- [ ] `Ratios & Trends` renders a Recharts line chart over time.
- [ ] `Breaches` lists breaches with "Create action" and (for critical/high severity) "Escalate" buttons that pre-fill the shared dialogs.
- [ ] `Assessments` lists all assessments and links to create a new one for the entity.
- [ ] `Actions`, `Escalations`, `Stress Events` tabs list historical records.
- [ ] `Audit History` tab shows compliance/audit rows scoped to the licensee.

## Assessments

- [ ] From `/prudential/assessments` a supervisor can create a new assessment.
- [ ] Creating with `?entity=...&return=...` prefills entity + return.
- [ ] Assessment detail displays: breaches, ratios, stress events, consolidated analysis, suggested rating.
- [ ] Selecting an overall rating different from the auto-suggested rating requires an override justification before save.
- [ ] Status transitions (draft → submitted → reviewed → approved → closed) enforce required fields (rationale to submit; review notes to review).
- [ ] Every save/transition writes an audit row (visible via `HistoryButton`) and dispatches the matching notification event.

## Actions

- [ ] "New action" from list or entity profile creates the action, writes an audit row, and notifies the assignee (if assigned).
- [ ] Complete/Waive/Cancel dialogs require a justification note and persist it.
- [ ] Overdue sweep marks eligible actions overdue and dispatches per-action notifications.

## Escalations

- [ ] Creating an escalation requires a reason (>= 5 chars); otherwise blocked with error.
- [ ] Resolving requires decision + outcome; both persisted; `prudential_escalation_resolved` fires.
- [ ] Critical/high breach rows on entity profile can open the escalation dialog with pre-filled context.

## Stress Indicators

- [ ] Admin can configure indicators (metric_key, threshold, direction, severity, sector/subsector, escalate).
- [ ] `evaluate_stress_indicators_for_return` returns events, dedupes on (indicator, return), and writes to `prudential_stress_events`.
- [ ] Events appear on dashboard, entity profile, and assessment prefill.

## Data Feeds

- [ ] Stress evaluation runs write `prudential_data_feed_logs` rows (started/success/failed).
- [ ] Dashboard "Recent data feed activity" surfaces the latest rows and marks failures in red.

## Notifications

- [ ] `notification_event_configs` has these `event_key` rows: `prudential_return_validation_failed`, `prudential_breach_detected`, `prudential_assessment_submitted`, `prudential_assessment_reviewed`, `prudential_assessment_approved`, `prudential_action_assigned`, `prudential_action_overdue`, `prudential_action_completed`, `prudential_escalation_created`, `prudential_escalation_resolved`, `prudential_stress_indicator_triggered`.
- [ ] Triggering each action creates a notification row visible in the notification center for the intended recipients.

## Permissions / RLS

- [ ] Admin/super_admin/supervisor/analyst can access `/prudential/*` routes.
- [ ] Non-internal users are redirected/blocked.
- [ ] External licensee users only see prudential actions/assessments tied to their entity (via `entity_user_access`).

## Regression

- [ ] Returns submission, validation, ratio compute, and breach detection continue to work.
- [ ] Complaints, conduct supervision, workflow engine, notifications infra, and existing dashboards load without regressions.
- [ ] `bunx tsgo --noEmit` completes with no errors.
