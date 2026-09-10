# AML-11 — Governed Evaluation of Supervisory Action Outcomes and Effectiveness

## Scope and exclusions

AML-11 lets an authorised supervisor record whether a **completed** AML/CFT supervisory action
achieved the objective recorded for it. It deliberately does **not** implement automatic
effectiveness scoring, risk-rating changes, automatic risk reduction on closure, automatic
escalation after an ineffective outcome, predictive analytics, AI-generated conclusions, regulator
policy values, DEC-01…DEC-08, LINK-11 remediation or any AML-12 work.

Completion is not effectiveness: a closed action is never treated as an effective one.

## Architecture reuse

No parallel downstream supervisory record was created. AML-11 adds one append-only ledger,
`public.supervisory_outcome_evaluation`, keyed to exactly one AML-08 consequence decision, plus
server-owned operations:

| Concern | Implementation |
|---------|----------------|
| Eligibility and action state | `supervisory_outcome_action_internal` (reuses `supervisory_consequence_target_internal`) |
| Read model | `supervisory_outcome_view` |
| Evidence | `supervisory_outcome_evidence_internal` over AML-05 `supervisory_assessment_evidence_basis` |
| Evaluation | `supervisory_outcome_evaluate` |
| Maker-checker | `supervisory_outcome_review` |
| Follow-up | `supervisory_outcome_followup` → canonical `supervisory_consequence_record` |
| Portfolio counts | `supervisory_outcome_portfolio_totals_internal`, published by `supervisory_portfolio_report` / `_export` |

Plans, reassessments, examinations, findings, interventions and enforcement cases are untouched and
are only ever created through their own governed AML-08 operations.

## Eligibility

Server-decided, with canonical reason codes: `OK`, `NO_TARGET_ACTION`, `TARGET_NOT_FOUND`,
`CONSEQUENCE_WITHDRAWN` / `CONSEQUENCE_SUPERSEDED`, `ACTION_CANCELLED`, `ACTION_NOT_COMPLETE`,
`OBJECTIVE_MISSING`. Cancelled and withdrawn actions are identified separately, open actions are
refused, missing objectives block evaluation, out-of-scope and cross-regulator records are refused by
`supervisory_entity_scope_check`, and actions without published lineage are flagged
`legacy_lineage` honestly rather than hidden.

## Effectiveness vocabulary

`NOT_ASSESSED`, `EFFECTIVE`, `PARTIALLY_EFFECTIVE`, `INEFFECTIVE`, `INCONCLUSIVE`. Each evaluation
stores the entity, domain, regulator, source consequence, publication/risk/assessment lineage,
source rating and provenance, target action and objective, action status and completion date, the
conclusion, a written rationale (≥20 characters), limitations, recommended next step, evidence,
preparer, reviewer, decision status, version chain and audit history.

## Evidence

Evidence must be registered AML-05 evidence in the same entity or assessment context; anything else
is refused with `evidence_not_in_context`. Restricted or confidential evidence cannot be cited
without `aml_supervision.view_confidential` and is withheld from the read model. Approval freezes an
immutable `evidence_snapshot`, so later changes to the register never rewrite an approved
evaluation.

## Maker-checker and immutability

Preparation requires AML/CFT create or review authority; approval requires approval authority and a
different person — self-approval is refused. Approval freezes conclusion, rationale, source and
evidence references. Returned evaluations are preserved; amendments create a new version linked by
`supersedes_id` / `superseded_by_id`. Direct insert, update and delete are refused by the writer and
immutability guards; there is no role-name bypass.

## Follow-up actions

An approved `PARTIALLY_EFFECTIVE`, `INEFFECTIVE` or `INCONCLUSIVE` evaluation makes the existing
AML-08 governed actions available. The supervisor must select and justify one; the follow-up is then
created only by `supervisory_consequence_record`, preserving its own prerequisites and duplicate
convergence. Nothing is created automatically, and no risk-of-record is changed.

## Portfolio integration

`outcome_summary` adds factual counts only: linked, completed, open and cancelled actions,
evaluations pending and awaiting review, effective / partially effective / ineffective /
inconclusive / not assessed, unevaluated actions and legacy-lineage actions. Legacy and unevaluated
actions stay separate from evaluated outcomes, and React recomputes nothing.

## Product surface

`AmlOutcomeEffectivenessPanel` — "Outcome & effectiveness" — is mounted on the AML assessment
workspace consequence surface and on the entity AML view. It shows original risk/publication,
objective, target action and lifecycle, completion, eligibility, conclusion and rationale, evidence,
evaluator and reviewer, decision history, available follow-ups and full lineage, with honest states
for open, unassessed, legacy, review-pending, approved and returned records.

## Certification status

Completed:

- AML-11 UI tests `src/test/amlOutcomeEffectiveness.test.tsx` (UI-OUTCOME-01…25): **25 passed / 0 failed**.
- Frontend boundary `scripts/verify-aml-outcome-effectiveness-frontend-boundary.mjs`:
  **39 passed / 0 failed** (SOURCE 6, ELIG 5, EFF 5, EVID 4, MC 5, FOLLOW 5, REP 5, RISK 2, SEC 2).
- Security: all AML-11 internal helpers and guards are revoked from `anon`/`authenticated`; only the
  four governed entry points are executable by signed-in users; every function pins
  `search_path = public`. Linter advisories remain in the inherited classes (1756, same count before
  and after the AML-11 hardening migration).

Outstanding (not yet run):

- `scripts/verify-aml-supervisory-outcome-effectiveness.sql` (AML11CERT behavioural SQL verifier:
  ELIGIBILITY, EVALUATION, REVIEW, FOLLOW-UP, REPORTING, SECURITY, ROLLBACK families).
- Action governance, RBAC parity and central authorisation suites; affected AML-08/09/10 suites;
  typecheck; production build; one full two-worker integration suite.
- Preservation census re-confirmation against digest `8385b6c8f7ba2b4102ab054c8f5ac686`.

## Preservation

No risk rating was changed, no risk history rewritten, no historical action changed, no closure
treated as effectiveness, no automatic follow-up created, no evidence fabricated, no calculation
policy authored, v1.0 unchanged, v1.1 unchanged and not activated, LINK-11 untouched, no AML data
deleted.

## Deferred

Three consecutive full repository suites remain deferred to the final AML module release lock.

## AML-12 readiness

Not yet — AML-11 behavioural SQL certification and the remaining regression gates must pass first.
