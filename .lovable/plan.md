## Goal
Make the new **Internal** form type taxonomy-free, then seed four internal form templates ready to use.

## Part A — Decouple Internal forms from sector/sub-sector/category/service

**`src/pages/admin/FormBuilder.tsx`** — wrap the Sector / Sub-Sector / Category / Service pickers (lines ~698–739) in `{formType !== 'internal' && ( ... )}`. The save payload already tolerates empty taxonomy (columns default to `''` or `null`), so no other change is needed. Internal templates will be saved with empty sector/sub_sector/category/service fields.

No external-portal filter changes needed — pre-license/post-license/returns/registration portals already filter strictly by `form_type`, so internal templates remain invisible to licensees.

## Part B — Seed 4 internal form templates (data migration via insert tool)

For each form, insert one row into `form_templates` (form_type='internal', status='draft', empty taxonomy, regulator_id = the single active regulator), one row into `form_versions` (version 1, status='draft', semantic_version='1.0') with a `schema_snapshot` JSONB containing one section + the fields below, and matching rows into `form_fields` so the normalized renderer works too.

### 1. Voluntary Surrender of License
Section "Surrender Details":
- `reasons` — textarea, required — "Entity's reasons for surrender"
- `outstanding_obligations` — textarea, required — "Outstanding obligations"
- `customer_notification_plan` — textarea, required — "Customer notification plan"
- `settlement_of_liabilities` — textarea, required — "Plan for settlement of liabilities"
- `effective_date` — date, required — "Effective date of surrender"
- `supporting_documents` — file (allowMultiple), optional

### 2. Regulatory Suspension Initiation
Section "Suspension Details":
- `grounds` — multi_select, required — options: Capital breach, Fitness & propriety concern, AML failure, Governance failure, Reporting failure, Consumer harm, Other
- `grounds_other` — text, optional — "If 'Other', specify"
- `supporting_evidence` — file (allowMultiple), required — "Supporting evidence"
- `evidence_links` — textarea, optional — "External evidence links (one per line)"
- `recommended_duration_days` — number, required — "Recommended duration (days)"
- `immediate_restrictions` — textarea, required — "Immediate restrictions imposed"
- `generate_show_cause_notice` — checkbox, options: ["Generate show cause notice"]

### 3. Regulatory Revocation Initiation
Section "Revocation Details":
- `grounds` — textarea, required
- `supporting_evidence` — file (allowMultiple), required
- `evidence_links` — textarea, optional
- `generate_board_paper` — checkbox, options: ["Generate board paper"]
- `generate_show_cause_notice` — checkbox, options: ["Generate show cause notice"]
- `hearing_date` — date, required
- `stakeholder_notification_plan` — multi_select, required — options: Depositors, Policyholders, Creditors, Shareholders, General public
- `notification_plan_details` — textarea, required — "Notification plan details"

### 4. Management Response to Show Cause Notice
Section "Management Response":
- `representations` — textarea, required — "Entity's representations"
- `supporting_documents` — file (allowMultiple), required
- `proposed_remedial_actions` — textarea, required
- `requested_hearing_date` — date, required

## Technical Details
- `form_templates`: `form_type='internal'`, `sector='' sub_sector='' category='' service=''`, all `*_id` taxonomy FKs NULL, `regulator_id` = `(select id from regulators where status='active' order by created_at limit 1)`, `is_reusable=true`, `status='draft'`.
- `form_versions`: `version=1`, `semantic_version='1.0'`, `status='draft'`, `schema_snapshot` = JSONB array of one section with `rows` + `fields` matching the `FormSection` shape in `src/types/formBuilder.ts`.
- `form_fields`: one row per field with `section_id`, `section_title`, `section_order=0`, `field_order`, `field_type`, `label`, `field_name`, `required`, `validation`, `options`, `metadata` populated to mirror the snapshot.
- Admin can later open each draft from `/admin/forms?tab=internal`, review, and publish.

## Verification
- `tsgo` typecheck.
- Open `/admin/forms?tab=internal` → the 4 drafts list. Click one → builder opens with no Sector/Sub-Sector/Category/Service pickers, section + fields render. Publish, confirm version history shows 1.0 published.
- Open another tab (Pre-License) → internal templates not listed there.

## Out of scope
- Runtime surface where internal users fill these forms (separate feature). Workflow wiring for surrender/suspension/revocation. Document/notice template generation behind the "Generate …" checkboxes.
