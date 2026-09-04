# Supervisory Methodology administration & review workspace

Read-only review workspace over the frozen methodology governance backend. No
policy value, adoption, approval or activation is performed by this wave.

## Routes

| Route | Screen | Authority |
| --- | --- | --- |
| `/admin/supervisory-methodology` | Methodology register | `aml_supervision.manage_config` |
| `/admin/supervisory-methodology/:methodologyId` | Version review workspace (tabbed) | `aml_supervision.manage_config` |

Registered in `src/routes/adminRoutes.tsx`, `src/lib/permissionModules.ts`,
breadcrumb navigation snapshot, and `sec_routes` / `sec_navigation_items`
(`nav_cfg_sup_methodology`, `nav_cfg_sup_methodology_detail`) under
Administration → Supervision configuration, beside Calculation Configuration
and Calculation Approvals (both unchanged).

## Screens

- **Register** — `PageHeader` + `RegisterToolbar` + `SupervisoryRegister` in
  server mode: URL-backed search/filter/sort/page, 25 default (10/25/50/100),
  "Showing X–Y of Z", First/Previous/Next/Last, ARIA sort state, invalid-page
  repair. Filters come from `supervisory_methodology_register_options()`.
  Origin renders as **MIPL Reference / Regulator Adopted / Regulator Authored**;
  lifecycle status and regulator approval state are separate columns.
- **Detail workspace tabs** — Overview (composition + layered readiness),
  Dimensions & Questions (dimension navigator + server-paged register + read-only
  detail drawer), Response Semantics, Evidence & Facts, Parameters,
  Reference Decisions, Regulator Approval, Audit History, Compare.

## Read models (all governed RPCs; no page reads methodology tables directly)

`supervisory_methodology_register`, `_register_options`, `_detail`,
`_dimension_list`, `_question_register`, `_question_detail`,
`_semantic_register`, `_fact_register`, `_fact_detail`, `_parameter_register`,
`_reference_decision_register`, `_approval_register`, `_audit_register`,
`_compare`, `_review_readiness`, `_action_capabilities`, `_adoption_targets`.

## Action RPCs

`supervisory_methodology_adopt_reference`, `supervisory_methodology_lifecycle`.
Every control in `MethodologyActionBar` is driven solely by
`supervisory_methodology_action_capabilities` — no role-name or `is_super_admin`
inference — and a blocked action shows the server's business reason. **Activate is
never offered.** Platform administration may adopt, but never receives an enabled
substantive Approve action.

## Readiness layers

CONTENT, REFERENCE_GOVERNANCE, REGULATOR_ADOPTION, REGULATOR_APPROVAL,
FACT_DEFINITIONS, MATERIALITY_POLICY, CALCULATION_POLICY, LEGACY_DATA_REPAIR,
ASSESSMENT_ELIGIBILITY, CERTIFICATION — rendered independently, never collapsed
into one traffic light. `LEGACY_DATA_REPAIR` distinguishes an approved-but-not-
executed repair from a pending, withdrawn or superseded decision.

## Version comparison

`supervisory_methodology_compare` groups question-level change classification
(KEEP / REWORD / SEMANTIC_CORRECTION / SPLIT / MERGE / MOVE_DIMENSION / NEW /
RETIRED) with predecessor → target mapping, and states that historical responses
were not migrated.

## Verification

`scripts/verify-supervisory-methodology-admin-read-models.sql` — METH-READ-01…22
(anonymous denial, execute grants, RLS-bound totals, oversight breadth, limit
bound 100, deterministic paging, sorting, human origin labels, derived filter
options, live counts, question filters, question detail fidelity, contextual
participation, version-owned semantics, fact/parameter truthfulness, reference vs
regulator approval separation, layered readiness + refused activation/approval,
server-scoped adoption targets, real audit events, zero persistent write). All
fixtures run inside one transaction that rolls back.

## Known blockers (unchanged by this wave)

LINK-11 (22 legacy `STR_SAR_GOVERNANCE` rows, repair approved but not executed),
CALC-05/06/09/11 (no approved calculation policy), AMLH-09.
