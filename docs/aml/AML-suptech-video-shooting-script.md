# AML/CFT SupTech — Complete Line-by-Line Video Shooting Script

Target length: 22–25 minutes. This is the recording-ready script: the approved narration, with the
exact screen, route and record to be on camera for every scene. It supersedes the shorter presenter
script for the full-length business video.

## Fixed facts for this recording

| Item | Value |
|---|---|
| Persona on camera | `aml_supervision_supervisor@mishainfotech.com` (supervisor / checker) |
| Configuring officer referenced | `aml_supervision_officer@mishainfotech.com` (officer / maker) |
| Anchor institution | DEMO AML 06 Rodney Bay Payments Ltd — `/entities/aa220000-0000-4000-8000-000000000006` |
| Anchor assessment | `SUP-AML_CFT-2026-00744` — `/supervision/aml/assessments/c3e16863-60d8-4c6e-8650-3f0eefcbc0cf` |
| Methodology | AML/CFT Risk-Based Supervision Methodology v1.0 (ACTIVE); v1.1 exists as a later draft version |
| Active calculation configuration | `daf7d06e-1876-45bc-8a14-6869545f65a5` (on v1.0) |
| Published result | inherent Low, control Strong, residual **Low**, 20 elements calculated, 6 not applicable |
| Escalation chain institution | DEMO AML 07 — `/entities/aa220000-0000-4000-8000-000000000007` (plan `8499e40f-d2b4-4b70-9563-e83bfc1bf751`, examination `d100da97-5afb-4756-9d21-6c51abe524e9`, finding `SF-AML-2026-00327` / `661dbc40-b72a-4874-bbf5-6e1af11ead9a`) |
| Remediation / effectiveness institution | DEMO AML 05 — `/entities/aa220000-0000-4000-8000-000000000005` |
| Review-cycle institution | DEMO AML 08 — `/entities/aa220000-0000-4000-8000-000000000008` |

## Before you start recording

- Sign in as the supervisor persona; leave `/supervision/aml` open and loaded.
- Open the anchor assessment once in a second tab so its data is warm, then return to the landing screen.
- `/supervision/aml/examinations` can take up to ten seconds to populate — open it once before recording.
- Do not edit the active configuration, do not create assessments, do not recalculate or republish.
- Everything needed is already prepared. Pause two seconds before speaking.

---

## SCENE 1 — INTRODUCTION

**[ACTION]** `/supervision/aml` — AML/CFT supervision landing screen. Stay still.

**[SAY]**
"Welcome to this demonstration of our SupTech platform." *[PAUSE]*
"In this demonstration, I am not going to take you through a collection of independent software modules." *[PAUSE]*
"Instead, I am going to show you how a regulator can manage the complete supervisory lifecycle of a regulated institution." *[PAUSE]*
"We will begin with the institution itself."
"We will then look at how the regulator defines and governs its own AML/CFT methodology."
"We will apply that methodology to an actual risk assessment."
"We will calculate, independently review and publish the supervisory risk rating."
"And then we will see how that risk information moves into continuous monitoring, supervisory planning, intervention, examination, findings, remediation and further supervisory review." *[PAUSE]*
"The important concept throughout this demonstration is connectivity." *[PAUSE]*
"An assessment is not an isolated questionnaire."
"An examination is not an isolated case."
"And a finding is not an isolated record."
"They all become part of the continuing supervisory history of the institution." *[PAUSE]*
"Let us begin."

## SCENE 2 — SUPERVISED ENTITY

**[ACTION]** `/supervision/aml/entities`, then open DEMO AML 06 Rodney Bay Payments Ltd
(`/entities/aa220000-0000-4000-8000-000000000006`).

**[SAY]**
"We start with the supervised entity register." *[PAUSE]*
"This represents the institutions and entities for which the regulator has supervisory responsibility."
"Each institution has a consolidated supervisory profile." *[PAUSE]*
"This institution becomes the anchor for its regulatory and supervisory history."
"As supervision progresses, its assessments, risk positions, monitoring information, plans, interventions, examinations, findings and remediation activities remain connected to this entity." *[PAUSE]*
"This means the regulator is progressively building institutional supervisory memory." *[PAUSE]*
"And that supervisory memory does not disappear when an individual supervisory officer changes." *[PAUSE]*
"Before we assess this institution, however, I want to show you something very important."

## SCENE 3 — INTRODUCING AML POLICY AND METHODOLOGY

**[ACTION]** `/admin/supervisory-methodology`.

**[SAY]**
"Every regulator has its own supervisory philosophy and risk-based supervision framework." *[PAUSE]*
"Even when different authorities follow the same international principles, they may use different risk factors, different assessment questions, different thresholds and different supervisory responses." *[PAUSE]*
"For that reason, our platform does not impose a fixed AML/CFT methodology on the regulator." *[PAUSE]*
"The platform provides the supervisory engine." *[PAUSE]*
"**The regulator owns the supervisory policy.**" *[PAUSE 2 SECONDS]*

## SCENE 4 — METHODOLOGY CONFIGURATION

**[ACTION]** Open the AML/CFT Risk-Based Supervision Methodology v1.0 detail. Show the dimension list,
then one dimension's questions. Do not scroll continuously.

**[SAY]**
"Here we can see the AML/CFT supervisory methodology configured within the platform." *[PAUSE]*
"The regulator can determine what it wants its supervisors to assess." *[PAUSE]*
"For example, this can include areas relating to customer risk, geography, products and services, delivery channels, governance, internal controls, customer due diligence, transaction monitoring and other relevant AML/CFT risk areas." *[PAUSE]*
"The precise structure is determined by the authority."
"Within those areas, the regulator can define the individual supervisory questions and assessment factors." *[PAUSE]*
"This is important because regulatory methodology should not be permanently buried inside software code." *[PAUSE]*
"As policy changes, the methodology must also be capable of evolving."

## SCENE 5 — DIFFERENT POLICIES FOR DIFFERENT SECTORS

**[ACTION]** `/admin/supervisory-policy-profiles`. Point to the sector scoping, then stop moving.

**[SAY]**
"The same architecture can also support different methodologies for different regulated sectors." *[PAUSE]*
"For example, the AML/CFT methodology used for a bank does not necessarily have to be identical to the methodology used for a money services business, insurer, securities intermediary or another type of regulated institution." *[PAUSE]*
"The authority can therefore configure its supervisory approach according to the nature and risk profile of the sector."

## SCENE 6 — CALCULATION POLICY

**[ACTION]** `/admin/supervisory-calculation` — configuration `daf7d06e-1876-45bc-8a14-6869545f65a5`.
Highlight in turn: aggregation rule, treatment of not-applicable information, completeness requirement,
banding, and the residual matrix.

**[SAY]**
"Defining the assessment questions is only one part of the methodology." *[PAUSE]*
"The regulator must also determine how those supervisory assessments translate into risk." *[PAUSE]*
"This is the calculation policy."
"Here the authority can govern decisions such as how risk is aggregated…"
"…how applicable and non-applicable information is treated…"
"…what completeness requirements apply…"
"…how the calculation behaves…"
"…and how the resulting supervisory rating is determined." *[PAUSE]*
"These are not intended to be hidden programming assumptions." *[PAUSE]*
"They are explicit supervisory policy decisions."

## SCENE 7 — DEMONSTRATION POLICY CAUTION

**[ACTION]** Stay on the active configuration; point to its ACTIVE status.

**[SAY]**
"For this demonstration, we are using an active demonstration calculation configuration." *[PAUSE]*
"The values shown here are demonstration assumptions." *[PAUSE]*
"In a real regulatory implementation, these policy decisions would be agreed with and formally owned by the regulator." *[PAUSE]*
"The system provides the mechanism to configure, govern and execute those decisions."
"It does not attempt to make regulatory policy on behalf of the authority."

## SCENE 8 — POLICY GOVERNANCE

**[ACTION]** `/admin/supervisory-calculation/approvals` — the configuration's submission and approval
history. Point to the status progression and to the two different names.

**[SAY]**
"Configurability, however, does not mean that an administrator can simply change regulatory policy whenever they want." *[PAUSE]*
"Policy configuration itself is governed." *[PAUSE]*
"The lifecycle moves from…"
"Draft…"
"…to Review…"
"…to Approved…"
"…and finally to Active."
"One authorised officer can prepare the configuration."
"Another appropriately authorised officer independently reviews and approves it." *[PAUSE]*
"This gives the regulator maker-checker governance over the methodology that ultimately influences supervisory risk."

## SCENE 9 — WHY GOVERNANCE MATTERS

**[ACTION]** Remain on the approval history.

**[SAY]**
"This control is particularly important." *[PAUSE]*
"A seemingly small change to a weighting, threshold or calculation rule could affect how institutions are classified." *[PAUSE]*
"Those changes therefore need accountability." *[PAUSE]*
"The platform allows the regulator to understand…"
"Who configured the policy?"
"Who reviewed it?"
"Which version became effective?"
"And which methodology was subsequently used by an assessment?"

## SCENE 10 — METHODOLOGY VERSIONING

**[ACTION]** `/admin/supervisory-methodology` — show v1.0 as the active version alongside the later
version. Point to the version numbers and statuses.

**[SAY]**
"Regulatory methodology will also change over time." *[PAUSE]*
"Suppose the regulator introduces a revised AML/CFT methodology next year." *[PAUSE]*
"We should not simply modify the old methodology and thereby change the meaning of historical assessments." *[PAUSE]*
"Instead, policy and methodology are versioned." *[PAUSE]*
"A historical assessment remains associated with the methodology under which it was performed."
"A future assessment can use the newly approved methodology." *[PAUSE]*
"**Policy can change without rewriting regulatory history.**" *[PAUSE 2 SECONDS]*

## SCENE 11 — TRANSITION FROM POLICY TO ASSESSMENT

**[ACTION]** `/supervision/aml/assessments`.

**[SAY]**
"So we have now established three important things." *[PAUSE]*
"The regulator defines what should be assessed."
"The regulator defines how risk should be determined."
"And authorised officers govern and approve those rules." *[PAUSE]*
"Now let us see that same methodology applied to an actual institution."

## SCENE 12 — OPEN DEMO AML 06

**[ACTION]** Open `SUP-AML_CFT-2026-00744`
(`/supervision/aml/assessments/c3e16863-60d8-4c6e-8650-3f0eefcbc0cf`). Show the header — the methodology
name and version are stated on it. Then open **Question scope**, and one entry under **Inherent risk** and
**Control effectiveness**.

**[SAY]**
"This is our demonstration AML/CFT assessment." *[PAUSE]*
"The assessment contains forty-one recorded responses." *[PAUSE]*
"But the important point is that this is not simply a questionnaire containing forty-one answers." *[PAUSE]*
"The assessment is operating within the context of the regulator's governed AML/CFT methodology."
"The supervisor evaluates the applicable risk and control areas and records the supervisory information supporting the assessment." *[PAUSE]*
"We therefore retain more than simply a final number."
"We retain the basis for the supervisory conclusion."

## SCENE 13 — CALCULATION READINESS

**[ACTION]** Same assessment — the **Submission readiness** panel, then the **Calculation** tab.

**[SAY]**
"Once the assessment has been completed, the system determines whether it is actually ready for calculation." *[PAUSE]*
"This is another important control." *[PAUSE]*
"The platform does not produce an official rating merely because somebody presses a Calculate button." *[PAUSE]*
"It first verifies that the necessary assessment information and an appropriately governed calculation policy are available." *[PAUSE]*
"For this demonstration assessment, those prerequisites have been satisfied." *[PAUSE]*
"So the assessment is calculable."

## SCENE 14 — CALCULATED RESULT

**[ACTION]** **Calculation** tab — the completed run: inherent Low, control Strong, residual Low, 20
calculated elements, 6 not applicable.

**[SAY]**
"The assessment has now been calculated through the governed methodology." *[PAUSE]*
"In this example, twenty calculation elements contribute to the result…"
"…while six have correctly been treated as not applicable." *[PAUSE]*
"But there is another important distinction here." *[PAUSE]*
"**Calculation is not approval.**" *[PAUSE 2 SECONDS]*
"The calculation engine produces a result."
"The regulator must still exercise supervisory governance over that result."

## SCENE 15 — CALCULATION EXPLAINABILITY / PROVENANCE

**[ACTION]** Same tab — open the run's detail: methodology and version, calculation configuration and
version, question-plan version, contributing inputs and the recorded run reference.

**[SAY]**
"The platform also retains how the calculation was produced." *[PAUSE]*
"We can identify the assessment…"
"…the methodology…"
"…the relevant calculation configuration…"
"…and the information contributing to the calculation." *[PAUSE]*
"This means the regulator does not need to treat the final risk rating as a black box." *[PAUSE]*
"The supervisor should be able to answer a very simple but important question." *[PAUSE]*
"Why did this institution receive this rating?"

## SCENE 16 — SUBMISSION FOR REVIEW

**[ACTION]** **Review & decision** tab — the review round and its recorded submission.

**[SAY]**
"After calculation, the rating enters the supervisory review process." *[PAUSE]*
"Again, the platform deliberately separates the mechanical calculation from the regulatory decision." *[PAUSE]*
"A calculated result is not automatically the regulator's official risk position."

## SCENE 17 — INDEPENDENT APPROVAL

**[ACTION]** **Approval history** tab — the approval decision, with the approver distinct from the
officer who recorded the assessment.

**[SAY]**
"Here the rating has been independently reviewed and approved by an appropriately authorised supervisor." *[PAUSE]*
"This provides maker-checker governance over one of the regulator's most important supervisory conclusions." *[PAUSE]*
"The platform preserves who made that decision and the assessment and methodology supporting it."

## SCENE 18 — PUBLISH RISK OF RECORD

**[ACTION]** Approval history — the publication entry. Then the entity's AML risk history on
`/entities/aa220000-0000-4000-8000-000000000006`, showing the current Low position and the earlier
position retained above it.

**[SAY]**
"Once the rating has been approved, it can be published." *[PAUSE]*
"Publication is significant." *[PAUSE]*
"This is the point at which the approved rating becomes the institution's operative supervisory risk of record."
"We can now see that supervisory risk reflected against the institution." *[PAUSE]*
"But previous risk positions have not been deleted or overwritten." *[PAUSE]*
"The historical risk record remains intact." *[PAUSE]*
"**We change the current supervisory position without rewriting supervisory history.**" *[PAUSE 2 SECONDS]*

## SCENE 19 — CONTINUOUS MONITORING

**[ACTION]** `/supervision/aml/work-queue` — the AML/CFT supervisory work queue and review-cycle status.

**[SAY]**
"An approved risk rating is not the end of supervision." *[PAUSE]*
"Risk continues to change between formal assessment cycles." *[PAUSE]*
"New regulatory information may arrive."
"Indicators may deteriorate."
"Commitments may become overdue."
"New intelligence may become available."
"Or an event may require supervisory attention." *[PAUSE]*
"This is where continuous monitoring becomes important."

## SCENE 20 — ATTENTION ITEM / NEXT STEPS

**[ACTION]** Return to the anchor assessment, **Supervisory consequence** tab, and the **Supervisory
actions** panel at the top of the assessment. Point to an available action, then to an action that is
unavailable together with the stated reason.

**[SAY]**
"Here the platform has identified a condition requiring supervisory attention." *[PAUSE]*
"But it does not automatically convert every signal into enforcement action." *[PAUSE]*
"Instead, it considers the supervisory context and presents the appropriate next steps."
"Some actions may be available."
"Other actions may not yet be appropriate." *[PAUSE]*
"And where an action is not available, the system explains why." *[PAUSE]*
"This creates governed escalation rather than arbitrary escalation."

## SCENE 21 — REASSESSMENT REQUIREMENT

**[ACTION]** Same **Supervisory consequence** tab — the recorded reassessment requirement for DEMO AML 06,
beside the retained risk history.

**[SAY]**
"In this example, the supervisor determined that the new information was material enough to require reassessment." *[PAUSE]*
"Notice what the platform does not do." *[PAUSE]*
"It does not simply rewrite the previously published risk rating." *[PAUSE]*
"The previous supervisory conclusion remains in history." *[PAUSE]*
"The new information creates a requirement for a new assessment." *[PAUSE]*
"This allows the regulator to preserve the chronology of risk."

## SCENE 22 — SUPERVISORY PLAN

**[ACTION]** Same tab — the prepared supervisory plan for DEMO AML 06
(`3867aebc-a3d9-491f-9d5a-7fa952031a05`, in preparation). Show its objective, priority and due date. The
active plan on the escalation chain is `8499e40f-d2b4-4b70-9563-e83bfc1bf751` on DEMO AML 07.

**[SAY]**
"The concern also moves into supervisory planning." *[PAUSE]*
"This is where identified risk is translated into a structured supervisory response."
"The regulator can define what it wants to achieve and what supervisory activity is required." *[PAUSE]*
"We therefore create a direct connection between…"
"Risk…"
"…supervisory objective…"
"…and supervisory action."

## SCENE 23 — INTERVENTION

**[ACTION]** `/entities/aa220000-0000-4000-8000-000000000007` (DEMO AML 07) — the endorsed targeted
examination intervention on its AML supervisory activity. Show the endorsement and the rationale.

**[SAY]**
"In our demonstration, that supervisory plan resulted in a specific intervention." *[PAUSE]*
"The intervention records why supervisory action was required and maintains its connection to the underlying concern."
"This intervention has also gone through its required endorsement." *[PAUSE]*
"And this gives us a principle that you will see repeatedly throughout the platform." *[PAUSE]*
"**This record did not appear independently. We can trace exactly which supervisory decision caused it.**"

## SCENE 24 — EXAMINATION

**[ACTION]** `/supervision/aml/examinations` — open the examination authorised by that endorsement
(`d100da97-5afb-4756-9d21-6c51abe524e9`). Allow it a moment to load. Show scope and its originating
intervention.

**[SAY]**
"The intervention subsequently identified that further assurance was required." *[PAUSE]*
"So the matter progressed into an examination."
"The examination therefore has a clear supervisory origin." *[PAUSE]*
"We can trace backwards…"
"from the examination…"
"…to the intervention…"
"…to the supervisory plan…"
"…to the underlying supervisory concern…"
"…and ultimately back to the institution." *[PAUSE]*
"That traceability is fundamental to the platform."

## SCENE 25 — HIGH-SEVERITY FINDING

**[ACTION]** `/supervision/aml/findings` — open `SF-AML-2026-00327`. Show severity High, status Issued,
and the recorded source of the finding.

**[SAY]**
"Supervision identified a material deficiency." *[PAUSE]*
"And that issue has now become a formal high-severity supervisory finding."
"The finding records the issue, its severity and its supervisory status." *[PAUSE]*
"But equally importantly, its origin remains available — the platform stores the recorded source of every finding rather than assuming it." *[PAUSE]*
"Months or even years later, the regulator can determine…"
"Why was this finding issued?"
"Where did it come from?"
"What supervisory concern started the chain?"
"And what was required in response?"

> Recording note: this finding's recorded source is the risk assessment, not the examination. Use the
> wording above so the narration matches the record on screen.

## SCENE 26 — REMEDIATION

**[ACTION]** `/entities/aa220000-0000-4000-8000-000000000005` (DEMO AML 05) — the completed supervisory
plan carrying the remediation activity (`458783fc-3feb-48db-852c-90588f078bb5`, status Completed) and its
completed actions.

**[SAY]**
"Issuing the finding, however, is not the end of supervision." *[PAUSE]*
"The institution must address the deficiency." *[PAUSE]*
"Here we can see the associated remediation plan."
"The institution has completed the remediation activities." *[PAUSE]*
"But the platform deliberately distinguishes between two questions." *[PAUSE]*
"Has the institution completed the action?" *[PAUSE]*
"And…" *[PAUSE]*
"Has the action actually addressed the supervisory concern?" *[PAUSE]*
"Those are not necessarily the same thing."

## SCENE 27 — EFFECTIVENESS REVIEW

**[ACTION]** Same entity — the outcome effectiveness evaluation recorded as **Partially effective**, with
its cited evidence.

**[SAY]**
"In this example, the remediation activity was completed." *[PAUSE]*
"But supervisory review concluded that it was only partially effective." *[PAUSE]*
"This distinction is extremely important in supervision." *[PAUSE]*
"**Completion does not automatically mean effective remediation.**" *[PAUSE]*
"The regulator therefore evaluates effectiveness, not simply completion."

## SCENE 28 — SECOND-SUPERVISOR APPROVAL

**[ACTION]** Same evaluation — the approval record, showing an approver distinct from the evaluator.

**[SAY]**
"The effectiveness conclusion has also been reviewed and approved by a second supervisor." *[PAUSE]*
"This provides another maker-checker control around an important supervisory judgment." *[PAUSE]*
"The platform therefore records not only what happened…"
"…but also who made the regulatory decision."

## SCENE 29 — BROUGHT-FORWARD MONITORING

**[ACTION]** `/entities/aa220000-0000-4000-8000-000000000008` (DEMO AML 08) — the recorded monitoring
decision and the review brought forward, with its stated reason.

**[SAY]**
"Because the remediation was only partially effective, supervision continues." *[PAUSE]*
"In this case, monitoring has been recorded and the next review has been brought forward." *[PAUSE]*
"This closes the supervisory loop." *[PAUSE]*
"We moved from assessment…"
"…to risk…"
"…to monitoring…"
"…to supervisory planning…"
"…to intervention…"
"…to examination…"
"…to finding…"
"…to remediation…"
"…and then back into continued monitoring and reassessment."

## SCENE 30 — RETURN TO ENTITY 360

**[ACTION]** `/entities/aa220000-0000-4000-8000-000000000006` — the anchor institution's consolidated
supervisory profile. Move slowly down the supervisory history.

**[SAY]**
"Let us now return to the institution where we started." *[PAUSE]*
"At the beginning, this was simply an institution within the supervised entity register." *[PAUSE]*
"We now have a connected supervisory history." *[PAUSE]*
"We can understand its AML/CFT assessment."
"We can understand how its risk was calculated and approved."
"We can see its historical and current supervisory risk."
"We can see monitoring concerns."
"We can see reassessment requirements."
"We can see supervisory plans."
"We can see interventions."
"We can see examinations."
"We can see findings."
"We can see remediation."
"And we can see the regulator's conclusion regarding the effectiveness of that remediation." *[PAUSE]*
"This is what we mean by institutional supervisory memory."

## SCENE 31 — MANAGEMENT VALUE

**[ACTION]** `/supervision/aml/portfolio` — the portfolio report. Optionally `/supervision/aml/heatmap`
for one still frame.

**[SAY]**
"Now let us look at this from the perspective of supervisory management." *[PAUSE]*
"Once this information is connected, management can progressively answer much more important questions." *[PAUSE]*
"Which institutions currently require the greatest supervisory attention?"
"Why do we consider them higher risk?"
"Which institutions are deteriorating?"
"Which institutions require reassessment?"
"What supervisory activity is currently underway?"
"Which high-severity findings remain unresolved?"
"Which remediation commitments are overdue?"
"Where has remediation been completed but found ineffective?"
"And where should limited supervisory resources be allocated next?" *[PAUSE]*
"This is where technology begins to support genuinely risk-based supervision."

## SCENE 32 — CONFIGURABILITY BEYOND AML/CFT

**[ACTION]** Remain on the portfolio screen, or show the Supervision navigation so the other supervisory
areas are visible. Do not open them.

**[SAY]**
"One final point is important." *[PAUSE]*
"The architectural principle we have demonstrated is not limited to AML/CFT." *[PAUSE]*
"The same platform approach can support other supervisory areas." *[PAUSE]*
"For example…"
"prudential supervision…"
"consumer protection…"
"market conduct…"
"operational resilience…"
"cybersecurity…"
"corporate governance…"
"licensing…"
"fit and proper assessment…"
"and other regulator-specific supervisory programmes." *[PAUSE]*
"Each area can have its own methodology, policy, governance and supervisory workflow while remaining connected to the same institution."

## SCENE 33 — THREE-LAYER CONFIGURATION MESSAGE

**[ACTION]** Keep one stable screen visible. Do not navigate.

**[SAY]**
"So from a regulator's perspective, the platform provides three important levels of control." *[PAUSE]*
"First…"
"Policy."
"The regulator defines how it wants supervision to operate." *[PAUSE]*
"Second…"
"Governance."
"Those policies can be versioned, reviewed, approved and audited." *[PAUSE]*
"And third…"
"Execution."
"The approved policy then drives assessment, risk rating, monitoring and supervisory action." *[PAUSE]*
"**The platform connects regulatory policy to supervisory action.**"
"Regulatory policy…"
"…supervisory methodology…"
"…supervisory decision…"
"…and regulatory action."

## SCENE 34 — FINAL CLOSING

**[ACTION]** Return to `/entities/aa220000-0000-4000-8000-000000000006` or `/supervision/aml`.
*[PAUSE 2 SECONDS]*

**[SAY]**
"So, to summarise what we have demonstrated…" *[PAUSE]*
"We started with a regulated institution." *[PAUSE]*
"We showed how the regulator can configure and govern its own AML/CFT methodology." *[PAUSE]*
"We applied that methodology to an institutional risk assessment." *[PAUSE]*
"We calculated the risk." *[PAUSE]*
"An independent supervisor reviewed and approved that risk." *[PAUSE]*
"And the rating was published as the operative supervisory risk of record." *[PAUSE]*
"Continuous monitoring subsequently identified additional supervisory concern." *[PAUSE]*
"That concern resulted in reassessment and supervisory planning." *[PAUSE]*
"The supervisory plan progressed into an intervention." *[PAUSE]*
"The intervention resulted in an examination." *[PAUSE]*
"The examination produced a high-severity finding." *[PAUSE]*
"The institution completed its remediation." *[PAUSE]*
"But the regulator independently determined that the remediation was only partially effective." *[PAUSE]*
"And that decision resulted in continued monitoring and an earlier supervisory review." *[PAUSE 2 SECONDS]*
"Throughout this entire lifecycle, the platform preserved the methodology, relationships, decisions, approvals and supervisory history behind every action." *[PAUSE]*
"So our objective with this SupTech platform is not simply to digitise individual regulatory processes." *[PAUSE]*
"It is to provide the regulator with a…"
"connected…"
"configurable…"
"governed…"
"and risk-based supervisory operating environment." *[PAUSE 2 SECONDS]*
"Thank you for watching this demonstration."

## OPTIONAL 30-SECOND PROMOTIONAL ENDING

"Our SupTech platform gives regulators the ability to define their supervisory policy, translate that
policy into governed methodology, apply it consistently across regulated institutions, and connect risk
directly with regulatory action." *[PAUSE]*
"The result is better supervisory visibility, stronger institutional memory, greater accountability and a
more proactive approach to risk-based supervision."

## Phrases to use

- "The regulator owns the supervisory policy."
- "Calculation is not approval."
- "Policy can change without rewriting regulatory history."
- "We change the current supervisory position without rewriting supervisory history."
- "Completion does not automatically mean effective remediation."
- "This record did not appear independently; we can trace exactly which supervisory decision caused it."
- "The platform connects regulatory policy to supervisory action."

## Phrases not to use

Do not say: "This is hardcoded." · "This is our AML scoring model." · "This is the score MIPL
recommends." · "This is test data." · "We seeded this directly in the database." · "Lovable created
this." · "This screen still has some issues." · "This feature is under development." · "We have eight
unsigned decisions." · "Our v1.2 failed." · "There are duplicate question codes." · "The weights don't
equal 100 percent." · "The calculation engine had defects." · "We fixed this yesterday."

Instead say: "For demonstration purposes, these are demonstration policy assumptions. During
implementation, these decisions are configured and governed according to the regulator's approved
methodology."

## Recording pace

Do not rush. Wait about one second after opening a screen before speaking. Pause after every important
statement, and for about two seconds after "The regulator owns the supervisory policy", "Calculation is
not approval" and "Policy can change without rewriting regulatory history". Do not move the mouse
continuously while speaking: point to the relevant information, then stop moving the cursor, so the
viewer is looking at exactly what you are explaining.

## If you lose your place

Who are we supervising? → Entity · What rules are we using? → Policy and methodology · What is the risk?
→ Assessment and rating · What changed? → Monitoring · What should we do? → Supervisory plan · What did
the regulator do? → Intervention and examination · What did we find? → Finding · What did the institution
do? → Remediation · Did it work? → Effectiveness review · What happens next? → Monitoring and
reassessment.
