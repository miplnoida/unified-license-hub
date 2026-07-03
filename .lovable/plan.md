
# Phase 4 Completion Plan

Existing state confirmed: admin pages, `SufficiencyPanel`, `RaiseRfiDialog`, `DecisionGatesBanner`, edge function `evaluate-application-sufficiency`, and sufficiency tables all exist and are wired into `ApplicationDetail`. Gaps are: sufficiency does not gate final decisions, decision buttons in the manual review area are still hard-coded, auto-RFI prefill from failed rules is not exposed, and there is no automatic re-evaluation on submit / RFI close / decision attempt.

Existing tables (`sufficiency_evaluations`, `sufficiency_evaluation_results`, `sufficiency_overrides`) already cover the schema the request asks for under different names — I will reuse them rather than create parallel `application_sufficiency_*` tables to avoid double-writing. If the requester insists on the exact names, I'll add SQL views as aliases.

## 1. Client evaluation helper
- Add `src/lib/applicationSufficiency.ts` exporting `evaluateApplicationSufficiency({ applicationId, triggerSource, evaluatedBy })` that calls the existing edge function `evaluate-application-sufficiency` and normalizes the response to the shape in the request (mapping `overall_status` → `status`, insufficient → blocked, `info_count` from results).
- Add `getLatestSufficiencyEvaluation(applicationId)` that loads the latest evaluation + results.

## 2. SufficiencyPanel upgrades
- Add "Create RFI from Failed Rules" button when latest evaluation has `fail`/`warning` results whose `rule_snapshot.auto_rfi === true` (or `suggested_rfi_prompt` present).
- Open `RaiseRfiDialog` with `initialItems` prefilled (see 3).
- Add trigger-source prop and expose `runEvaluation(trigger)` via `useImperativeHandle` so parent can auto-run on submit/RFI close/decision attempt.
- Show `info_count` and `not_evaluated` state.

## 3. RaiseRfiDialog extension
- Add optional `initialItems?: Array<{ prompt; question_type; required; item_due_at?; source_rule_id? }>` prop.
- When provided, prefill the item list on open and pass `sufficiency_evaluation_id` + `sufficiency_result_ids` in RFI insert metadata.
- Audit `application.rfi_raised_from_sufficiency` when triggered from sufficiency panel.

## 4. ApplicationDetail wiring
- Move `SufficiencyPanel` render before `DecisionReadySummary` (verify ordering).
- Auto-run evaluation via `useEffect`:
  - once when `app.status` transitions to `submitted` and no evaluation exists,
  - when latest RFI transitions to `closed`,
  - immediately before a manual decision attempt.
- Debounce with a ref so it doesn't re-run on every render.

## 5. Configurable decision UI
- New hook `src/hooks/useDecisionOptions.ts` — reads `decision_options` filtered by `applies_to` JSON matching `{ application_type, license_type, sector_id, status, workflow_step }`, sorted by `sort_order`. Falls back to hard-coded Approve / Reject / Request Resubmission when list is empty.
- New component `src/components/applications/ConfigurableDecisionActions.tsx`:
  - Renders one button per option with `color` styling.
  - Enforces `requires_reason` + `min_reason_length`, `requires_conditions`, and loads `decision_rationale_templates` when `rationale_template_id` set (auto-fills the remarks textarea, supports `{{placeholder}}` substitution using application fields).
  - On submit maps `outcome` → existing action:
    - `approve` / `reject` / `return` / `info_request` / `defer` / `conditional_approve` / `escalate` / `withdraw` → `perform-workflow-action` edge function (existing) with `decision_option_code` + `rationale` in payload, plus writes an `approval_actions` row with metadata `{ decision_option_id, outcome, sufficiency_evaluation_id }`.
- Replace hard-coded Approve/Reject/Request-Resubmission buttons in the manual review area of `ApplicationDetail` (NOT `WorkflowPanel`) with this component. `WorkflowPanel` remains untouched; add a short note comment that workflow-driven steps still use their own transitions.

## 6. Sufficiency decision gate
- Before executing any decision option with outcome in {approve, conditional_approve, reject, defer, return, escalate}:
  1. Ensure a fresh evaluation exists (run one with `triggerSource: 'decision_attempt'` if stale > 5 min or missing).
  2. If `status === 'blocked'` → open `OverrideReasonDialog` with rule key `licensing.sufficiency.blocker_override`; on confirm, call `logRuleOverride` (writes `rule_overrides` + mirrored `audit_logs`) then proceed. Cancel = abort.
  3. If `status === 'warning'` → require acknowledgement dialog using `licensing.sufficiency.warning_acknowledgement`.
  4. Audit `application.decision_option_executed` with `{ option, outcome, sufficiency_status, sufficiency_evaluation_id }`.

## 7. AdminHub tiles
- Verify tiles exist for Sufficiency Rules, Sufficiency Rule Sets, Decision Options, RFI Auto-Rules; add any missing under the license_management section of the admin hub with the descriptions from the spec.

## 8. Optional migration (only if needed)
- Existing `sufficiency_evaluations`/`sufficiency_evaluation_results` already cover the required columns. I'll add a small migration ONLY if a column is missing after re-checking (e.g. `info_count` derived from results, `trigger_source` alias already exists as `triggered_by`). Plan: add `info_count integer default 0` if not present on `sufficiency_evaluations`; otherwise skip migration.

## 9. Validation
- Run `tsgo` typecheck and `bunx vitest run` for touched files.
- Manual smoke via Playwright on `/applications/:id` for an internal user: run sufficiency, prefill RFI, attempt approve with a blocker (override), configured decision option submits.

## Files to touch
- Create: `src/lib/applicationSufficiency.ts`, `src/hooks/useDecisionOptions.ts`, `src/components/applications/ConfigurableDecisionActions.tsx`
- Edit: `src/components/applications/SufficiencyPanel.tsx`, `src/components/applications/RaiseRfiDialog.tsx`, `src/pages/applications/ApplicationDetail.tsx`, AdminHub page if tiles missing
- Possibly one migration for `info_count` column

## Out of scope (called out per instructions)
- Not modifying `WorkflowPanel` internal buttons; configured decisions apply to the manual review area only.
- Not deleting `application_rfi_auto_rules` — reviewer suggestions coexist with sufficiency-driven auto-RFI.
