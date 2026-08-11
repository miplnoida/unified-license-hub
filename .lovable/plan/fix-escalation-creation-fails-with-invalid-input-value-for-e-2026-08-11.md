# Fix: escalation creation fails with "invalid input value for enum escalation_type"

## What is happening

Creating a prudential escalation writes a row, and a backend bridge then mirrors it into the central Escalation Manager feed. That bridge labels the mirrored record `prudential_breach`, but `prudential_breach` was never added to the list of allowed escalation types in the database, so the whole insert is rejected and no escalation is created.

Confirmed by inspection: the allowed values are `sla_warning, sla_breach, threshold_breach, fp_adverse_finding, pattern_alert, overdue_condition, investigation_delay, workflow_blockage, integration_failure, scheduler_failure, notification_delivery_failure, system_health_alert`.

The same defect exists on three other bridges, which will fail the same way:

| Source | Label used | Currently allowed |
| --- | --- | --- |
| Prudential escalations | `prudential_breach` | no |
| Complaint escalation cases | `complaint_escalation` | no |
| Conduct alerts | `conduct_alert` | no |
| Coordination escalations | `coordination_escalation` | no |

So complaint auto-escalation sweeps, conduct alerts, and cross-regulator coordination escalations are broken in the same way, not just the prudential screen.

## Fix

One database migration that adds the four missing values to the allowed escalation-type list:

- `prudential_breach`
- `complaint_escalation`
- `conduct_alert`
- `coordination_escalation`

This is additive only — no existing data, rule, or feed row changes, and no frontend change is needed because the Escalation Manager reads types from the database.

## Verification after the migration

1. Create a new prudential escalation from Prudential & Supervision — it saves and shows a success toast.
2. The new escalation appears in the Escalation Manager feed with a readable "Prudential Breach" type label.
3. Run the complaint escalation sweep and confirm a case is created without error.
4. Confirm no runtime or console errors on either screen.

## Technical notes

- Migration: `ALTER TYPE public.escalation_type ADD VALUE IF NOT EXISTS ...` for each of the four labels.
- The bridge functions (`trg_prudential_escalation_to_escalation`, `trg_complaint_case_to_escalation`, `trg_conduct_alert_to_escalation`, `trg_coordination_escalation_to_escalation`) stay as-is; only the enum is widened, keeping each source module's type distinguishable in the feed.
