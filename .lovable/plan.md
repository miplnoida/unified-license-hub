# Licensing Completion: Sufficiency Review + Decision Options

Extends (never replaces) Application Detail, RFI, Workflow, Forms, Documents, and Decision Summary. All new work is additive.

## 1. Database (single migration)

**New tables (public schema, with GRANTs + RLS + updated_at triggers):**

- `sufficiency_rules` — catalog of reusable rules
  - `code`, `name`, `description`
  - `rule_type` enum: `form_submitted | document_uploaded | field_present | fee_paid | declaration_answered | risk_flag_present | ai_flag_review | regulator_clearance`
  - `config jsonb` (form_template_id, document_group_id, field_path, fee_component_id, declaration_key, flag_key, regulator_id, expected value, etc.)
  - `severity` enum: `blocker | warning | info`
  - `auto_rfi` bool, `rfi_prompt_template text`, `rfi_question_type` (`text|document|both`)
  - `is_active` bool

- `sufficiency_rule_sets` — scoped bundle
  - `name`, `application_type`, `license_type_id`, `sector_id`, `sub_sector_id`, `category_id`, `is_active`, `priority`

- `sufficiency_rule_set_items` — rules in a set (with per-set severity override)

- `sufficiency_evaluations` — one row per run
  - `application_id`, `rule_set_id`, `triggered_by` (`manual|submit|workflow|rfi_response`), `evaluated_by`, `evaluated_at`
  - `overall_status` (`sufficient|insufficient|warning`), `blocker_count`, `warning_count`, `snapshot jsonb`

- `sufficiency_evaluation_results` — one row per rule per evaluation
  - `evaluation_id`, `rule_id`, `rule_snapshot jsonb`, `status` (`pass|fail|warning|na`), `detail jsonb`, `auto_rfi_item_id` (nullable FK)

- `sufficiency_overrides` — analyst overrides on failed rules
  - `evaluation_result_id`, `overridden_by`, `reason text NOT NULL CHECK (length(reason) >= 10)`, `created_at`

- `decision_options` — configurable decision buttons
  - `code`, `label`, `outcome` (`approve|reject|return|defer|conditional_approve|withdraw|escalate`), `color`, `icon`, `requires_conditions` bool, `requires_reason` bool, `min_reason_length`, `rationale_template_id`, `applies_to` (`application_type/license_type/workflow_step` jsonb scope), `sort_order`, `is_active`

- `decision_rationale_templates` — reusable rationale bodies with `{{placeholder}}` tokens; `body text`, `variables jsonb`, `outcome` scope

**Extensions to existing tables (ADD COLUMN … IF NOT EXISTS):**

- `applications`: `last_sufficiency_evaluation_id uuid`, `sufficiency_status text`
- `application_rfis`: `sufficiency_evaluation_id uuid`, `pauses_sla bool default true`
- `sla_configurations` (or workflow instance): use existing pause mechanism — add `paused_at`, `paused_reason`, `resumed_at` columns on `workflow_instances` if not present; otherwise reuse existing pause fields.

**Trigger:** on `application_rfis` INSERT with `pauses_sla=true` → update active `workflow_instances.paused_at`; on RFI status change to `responded`/`closed` → set `resumed_at` and extend `sla_due_at` by elapsed pause duration. Log to `audit_logs`.

**RLS:** admin CRUD on rules/sets/decision options; analysts read evaluations for applications they can view; override insert requires analyst+ role and passes reason check.

## 2. Edge function: `evaluate-application-sufficiency`

Input: `{ application_id, triggered_by }`. Steps:

1. Load application + resolve matching `sufficiency_rule_sets` by application_type/license_type/sector hierarchy (most specific wins).
2. For each rule, execute evaluator by `rule_type`:
   - `form_submitted` → check `form_responses` for template + `status='submitted'`
   - `document_uploaded` → check `documents`/`document_groups` presence + non-expired
   - `field_present` → JSON path lookup in latest form response
   - `fee_paid` → sum `payments` for component vs required
   - `declaration_answered` → field value equals expected
   - `risk_flag_present` → `entity_risk_scores`/`coordination_flags`/`fp_findings`
   - `ai_flag_review` → `application_ai_assessments.requires_review`
   - `regulator_clearance` → `coordination_participants.status='cleared'` for regulator_id
3. Insert `sufficiency_evaluations` + `sufficiency_evaluation_results` rows (snapshot rule config for audit immutability).
4. For each failed rule with `auto_rfi=true`, if no open RFI item already covers it (dedupe by `rule_id` in metadata), append to a single new/open sufficiency RFI on the app; store `auto_rfi_item_id` back on the result. Ensure the parent RFI has `pauses_sla=true` and `sufficiency_evaluation_id` set.
5. Update `applications.sufficiency_status` + `last_sufficiency_evaluation_id`.
6. Compliance audit log entries via `_shared/audit.ts`.

Return `{ evaluation_id, overall_status, results, generated_rfi_id }`.

## 3. Admin pages

- `src/pages/admin/SufficiencyRules.tsx` — list/create/edit rules; rule-type–specific config editor.
- `src/pages/admin/SufficiencyRuleSets.tsx` — manage sets, scope selectors, drag-order rules, per-item severity override.
- `src/pages/admin/DecisionOptions.tsx` — list/create decision options with scope + linked rationale template; separate tab for `DecisionRationaleTemplates`.
- Routes added to `src/routes/adminRoutes.tsx` under `settings` / `license_management` modules; add to `AdminHub` cards and sidebar under existing Licensing admin group.
- Permission seeds inserted via a small data insert (not migration) into `permission_modules`/`permission_actions` for `sufficiency_rules`, `decision_options`.

## 4. Application Detail additions (extend, not replace)

- New `SufficiencyPanel` component (`src/components/applications/SufficiencyPanel.tsx`) mounted as an accordion/tab section:
  - "Run Evaluation" button (calls edge function), "Last evaluated" timestamp, overall status pill.
  - Table of results grouped by severity: rule name, status, detail, linked evidence deep-link, "Override" button on failed rows.
  - Override dialog: SweetAlert2 form, requires reason ≥10 chars, writes `sufficiency_overrides`, logs audit.
  - "Auto-generated RFI" chip linking to the RFI created for that rule.
- Existing RFI, workflow, and decision components untouched — only sibling section added.

## 5. Decision Summary extension

- Existing decision buttons replaced by data-driven render sourced from `decision_options` filtered by current workflow step scope. Non-configured fallback keeps the existing hard-coded set to avoid regressions.
- Selecting a decision opens a dialog: rationale template auto-fills body with placeholders resolved from app context; enforces `requires_reason` / `min_reason_length`; conditional approve requires at least one condition. On submit, calls existing workflow action edge function with new `decision_option_code` + `rationale` payload; server-side records into `approval_step_actions.metadata`.

## 6. SLA pause/resume

- DB trigger described above.
- `useWorkflowSLA` hook reads `paused_at`/`resumed_at` and shows "Paused — awaiting RFI response" state; existing SLA badges reused.

## 7. Audit & security

- All rule/set/decision-option CRUD → `logAudit`.
- Evaluations, overrides, decision selections → compliance audit via `_shared/audit.ts`.
- Overrides + SLA pause events also written to `audit_logs` with before/after snapshots.

## 8. Tests

- `sufficiency-evaluator.test.ts` — unit tests per rule type (mock supabase client).
- `sufficiencyOverride.test.ts` — reason enforcement, audit call.
- `decisionOptions.test.ts` — scope resolution + rationale rendering.
- `slaPauseResume.test.ts` — trigger behavior via SQL fixture.

## Technical notes

```text
Application Detail
├── (existing) Forms / Documents / RFI / Workflow / Payments / Decision
└── (new)     Sufficiency Panel  ── Run / Results / Override
                   │
                   └── calls edge fn ──► sufficiency_evaluations
                                          └── failed+auto_rfi ──► application_rfis (pauses_sla)
                                                                     │
                                                                     └── trigger → workflow_instances.paused_at
```

Nothing in existing FormRenderer, RFI panel, workflow engine, or Decision Summary is rewritten — Sufficiency Panel is a new sibling, and Decision Summary gains a data-driven button source with a fallback to the current hard-coded set.
