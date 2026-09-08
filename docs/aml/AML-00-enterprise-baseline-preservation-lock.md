# AML-00 — AML/CFT Enterprise Baseline, Preservation Lock & Convergence Inventory

Non-destructive architecture census. No schema object was created, altered, renamed or
dropped; no business data was written, migrated or deleted; no methodology version was
approved, activated or retired; no calculation policy was decided; no AML-01 work started.

## A. Baseline

| Item | Value |
| --- | --- |
| Repository | `miplnoida/unified-license-hub` |
| Actual current main HEAD at rebaseline | `a1843bbd3b1124e4c9b03aa9c250121846622264` — "Closed OS-02G1 peer engine", 2026-09-06 19:10:58 +0000 |
| Expected SHA in the brief | `a1843bbd3b1124e4c9b03aa9c250121846622264` — matches |
| Working tree at start | no reported changes |
| Census date | 2026-09-08 |
| Mode | read-only census + this document |

## B. AML/CFT architecture as built

Routes (all guarded by module `aml_supervision`, `src/routes/dashboardRoutes.tsx:415-423`):

| Route | Page |
| --- | --- |
| `/supervision/aml` | `AmlOverview` |
| `/supervision/aml/work-queue` | `AmlWorkQueue` |
| `/supervision/aml/entities` | `AmlSupervisedEntities` |
| `/supervision/aml/assessments` | `AmlAssessments` |
| `/supervision/aml/assessments/:id` | `AmlAssessmentWorkspace` |
| `/supervision/aml/heatmap` | `AmlRiskHeatmap` |
| `/supervision/aml/examinations` | `AmlExaminations` |
| `/supervision/aml/findings` | `AmlFindings` |

Administration routes (`src/routes/adminRoutes.tsx:205-208`), guarded on
`aml_supervision.manage_config`: `/admin/supervisory-methodology`,
`/admin/supervisory-methodology/:methodologyId`, `/admin/supervisory-calculation`,
`/admin/supervisory-calculation/approvals`.

Components: `AmlActionDialog`, `AmlAssessmentActions`, `AmlAssessmentCalculation`,
`AmlAssessmentGovernance`, `AmlDimensionQuestions`, `AmlDimensionWorksheet`,
`AmlEvidenceLinker`, `AmlNewAssessmentDialog`, `AmlSupervisoryActivity`.
Hooks: `useAmlLifecycle`, `useAmlSupervision`, `useSupervisoryCalculationConfig`,
`useSupervisoryMethodologyAdmin`. Shared logic: `src/lib/amlAssessmentReadiness.ts`,
`src/lib/amlLabels.ts`.

Read models (RPC): `aml_overview_metrics`, `aml_portfolio`, `aml_portfolio_page`,
`aml_work_queue`, `aml_work_queue_page`, `aml_entity_panel`, `aml_assessment_page`,
`aml_examination_page`, `aml_finding_page`.
Governed write operations: `supervisory_assessment_create`, `_dimension_upsert`,
`_question_upsert`, `_transition`, `supervisory_attention_open` / `_confirm_priority`,
`supervisory_examination_open`, `examination_scope_from_assessment`,
`examination_scope_area_amend`, `supervisory_finding_create`,
`supervisory_intervention_open` / `_decide`, `supervisory_plan_open` / `_lifecycle`,
`supervisory_reassessment_require`, `supervisory_remediation_escalate`,
`supervisory_assessment_calculate`. No edge function is used by the AML surfaces.

## C. Methodology state (live)

| Methodology | Version | Status | Origin | Dimensions | Questions | Facts | Parameters |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `AML-CFT-RBA` `1e248dc0…` | 1.0 | **ACTIVE** (effective 2026-01-01) | REGULATOR_AUTHORED | 26 | 41 active | — | — |
| `AML-CFT-RBA` `4dc13ebf…` | 1.1 | **DRAFT** | MIPL_REFERENCE | 26 | 70 active (48 CORE / 16 CONDITIONAL / 6 ENHANCED; 17 inherent / 53 control; 69 scored, 1 contextual) | 87 (88 question links) | 8, all UNAPPROVED and valueless |
| `AML_RBA` `e7d52276…` | 1.0 | SUPERSEDED (effective_to 2026-09-02) | REGULATOR_AUTHORED | 19 | 0 | — | — |

Dimension groups across all versions: `INHERENT_RISK` 18, `CONTROL_EFFECTIVENESS` 53,
`COMPOSITE` 6. Semantic profiles on v1.1: 5. Reference decisions: 10, none claiming
regulator or customer approval. No assessment is bound to v1.1 (0 rows).

## D. Calculation state (live)

`supervisory_calculation_config` 0, `_response_score` 0, `_band` 0, `_matrix_cell` 0,
`supervisory_domain_calculation_rule` 0. The engine, governance, maker/checker,
immutability guards and screens exist and are certified; **no calculation policy has been
authored, approved or activated**. Consequently only 2 rows exist in
`supervisory_assessment_calculation`, and 565 approved AML dimensions carry no acceptable
governed calculation outcome. This is a supervisory-owner policy decision, not an
engineering defect.

## E. Business data census

| Object | Rows |
| --- | --- |
| `supervisory_assessment` (all domains) | 28 — AML/CFT 27 (approved 21, superseded 3, draft 2, submitted 1) |
| `supervisory_assessment_dimension` | 725 |
| `supervisory_assessment_question_response` | 984 |
| `supervisory_assessment_event` | 131 |
| `supervisory_assessment_calculation` | 2 |
| `supervisory_attention` / `_plan` | 19 / 19 |
| `supervisory_intervention` | 74 |
| `supervisory_finding` | 27 |
| `examinations` | 28 |
| `entity_risk_state` | 22 |
| `supervisory_domain_perimeter` | 26 |
| legacy `aml_assessments` | 2 |

## F. Legacy / duplication register (preservation classifications)

| Object | Classification | Reason |
| --- | --- | --- |
| `supervisory_assessment*`, `supervisory_methodology*`, `supervisory_calculation*`, `supervisory_domain_*`, `supervisory_attention/plan/intervention/finding`, `examinations`, `entity_risk_state` | **CANONICAL — PRESERVE** | Live production spine of AML/CFT and every other supervisory domain |
| `aml_assessments` (2 rows) | **LEGACY — PRESERVE, DO NOT EXTEND** | Retired read path: no application code references it (only baseline dumps, EPIC-1/2/3 records, certification snapshots and two verifiers). Retirement is a data-migration decision outside AML-00 |
| `AML_RBA` v1.0 methodology (19 dimensions, 0 questions) | **HISTORICAL — PRESERVE** | SUPERSEDED with `effective_to` set; kept for provenance of pre-2026-09 assessments |
| `AML-CFT-RBA` v1.0 | **ACTIVE — PRESERVE UNCHANGED** | 21 approved assessments bound to it; structurally frozen by trigger |
| `AML-CFT-RBA` v1.1 | **DRAFT — PRESERVE, NOT ACTIVATABLE HERE** | MIPL reference design; regulator approval is a separate decision layer |
| 22 assessment dimensions coded `STR_SAR_GOVERNANCE` | **PRESERVE — POLICY REPAIR ONLY** | Code absent from bound methodology; not deterministically repairable (LINK-11) |

## G. Runtime vs methodology parity gap

`AmlMethodologyQuestion` in `src/hooks/useAmlLifecycle.ts` exposes only: `question_code`,
`prompt`, `guidance`, `response_options`, `mandatory`, `requires_observation`,
`requires_evidence`, `min_evidence_count`, `allow_not_applicable`,
`na_requires_rationale`, `question_version`, `sort_order`. The v1.1 semantic design is
therefore **authored and administrable but not consumed by the officer working file**:

| v1.1 attribute | Admin UI | Assessment runtime |
| --- | --- | --- |
| `axis`, `question_class`, `calculation_participation` | shown | not consumed |
| `response_semantics_code` / semantic profile | shown | not consumed — answers still use raw `response_options` |
| `trigger_condition`, `applicability_rule`, `na_conditions` | shown | not consumed — conditional/enhanced questions are not gated at runtime |
| `evidence_basis_types`, `minimum_evidence_note` | shown | not consumed — only `min_evidence_count` is enforced |
| `supervisory_judgement_required`, `factual_auto_prefill_possible` | shown | not consumed — no fact prefill exists |
| `standards_reference`, `sector_applicability`, `change_classification`, `predecessor_mapping` | shown | not consumed |
| 87 fact requirements / 88 question-fact links | shown | **no runtime fact capture surface exists** |

Dimension-level parity: `dimension_kind`, `scoring_guidance`, `mandatory_questions`,
`data_sources`, `evidence_requirements` are read by the worksheet; `provenance` is not.

## H. Hard-coded policy inventory (presentation-layer constants)

| Location | Hard-coded value | Should come from |
| --- | --- | --- |
| `AmlRiskHeatmap.tsx:14-15` | inherent scale `LOW…SEVERE`, control scale `STRONG…INEFFECTIVE` | methodology `scoring_scale` / calculation bands |
| `AmlDimensionWorksheet.tsx:228-229` | confidence and data quality default `MEDIUM` | methodology or no default |
| `AmlAssessmentActions.tsx:409` | priority option `HIGH` | governed priority vocabulary |
| `AmlActionDialog.tsx:211-213` | priorities `HIGH`, `MEDIUM`, `LOW` | governed priority vocabulary |
| `AmlFindings.tsx:238,247` | terminal statuses `EFFECTIVE`/`CLOSED` | finding status catalogue |
| `AmlOverview.tsx:48` | 60-day assessment-due horizon in copy | supervisory cycle configuration |
| `AmlRiskHeatmap.tsx:20`, `AmlNewAssessmentDialog.tsx:53` | portfolio limit 300 | server pagination |
| `AmlAssessmentActions.tsx:377,494` | target review / due date `plusDays(30)` | plan and review policy |

## I. RBAC / authority state

Module `aml_supervision` publishes 13 permissions: `view`, `view_confidential`, `create`,
`edit`, `submit`, `review`, `approve`, `assign`, `examine`, `finding_manage`,
`remediation_manage`, `manage_config`, `methodology_approve`. UI usage covers `view`,
`create`, `edit`, `submit`, `review`, `approve`, `examine`, `manage_config`; `assign`,
`finding_manage`, `remediation_manage`, `view_confidential`, `methodology_approve` are
enforced server-side but have no dedicated screen affordance.

Register gap: the four administration routes are registered in `sec_routes`, but the eight
`/supervision/aml/*` routes are **not** (0 rows), while 10 `nav_sup_aml*` navigation items
exist. Authorization is still enforced (route-level module guard plus server-side checks in
every RPC), so this is a register-completeness gap, not an access hole.
`/supervision/portfolio-intelligence` shows the same gap from the OS-02G1 wave.

## J. Verification executed (honest results)

| Suite | Result |
| --- | --- |
| `verify-aml-assessment-structural-integrity.sql` | 14 PASS, 0 FAIL |
| `verify-aml-authority-ux-parity.sql` | 10 PASS, 0 FAIL |
| `verify-aml-calculation-governance.sql` | 20 PASS, 0 FAIL |
| `verify-aml-calculation-integrity.sql` | 7 PASS, **4 FAIL** — CALC-05, CALC-06, CALC-09, CALC-11 |
| `verify-aml-dimension-linkage.sql` | 11 PASS, **1 FAIL** — LINK-11 (22 `STR_SAR_GOVERNANCE` rows) |
| `verify-aml-full-module-hardening.sql` | 56 PASS, **5 FAIL** — AMLH-09 plus the four CALC gates |
| `verify-aml-v11-reference-draft.sql` | 18 PASS, 0 FAIL |
| `verify-supervisory-authority-boundary.sql` | 17 PASS, 0 FAIL |
| `verify-supervisory-methodology-admin-read-models.sql` | 22 PASS, 0 FAIL |
| `verify-supervisory-regulator-methodology-authority.sql` | 16 PASS, 0 FAIL |
| `verify-epic-3-aml-closed-loop.sql` | **ERROR at line 148** — fixture insert violates `supervisory_methodology_code_version_uniq`; suite cannot complete (pre-existing fixture defect, gate A passed) |
| `bunx tsgo --noEmit` | clean |
| `bunx vitest run src/test/rbac` | 69 passed, **1 failed** — `actionCoverage.test.ts`: unguarded action site `src/pages/supervision/PortfolioIntelligence.tsx:333` |
| `scripts/validate-nav-icons.mjs` | **FAIL** — `nav_sup_portfolio_intelligence` uses unapproved icon `ChartNetwork` |
| `scripts/verify-breadcrumb-coverage.mjs` | PASS — 0 uncovered routes |

Regression vs pre-existing: none of the above is caused by AML-00 (no code or data was
changed). The four CALC gates and AMLH-09 are policy blockers; LINK-11 is a methodology
decision; the two non-AML failures (RBAC action coverage and nav icon) are regressions
introduced by the OS-02G1 portfolio-intelligence wave and are outside AML-00's mandate —
they are reported here, not fixed.

## K. Blockers before AML certification

1. **AML-BLK-01 (policy)** — no calculation configuration authored, approved and activated;
   blocks CALC-05, CALC-06, CALC-09, CALC-11, AMLH-09.
2. **AML-BLK-02 (policy)** — no AML/CFT effective-date rule decision recorded.
3. **AML-BLK-03 (methodology)** — 22 `STR_SAR_GOVERNANCE` dimensions on legacy assessments.
4. **AML-BLK-04 (governance)** — v1.1 holds MIPL reference approval only; regulator
   approval, parameter calibration and activation are undecided.
5. **AML-BLK-05 (engineering)** — runtime parity gap in section G: semantics, conditional
   gating, evidence basis and 87 fact requirements have no officer-facing surface.
6. **AML-BLK-06 (register)** — eight `/supervision/aml/*` routes absent from `sec_routes`.
7. **AML-BLK-07 (test estate)** — `verify-epic-3-aml-closed-loop.sql` fixture collision.
8. **Non-AML, inherited** — RBAC action-coverage failure and unapproved nav icon on
   portfolio intelligence.

## L. AML-01 readiness

The spine, authority model, governance, immutability guards and administration surfaces are
in place and independently verified; what is missing is regulator policy content and the
officer-facing consumption of the v1.1 semantic model. AML-01 can therefore proceed on
engineering scope (AML-BLK-05, AML-BLK-06, AML-BLK-07) without touching any preserved
object, while AML-BLK-01 through AML-BLK-04 stay with the supervisory owner. Nothing in this
wave changed the system: preservation lock holds.
