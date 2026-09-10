# AML/CFT demonstration — video storyboard

Target length: 12–14 minutes. One continuous supervisory story, no mock screens, no data invented on camera.

| # | Scene | Route / record | Duration | Readiness |
|---|-------|----------------|----------|-----------|
| 1 | Framing: risk-based AML/CFT supervision end to end | `/supervision/aml` | 0:45 | READY |
| 2 | Methodology governance: v1.0 ACTIVE regulator-authored, v1.1 DRAFT reference | `/admin/supervisory-methodology` | 1:00 | READY |
| 3 | Programme configuration that drives the question plan | `/admin/supervisory-methodology/assessment-programmes` | 0:45 | READY |
| 4 | Supervised population and risk of record | `/supervision/aml/entities` | 0:45 | READY |
| 5 | New assessment prepared from the programme (41-question plan) | SCEN-01 | 1:15 | READY |
| 6 | Working the file: responses, justified not-applicable, workpaper evidence | SCEN-02 | 1:30 | READY |
| 7 | Independent review returning a file with a written reason | SCEN-03 | 1:00 | READY |
| 8 | Return, correction and resubmission — two review rounds | SCEN-04 | 1:00 | READY |
| 9 | Partly worked file: 12 of 41 answered | SCEN-05 | 0:30 | READY |
| 10 | Approval and rating publication | calculation screens | 1:00 | **POLICY BLOCKED** — shown as an explained gap |
| 11 | Consequence: plan opened and reassessment required | DEMO AML 06 | 1:00 | READY |
| 12 | Escalation chain: plan → intervention endorsed → examination → high finding issued | DEMO AML 07 | 1:30 | READY |
| 13 | Review-cycle governance: monitoring recorded, review brought forward | DEMO AML 08 | 0:45 | READY |
| 14 | Effectiveness: completed plan evaluated PARTIALLY_EFFECTIVE, independently approved | DEMO AML 05 | 1:15 | READY |
| 15 | Server refusal: an open plan cannot be evaluated | DEMO AML 09 | 0:30 | READY |
| 16 | Portfolio report and export | `/supervision/aml/portfolio` | 1:00 | READY |
| 17 | Close: governance, immutability, honest gaps | — | 0:30 | READY |

## Scene 10 — calculation policy governance, and one published rating

Scene 10 can now be recorded in full, because a **demonstration** calculation configuration has been
authored, independently approved and activated through the product's own workflow.

| Beat | Route | Record | Narration point |
|---|---|---|---|
| 10a | `/admin/supervisory-calculation` | AML-CFT-RBA v1.0 configuration `daf7d06e-1876-45bc-8a14-6869545f65a5` | The methodology publishes questions and scales; it does not by itself produce a rating. Scoring, weighting, bands, the residual matrix and the recommendation rule are policy, authored here and visible in full. |
| 10b | `/admin/supervisory-calculation` | validation panel | The server, not the screen, decides whether the policy is complete. An incomplete policy cannot be submitted. |
| 10c | `/admin/supervisory-calculation/approvals` | same configuration | Maker/checker: the officer who authored the policy cannot approve it. A different authorised approver does, with a recorded rationale, and only then does it take effect. |
| 10d | `/aml/assessments/c3e16863-60d8-4c6e-8650-3f0eefcbc0cf` | SCEN-06, DEMO AML 06 Rodney Bay Payments Ltd | With a policy in force the assessment moves from NOT CALCULABLE to a calculated recommendation, and the explanation shows the answers, weights, bands and matrix cell that produced it. |
| 10e | same | approval and publication | Calculation is not approval. The rating is reviewed, approved by a second authorised person, and only then published as the entity's operative risk of record — with the previous rating retained in history. |

Say plainly on camera: these are demonstration policy values, authored for the demonstration
environment. The regulator decisions DEC-01…DEC-08 remain open, and assessments of earlier periods
resolve no policy and are deliberately left exactly as recorded.

## Recording rules

- Internal supervisory user only; no screen may show another regulator's data.
- Never edit data on camera outside the seeded scenarios.
- Do not activate a calculation policy, approve a rating or bypass any refusal.
- Refusals are part of the story: show the message, do not work around it.
