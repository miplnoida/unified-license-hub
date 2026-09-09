# AML-07 — Assessment review, approval and risk-of-record publication

AML-07 completes the governed AML/CFT assessment lifecycle: work completed →
submitted for review → reviewer challenge / return → calculation run reviewed →
override resolved → assessment approved → risk-of-record published → previous
risk-of-record superseded → downstream supervision consumes the new
risk-of-record.

AML-07 adds no second assessment workflow and no parallel risk register. It
extends `supervisory_assessment` and publishes into the existing canonical
`entity_risk_state` / `entity_risk_state_movement` spine.

## Three distinct concepts

| Concept | Where it lives | Meaning |
| --- | --- | --- |
| **CALCULATED RESULT** | `supervisory_assessment_calculation_run` (AML-06) | What the approved calculation policy produced for a set of inputs. Never a decision. |
| **APPROVED ASSESSMENT RESULT** | `supervisory_assessment_approval_decision` | What an authorised reviewer bound: the calculated rating, or an approved override. |
| **PUBLISHED RISK-OF-RECORD** | `entity_risk_state` + `entity_risk_state_movement`, referenced by `supervisory_assessment_risk_publication` | The entity's supervisory risk position that downstream supervision consumes. |

A calculated result is never displayed or consumed as the entity's risk.

## Lifecycle

Canonical states (existing vocabulary, exposed as `canonical_state`):
`DRAFT`, `SUBMITTED_FOR_REVIEW`, `RESUBMITTED`, `RETURNED_FOR_CHANGES`,
`APPROVED_NOT_PUBLISHED`, `APPROVED`, `CLOSED_WITHOUT_APPROVAL`, `SUPERSEDED`.

`supervisory_assessment_lifecycle_state(_assessment_id)` returns, per state:
permitted actions, the required canonical permission, blocking conditions with
reason codes, the maker-checker requirement, assignment, and whether editing,
calculation and publication are allowed. React renders this contract; it does
not reconstruct the state machine.

## Submission gate

`supervisory_assessment_submit_for_review` re-reads the committed record inside
the same transaction and refuses unless: included questions are complete,
evidence/fact readiness holds, no unresolved validation finding exists, an
approved applicable calculation policy exists, a successful immutable
calculation run exists and matches the current response / fact / question-plan /
policy hashes, no override proposal is unresolved, rationale is present, and the
caller holds the required authority and assignment. A stale browser is refused
with `stale_readiness` / `stale_calculation`. Submission binds the exact run; a
later recalculation never silently replaces the run under review.

## Review rounds, challenges, return and resubmission

Each submission opens a `supervisory_assessment_review_round` holding an
immutable readiness and submission snapshot plus the bound run number and result
hash. `supervisory_assessment_review_challenge` records the challenge code,
category, narrative, referenced question / dimension / fact / run, raising and
resolving actor and times. Returning records a written reason and never rewrites
the submitted snapshot; resubmission opens a new round with a change summary.

## Maker-checker and independence

Enforced server-side using canonical permissions and assignment/scope, never
role names: the preparer or submitter cannot approve; an override proposer
cannot approve their own override; a reviewer without scope cannot act;
reassignment is governed and audited; technical administrators receive no
regulatory approval authority; regulator and domain boundaries are enforced; and
direct table updates cannot achieve approval.

## Approval and override precedence

`supervisory_assessment_approve` writes one immutable decision binding the
assessment, methodology/programme versions, question-plan snapshot,
evidence/fact state, selected run number and hash, computed rating, approved
override rating (if any), final rating and its source, approver, time, rationale,
effective date and round history. The server resolves precedence: an approved,
valid override otherwise the computed result. A pending, rejected or
self-approved override never becomes the final rating. Approval never
recalculates.

## Publication and supersession

`supervisory_assessment_publish_risk_of_record` is governed, atomic and
idempotent. Only an approved assessment and only its exact approved result may
publish. Repeat publication creates no duplicate current record; concurrent
attempts yield one valid outcome. The previous current record is preserved and
superseded through the canonical movement ledger with effective dates, reason and
actor. History is immutable and direct update/delete is refused. Where approval
and publication are one atomic action, that architecture is preserved; the
`APPROVED_NOT_PUBLISHED` state and its permitted next action are exposed
explicitly, so there is no ambiguous half-published state. Corrections use the
existing governed reversal path and never delete published history.

## Lineage

`supervisory_assessment_risk_lineage` walks: risk-of-record → publication →
approval decision → review round → calculation run → calculation policy version
→ methodology version → programme version → question plan → responses → facts →
evidence. Restricted sources are withheld by the server; labels, counts, errors
and hashes do not disclose them.

## Downstream integration

Entity 360, the AML supervised-entity register, portfolio views, the AML work
queue, continuous monitoring, supervisory planning, examination initiation, and
dashboards/reports read the canonical published risk-of-record. None recompute
risk from draft assessment data, and a draft, submitted or merely calculated
result never alters displayed risk. After publication the read models refresh
from the canonical spine with no data duplication.

## Legacy compatibility

No historical assessment is backfilled or reinterpreted. Records without an
AML-06 run display an honest legacy lineage state
(`LEGACY_NO_CALCULATION_RUN`, "Legacy — no AML-06 run", "Legacy movement");
no run hash, policy version or review round is fabricated. AML-07 gates do not
invalidate previously approved assessments.

## UI

- `src/components/supervision/aml/AmlAssessmentReviewPanel.tsx` — Review &
  decision tab in the assessment workspace: lifecycle state, server actions and
  reasons, assignments, bound run, blockers, rounds, challenges, return/resubmit
  history, calculated vs override vs approved vs published results, approval
  decision, publication and lineage.
- `src/components/supervision/aml/AmlEntityRiskHistory.tsx` — current published
  risk, effective/as-of dates, source assessment, publication record, superseded
  ratings with run and version references, reasons, and legacy state; mounted in
  the entity AML panel and the review tab.
- `src/hooks/useAmlAssessmentReview.ts` — server read models and governed
  mutations only; the only local vocabulary is display labelling.

## Security

Unauthenticated callers cannot review, approve or publish. Cross-regulator and
cross-domain access is refused. Assignment and scope are enforced. Direct writes
to decision, publication and risk-history tables are refused. Internal helpers
are not executable by `PUBLIC`, `anon` or `authenticated`. All SECURITY DEFINER
functions pin `search_path`. The audit actor is taken from the session and cannot
be spoofed. Concurrent approval and publication are serialised safely.

## Certification

- `scripts/verify-aml-assessment-review-risk-publication.sql` — single
  transaction, `ON_ERROR_STOP`, authenticated personas, real governed functions,
  positive and negative paths, complete rollback, family totals for `SUBMIT`,
  `REVIEW`, `CHALLENGE`, `RESUBMIT`, `APPROVAL`, `OVERRIDE`, `PUBLISH`,
  `SUPERSEDE`, `LINEAGE`, `DOWNSTREAM`, `IDEMPOTENCY`, `CONCURRENCY`, `LEGACY`,
  `SEC`.
- `scripts/verify-aml-review-publication-frontend-boundary.mjs` — 17 gates.
- `src/test/amlAssessmentReview.test.tsx` — UI-REV-01…25.
- `src/test/amlEntityRiskHistory.test.tsx` — UI-RISK-01…10.

The AML07CERT fixture is rollback-only; no `AML07CERT%` record survives and no
operational data is touched.

## Preservation

AML-01…AML-06 remain intact. Methodology v1.0 stays `ACTIVE`/`REGULATOR_AUTHORED`
and v1.1 stays `DRAFT`/`MIPL_REFERENCE`. No live calculation policy is authored
or activated, so operational calculation stays correctly `NOT_CALCULABLE` until
the regulator approves policy. No assessment, response, fact, evidence,
question plan, historical calculation, historical approval, risk record or
regulator record is modified or deleted.

## Remaining policy decisions for the regulator

1. Approve and activate a live AML/CFT calculation policy (until then
   operational assessments cannot bind a calculation run and follow the legacy
   officer-rating path).
2. Confirm whether publication remains atomic with approval for all assessment
   types, or whether a separate publication authority is required.
3. Confirm the retention and reversal policy for legally invalidated approvals.
4. Confirm reviewer independence scope for small regulator teams
   (single-reviewer divisions).

## Final certification lock (HEAD 2a9edb988, clean tree)

Preservation census: identical before and after the gate chain (28 assessments,
25 current, 984 responses, 21 AML entity risk states, 25 movements, 4 programmes,
v1.0 ACTIVE/REGULATOR_AUTHORED, v1.1 DRAFT/MIPL_REFERENCE, 0 live calculation
policies). Canonical AML-07 risk digest (defined in
`scripts/aml07-preservation-census.sql`): `8385b6c8f7ba2b4102ab054c8f5ac686`,
unchanged across the run. The digest string quoted in the request
(`d74db7c3fa59b511cb8cfb682f68c38b`) was never recorded in the repository with a
column/order/hash definition, so it cannot be reproduced or claimed; the
definition above is now canonical and versioned.

Gates:
- AML-07 review/approval/publication SQL: 47/47 (46 family gates + rollback), 0 fail, 0 AML07CERT survivors.
- Rollback sweep: 0 rows for AML07CERT / AML06CERT / AML05CERT / PLANCERT across assessments, rounds, challenges, decisions, publications, plans, responses, evidence, facts, events, risk state, regulators, roles.
- Predecessors: policy-profile kernel 32/32, methodology studio 45/45, v1.1 reference draft 18/18, programme configuration 52/52, question plan 50/50, evidence/fact readiness 58/58, calculation policy engine 50/50, regulator scope 11/11, route register 6/6, structural integrity 14/14, dimension linkage 11 pass/1 fail, calculation governance 18/2, calculation integrity 7/4, full-module hardening 53/8, epic-3 closed loop 21/21.
- Hardening SQL: 31/0/0 plus F5-B1 4/0. RBAC parity OK, authorization centralised, action governance 2289/2289 protected, RBAC/authorize tests 14 files / 119 tests.
- UI: review surface 25/25, risk history 10/10, frontend boundary 17/17 (React displays server decisions only).
- Security scan: 5 findings, all inherited platform/public-registration items; none in AML-07 surfaces.
- Full suite, canonical two workers, three consecutive runs: 170 files / 1604 tests / 0 failed / 0 skipped each. Typecheck and build pass.

Corrections made: `scripts/verify-aml-policy-profile-kernel.sql` PROFILE-02 was
asserting an obsolete two-type catalogue; updated to the three genuinely
implemented component types and strengthened to require a backing store for each.
No production behaviour was changed to satisfy a verifier.

Outstanding, all classified as pre-existing policy/configuration blockers outside
AML-07: CALC-05/06/09/11, CALCG-03, CALCG-20, OUTC-09, AMLH-09 and LINK-11 depend
on a regulator-authored ACTIVE calculation policy, materiality naming decision and
methodology dimension-code decision. Operational calculation correctly remains
NOT_CALCULABLE. The AML-02-era methodology-authority verifier still aborts on its
structurally invalid v1.1 reference fixture (test fixture defect, not AML-07).

Verdict: AML-07 review, approval and risk-of-record publication is certified for
its own scope. The AML baseline is not declared fully green, because inherited
calculation-policy and methodology-fixture gates remain red pending regulator
decisions.
