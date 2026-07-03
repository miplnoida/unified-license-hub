# Slice 7.10 — Universal Audit & Override Framework (integration pass)

The foundation is already live: `rule_overrides` table + `log_rule_override` RPC, `DiffViewer`, `ChangeHistoryDrawer`, `OverrideReasonDialog`, `lib/ruleOverrides.ts`, and `/admin/overrides` admin page (wired into AdminHub + admin routes).

This slice wires that framework into the nine domains listed, adds CSV export on the admin page, and adds "Change history" affordances to each entity detail view. No rebuilds — pure extension.

## 1. Admin page polish (`/admin/overrides`)
- Add CSV export (respects current filters: module, entity_type, date range, free-text on rule_key / reason / user).
- Add "View timeline" per row → opens `ChangeHistoryDrawer` scoped to that entity.
- Add module facet counts.

## 2. Wire ChangeHistoryDrawer into each domain detail view
Add a "History" button in the header of each detail page that opens `<ChangeHistoryDrawer entityType=… entityId=… />`. No schema changes; drawer already merges `audit_logs` + `rule_overrides`.

| Module | File | entityType |
|---|---|---|
| Applications | `pages/ApplicationDetail.tsx` | `application` |
| F&P assessments | `pages/admin/FitAndProperAssessmentDetail.tsx` | `fp_assessment` |
| Prudential returns | `pages/returns/ReturnDetail.tsx` (or equivalent) | `returns_filed` |
| Complaints | `pages/ComplaintDetail.tsx` | `complaint` |
| Enforcement | `pages/enforcement/EnforcementDetail.tsx` | `enforcement_action` |
| Supervisory plans | `pages/supervision/SupervisoryPlanDetail.tsx` | `supervisory_plan` |
| AI assessments | `components/applications/AiAssessmentPanel.tsx` | `application_ai_assessment` |
| Rule evaluations | `components/returns/ValidationResultPanel.tsx` | `return_validation_run` |
| Decision records | `components/fit-and-proper/FpDeterminationsPanel.tsx` | `fp_determination` |

## 3. Wire OverrideReasonDialog into decision points
Replace ad-hoc "force / override" buttons with the reusable dialog, passing the correct `module` + `rule_key` + original/overridden values. Every override goes through `logRuleOverride` → written to `rule_overrides` AND mirrored into `audit_logs` (RULE_OVERRIDE).

| Decision point | Module | rule_key examples |
|---|---|---|
| Application analyst overrides AI recommendation | `ai_assessments` | `ai.recommendation` |
| Application approver overrides workflow gate (missing docs / fee / RFI) | `licensing` | `gate.documents`, `gate.fee`, `gate.rfi` |
| F&P override screening hit (sanctions/PEP/adverse media) | `fit_and_proper` | `screening.<rule_id>` |
| F&P override committee outcome (chair override) | `fit_and_proper` | `determination.outcome` |
| Prudential override threshold breach severity / auto-escalation | `prudential_returns` | `threshold.<ratio_key>` |
| Prudential override validation rule failure | `prudential_returns` | `validation.<rule_id>` |
| Complaint override auto-triage severity / SLA | `complaints` | `triage.severity`, `sla.due_at` |
| Enforcement override recommended penalty band | `enforcement` | `penalty.recommended` |
| Supervisory plan override 4-eyes second approver requirement | `supervisory_plans` | `four_eyes.required` |
| Rule engine manual overrides (delegation / auto-route) | `rule_engine` | `route.assigned_to`, `delegation.<rule_id>` |
| Determination final decision differs from committee vote | `decision_records` | `determination.final` |

Each call passes `original_value` (system/AI/rule output) + `overridden_value` (user choice) + free-text reason (min 10 chars, enforced client + server).

## 4. Non-goals
- No changes to `audit_logs` schema.
- No changes to existing RLS on domain tables.
- No new cron jobs.
- No new Edge Functions.

## Test plan (before closing 7.10)
1. From an application detail, open History → confirm existing audit rows render via DiffViewer.
2. Override an AI recommendation on an application → row appears in `/admin/overrides`, mirrored in audit_logs, and in the entity's ChangeHistoryDrawer.
3. Override a prudential threshold breach → same round-trip.
4. `/admin/overrides` CSV export downloads filtered rows.
5. Non-privileged user cannot read `/admin/overrides` (RLS + route guard).
6. Attempted UPDATE/DELETE on `rule_overrides` fails (append-only trigger).

## Technical notes
- All new dialog invocations import from `@/components/audit/OverrideReasonDialog` and `@/lib/ruleOverrides`.
- CSV export uses client-side blob download (no new function).
- `ChangeHistoryDrawer` already de-dupes mirrored `RULE_OVERRIDE` audit rows via `metadata.override_id`.
- Module strings must match `OVERRIDE_MODULES` in `src/lib/ruleOverrides.ts`.
