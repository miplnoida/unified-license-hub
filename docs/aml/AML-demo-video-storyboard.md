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

## Scene 10 handling

Scene 10 is the only scene that cannot be completed live. The eight calculation policy decisions
DEC-01…DEC-08 are unsigned, so no live AML/CFT calculation policy exists, every rating is reported as
`NOT_CALCULABLE`, and the rating override operation refuses with `no_calculation`. The scene shows the
configuration screens and the empty approval queue, and states plainly that publication is waiting on
signed regulator policy decisions rather than on software.

## Recording rules

- Internal supervisory user only; no screen may show another regulator's data.
- Never edit data on camera outside the seeded scenarios.
- Do not activate a calculation policy, approve a rating or bypass any refusal.
- Refusals are part of the story: show the message, do not work around it.
