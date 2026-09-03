# AML/CFT supervision — persistent demonstration / QA dataset

| Artefact | Path |
| --- | --- |
| Seed (idempotent) | `scripts/demo/seed-aml-demo-dataset.sql` |
| Cleanup | `scripts/demo/cleanup-aml-demo-dataset.sql` |
| Verification (18 gates) | `scripts/verify-aml-demo-dataset.sql` |
| Browser E2E (6 specs) | `e2e/cert-v2/06-aml-demo-dataset.spec.ts` |

Non-production only: both SQL scripts refuse to run when
`public.is_production_environment()` is true.

## What the dataset is

24 AML/CFT supervision cases on 24 stable demonstration entities
(`DEMO AML 01 …` – `DEMO AML 24 …`, deterministic ids `aa220000-…-0000000000NN`),
each stopped at a different point of the governed closed loop so every AML
screen, counter, queue and drill-through has real, causally consistent data.

Everything is written through the governed operations only, acting as the real
certification personas. Direct inserts are limited to the ordinary registry
fixtures (`parties`, `licensees`, `entity_supervision_assignments`).

| # | State represented |
| --- | --- |
| 01 | in perimeter, never assessed |
| 02 | draft assessment |
| 03 | assessment awaiting independent review |
| 04 | approved LOW residual rating |
| 05 | approved MODERATE residual rating |
| 06 | approved HIGH residual rating |
| 07 | deteriorating: MODERATE superseded by HIGH, movement recorded |
| 08 | supervisory attention opened and priority confirmed |
| 09 | supervisory plan approved and active |
| 10 | intervention endorsed |
| 11 | examination opened and scoped from the approved assessment |
| 12 | examination fieldwork: requests issued/received, workpaper submitted |
| 13 | examination with an overdue, still-outstanding information request |
| 14 | HIGH finding issued, awaiting management response |
| 15 | officer-recorded management response (sender, date, channel) |
| 16 | corrective actions at mixed stages of the remediation lifecycle |
| 17 | all corrective actions awaiting independent validation |
| 18 | one action concluded INEFFECTIVE and escalated |
| 19 | finding closed, reassessment mandated |
| 20 | complete loop: HIGH → MODERATE after validated remediation |
| 21 | governed determination places the entity **outside** the AML/CFT perimeter |
| 22 | joint AML/CFT and prudential engagement (both assessments as origin) |
| 23 | escalated action referred to Enforcement by an enforcement officer |
| 24 | partially effective action with an accepted, graded residual deficiency |

## Personas used

| Function | Certification identity |
| --- | --- |
| AML/CFT officer (maker) | `aml_supervision_officer@` |
| AML/CFT supervisor (checker) | `aml_supervision_supervisor@` |
| Independent supervisor (residual acceptance, closure) | `prudential_supervisor@` |
| Prudential analyst (joint engagement) | `prudential_analyst@` |
| Enforcement referral | `enforcement_officer@` |
| Negative controls | `returns_officer@`, `read_only@`, `licensee_primary_user@` |

No accounts are created and no password appears in any script.

## Defect found and fixed

**Internal AML/CFT staff were treated as external users by the canonical
supervisory read guard.** `public.sup_read_guard()` decided "internal" purely
from the legacy `app_role` enum, which AML business roles do not carry, so
`entity_supervisory_360`, the supervisor dashboard, the priority work queue and
team performance all refused to answer for an AML officer or AML supervisor.
The guard now also accepts a user holding any internal supervisory viewing
permission (`supervisory_spine.view`, `aml_supervision.view`,
`prudential_supervision.view`, `market_conduct.view`, `license_management.view`,
`returns_management.view`, `inspection_management.view`,
`enforcement_management.view`). External portal users hold none of these and
remain refused — proven by the external-user spec.

## Rebuild semantics and one platform limitation

Re-running the seed leaves the same live dataset: it removes the previous
governed content and rebuilds it on the same entities. One record class cannot
be removed — `supervisory_intervention_event` is append-only by design, so the
previous run's interventions cannot be deleted. They are cancelled, detached and
retitled `SUPERSEDED …` so they never appear in an active queue. Audit entries
(`compliance_audit_logs`, `audit_logs`) are likewise permanent evidence and are
never removed. This is recorded as expected behaviour, not a defect.

## Verification status

| Suite | Result |
| --- | --- |
| `scripts/verify-aml-demo-dataset.sql` | 18 PASS, 0 errors |
| `e2e/cert-v2/06-aml-demo-dataset.spec.ts` | 6 passed |
| `scripts/verify-w4-a6-aml-closed-loop.sql` | 25 PASS, 0 errors |

Security linter: 1590 issues, no new issue types (the amended read guard keeps
`SET search_path`).
