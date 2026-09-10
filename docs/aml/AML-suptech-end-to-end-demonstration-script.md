# AML/CFT SupTech — end-to-end supervisory demonstration (20–25 minutes)

One institution, one connected supervisory lifecycle. Every route and record below exists in the
seeded demonstration environment and was rehearsed as an internal supervisory user. Nothing on
screen is mocked and no rating is invented on camera.

Anchor institution: **DEMO AML 06 Rodney Bay Payments Ltd** — entity `aa220000-0000-4000-8000-000000000006`.
Personas: maker `aml_supervision_officer@mishainfotech.com`, checker `aml_supervision_supervisor@mishainfotech.com`.

Optional 4–5 minute prelude before scene 3: [policy and methodology configuration](./AML-policy-methodology-configuration-scene.md) —
regulator-owned methodology, questions, calculation policy, versioning, maker-checker and effective dates.

## Running order

| # | Scene | Route | Record | Duration |
|---|-------|-------|--------|----------|
| 1 | Opening | `/supervision/aml` | portfolio counters | 1:00 |
| 2 | Supervised entity | `/supervision/aml/entities` → `/entities/aa220000-0000-4000-8000-000000000006` | DEMO AML 06 | 1:00 |
| 3 | AML/CFT assessment | `/supervision/aml/assessments/c3e16863-60d8-4c6e-8650-3f0eefcbc0cf` | SCEN-06, 41 responses | 2:00 |
| 4 | Calculation policy governance | `/admin/supervisory-calculation` | config `daf7d06e-1876-45bc-8a14-6869545f65a5` (v1.0, ACTIVE) | 2:00 |
| 5 | Calculation readiness | assessment calculation view | server readiness = CALCULABLE | 1:00 |
| 6 | Calculated rating | same | 20 dimensions calculated, 6 not applicable | 1:00 |
| 7 | Explainability / provenance | same, calculation detail | run `run_seq=1`, hash `22ef382593b79db559563072bd70fb90` | 1:30 |
| 8 | Submitted for review | same, review history | maker submission with recorded run | 0:45 |
| 9 | Independent approval | same | checker approval with rationale | 1:00 |
| 10 | Publication of the risk of record | same → `/entities/aa220000-…-000006` | residual LOW, prior states retained | 1:30 |
| 11 | Continuous monitoring | `/supervision/aml` review-cycle panel, `/supervision/aml/work-queue` | monitoring decisions | 1:00 |
| 12 | Governed next steps | entity supervisory panel | available vs blocked actions with reasons | 1:00 |
| 13 | Reassessment required | DEMO AML 06 | requirement `e9676a14-7667-4cb1-80fd-d0309cc4eda5` | 1:00 |
| 14 | Supervisory plan | DEMO AML 06 | plan `3867aebc-a3d9-491f-9d5a-7fa952031a05` | 1:00 |
| 15 | Intervention | DEMO AML 07 Gros Islet Virtual Assets Ltd | endorsed intervention | 1:00 |
| 16 | Examination | `/supervision/aml/examinations` | examination `d100da97-5afb-4756-9d21-6c51abe524e9` | 1:00 |
| 17 | High-severity finding | `/supervision/aml/findings` | finding `661dbc40-b72a-4874-bbf5-6e1af11ead9a` | 1:00 |
| 18 | Remediation | DEMO AML 05 | plan `458783fc-3feb-48db-852c-90588f078bb5` completed | 1:00 |
| 19 | Effectiveness review | same | PARTIALLY_EFFECTIVE with cited evidence | 1:00 |
| 20 | Second-supervisor approval | same | independent approval recorded | 0:45 |
| 21 | Brought-forward monitoring | DEMO AML 08 Choiseul Cash Services Ltd | monitoring recorded, review date advanced | 0:45 |
| 22 | Return to Entity 360 | `/entities/aa220000-0000-4000-8000-000000000006` | full supervisory history | 1:00 |
| 23 | Management value | `/supervision/aml/portfolio` (+ export), `/supervision/aml/heatmap` | server-produced report | 1:30 |
| 24 | Closing | — | — | 0:45 |

## Narration

**1. Opening.** "Rather than taking you screen by screen through separate modules, we will follow one
regulated institution: what the regulator knows about it, its AML/CFT assessment, the calculation and
approval of its risk rating, an emerging concern, the supervisory action that follows, an examination,
a finding, remediation, effectiveness and back into monitoring. None of these activities exists
independently — the platform holds the institution's complete supervisory story."

**2. Supervised entity.** "Every regulated institution has one consolidated supervisory profile. It is
the anchor around which assessments, ratings, monitoring, plans, interventions, examinations, findings
and remediation accumulate. Instead of spreadsheets, documents and mailboxes, we are building
institutional supervisory memory."

**3. AML/CFT assessment.** "This is the AML/CFT assessment, worked against the regulator's approved
methodology — forty-one responses across the applicable dimensions. We keep more than a score: the
responses, the basis and the workpapers, so another supervisor can later answer why we concluded this."

**4. Calculation policy governance.** "Before calculating anything: the engine is not allowed hidden
assumptions or arbitrary constants. The methodology has an explicit calculation policy that travels
Draft → Review → Approved → Active. One authorised person prepares it; a different authorised person
approves it. The maker cannot make their own assumptions operative. For today we use a formally
activated demonstration configuration. These values demonstrate how regulator-defined calculation
policy is governed by the system; in a live implementation the regulator determines and approves them."

> Presenter note: never describe these as recommended AML calculation values.

**5. Calculation readiness.** "With methodology and policy governed, the server decides whether the
assessment is ready. The platform does not produce a rating because somebody pressed a button — it
checks the assessment data, the methodology and the approved policy. Here the prerequisites are
satisfied, so the assessment is calculable."

**6. Calculated rating.** "Twenty calculation elements contribute; six are legitimately not applicable.
Calculation is still not an official supervisory rating — the engine gives a result, the regulator
still exercises governance over it."

**7. Explainability.** "We preserve how the result was produced: methodology, configuration, inputs,
intermediate scores, bands and the matrix cell. The rating is reproducible and explainable rather than
a black box — and later methodology change does not rewrite this record."

**8. Submitted for review.** "The calculated rating is submitted for supervisory review. Calculation is
one event; approval is another. A mathematical result does not become the regulator's official
position by itself."

**9. Independent approval.** "An independently authorised supervisor reviews and approves it. The system
records who decided, when, and which assessment and methodology supported the decision."

**10. Publication.** "Publication is the point at which the approved assessment becomes the
institution's operative risk of record. It is reflected against the institution — and the earlier risk
states and movements remain. We change the current position without rewriting supervisory history."

**11. Continuous monitoring.** "A published rating is not the end of supervision. Returns arrive, events
occur, findings stay open, commitments fall overdue. Monitoring runs alongside periodic assessment, and
here it raises something needing supervisory attention."

**12. Governed next steps.** "Rather than escalating every indicator, the platform evaluates context and
offers the appropriate next actions. Some are available; others are blocked until the required
supervisory step exists — and the system says why. Controlled escalation, not arbitrary escalation."

**13. Reassessment.** "The supervisor judged the new information material enough to require a
reassessment. Notice what does not happen: the approved rating is not overwritten. It stays in history
while a new assessment determines whether the risk position should change."

**14. Supervisory plan.** "The concern feeds supervisory planning, where risk becomes a structured
regulatory response: risk → supervisory objective → supervisory activity."

**15. Intervention.** "The plan produced a specific intervention, endorsed through its governance. This
record did not appear on its own — we can trace the decision that caused it."

**16. Examination.** "The intervention required further assurance, so the matter became an examination.
We can trace backwards: examination → intervention → plan → concern → institution."

**17. Finding.** "This high-severity finding was formally issued against the institution and is
recorded as arising from the risk assessment itself — the platform stores the source of every finding
rather than assuming it. Years later the regulator can still establish why the finding exists, where it
came from, and what was required in response."

**18. Remediation.** "The institution completed its remediation activities. The platform deliberately
separates activity completed from risk effectively remediated."

**19. Effectiveness review.** "Supervisory review concluded the remediation was only partially
effective. An institution can complete everything it promised while the underlying risk remains, so the
regulator assesses effectiveness, not completion."

**20. Second-supervisor approval.** "That effectiveness conclusion was itself approved by a second
supervisor — governance around closure and supervisory judgment, not just around activity."

**21. Brought-forward monitoring.** "Because remediation was only partially effective, attention
continues: monitoring is recorded and the review date is brought forward. That closes the loop."

**22. Return to Entity 360.** "Back where we started, we now hold assessment, calculated risk, approval
and publication, monitoring, reassessment requirements, planning, intervention, examination, findings,
remediation, effectiveness and continuing attention. This is institutional memory."

**23. Management value.** "The same connected information answers the management questions: who presents
the greatest risk and why, who is deteriorating, who needs reassessment, what activity is underway,
which high findings are unresolved, which remediation is overdue, who completed remediation yet remains
ineffective, and where to place the next supervisory hour. The portfolio report and its export are
produced by the server, so what is exported is exactly what was authorised and seen."

**24. Closing.** "Not an AML questionnaire and not case management: an institution, a structured
assessment, a governed calculation policy, an independent review, an approved and published risk of
record, monitoring that raised concern, reassessment and planning, intervention, examination, a
high-severity finding, remediation judged only partially effective, and enhanced monitoring — with the
relationships, methodology, decisions, approvals and history preserved throughout. We can go deeper
into whichever area matters most to your supervisory model."

## Recording rules

- Internal supervisory user only; no screen may show another regulator's data.
- Do not edit data on camera outside the seeded scenarios.
- Say plainly that the calculation policy values are demonstration values for this environment; the
  regulator decisions DEC-01…DEC-08 remain open, so assessments of earlier periods resolve no policy
  and stay exactly as recorded.
- Refusals are part of the story: show the message, never work around it.
