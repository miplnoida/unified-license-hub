# Unified License Hub — User Manual — Demo Playbook

> **INTERIM — TO BE RE-VERIFIED AFTER FINAL E2E**
>
> Version 1.0.0 · generated 2026-08-30 · documented HEAD `a24f6286782683ed414584405cce4e8b7e8a589e`
> E2E verification: PENDING — not yet E2E verified
>
> Generated from `src/content/user-manual/` — do not edit by hand.

## 15-minute Executive Demo (`demo-executive-15`)

_Duration: 15 minutes · Board, executive management or a visiting delegation. Optimise for confidence and coverage, not detail. Never open restricted AML content._

**Focus**

- Dashboard
- Licensing
- Entity 360
- AI governance
- Analytics

**Records to use (demo-safe only)**

- One demo licensee with a populated Entity 360 profile
- One submitted licence application in the assessment queue
- Portfolio analytics dashboard with at least one full period of data

**Run sheet**

1. **supervisor** — Dashboard (`/dashboard`): Sign in and land on the internal dashboard. Point out the work-driven layout.
   - Expect: Dashboard with live counts and personal queues.
   - Message: One platform, one identity, one audit trail across the whole regulatory lifecycle.
   - Fallback: If counts are empty, open My Work instead and describe the same point.
2. **supervisor** — Application queue (`/applications/queue`): Open the licence application queue and then one application.
   - Expect: Queue list, then the application detail with its forms and evidence.
   - Message: Applications arrive complete, fee-settled and server-verified — assessment starts from a reliable base.
   - AI: Assessment observations are advisory only; the officer decides.
   - Fallback: Use the applications list if the queue is filtered empty.
3. **supervisor** — Licence register (`/licenses`): Show the licence register and open one licence.
   - Expect: Licence with number, scope, conditions and validity.
   - Message: The authorisation perimeter is explicit and machine-readable, not a PDF in a folder.
   - Fallback: Open Entity 360 → Licences instead.
4. **supervisor** — Entity 360 (`/admin/licensees`): Open a licensee profile and walk the seven supervisory groups.
   - Expect: Entity 360 with grouped sections populated.
   - Message: Everything the regulator knows about a firm, in one supervisory view, grouped the way supervisors think.
   - Fallback: Use the entity list screenshot if a profile is thin.
5. **supervisor** — Entity 360 → Ownership (`/admin/licensees`): Open Ownership, then the UBO analysis.
   - Expect: Ownership register and the calculated UBO set with paths.
   - Message: Beneficial ownership is calculated deterministically from an approved ledger — auditable arithmetic, not estimation.
   - AI: State explicitly that this is not AI.
   - Fallback: Describe the calculation using the structure screenshot.
6. **super_admin** — AI governance (`/governance/ai`): Show the AI surface registry and the activity ledger.
   - Expect: Eight governed advisory surfaces; per-invocation provenance entries.
   - Message: Every AI surface is registered, advisory, human-reviewed and logged — and none can write regulatory data.
   - AI: Advisory classification and “no authoritative write path” are database constraints, not policy statements.
   - Fallback: Show the surface registry alone.
7. **analyst** — Analytics (`/analytics`): Close on the portfolio analytics dashboard.
   - Expect: Portfolio-level charts and supervisory metrics.
   - Message: Supervision becomes portfolio-aware: risk can be compared, not just filed.
   - Fallback: Use the reports dashboard.

## 45-minute Regulator Demo (`demo-regulator-45`)

_Duration: 45 minutes · Regulatory staff and technical assessors. They will test governance claims — be precise about what is enforced server-side._

**Focus**

- Onboarding
- Licensing
- Maker-checker
- Entity 360
- Payments & currency
- Returns
- Complaints & conduct
- AI governance
- Audit

**Records to use (demo-safe only)**

- A fresh demo registration ready for review
- A demo application with an outstanding fee
- A licensee with returns obligations, one overdue
- A complaint in the intake queue
- A regulator configured with a non-JMD base currency for the FX demonstration

**Run sheet**

1. **applicant** — Register (`/register`): Walk the public registration wizard and the OTP step.
   - Expect: Registration wizard with email verification.
   - Message: Identity is established once, before any regulated filing is possible.
   - Fallback: Use the registration screenshot if email delivery is unavailable.
2. **licensing_officer** — Registration review (`/admin/registration-review`): Review and recommend the registration, then attempt to accept it yourself.
   - Expect: Recommendation recorded; self-acceptance refused.
   - Message: Maker-checker is enforced by the database — the UI is not the control.
   - Fallback: Describe the refusal if no second internal account is available.
3. **supervisor** — Registration review (`/admin/registration-review`): Accept the registration as an independent approver.
   - Expect: Acceptance recorded; portal account provisioned.
   - Message: Acceptance provisions access automatically, with a forced password change.
   - Fallback: Show the provisioning notification.
4. **licensee_primary** — Applications (`/applications`): Show a draft application, the mandatory form set and the fee gate before submission.
   - Expect: Submit disabled until every form is complete and the fee is settled.
   - Message: The submission gate is re-checked server-side; the button state is only a courtesy.
   - Fallback: Open the application forms screen.
5. **licensee_primary** — Payments (`/payments`): Pay the assessed fee and open the receipt.
   - Expect: Ledger entry and a server-issued receipt.
   - Message: Money is an append-only ledger against a server-authoritative assessment; the browser can neither price nor mint receipts.
   - Fallback: Show payment history with an existing receipt.
6. **admin** — Currency settings (`/settings/currency`): Show the currency master, the effective-dated rate table, then a converted figure.
   - Expect: Rates with effective dates; converted amounts carrying rate provenance.
   - Message: Multi-currency is effective-dated and reproducible — historical reporting does not silently change.
   - Fallback: Show the currency configuration screen only.
7. **licensing_officer** — Application queue (`/applications/queue`): Assess the application, raise an RFI, then record a recommendation.
   - Expect: RFI issued with a deadline; recommendation recorded.
   - Message: Assessment is evidenced: every finding, request and recommendation is attributable.
   - AI: Open the advisory observations and reject one out loud.
   - Fallback: Show a previously raised RFI.
8. **supervisor** — Application queue (`/applications/queue`): Approve the application and show the issued licence.
   - Expect: Decision record with rationale; licence issued.
   - Message: Decision authority comes from the configured matrix and is enforced server-side.
   - Fallback: Open an existing issued licence.
9. **supervisor** — Entity 360 (`/admin/licensees`): Walk the seven groups, then move the As At date backwards.
   - Expect: Historical replay of identity, ownership and governance.
   - Message: The profile answers “what did we know, and when did we know it”.
   - Fallback: Use the overview screenshot.
10. **supervisor** — Entity 360 → Ownership (`/admin/licensees`): Show the ownership ledger, the indirect chain and the calculated UBO set with a truncation or restricted boundary.
   - Expect: UBO set with contributing paths and explicit boundaries.
   - Message: Bounded, deterministic traversal with explicit unresolved boundaries instead of silent gaps.
   - AI: Deterministic mathematics — not AI.
   - Fallback: Walk the structure screenshot.
11. **licensee_primary** — Return obligations (`/returns/obligations`): File a return, then amend it.
   - Expect: Immutable submitted version plus a new amended version.
   - Message: Amendments never overwrite history; the original filing stays provable.
   - Fallback: Open an existing filing with two versions.
12. **analyst** — Returns queue (`/returns/queue`): Review the filing, show the overdue obligation and mention the extension mechanism.
   - Expect: Review queue with an overdue item.
   - Message: Timeliness is deterministic; deadlines move only by a governed, audited extension.
   - Fallback: Use the returns calendar.
13. **licensing_officer** — Complaint intake (`/complaints/intake`): Triage a complaint: classify, check duplicates, assign.
   - Expect: Complaint classified and assigned.
   - Message: Consumer harm enters the same governed pipeline as everything else.
   - Fallback: Open the complaints list.
14. **supervisor** — Conduct attention (`/conduct/attention`): Show the conduct picture across the portfolio.
   - Expect: Attention list driven by deterministic conduct facts.
   - Message: Individual complaints become a portfolio conduct signal.
   - AI: The narrative advisory confirms no risk and changes no record.
   - Fallback: Open complaints analytics.
15. **super_admin** — AI governance (`/governance/ai/surfaces`): Show the surface registry, instruction versions and the activity ledger.
   - Expect: Eight advisory surfaces, versioned instructions, per-invocation provenance.
   - Message: AI is governed like any other regulated process: registered, versioned, reviewed and logged.
   - AI: Read the “What NOT to claim” list to the audience if they push on capability.
   - Fallback: Show the surface registry alone.
16. **admin** — Audit logs (`/admin/audit-logs`): Close on the audit trail and Entity 360 → Provenance.
   - Expect: Actor, UTC timestamp, action and reason for each event.
   - Message: Every canonical change is attributable, timestamped in UTC and reasoned — the record is defensible.
   - Fallback: Use Entity 360 → Provenance alone.

## 90-minute Deep Dive (`demo-deep-dive-90`)

_Duration: 90 minutes · Technical regulatory assessors, internal audit or an implementation team. Expect challenge; run the negative cases deliberately._

**Focus**

- Full implemented regulatory lifecycle
- Governance contracts
- Negative and fail-closed behaviour
- Evidence and audit

**Records to use (demo-safe only)**

- All records from the 45-minute demo
- A post-licence change request with an unsatisfied fit & proper linkage
- An entity with a cross-regulator ownership branch
- A penalty on a regulator with a non-JMD base currency
- A wide synthetic ownership network to demonstrate traversal bounding

**Run sheet**

1. **admin** — Admin control panel (`/admin`): Start from configuration: sectors, categories, forms, fees, workflows, SLAs.
   - Expect: Control hub with configuration pathways and metrics.
   - Message: The platform is configured, not coded, for each regulator and sector.
   - Fallback: Open individual configuration hubs.
2. **admin** — Forms & packages (`/admin/forms-packages`): Show a form template, its version history and scheduled deployment.
   - Expect: Versioned template with historical schema retained.
   - Message: Submissions render against the schema in force at submission — history never re-renders wrongly.
   - Fallback: Open a form detail view.
3. **admin** — Role management (`/admin/roles`): Show dynamic RBAC: modules, actions and role templates.
   - Expect: Role with mapped module actions.
   - Message: Authority is data, versioned and auditable — and enforced server-side, not in the sidebar.
   - Fallback: Show permission coverage.
4. **applicant** — Register (`/register`): Run registration end to end (Journey A steps 1–3).
   - Expect: Registration accepted and account provisioned.
   - Message: Identity first, everything else after.
   - Fallback: Use the registration screenshots.
5. **licensee_primary** — New application (`/applications/new`): Complete licensing including fee gate, submission verification and RFI response.
   - Expect: Application progressing through governed states.
   - Message: Every state transition has an owner, a reason and a timestamp.
   - Fallback: Open an in-flight application.
6. **licensing_officer** — Application queue (`/applications/queue`): Attempt to approve your own recommendation.
   - Expect: Refusal from the server.
   - Message: Segregation of duties is a database contract.
   - Fallback: Describe the certified gate result.
7. **legal_compliance** — Fit & proper (`/fit-and-proper/individuals`): Complete a determination, then show a dependent approval that is blocked without one.
   - Expect: Blocked approval, then success after determination.
   - Message: Fail-closed linkage: no positive determination, no dependent approval.
   - Fallback: Show the blocked state only.
8. **licensee_primary** — New post-licence request (`/post-license/new`): Run Journey B including the governed post-approval effect and an idempotent replay.
   - Expect: Effect ledger entry; replay produces no duplicate.
   - Message: Approval produces a canonical, idempotent, provenance-bearing effect.
   - Fallback: Show an existing effect ledger entry.
9. **supervisor** — Entity 360 (`/admin/licensees`): Walk all 21 sections group by group, using the As At control on the temporal ones.
   - Expect: Complete supervisory profile with historical replay.
   - Message: One profile, seven supervisory questions, full history.
   - Fallback: Prioritise identity, ownership, obligations and provenance.
10. **supervisor** — Entity 360 → Ownership (`/admin/licensees`): Run Journey F fully: change set, self-approval refusal, indirect layer, traversal, policy versioning, node-limit truncation and a restricted branch.
   - Expect: UBO set with paths, boundaries and truncation flags.
   - Message: Deterministic, bounded, policy-governed and historically stable.
   - AI: No AI participates in this journey at any point.
   - Fallback: Walk the certified gate evidence.
11. **licensee_primary** — Return obligations (`/returns/obligations`): Run Journey C including validation failure, RFI, amendment, extension and the overdue sweep.
   - Expect: Full returns lifecycle with versions preserved.
   - Message: Reporting discipline is measured deterministically and evidenced completely.
   - Fallback: Open an existing filing history.
12. **admin** — Payments (`/payments`): Run Journey D including reconciliation, a capped refund and reporting-currency conversion.
   - Expect: Ledger, receipt, reversal and FX provenance.
   - Message: Financial integrity: immutable ledger, governed reversals, reproducible FX.
   - Fallback: Show payment detail with its finance panel.
13. **analyst** — Penalty register (`/billing/penalties`): Show a penalty with server-resolved currency and provenance.
   - Expect: Penalty in the regulator’s resolved base currency with provenance.
   - Message: Enforcement money is currency-correct by construction, not by data entry.
   - Fallback: Open the enforcement workspace.
14. **supervisor** — Complaints (`/complaints`): Run Journey E through to enforcement referral.
   - Expect: Complaint, investigation, outcome and enforcement record.
   - Message: Consumer harm is traceable from intake to action.
   - Fallback: Use complaint analytics.
15. **supervisor** — Prudential dashboard (`/supervision/prudential`): Show prudential monitoring, breaches and peer comparison, then the advisory narrative.
   - Expect: Deterministic metrics with an advisory narrative beside them.
   - Message: Numbers are deterministic; wording is advisory and reviewed.
   - AI: Note that F8 prudential supervision is implemented but not yet certified.
   - Fallback: Show metrics without the narrative.
16. **super_admin** — AI governance (`/governance/ai`): Run the full AI governance walkthrough including model registry, instruction versions, assurance reviews, exceptions and the activity ledger.
   - Expect: Complete AI governance chain.
   - Message: AI is treated as a regulated process with registration, versioning, assurance and provenance.
   - AI: Close with the “What NOT to claim” list.
   - Fallback: Surfaces and activity ledger only.
17. **admin** — Audit logs (`/admin/audit-logs`): Close on audit, provenance and the certification position of each module.
   - Expect: Audit trail and provenance across the demonstrated journeys.
   - Message: Defensibility is the product: every value has an owner, a time, a reason and a certified contract behind it.
   - Fallback: Entity 360 → Provenance.

## AI demonstration scenarios

### Application assessment support — advisory observations under officer control (`ai-demo-application-assessment`)

_Persona: licensing_officer · start: Application queue (`/applications/queue`)_

A submitted licence application is being assessed and the officer wants a fast first read of points to consider.

**What to click**

- Open a submitted application
- Open the AI assessment observations panel
- Read two observations aloud

**AI output to highlight**

- Observations and points to consider
- Suggested questions that could become an RFI

**Confidence & rationale:** No numeric confidence is produced. Each observation references the application content it came from so the officer can verify it immediately.

**Human decision point:** The officer decides which observations matter. Nothing is pre-written into the assessment record.

**Override demonstration:** Discard one observation out loud and raise a different RFI of your own. Show that the assessment record reflects the officer, not the model.

**Audit evidence**

- AI activity ledger entry for the invocation
- Assessment findings attributed to the officer
- RFI attributed to the officer

**Key talking point:** The model reads; the officer decides. Approval authority is untouched.

### Prudential analysis narrative — deterministic figures, advisory wording (`ai-demo-prudential-narrative`)

_Persona: supervisor · start: Prudential dashboard (`/supervision/prudential`)_

A supervisor is preparing prudential analysis for an entity ahead of a supervisory meeting.

**What to click**

- Open the entity prudential view
- Show the computed metrics and thresholds
- Generate the analysis narrative

**AI output to highlight**

- Narrative reading of the recorded indicators
- Movement explanations and lines of enquiry

**Confidence & rationale:** The metrics are deterministic and reproducible; only the wording is generated, and it names the metrics it describes.

**Human decision point:** The supervisor edits the wording before it enters any supervisory product. No rating is proposed by the model.

**Override demonstration:** Edit one sentence and delete another, then explain that the risk rating remains a human supervisory judgement.

**Audit evidence**

- AI activity ledger entry with model and surface
- Deterministic metric computation independent of the narrative

**Key talking point:** Separate the arithmetic from the prose. The arithmetic is the regulator’s; the prose is a draft.

### Cross-entity conduct intelligence — hypotheses, not findings (`ai-demo-conduct-intelligence`)

_Persona: supervisor · start: Conduct attention (`/conduct/attention`)_

Conduct facts across several firms suggest a possible pattern that a supervisor needs to test.

**What to click**

- Open the cross-entity conduct view
- Request the advisory reading
- Read one hypothesis and one question

**AI output to highlight**

- Narrative reading of deterministic conduct facts
- Explicitly unproven hypotheses and questions to test

**Confidence & rationale:** No confidence score. Hypotheses are labelled as unproven and tied to the deterministic fact set.

**Human decision point:** A supervisor must test any hypothesis before it influences supervisory work; the surface confirms no risk.

**Override demonstration:** Reject a hypothesis on the spot and explain what evidence would be needed to accept it.

**Audit evidence**

- AI activity ledger entry
- No change to any conduct record as a result of the invocation

**Key talking point:** The platform is careful to generate questions, not conclusions.

### Fit & proper media reading — summarised, then verified (`ai-demo-fp-media`)

_Persona: legal_compliance · start: Fit & proper individuals (`/fit-and-proper/individuals`)_

Openly available media material has been gathered during screening of a nominated individual.

**What to click**

- Open the individual under assessment
- Open the media reading summary
- Point at the source reference on one item

**AI output to highlight**

- Summary of the material
- Points the officer should verify

**Confidence & rationale:** The summary asserts nothing about truth, relevance or identity match, and carries no confidence score.

**Human decision point:** The officer verifies identity and relevance. The determination is recorded by the officer with rationale.

**Override demonstration:** Mark one summarised item as not relevant to this individual and record the determination independently.

**Audit evidence**

- AI activity ledger entry
- Determination attributed to the officer with rationale

**Key talking point:** Adverse media never becomes a finding without a human verifying identity and relevance.

### Management reporting assistance — released instructions and mandatory review (`ai-demo-management-reporting`)

_Persona: supervisor · start: AI instruction registry (`/governance/ai/instructions`)_

A supervisor is drafting management commentary for a reporting period.

**What to click**

- Show the released instruction version for the surface
- Generate the commentary draft
- Show the mandatory review step

**AI output to highlight**

- Period summary and movement explanations
- Coverage commentary and evidence-pack summary

**Confidence & rationale:** Only released instruction versions are used, resolved server-side, so the drafting basis is reproducible.

**Human decision point:** Mandatory human review before any wording is adopted into management reporting.

**Override demonstration:** Rewrite a movement explanation and explain why the underlying figure did not change.

**Audit evidence**

- Released instruction version recorded per invocation
- AI activity ledger entry
- Reviewer attribution on the adopted wording

**Key talking point:** Instruction versioning is what makes AI drafting reviewable after the fact.

### Dashboard observations — commentary that is never a finding (`ai-demo-dashboard-insights`)

_Persona: analyst · start: AI Insights Hub (`/analytics/ai-insights`)_

An analyst wants a quick read of movements on the portfolio dashboard.

**What to click**

- Open the AI Insights Hub
- Show one observation and the metric it refers to

**AI output to highlight**

- Short observations on movements and outliers

**Confidence & rationale:** No confidence score; the underlying figures are deterministic and independently verifiable on the dashboard.

**Human decision point:** Observations are commentary and are never stored as supervisory findings.

**Override demonstration:** Dismiss an observation and show that the dashboard figure is unchanged.

**Audit evidence**

- AI activity ledger entry
- No supervisory record created

**Key talking point:** Commentary is disposable. Data is not.

## Demo data safety

- Use synthetic / demo-safe records only — never a real supervised institution.
- Never present AI output as a decision, rating, approval or price.
- Never present a capability marked IN DEVELOPMENT or TRACK-B / FUTURE as production-ready.
- Never demonstrate with live personal identity data.

## Claims that must never be made

- AI does not autonomously issue regulatory decisions.
- AI does not replace maker-checker; approval authority is unchanged and enforced server-side.
- UBO and ownership mathematics is deterministic, not AI.
- Do not claim predictive accuracy, hit rates or model performance without measured evidence.
- Do not describe deterministic rules (due dates, fees, FX, routing, traversal) as AI.
- Do not present unfinished or placeholder AI capability as operational.
- Do not claim AI can alter canonical regulatory data — every surface has authoritative_write_path = NONE.
- Do not present the output as a regulatory finding, decision, rating or determination, and do not claim accuracy figures that have not been measured.

