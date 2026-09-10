# AML-09 — Risk Surveillance, Review-Cycle Status and Governed Reassessment Triggering

## Architecture reuse

No new risk, assessment, programme or action architecture was created. AML-09 reads the
AML-07 published risk-of-record and AML-08 consequence source view, and appends governed
monitoring decisions to `supervisory_risk_monitoring_decision`
(`decision_kind` = `REASSESSMENT_TRIGGERED` | `RESCHEDULE`). Reassessment requirements reuse
`supervisory_reassessment_requirement`. Findings, examinations and enforcement cases are read
from their canonical tables only.

## Date resolution order

1. Approved explicit schedule decision (latest appended decision wins)
2. Bound assessment programme cycle applied to the last completed assessment
3. Next review date recorded on the last completed assessment
4. Review date held on the entity risk-of-record
5. Otherwise `UNSCHEDULED` — no default interval is ever assumed

Recorded schedule history is a snapshot: later programme changes never rewrite it.
A certification defect was fixed here — the authoritative schedule decision is now resolved by
`decided_at DESC, decision_seq DESC`, so decisions recorded in the same instant resolve
deterministically.

## Monitoring states

`CURRENT`, `DUE` (on the review date itself), `OVERDUE`, `EVENT_TRIGGERED`, `UNSCHEDULED`,
`BLOCKED` (no risk-of-record), `LEGACY` (pre-governance risk record). `NOT_CALCULABLE` ratings
are read, never derived.

## Event sources

Canonical only: high/critical issued findings, concluded or reassessment-flagged examinations,
open enforcement cases — each after the current risk-of-record took effect. An event creates a
consideration state only; it never changes risk and never creates a reassessment. Unsupported
event types are refused; inaccessible sources are never disclosed.

## Reassessment governance

Requires `aml_supervision.review` (or `supervisory_spine.review`), entity scope and a written
rationale. Repeated or concurrent requests converge on the existing open requirement. Event,
schedule, risk-state and actor lineage are recorded and audited.

## Rescheduling, deferral and waiver

Rescheduling requires `aml_supervision.approve` plus a rationale; decisions are appended and
prior records retained. Identical repeats converge. Waiving an AML/CFT review remains
unsupported and is refused — no waiver policy was invented.

## Certification results

- SQL `scripts/verify-aml-risk-monitoring-reassessment.sql`: 43 passed / 0 failed
  (MON 8, DATE 6, EVENT 5, REASSESS 8, RESCHED 6, SEC 8, ROLLBACK 2), single transaction,
  `ON_ERROR_STOP`, final rollback.
- Rollback proof: 0 surviving AML09CERT monitoring decisions, requirements, findings,
  assessments, methodologies, risk states, risk movements, publications, audit events or work
  items; 0 older AML certification fixtures.
- UI suite: 22 passed / 0 failed. Frontend boundary: 27 passed / 0 failed.
- RBAC/authorisation and AML-08 focused tests: 14 files / 121 tests passed.
  RBAC action coverage 2293/2293 protected. RBAC parity OK.
- Full two-worker suite (one run): 172 files / 1651 tests passed. Typecheck clean; build OK.

## Security

Anonymous access and direct table writes are refused; internal helpers are revoked from
`authenticated` and `anon`; all AML-09 SECURITY DEFINER paths pin `search_path`; regulator and
domain isolation is enforced server-side; the acting supervisor is recorded on every decision.
No new security advisory was introduced (inherited advisory population unchanged).

## Preservation

Risk ratings, risk history, historical assessments, programme configuration, v1.0 / v1.1
methodology state and LINK-11 remain untouched. No calculation policy, risk-to-action policy or
review interval was authored. Canonical risk digest unchanged: `8385b6c8f7ba2b4102ab054c8f5ac686`.

## Remaining blockers (inherited, policy-dependent)

CALC-05, CALC-06, CALC-09, CALC-11 (no ACTIVE calculation configuration published) and AMLH-09
(governed calculation outcomes) remain red pending regulator policy. Out of AML-09 scope.

## Deferred

Three-run full regression certification is deferred to the final AML module release lock.

## AML-10 readiness

YES.
