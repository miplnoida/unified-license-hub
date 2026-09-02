# EPIC 3 — AML/CFT ENTERPRISE SUPERVISION + CLOSED-LOOP SUPERVISION

**Status: IN PROGRESS — NOT CERTIFIED**

Backend (schema, RBAC, governed operations, read models) is implemented and
applied. The Epic 3 end-to-end certification script, the AML/CFT UI workspace
and the full regression sweep are **not yet done**, so no PASS verdict is
claimed. Epic 4 has not been started.

---

## A. Baseline

| Item | Value |
| --- | --- |
| Starting HEAD | `a25a9df1e` (working tree clean) |
| Starting migration head | `20260902200714_951b16b3-c67b-4d32-a35f-d9d4af72a8ad.sql` |
| Epic 2 baseline | CERTIFIED, 17/17 |
| Overlap check | No other agent had touched AML/CFT, `supervisory_assessment`, findings, examinations, remediation, enforcement, `entity_risk_state`, Entity 360 or My Work. No Epic 2 invariant invalidated. |

## B. Before counts (census)

| Object | Rows before |
| --- | --- |
| `aml_assessments` | 0 |
| `aml_findings` | 0 |
| `supervisory_assessment` (AML_CFT) | 0 |
| `supervisory_assessment_dimension` (AML_CFT) | 0 |
| `supervisory_attention` / `plan` / `intervention` (AML) | 0 / 0 / 0 |
| `examinations` (AML_CFT) | 0 (14 total, all legacy provenance) |
| `examination_findings` | 10 |
| `conduct_findings` | 7 |
| `inspection_findings` | 0 |
| `entity_risk_state` (AML_CFT) | 0 |
| `enforcement_actions` | 6 |

Zero AML production rows confirmed, so the AML model was implemented cleanly
with no invented provenance.

## C. Migrations applied (5)

1. **AML RBAC + methodology engine** — AML permission catalogue, personas,
   shared rating scale, versioned/effective-dated methodology, baseline
   AML/CFT methodology `AML-CFT-RBA` v1.0 (6 inherent + 20 control dimensions).
2. **Canonical finding + remediation** — `supervisory_finding`,
   `supervisory_finding_event`, `supervisory_remediation_action`,
   `supervisory_remediation_event`, `supervisory_remediation_validation`,
   legacy convergence, enforcement linkage.
3. **AML assessment workspace + closed loop + read models** — dimension
   judgment/override, AML domain extension, examination scope provenance,
   signals, reassessment requirement, risk-movement history, four read models.
4. **Anon boundary fix** — revoked the upgraded dimension operation from `anon`
   and dropped the superseded overload.
5. **Rating-scale scoping + control values** — canonical scale enforced for
   AML/CFT only; Strong/Satisfactory/Needs improvement/Weak added.

## D. AML RBAC (residual F-01 resolved)

`aml_supervision` now carries 12 actions in the authoritative `sec_permissions`
catalogue: `view`, `view_confidential`, `create`, `edit`, `submit`, `review`,
`approve`, `assign`, `examine`, `finding_manage`, `remediation_manage`,
`manage_config`. `aml_supervision.edit` exists, so the pre-existing
`aml_assess_write` policy is now satisfiable by a real persona — **F-01 closed**.

Personas: AML/CFT Officer, **Senior AML/CFT Analyst (new)**, AML/CFT Supervisor,
**Head of AML/CFT (new)**, Inspector, Inspection Supervisor, Enforcement
Officer/Supervisor. Officers prepare; supervisors review/approve;
`view_confidential` is restricted to supervisor level and above (one
pre-existing officer grant of `view_confidential` predates Epic 3 and is
recorded as a residual, not a new widening).

## E. Methodology architecture

Configurable, versioned, effective-dated, sector-aware, evidence-aware.
Lifecycle DRAFT → REVIEW → APPROVED → ACTIVE → SUPERSEDED/RETIRED, with
`supervisory_methodology_new_version` for changes and
`supervisory_methodology_resolve` for point-in-time resolution. An ACTIVE
historical version cannot be edited in a way that changes how old assessments
read. No methodology logic lives in React.

## F. Risk calculation vs judgment

`supervisory_assessment_dimension` stores `calculated_*` ratings separately from
the approved ratings. Any divergence sets `is_overridden` and requires
`override_reason`, `overridden_by`, `overridden_at`, and writes an `OVERRIDE`
compliance-audit row. Calculated risk is never authoritative.

## G. Canonical finding model

One register for AML_CFT, PRUDENTIAL, MARKET_CONDUCT, OPERATIONAL_RESILIENCE and
CROSS_DOMAIN, with FK-backed provenance to assessment, dimension, attention,
plan, intervention, examination, workpaper and signal. Lifecycle DRAFT → REVIEW
→ ISSUED → MANAGEMENT_RESPONSE → REMEDIATION_REQUIRED → VALIDATION → CLOSED plus
WITHDRAWN/SUPERSEDED/REOPENED. HIGH/CRITICAL findings cannot be issued by their
author, nor closed by their validator, nor closed without a governed validation.

Convergence: 10 `examination_findings` and 7 `conduct_findings` linked and
mirrored as `BACKFILL_DETERMINISTIC` (17 canonical rows); nothing deleted or
rewritten. The two empty duplicates (`aml_findings`, `inspection_findings`) are
write-blocked.

## H. Canonical remediation model

One corrective-action contract per finding. Lifecycle OPEN →
ACTION_PLAN_SUBMITTED → UNDER_REVIEW → ACCEPTED → IMPLEMENTING →
EVIDENCE_SUBMITTED → VALIDATION → EFFECTIVE / PARTIALLY_EFFECTIVE / INEFFECTIVE
→ CLOSED, with REOPENED. Effectiveness can only be concluded by
`supervisory_remediation_validate`; "entity says completed" is not closure.
Overdue or ineffective remediation raises governed
`UNRESOLVED_REMEDIATION` attention — it never auto-enforces.

## I. Closed loop and risk movement

`supervisory_reassessment_requirement` records the trigger (examination
conclusion, material finding, remediation completed/ineffective, enforcement
outcome, material signal, significant entity change, supervisory direction) with
FK-backed origin. Risk does not move from a requirement. On approval of a new
assessment, `entity_risk_state_movement` records previous/new assessment,
previous/new ratings, trend, reason, trigger, supporting findings, remediation
actions, examination, approver and timestamp, and the outstanding requirement is
marked FULFILLED. `supervisory_assessment_transition` remains the **only**
writer of `entity_risk_state`.

## J. Enforcement linkage

`enforcement_actions` gained `supervisory_finding_id`,
`remediation_action_id`, `supervisory_assessment_id` and
`remediation_bypass_reason`, preserving provenance back through the spine. The
full cross-domain escalation convergence remains Epic 4.

## K. Read models

`aml_overview_metrics()`, `aml_work_queue()`, `aml_portfolio()`,
`aml_entity_panel()` — all SECURITY INVOKER over canonical records; no alternate
AML risk state.

## L. AML/CFT workspace UI (Gates 1-2, 10)

Seven canonical AML screens, all served exclusively by the read models above and
all read-only with respect to risk state:

| Screen | Route |
| --- | --- |
| AML Overview | `/supervision/aml` |
| AML Work Queue | `/supervision/aml/work-queue` |
| AML Supervised Entities | `/supervision/aml/entities` |
| AML Risk Assessments | `/supervision/aml/assessments` |
| AML Risk Heatmap | `/supervision/aml/heatmap` |
| AML Examinations | `/supervision/aml/examinations` |
| AML Findings & Remediation | `/supervision/aml/findings` |

Entity 360 now carries a canonical AML panel
(`src/components/entity-detail/EntityAmlPanel.tsx`) rendered on the `aml`
section, served solely by `aml_entity_panel()`: residual / inherent / control
ratings, prior rating, approved trend, review dates, last approved assessment,
high-risk dimensions, active examination, open and critical findings, overdue
remediation, reassessment requirement, active enforcement and the derived next
supervisory action — every value read from canonical state, none recomputed in
the browser, each block drilling through to the canonical record. The legacy
`entity360_section` AML block is retained beneath it as a read-only historical
view (residual, see §N).

Preview smoke evidence (authenticated internal persona, Vite preview): all seven
routes render with no access denial, no blank state and no page errors; the
Entity 360 AML panel renders and resolves its canonical empty state on an entity
with no AML record. Two invalid DOM-nesting warnings raised on the assessments
and findings registers were fixed.

## M. Regression evidence

| Suite | Result |
| --- | --- |
| `scripts/verify-epic-3-aml-closed-loop.sql` | **ALL GATES A-Z PASS** |
| `scripts/verify-epic-2-supervisory-spine.sql` | **ALL DB GATES PASS** (re-run after every Epic 3 migration) |
| `scripts/verify-f0c-certification.sql` | **34 TESTED_PASS / 0 TESTED_FAIL** |
| `scripts/verify-dms-phase4-closure.sql` | **15/15 PASS** |
| Anon SECURITY DEFINER boundary | 7 allowlisted routines only; no new anon exposure |
| Typecheck / build | clean |

Two EPIC3_REGRESSIONs were found and fixed inside the wave:

1. the new canonical rating scale initially rejected the Epic 2
   prudential/control vocabulary — the scale is now enforced for AML/CFT only and
   control-effectiveness values were added;
2. the four AML notification trigger functions (`aml_assessment_notify`,
   `aml_finding_notify`, `aml_reassessment_notify`, `aml_remediation_notify`)
   were executable by `authenticated`, breaking F0-C gate D-06 — `EXECUTE` is now
   revoked from `PUBLIC`/`anon`/`authenticated` and granted to `service_role`
   only. D-06 passes again.

No Epic 3 regression remains open.

## N. Documented residuals (non-blocking)

1. `entity360_section` still reads the legacy `aml_assessments` /
   `aml_findings` tables for its historical AML block; the canonical panel is the
   authoritative surface above it. Legacy read removal is Epic 4 clean-up.
2. No persistent AML demonstration population: all certification fixtures are
   transaction-scoped and rolled back, so the workspace and Entity 360 panel show
   canonical empty states until demo seeding is requested.

## O. Epic 4 items (unchanged)

Cross-domain escalation convergence, `conduct_investigations` decision, global
supervisory dashboard redesign, whole-platform 20+ entity certification, final
legacy deletion.

## P. Verdict

**EPIC 3 — CERTIFIED.** The AML/CFT methodology and its change control, the
governed assessment envelope with separated calculated and judged ratings,
attention → priority → plan → intervention → examination convergence, the
canonical finding → response → remediation → validation loop, governed
enforcement referral, the closed reassessment loop with audited risk movement,
the RBAC/anon/maker-checker/entity-scope boundary, the AML workspace UI and the
Entity 360 canonical AML panel all pass certification, with Epic 2, F0-C and DMS
regressions green.
