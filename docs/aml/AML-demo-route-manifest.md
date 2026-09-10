# AML/CFT demonstration — route and record manifest

Every route below was loaded in a headless rehearsal as an internal supervisory user.
No route returned an HTTP status of 400 or above and every screen rendered real seeded data.

## Supervisory routes

| # | Route | Purpose in the demonstration |
|---|-------|------------------------------|
| 1 | `/supervision/aml` | AML/CFT overview: portfolio counters, risk distribution, review cycle |
| 2 | `/supervision/aml/work-queue` | Prioritised AML work queue |
| 3 | `/supervision/aml/entities` | Supervised entity population with risk of record |
| 4 | `/supervision/aml/assessments` | Assessment register across all lifecycle states |
| 5 | `/supervision/aml/assessments/:id` | Assessment workspace: question plan, responses, evidence, review history |
| 6 | `/supervision/aml/heatmap` | Risk heatmap |
| 7 | `/supervision/aml/examinations` | Examination register |
| 8 | `/supervision/aml/findings` | Findings and remediation |
| 9 | `/supervision/aml/portfolio` | Server-authoritative portfolio report and export |

## Configuration routes (governance scenes)

| Route | Purpose |
|-------|---------|
| `/admin/supervisory-methodology` | v1.0 ACTIVE regulator-authored, v1.1 DRAFT / MIPL_REFERENCE |
| `/admin/supervisory-methodology/:methodologyId` | Version workspace: dimensions, questions, applicability |
| `/admin/supervisory-policy-profiles` | Policy profile kernel |
| `/admin/supervisory-assessment-programmes` | Programme configuration |
| `/admin/supervisory-calculation` | Calculation configuration — active demonstration policy `daf7d06e-1876-45bc-8a14-6869545f65a5` |
| `/admin/supervisory-calculation/approvals` | Calculation configuration approvals — maker/checker history |

Narration for these routes: [`AML-policy-methodology-configuration-scene.md`](./AML-policy-methodology-configuration-scene.md).


## Current-workflow assessment records

| Key | Assessment id | Entity | State |
|-----|---------------|--------|-------|
| SCEN-01 | `3709eb06-31d1-4efd-be6c-fad3dbf73111` | DEMO AML 01 Castries Remittance Services Ltd | draft, 41-question plan, no responses |
| SCEN-02 | `f2910beb-2c79-49cb-bdb9-0ecf2dd3f885` | DEMO AML 02 Vieux Fort Money Transfer Ltd | submitted, 41 responses |
| SCEN-03 | `8591b783-0a86-476e-9c0b-745d17d46ca6` | DEMO AML 03 Soufriere Exchange Bureau Ltd | returned for revision |
| SCEN-04 | `b3905c17-b8ab-4709-8531-a4356c60fe7a` | DEMO AML 04 Marigot Credit Union | returned then resubmitted |
| SCEN-05 | `093b4f2b-5017-49fc-aa9f-026f21d15a0f` | DEMO AML 05 Dennery Cooperative Credit Union | draft, 12 of 41 answered |

## Downstream supervisory records (all created through governed operations)

| Entity | Governed action | Target |
|--------|-----------------|--------|
| DEMO AML 06 Rodney Bay Payments Ltd | supervisory plan opened | plan `3867aebc-a3d9-491f-9d5a-7fa952031a05` |
| DEMO AML 06 | reassessment required | requirement `e9676a14-7667-4cb1-80fd-d0309cc4eda5` |
| DEMO AML 07 Gros Islet Virtual Assets Ltd | plan → intervention → endorsement → examination → high finding issued | examination `d100da97-5afb-4756-9d21-6c51abe524e9`, finding `661dbc40-b72a-4874-bbf5-6e1af11ead9a` |
| DEMO AML 08 Choiseul Cash Services Ltd | monitoring recorded, review rescheduled | review-cycle decisions |
| DEMO AML 05 | remediation plan completed, outcome evaluated PARTIALLY_EFFECTIVE and independently approved | plan `458783fc-3feb-48db-852c-90588f078bb5` |
| DEMO AML 09 Anse La Raye Remittance Ltd | plan deliberately left open | plan `e37777ac-c43c-4043-8e66-c853629c8e39` |

## What must not be shown as available

No approved rating publication and no live calculation policy exist. DEC-01…DEC-08 are unsigned,
so the calculation screens correctly report `NOT_CALCULABLE` and the approval queue is empty.
Historical ratings on cases 06–24 are labelled officer-recorded legacy ratings.


## Calculation policy and published rating (added with the calculation-policy wave)

| Purpose | Route | Record |
|---|---|---|
| Calculation policy parameters, scoring, bands, residual matrix, history | `/admin/supervisory-calculation` | configuration `daf7d06e-1876-45bc-8a14-6869545f65a5` on AML-CFT-RBA v1.0 |
| Configuration approval queue and maker/checker history | `/admin/supervisory-calculation/approvals` | same configuration |
| Calculated, approved and published assessment | `/aml/assessments/c3e16863-60d8-4c6e-8650-3f0eefcbc0cf` | SCEN-06, entity `aa220000-0000-4000-8000-000000000006` (DEMO AML 06 Rodney Bay Payments Ltd) |

Personas: maker `aml_supervision_officer@mishainfotech.com` (configure, validate, submit, answer,
calculate, submit for review); checker `aml_supervision_supervisor@mishainfotech.com` (approve the
configuration, approve and publish the rating).
