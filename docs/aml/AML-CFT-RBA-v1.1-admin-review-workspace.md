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
22 gates pass. Methodology configuration / approval authority is not a standing
grant in this deployment, so the verifier builds a regulator-scoped configuration
persona and a methodology approver as fixtures; every fixture (regulator, roles,
scopes, role assignments) runs inside one transaction that rolls back.
`scripts/run-meth-read-gates.py` emits a gate-by-gate PASS/FAIL table:

```text
python3 scripts/run-meth-read-gates.py | psql -q -f -
```

## Known blockers (unchanged by this wave)

LINK-11 (22 legacy `STR_SAR_GOVERNANCE` rows, repair approved but not executed),
CALC-05/06/09/11 (no approved calculation policy), AMLH-09.

## UI + persona verification closure (HEAD 9ca431c)

- `src/test/supervisoryMethodologyAdminUi.test.tsx` — UI-METH-01…24 (25 tests),
  all passing. Every render is driven by real captured server payloads in
  `src/test/fixtures/methodologyReadModels.json` (produced by
  `scripts/capture-methodology-read-model-fixtures.sql`); no invented data, no
  write RPC is reachable from the workspace.
- `scripts/verify-methodology-persona-matrix.sql` — PERSONA-01…12: 11 PASS,
  1 SKIP (PERSONA-08, no enterprise oversight persona is provisioned in this
  deployment). Direct table writes, parameter value writes and activation are
  refused for every persona; approval is never granted to platform
  administration and maker/checker separation holds.
- Browser smoke (`http://localhost:8080`, 1280×1800): register renders the live
  three-version AML register with derived filters; the v1.1 workspace renders
  26 dimensions / 70 questions across the nine tabs with zero console errors.
- Zero duplication: one register page, one detail page, one hook
  (`useSupervisoryMethodologyAdmin.ts`) is the only RPC caller; two routes, two
  navigation items, one permission mapping.
- Regression: METH-READ 22/22, platform contract 17/17, authority boundary
  17/17, regulator methodology authority 16/16, v1.1 reference draft 18/18,
  calculation governance 20/20, structural integrity 14/14, catalogue design
  (Python) pass, breadcrumb coverage 364/364, nav icons 242/242, RBAC parity OK
  and action coverage 100 % (two read-only workspace controls annotated
  `aml_supervision.view`), typecheck clean, full frontend suite 1437/1437.
- Production state unchanged: v1.1 remains `MIPL_REFERENCE` / `DRAFT`,
  0 regulator approvals, 0 valued parameters, 0 ACTIVE calculation
  configuration, and no methodology event was written during verification.
- Preserved policy failures: LINK-11, CALC-05, CALC-06, CALC-09, CALC-11,
  AMLH-09.
