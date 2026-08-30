# Unified License Hub — User Manual

> **INTERIM — TO BE RE-VERIFIED AFTER FINAL E2E**
>
> Version 1.0.0 · generated 2026-08-30 · documented HEAD `a24f6286782683ed414584405cce4e8b7e8a589e`
> E2E verification: PENDING — not yet E2E verified
>
> Generated from `src/content/user-manual/` — do not edit by hand.

## Contents

1. Getting Started — `getting-started`
2. Roles & Personas — `roles-personas`
3. Entity 360 — `entity-360`
4. End-to-End Regulatory Journey — `end-to-end`
5. Demo Playbook — `demo-playbook`
6. Registration & Onboarding — `registration`
7. Licensing & Authorisation — `licensing`
8. Post-Licensing Services — `post-licensing`
9. Regulatory Returns — `returns`
10. Fees, Payments & Currency — `fees-payments`
11. Complaints — `complaints`
12. Market Conduct Supervision — `market-conduct`
13. Investigations & Enforcement — `investigations`
14. Thematic Reviews — `thematic-reviews`
15. Correspondence — `correspondence`
16. Notifications, SLA & Escalations — `notifications-sla`
17. Appeals & Reviews — `appeals`
18. Entity Network, Ownership & UBO — `ownership-ubo`
19. Administration & Configuration — `administration`
20. Audit, Evidence & Traceability — `audit-evidence`
21. Analytics & Reporting — `analytics`
22. AI & Human-Controlled Governance — `ai-governance`

## Getting Started

_Chapter: getting-started · audience: any · status: AVAILABLE_

### What the Unified License Hub is

The Unified License Hub is a single regulatory operating platform. It carries a regulated party from first registration, through authorisation, into ongoing supervision — returns, fees, conduct, complaints, enforcement — and keeps one canonical record of the entity throughout.

Everything you see in a screen is a view over server-authoritative records. The browser never prices, approves, calculates a licence outcome or writes a regulatory record directly.

### Signing in

- Use the unified sign-in page; the platform routes you to the correct portal based on your role.
- Accounts provisioned by the regulator start with a temporary password and force a password change on first sign-in.
- If you have forgotten your password, use the three-step email verification flow from the sign-in page.

### Finding your way around

- The left sidebar is driven by the governed navigation registry and shows only what your role is entitled to discover.
- Breadcrumbs above every page show where you are in the navigation hierarchy.
- My Work is the consolidated personal queue across every module.
- The account menu at the top right holds your profile, password and preferences.
- Help & User Manual (this manual) is always available from the sidebar.

### Conventions used in this manual

- AVAILABLE — implemented and usable today.
- CONFIGURATION REQUIRED — implemented, but does nothing useful until an administrator configures it.
- IN DEVELOPMENT — partially implemented; do not present as production-ready.
- TRACK-B / FUTURE — planned, not built.
- FINAL-E2E VERIFICATION PENDING — implemented and expected to work, but not yet re-verified by whole-system end-to-end certification.

### Manual status

This is version 1 of the manual. It is an INTERIM / DEMO PREPARATION document and will be re-verified, with fresh screenshots, after the final whole-system E2E certification wave (F19/F20).

**Where to find it**

- Sign in — `/login`
- My Work — `/my-work`

**Screenshots:** `pub-landing`, `int-dashboard`, `int-manual`, `pub-registry`

## Roles & Personas

_Chapter: roles-personas · audience: any · status: AVAILABLE_

### How authority actually works

Menu visibility is discoverability only. Real authority comes from three enforced layers: route guards, dynamic role permissions, and database-level row security plus governed functions. If a person can see a menu entry but lacks the server-side right, the action fails at the server.

Every persona below documents what the person can and cannot do based on those server contracts.

- Internal personas: Super Admin, Administrator, Supervisor, Licensing Officer, Analyst, Legal/Compliance Reviewer.
- External personas: Applicant, Pre-Licensee Applicant, Licensee Primary User, Licensee Secondary User.
- A Developer role exists for platform diagnostics and is not a regulatory persona.

### Segregation of duties

Nobody approves their own work. Where a recommendation and a decision both exist, the database rejects an approval by the same person who made the submission — the UI simply reflects a rule that is already enforced underneath.

**Where to find it**

- Role management — `/admin/roles`

**Screenshots:** `adm-roles`, `adm-users`

## Entity 360

_Chapter: entity-360 · audience: internal · status: AVAILABLE_

### What Entity 360 is

Entity 360 is the single supervisory view of one regulated entity. It answers, on one screen, who the entity is, what it is allowed to do, who owns and controls it, what it must report and whether it did, how financially sound and how well behaved it is, what supervisory action is open, and where every fact came from.

It is not a database dump. Each section is a supervisory question with an answer, sourced from a canonical process elsewhere in the platform.

### The "As at" concept

Many sections are temporal. Entity 360 can replay the recorded state as at a chosen date, so a supervisor can see what the regulator knew and what was true at the time of a decision — not only today’s position. Where a section is temporal, the manual entry for that section says so.

### Groups

- Identity & authorisation — who the entity is and what it is licensed to do.
- Ownership & control — who owns, controls and directs the entity.
- Reporting & obligations — what it must file and whether it filed it.
- Prudential & risk — financial soundness, risk rating and supervisory judgement.
- Conduct & financial crime — customer treatment, market conduct and AML/CFT.
- Supervisory action — examinations, enforcement and outstanding requests.
- Records & provenance — evidence, correspondence and where data came from.

### Confidentiality

Some sections are internal-only and confidential (for example confidential AML material). External users never see Entity 360; a licensee sees only its own filings, requests and correspondence through the licensee portal.

**Where to find it**

- Entity registry — `/entities`

**Screenshots:** `e360-entities`, `e360-overview`, `e360-structure`, `prud-dashboard`

## End-to-End Regulatory Journey

_Chapter: end-to-end · audience: any · status: AVAILABLE_

### Why journeys matter more than screens

A regulator does not buy screens; it buys a defensible regulatory lifecycle. The journeys chapter documents complete cross-module paths, showing where authority changes hands and where the record is created.

- Journey A — New regulated entity: registration to licence to Entity 360.
- Journey B — Post-licence structural change: request to approval to canonical ownership update.
- Journey C — Regulatory return: obligation to filing to acceptance and supervisory use.
- Journey D — Fees and payment: assessment to receipt to refund and FX provenance.
- Journey E — Complaint to supervisory action: intake to triage to decision and escalation.
- Journey F — Ownership and UBO: canonical ownership to traversal to calculated UBO.

## Demo Playbook

_Chapter: demo-playbook · audience: internal · status: AVAILABLE_

### Internal use only

The Demo Playbook is internal. It contains presentation sequencing, talking points and honesty rules for demonstrations to clients and regulators. It is never shown to external portal users.

### Golden rules

- Demonstrate only what is implemented. If a capability is IN DEVELOPMENT, say so.
- Never describe deterministic automation as AI, and never describe AI output as a decision.
- Always show the human decision point after any AI output.
- Use only DEMO-prefixed or existing safe demo records — never real personal data.
- If a demo record is missing, use the documented fallback rather than improvising.

## Registration & Onboarding

_Chapter: registration · module: F3 Registration · audience: any · status: AVAILABLE · AI: NO AI_

Establish a verified, non-duplicated identity for a prospective regulated person or firm before any licence application can be made, so that everything filed later is attributable to a known party.

**Actors:** Applicant / Pre-Licensee, Licensing Officer (reviewer), Supervisor or authorised approver (decision)

**Preconditions**

- Regulator, sector, sub-sector and category master data configured
- Registration form template published for the selected sector
- Email delivery configured (OTP verification)

**Where to start**

- Public → Register — `/register`
- Registration portal — `/registration/portal`
- Internal → Registration review queue — `/admin/registration-review`

**Process flow**

1. Applicant opens Register and chooses applicant or entity registration.
2. Applicant completes the dynamic onboarding wizard (identity, contact, sector selection, attachments).
3. Email OTP verifies the contact address; attachments are limited to 5 MB each.
4. Registration is submitted; the system allocates a reference and an SLA clock.
5. Registration lands in the internal review queue; a Licensing Officer verifies identity and completeness.
6. Reviewer either raises a query (returns to applicant for update), rejects, or recommends acceptance.
7. An independent approver accepts the registration.
8. Acceptance provisions the portal account with a temporary password and a forced password change.
9. The registered party may now create a licence application.

**Status lifecycle**

- `Draft` — Being completed by the applicant; not visible for review.
- `Submitted` — Received by the regulator, awaiting review.
- `Under review` — A reviewer is verifying identity and completeness.
- `Information requested` — Returned to the applicant with specific queries; the SLA is paused where configured.
- `Accepted` — Identity established; a portal account is provisioned.
- `Rejected` — Not accepted, with recorded reasons. The applicant may re-register where permitted.

**User actions**

- Save draft → Persists progress; files upload immediately to secure storage.
- Verify email → Sends and validates a one-time code before submission is permitted.
- Submit registration → Server-side validation runs; the registration becomes immutable to the applicant.
- Update registration → Only available while information has been requested; changes are versioned.
- Recommend / Accept / Reject → Internal decision actions; each requires a recorded reason.

**Maker-checker:** The reviewing officer proposes; a separate authorised user accepts or rejects. Self-approval of one’s own recommendation is denied by the database, not merely hidden in the UI.

**Notifications**

- Registration received (applicant)
- Information requested (applicant)
- Registration accepted with account credentials (applicant)
- Registration rejected with reasons (applicant)
- New registration awaiting review (internal queue)

**Service level & escalation**

- Review SLA is configurable in the SLA Manager. Breach raises an escalation to the configured escalation owner.

**Evidence**

- Submitted registration payload and version history
- Uploaded identity/constitutional documents
- OTP verification record
- Reviewer notes and decision rationale

**Audit**

- Every state transition, reviewer, timestamp (UTC), decision reason and document access is written to the audit trail.

**Exceptions**

- Duplicate identity detected → entity resolution case
- Rejected registration → reasons recorded and communicated
- Withdrawn by applicant before decision
- Expired OTP → resend required

**Demo notes**

- Emphasise that identity is established once and reused across every later module.
- Show that acceptance provisions the portal automatically — no manual account creation.
- Point out the forced password change on first sign-in.

**Screenshots:** `pub-register`, `reg-review-queue`, `ext-applicant-dashboard`

## Licensing & Authorisation

_Chapter: licensing · module: F4 Licensing · audience: any · status: AVAILABLE · AI: AI-ASSISTED_

Assess an application against the regulatory criteria and, where satisfied, issue a licence with a defined scope, conditions and validity period.

**Actors:** Applicant / Pre-Licensee, Licensing Officer, Fit & proper assessor, Supervisor / decision authority

**Preconditions**

- Accepted registration and a provisioned portal account
- Application form package published for the sector/category
- Fee schedule configured for the requested licence type
- Workflow and decision-authority configuration in place

**Where to start**

- External → License Requests → Pre Licensing Applications — `/applications?type=pre`
- External → New application — `/applications/new`
- Internal → Application queue — `/applications/queue`
- Internal → Licence register — `/licenses`

**Process flow**

1. Applicant creates an application and completes every mandatory form in the package.
2. Applicant uploads supporting evidence and nominates individuals for fit & proper assessment.
3. The system assesses fees; the applicant settles them (payment is mandatory before final submission).
4. Applicant submits. A server-side function re-verifies completeness, fee settlement and eligibility.
5. The application is routed by the workflow engine to the correct assessment queue.
6. Licensing Officer performs the assessment, raises RFIs, and records findings.
7. Fit & proper determinations are completed for nominated individuals.
8. Officer records a recommendation.
9. An independent decision-maker approves, refuses or returns the application.
10. On approval, the licence is generated with number, scope, conditions and validity; the entity appears in Entity 360.

**Status lifecycle**

- `Draft` — Being prepared by the applicant.
- `Pending payment` — Forms complete but assessed fees are outstanding.
- `Submitted` — Received and locked to the applicant.
- `Under assessment` — Being assessed by the regulator.
- `Information requested (RFI)` — Specific information requested with a deadline.
- `Recommended` — Officer recommendation recorded, awaiting an independent decision.
- `Approved` — Decision taken; licence issuance follows.
- `Refused` — Application refused with reasons; appeal rights apply.
- `Withdrawn` — Withdrawn by the applicant before decision through the governed withdrawal action.

**User actions**

- Continue application → Resumes the draft at the last incomplete form.
- Pay fees → Settles the assessment of record; receipts are issued by a governed server function.
- Submit → Runs server-side gating; nothing is accepted client-side.
- Withdraw → Calls the governed withdrawal contract with a mandatory reason.
- Raise RFI → Sends a request to the applicant and records a response deadline.
- Recommend / Approve / Refuse → Records the decision with mandatory rationale and produces the decision record.

**Maker-checker:** The assessing officer prepares the recommendation; the approver must be a different, authorised person. Approval authority comes from the decision-authority matrix and is enforced server-side.

**Notifications**

- Application submitted acknowledgement
- Fee assessed / payment received
- RFI raised and RFI overdue reminders
- Decision issued (approval/refusal)
- Licence issued with certificate

**Service level & escalation**

- Assessment and RFI response SLAs are configurable; breaches escalate to the configured owner and appear on supervisory dashboards.

**Evidence**

- All submitted form versions
- Uploaded documents
- Fee assessment, payment and receipt records
- Fit & proper determinations
- Decision record and rationale

**Audit**

- Every routing, assessment, RFI, recommendation and decision event with actor, UTC timestamp and reason.

**Exceptions**

- Refused
- Withdrawn
- Returned for correction / resubmission
- Expired RFI
- Unrouted application handled through manual processing fallback

> AI: The APPLICATION_ASSESSMENT surface may draft points for an assessor to consider. It never approves, refuses or scores an application, and its output must be reviewed before use.

**Demo notes**

- Show the mandatory-payment gate — it is enforced by the server, not the screen.
- Show the recommendation and the separate approval to prove segregation of duties.
- Finish on the issued licence and the new Entity 360 record.

**Screenshots:** `lic-app-queue`, `lic-applications`, `lic-register`, `fpa-individuals`, `ext-applicant-application`

## Post-Licensing Services

_Chapter: post-licensing · module: F5 Post-licensing services · audience: any · status: AVAILABLE · AI: DETERMINISTIC AUTOMATION_

Handle every regulated change after authorisation — ownership and governance change, branch/establishment change, scope variation, renewal, surrender — through a single governed intake with approval-dependent effects.

**Actors:** Licensee Primary User, Licensing Officer, Supervisor / decision authority, Fit & proper assessor (where an individual is nominated)

**Preconditions**

- An eligible licence (approved, issued or in grace) — the entitlement is enforced on every write
- The requested service is applicable to the entity’s sector/category (canonical taxonomy check)
- Service form package published
- Fee configuration for the service where chargeable

**Where to start**

- External → Post Licensing Applications — `/applications?type=post`
- External → New post-licence request — `/post-license/new`
- Internal → Regulatory requests register — `/licensing/regulatory-requests`

**Process flow**

1. Licensee selects a service from the applicable service catalogue; the request kind is set by the server, not the browser.
2. The licensee completes the service forms and identifies the target of the change (licence, establishment, individual, ownership interest).
3. Nominated individuals are linked to fit & proper subjects where the service requires it.
4. Fees are assessed and settled where chargeable.
5. The request is submitted and routed for assessment.
6. The regulator assesses, raises RFIs and records a recommendation.
7. An independent decision-maker approves or refuses.
8. On approval the post-approval effect engine applies the change deterministically (ownership, governance, establishment, licence attribute, renewal).
9. The effect and its provenance are recorded and visible in Entity 360 history.

**Status lifecycle**

- `Draft` — Prepared by the licensee.
- `Submitted` — Received and locked.
- `Under assessment` — Being assessed.
- `Information requested` — Awaiting the licensee’s response.
- `Approved` — Decision recorded; effects execute.
- `Effect applied` — The canonical record has been changed by the effect engine, with provenance.
- `Refused / Withdrawn` — No change is applied to the canonical record.

**User actions**

- Select service → Applies canonical applicability rules; ineligible services are not offered.
- Select target → Binds the request to a specific licence, establishment, appointment or ownership interest.
- Submit request → Server-side gating validates entitlement, completeness and fee settlement.
- Approve → Fails closed if any blocker (for example an outstanding fit & proper determination) exists.
- Acknowledge effect → Records that the regulated change has been received/acknowledged where required.

**Maker-checker:** Preparer (licensee) → assessor (regulator maker) → independent approver (regulator checker). Effects only execute from an approved decision; there is no manual back-door write.

**Notifications**

- Request submitted
- RFI raised
- Decision issued
- Effect applied / acknowledgement required

**Service level & escalation**

- Service-level SLAs are configurable per service; breaches escalate and surface on the supervisory dashboard.

**Evidence**

- Service forms and versions
- Target binding and provenance
- Fit & proper linkage
- Effect ledger entries and acknowledgements

**Audit**

- Intake, target selection, decision, effect execution and idempotent replay attempts are all audited.

**Exceptions**

- Blocked approval (fit & proper not determined)
- Refused request
- Withdrawn request
- Duplicate effect suppressed by idempotency

> AI: The post-approval effect engine is deterministic rule execution, not AI. Do not describe it as AI in a demo.

**Demo notes**

- Stress the single governed intake: one authority path for every post-licence change.
- Show that the approval fails closed when a fit & proper subject is not determined.
- Show the resulting change in Entity 360 with provenance back to the request.

**Screenshots:** `lic-requests`, `ext-licensee-service`, `ext-licensee-dashboard`

## Regulatory Returns

_Chapter: returns · module: F7 Regulatory returns · audience: any · status: AVAILABLE · AI: DETERMINISTIC AUTOMATION_

Ensure every reporting obligation for every licensed entity is generated, filed, validated, reviewed and either accepted or rejected — with a full record of what was required and what was actually filed.

**Actors:** Licensee Primary/Secondary User, Analyst (reviewer), Supervisor (decision), Administrator (configuration)

**Preconditions**

- Return type, form and validation rules configured
- Reporting obligation generated for the entity and period
- Cut-off and due-date rules configured
- Entity reporting currency profile resolved (regulator-scoped)

**Where to start**

- External → Regulatory Returns dashboard — `/entity/returns/dashboard`
- Internal → Return review queue — `/returns/queue`
- Internal → Obligations register — `/returns/obligations`
- Internal → Reporting calendar — `/returns/calendar`

**Process flow**

1. The obligation is generated for the entity and reporting period, with a due date derived from period end plus the configured cut-off.
2. The licensee opens the filing; a currency and obligation snapshot is taken so the filing is interpreted on its own historical basis.
3. Data is entered or imported; drafts auto-save and calculated fields are recomputed by a safe arithmetic evaluator.
4. Validation runs; blocking failures prevent submission and advisory findings are shown.
5. The primary user submits. Submission authority is checked server-side.
6. The filing enters the review queue; a reviewer examines data, validation results and prior-period movements.
7. Where required, an RFI is raised and the licensee responds.
8. A reviewer recommends and an independent user accepts or rejects the filing.
9. Accepted filings feed prudential/conduct supervision and Entity 360.

**Status lifecycle**

- `Not started` — Obligation exists, nothing filed yet.
- `Draft` — Being prepared by the entity.
- `Submitted` — Filed by the entity and locked.
- `Under review` — Being examined by the regulator.
- `Information requested` — An RFI is open against the filing.
- `Accepted` — The filing is accepted as the record for the period.
- `Rejected` — The filing is not accepted; a corrected filing is required.
- `Amended` — A superseding version has been filed through the amendment process; earlier versions are retained.
- `Overdue` — The due date passed without an accepted submission; late fees may apply.

**User actions**

- Start / continue filing → Opens the versioned form for the period with the historical schema.
- Validate → Runs configured validation rules and shows blocking vs advisory findings.
- Submit → Locks the filing and records the submitting user, time and currency basis.
- Request extension → Raises a governed extension request; approval moves the due date with an audit record.
- Amend → Creates a new version with a highlighted difference against the previous version.
- Accept / Reject → Regulator decision with mandatory rationale.

**Maker-checker:** Reviewer recommends; an independent authorised user accepts or rejects. The same person cannot both review and decide the same filing.

**Notifications**

- Filing due reminder
- Overdue notice
- RFI raised / responded
- Filing accepted or rejected
- Extension approved or refused

**Service level & escalation**

- Due dates, reminder lead times, overdue sweeps and review SLAs are configurable; overdue filings escalate and may attract late fees owned by the fees module.

**Evidence**

- Every submitted version and its schema snapshot
- Validation results
- Uploaded supporting evidence
- RFI correspondence
- Review decision and rationale

**Audit**

- Generation, submission, review, RFI, extension, amendment and acceptance events with actor and UTC timestamp.

**Exceptions**

- Overdue
- Rejected and re-filed
- Amended
- Extension granted
- Nil return where permitted

> AI: Validation, due-date generation and late-fee calculation are deterministic rules. AI is not used to accept or reject a filing.

**Demo notes**

- Show the obligation → filing → review chain rather than a single screen.
- Show the historical schema/currency snapshot: an old filing still reads as it was filed.
- Show the amendment difference highlighting.

**Screenshots:** `ret-queue`, `ret-obligations`, `ret-calendar`, `ret-filing`, `ext-licensee-returns`, `ext-licensee-secondary`

## Fees, Payments & Currency

_Chapter: fees-payments · module: F6 Fees & payments (incl. multi-currency) · audience: any · status: AVAILABLE · AI: NO AI_

Assess the correct fee for every chargeable regulatory event, collect it, allocate it to the assessment of record, and keep an immutable financial trail in the correct currency.

**Actors:** Applicant / Licensee (payer), Finance/Administrator (regulator), Supervisor (waiver/refund approval)

**Preconditions**

- Fee schedule and fee items configured
- Currency master and effective-dated FX rates configured
- Payment channel configuration

**Where to start**

- External → Payments — `/payments`
- Internal → Fee configuration — `/admin/fees`
- Internal → Payment register — `/payments`
- Internal → Currency settings — `/settings/currency`

**Process flow**

1. A chargeable event (application, service request, late filing, penalty) triggers a server-side assessment.
2. The assessment of record is created with itemised fee lines and the applicable currency.
3. The payer sees the authoritative outstanding balance — the browser never prices anything.
4. Payment is made (online simulation or recorded offline payment) and verified server-side.
5. The payment is allocated against assessment lines in the immutable ledger.
6. A receipt is minted by a governed server function.
7. Waivers, refunds and reversals follow separate governed, approval-based paths.
8. Amounts are reported in the transaction currency with the base reporting currency and FX provenance retained.

**Status lifecycle**

- `Assessed` — A fee is due and itemised.
- `Partially settled` — Some allocation exists but a balance remains.
- `Settled` — The assessment is fully allocated.
- `Waived` — An approved waiver removed the obligation with a recorded reason.
- `Refunded / Reversed` — An approved refund or reversal has been posted; the original entries remain.

**User actions**

- Pay now → Starts the payment flow against the authoritative balance.
- Record offline payment → Internal action recording a bank/manual payment for verification.
- Issue receipt → Calls the governed receipt issuance function; receipts cannot be minted from the browser.
- Request waiver / refund → Creates a governed request requiring independent approval.

**Maker-checker:** Waivers, refunds and reversals are proposed by one user and approved by another with the required authority. Ledger entries are append-only — corrections are made by reversal, never by editing history.

**Notifications**

- Fee assessed
- Payment received / receipt issued
- Payment overdue
- Waiver or refund decision

**Service level & escalation**

- Payment deadlines gate submission; overdue balances can block new filings and trigger penalty processes where configured.

**Evidence**

- Assessment of record
- Payment and allocation ledger
- Receipts
- Waiver/refund approvals with rationale
- FX rate used and its effective date

**Audit**

- Every assessment, allocation, receipt, waiver, refund and reversal with actor, UTC timestamp and currency provenance.

**Exceptions**

- Overpayment
- Partial payment
- Failed/abandoned payment
- Refund
- Reversal
- Currency mismatch prevented by the currency contract

**Demo notes**

- Show that pricing is server-authoritative — the UI displays, it does not calculate.
- Show the immutable ledger and reversal-based correction.
- Show currency and FX provenance on a historical transaction.

**Screenshots:** `fee-config`, `pay-history`, `cur-settings`, `pen-register`, `ext-applicant-payment`

## Complaints

_Chapter: complaints · module: Complaints management · audience: any · status: AVAILABLE · AI: DETERMINISTIC AUTOMATION_

Receive, triage, investigate and close complaints about regulated entities, and turn complaint intelligence into supervisory insight.

**Actors:** Complainant (public or licensee customer), Analyst (triage/investigation), Supervisor (decision/closure), Regulated entity (RFI respondent)

**Preconditions**

- Complaint types configured
- Routing/triage rules configured
- Entity register populated so complaints can be linked to an entity

**Where to start**

- Public → Submit a complaint — `/complaints/submit`
- Public → Track a complaint — `/complaints/track`
- Internal → Intake queue — `/complaints/intake-queue`
- Internal → Complaint register — `/complaints`

**Process flow**

1. A complaint is submitted publicly, by a signed-in user, or recorded internally; a tracking reference is issued.
2. Intake triage classifies the complaint, links it to the entity, and checks for duplicates.
3. The complaint is assigned to an analyst and prioritised.
4. Information is requested from the entity and/or the complainant.
5. The analyst records findings and a recommended outcome.
6. A supervisor decides the outcome and closes the complaint, or escalates it to investigation/enforcement.
7. The complainant is notified of the outcome; the complaint contributes to conduct intelligence for the entity.

**Status lifecycle**

- `Received` — Logged with a reference and awaiting triage.
- `Triaged` — Classified, linked to an entity, and prioritised.
- `Under investigation` — Being actively worked.
- `Information requested` — Awaiting a response from the entity or complainant.
- `Escalated` — Referred for supervisory or enforcement action.
- `Closed` — Outcome recorded and communicated.
- `Duplicate` — Linked to an existing complaint rather than worked twice.

**User actions**

- Triage → Sets type, entity linkage, priority and owner.
- Raise RFI → Requests information with a deadline and tracked response.
- Record finding → Captures the analytical conclusion and supporting evidence.
- Escalate → Creates a supervisory/enforcement referral with rationale.
- Close → Records the outcome; closure approval applies where configured.

**Maker-checker:** Analyst recommends closure or escalation; a supervisor approves. Closure approval queues exist where the configuration requires them.

**Notifications**

- Complaint acknowledgement with tracking reference
- RFI to entity
- Status change to complainant
- Outcome notification
- Escalation notice

**Service level & escalation**

- Acknowledgement, response and closure SLAs are configurable; breaches escalate through the escalation manager.

**Evidence**

- Complaint submission and attachments
- RFI correspondence
- Findings and outcome rationale

**Audit**

- All triage, assignment, RFI, finding, escalation and closure events with actor and UTC timestamp.

**Exceptions**

- Duplicate complaint
- Out of jurisdiction
- Withdrawn by complainant
- Anonymous complaint with limited follow-up

> AI: Duplicate detection and triage rules are deterministic. Cross-entity narrative advisory is a separate governed AI surface.

**Demo notes**

- Show the public reference and tracking — a citizen-facing trust feature.
- Show duplicate detection preventing double handling.
- Finish by showing the complaint appearing in the entity’s conduct picture.

**Screenshots:** `pub-complaint`, `pub-track`, `cmp-intake`, `cmp-list`, `cmp-analytics`

## Market Conduct Supervision

_Chapter: market-conduct · module: Market conduct · audience: internal · status: AVAILABLE · AI: AI-ASSISTED_

Monitor how regulated entities treat customers and behave in the market, convert signals into supervisory attention, and plan proportionate intervention.

**Actors:** Analyst, Supervisor, Administrator (rules/taxonomy configuration)

**Preconditions**

- Conduct risk taxonomy, products/channels and monitoring rules configured
- Complaint and returns data flowing

**Where to start**

- Conduct work queue — `/conduct/work-queue`
- Supervisory attention — `/conduct/attention`
- Signals & surveillance — `/conduct/signals`

**Process flow**

1. Deterministic monitoring rules generate conduct signals from complaints, filings and other recorded facts.
2. Signals are triaged and either dismissed with reasons or raised as supervisory attention.
3. Patterns and emerging risks are identified across entities.
4. A supervisory plan or intervention is proposed from the approved intervention catalogue.
5. The supervisor approves the plan/intervention and it becomes an operational record.
6. Outcomes are monitored and closed with approval where required.

**Status lifecycle**

- `Signal open` — A rule has flagged something for human review.
- `Under review` — An analyst is assessing the signal.
- `Attention raised` — Accepted as supervisory attention with an owner.
- `Intervention active` — An approved supervisory intervention is in progress.
- `Closed` — Concluded with recorded reasons; closure approval where configured.

**User actions**

- Review signal → Records the analytical judgement on a flagged fact.
- Raise attention → Creates an owned supervisory attention record.
- Propose intervention → Selects from the approved catalogue; free-text invention is not permitted.
- Request AI advisory → Produces a draft narrative/planning aid that must be reviewed before adoption.

**Maker-checker:** Analysts propose attention/interventions; supervisors approve. Closure approvals are a separate queue.

**Notifications**

- New signal assigned
- Attention raised
- Intervention due/overdue
- Closure approval requested

**Service level & escalation**

- Signal review and intervention milestones are SLA-tracked where configured.

**Evidence**

- Signal derivation facts
- Analyst assessment
- Approved plan/intervention record
- Closure rationale

**Audit**

- Signal lifecycle, decisions, AI advisory requests and human adoption/rejection are audited.

**Exceptions**

- Dismissed signal
- False positive with rule feedback
- Escalation to investigation

> AI: CROSS_ENTITY_INTELLIGENCE, SUPERVISORY_PLANNING_ASSISTANCE and MANAGEMENT_REPORTING_ASSISTANCE draft wording over deterministic facts. They confirm no risk, create no record and require human adoption.

**Demo notes**

- Emphasise that signals come from deterministic rules over recorded facts.
- Show that AI drafts wording, and the supervisor decides.
- Show the approved intervention catalogue as a control.

**Screenshots:** `cond-work-queue`, `cond-attention`

## Investigations & Enforcement

_Chapter: investigations · module: Investigations & enforcement · audience: internal · status: AVAILABLE · AI: NO AI_

Investigate suspected breaches, establish findings on evidence, and take proportionate enforcement action with legal defensibility.

**Actors:** Analyst / Investigator, Supervisor, Legal / Compliance Reviewer, Decision authority

**Preconditions**

- A referral, breach or complaint escalation
- Decision-authority matrix configured
- Penalty configuration where monetary sanctions apply

**Where to start**

- Enforcement work queue — `/enforcement`
- Conduct investigations — `/conduct/investigations`
- Breach inbox — `/supervision/breaches`

**Process flow**

1. A referral is received from complaints, monitoring, returns breaches or an examination.
2. An investigation case is opened with a scope and owner.
3. Evidence is gathered and recorded against the case.
4. Findings are drafted and legally reviewed.
5. A proposed enforcement action is prepared (direction, condition, penalty, licence action).
6. The designated decision authority decides; the entity is notified and given appeal rights.
7. Penalties are assessed in the entity’s applicable currency and collected through the fees module.
8. The action is recorded on the entity’s permanent supervisory record.

**Status lifecycle**

- `Referral` — Received, not yet accepted as a case.
- `Open` — Under active investigation.
- `Findings drafted` — Conclusions prepared for review.
- `Legal review` — Being reviewed for legal soundness.
- `Action proposed` — Awaiting the decision authority.
- `Action taken` — Decision issued and communicated.
- `Closed / No action` — Concluded with recorded reasons.

**User actions**

- Open case → Creates the investigation record with scope and owner.
- Record evidence → Attaches evidence with provenance and retention.
- Propose action → Prepares the enforcement recommendation for decision.
- Issue decision → Records the decision, notice and appeal rights.

**Maker-checker:** Investigator prepares; legal reviews; a separate decision authority decides. Under no circumstance does the investigator issue their own enforcement decision.

**Notifications**

- Case assigned
- Evidence request to entity
- Decision notice
- Penalty assessed
- Appeal window notice

**Service level & escalation**

- Case milestones and decision deadlines are tracked; overdue cases escalate to the supervisory owner.

**Evidence**

- Evidence register
- Findings and legal review
- Decision notice and rationale
- Penalty assessment and provenance

**Audit**

- Full case chronology with actor, UTC timestamps and access to confidential material.

**Exceptions**

- No action
- Settlement/undertaking where configured
- Appeal lodged
- Action varied on appeal

> AI: No AI surface participates in enforcement decisions.

**Demo notes**

- Emphasise evidence discipline and legal review before any action.
- Show appeal rights being created automatically with the decision.

**Screenshots:** `enf-queue`, `cond-investigations`

## Thematic Reviews

_Chapter: thematic-reviews · module: Thematic supervision · audience: internal · status: AVAILABLE · AI: NO AI_

Run cross-population reviews on a specific theme, compare entities on the same basis, and drive consistent remediation.

**Actors:** Supervisor (programme owner), Analyst (reviewer), Regulated entities (respondents)

**Preconditions**

- Population selection criteria
- Review questionnaire/template
- Timeline and milestones

**Where to start**

- Thematic reviews — `/supervision/thematic-reviews`

**Process flow**

1. A theme and scope are defined and the review population is selected.
2. The information request is issued to the population.
3. Entities respond within the deadline.
4. Responses are analysed and scored on a common basis.
5. Cross-population findings and good/poor practice are recorded.
6. Entity-specific follow-up actions are raised and tracked to closure with approval.

**Status lifecycle**

- `Planned` — Defined but not launched.
- `In progress` — Information requested / responses being received.
- `Analysis` — Responses being assessed.
- `Reported` — Findings published internally or externally.
- `Closed` — Follow-up actions completed and approved.

**User actions**

- Define review → Creates the programme with scope and timeline.
- Issue request → Notifies the population and starts the response clock.
- Record finding → Captures thematic conclusions.
- Request closure approval → Sends the review for independent closure approval.

**Maker-checker:** The programme team prepares findings; closure requires independent approval through the thematic closure approval queue.

**Notifications**

- Information request issued
- Response overdue
- Findings issued
- Closure approved

**Service level & escalation**

- Response and milestone deadlines are tracked; non-responders escalate.

**Evidence**

- Population selection basis
- Entity responses
- Analysis working and findings
- Closure approval

**Audit**

- Programme lifecycle, population changes, findings and closure are audited.

**Exceptions**

- Non-response
- Entity out of scope
- Extended deadline
- Review discontinued

**Demo notes**

- Show consistent treatment across the population — a key supervisory fairness message.

**Screenshots:** `thm-reviews`

## Correspondence

_Chapter: correspondence · module: Correspondence · audience: any · status: AVAILABLE · AI: NO AI_

Keep every formal exchange between the regulator and a regulated party in one attributable, retrievable thread instead of scattered mailboxes.

**Actors:** Regulator staff, Licensee Primary User, Administrator (templates/routing)

**Preconditions**

- Correspondence templates and routing rules configured
- Entity contacts recorded

**Where to start**

- Internal → Correspondence inbox — `/correspondence/inbox`
- Internal → Correspondence dashboard — `/correspondence/dashboard`
- External → Correspondence — `/entity/correspondence`

**Process flow**

1. Correspondence is created from a template or received into the inbox.
2. It is routed to the responsible team or officer by the routing rules.
3. A reply is drafted, reviewed where required, and issued to the entity.
4. The entity responds through the portal thread.
5. The thread is closed and retained against the entity record.

**Status lifecycle**

- `Draft` — Being prepared.
- `Issued` — Sent to the recipient.
- `Awaiting response` — A reply is expected by a deadline.
- `Responded` — The recipient has replied.
- `Closed` — No further action; retained as record.

**User actions**

- Create from template → Applies the approved wording and merge fields.
- Route → Assigns the item to the responsible owner.
- Reply → Adds an attributable message to the thread.
- Close thread → Marks the exchange complete and retains it as evidence.

**Maker-checker:** Formal outbound correspondence can require review before issue where the template/route configuration says so.

**Notifications**

- New correspondence received
- Response due reminder
- Thread closed

**Service level & escalation**

- Response deadlines are tracked and escalate on breach.

**Evidence**

- Full thread with attachments, senders and timestamps

**Audit**

- Creation, routing, issue, reply and closure events.

**Exceptions**

- Misrouted item re-routed with reason
- No response → escalation
- Superseded correspondence

**Demo notes**

- Show one thread containing the whole regulatory conversation, linked to the entity.

**Screenshots:** `corr-inbox`, `corr-dashboard`

## Notifications, SLA & Escalations

_Chapter: notifications-sla · module: Notification & SLA engine · audience: any · status: AVAILABLE · AI: NO AI_

Make sure the right person is told the right thing at the right time, and that nothing silently sits past its deadline.

**Actors:** All users (recipients), Administrator (configuration), Escalation owners

**Preconditions**

- Notification templates and events configured
- Channels (email/SMS/in-app) enabled
- SLA definitions and escalation rules configured

**Where to start**

- My Work — `/my-work`
- Notification centre — `/notifications`
- Internal → SLA manager — `/admin/sla-manager`
- Internal → Escalations & alerts — `/admin/escalations`

**Process flow**

1. A business event fires (submission, decision, due date, breach).
2. The notification engine resolves the template, audience and channel.
3. Messages are queued and delivered; delivery outcomes are recorded.
4. SLA clocks start/stop on the configured lifecycle events.
5. On breach, the escalation rule notifies the escalation owner and raises the item on dashboards.

**Status lifecycle**

- `Queued` — Accepted by the engine for delivery.
- `Sent` — Handed to the channel provider.
- `Delivered / Failed` — Provider outcome recorded; failures are visible in channel health.
- `Read` — In-app notification opened by the recipient.

**User actions**

- Mark as read → Clears the in-app item from the unread list.
- Open work item → Navigates to the underlying record.
- Configure template/SLA → Administrator action; changes are versioned and audited.

**Maker-checker:** Template and SLA configuration changes are audited; approval applies where the configuration hub requires it.

**Notifications**

- This module produces every other module’s notifications.

**Service level & escalation**

- SLA definitions are central; escalation chains are configurable per module.

**Evidence**

- Notification history and delivery outcome per recipient

**Audit**

- Template changes, event firing, delivery outcomes and escalations.

**Exceptions**

- Channel failure with retry
- Recipient unreachable
- Suppressed duplicate notification

**Demo notes**

- Show My Work as the single operational landing point for every persona.

**Screenshots:** `int-my-work`, `adm-sla`

## Appeals & Reviews

_Chapter: appeals · module: Appeals · audience: any · status: AVAILABLE · AI: NO AI_

Give a regulated party a fair route to challenge a decision, and give the regulator a controlled way to review it independently.

**Actors:** Applicant / Licensee (appellant), Appeal panel members, Legal / Compliance Reviewer, Administrator (panel configuration)

**Preconditions**

- An appealable decision within the appeal window
- Appeal panels configured

**Where to start**

- External → My appeals — `/appeals`
- Internal → Licence appeals register — `/admin/license-appeals`
- Internal → Appeal panels — `/admin/appeal-panels`

**Process flow**

1. The appellant lodges an appeal within the permitted window, stating grounds.
2. The appeal is registered and acknowledged.
3. A panel independent of the original decision-maker is constituted.
4. The panel reviews the original decision, evidence and grounds.
5. The panel upholds, varies or overturns the decision with reasons.
6. The outcome is communicated and the underlying record is updated.

**Status lifecycle**

- `Lodged` — Received within the appeal window.
- `Under review` — Being considered by the panel.
- `Upheld` — Original decision stands.
- `Varied` — Decision modified.
- `Overturned` — Original decision set aside.
- `Out of time` — Lodged after the appeal window.

**User actions**

- Lodge appeal → Creates the appeal with grounds and evidence.
- Constitute panel → Appoints independent members; the original decision-maker is excluded.
- Record outcome → Applies the panel’s decision with reasons.

**Maker-checker:** Structural independence: the original decision-maker cannot sit on the panel reviewing their own decision.

**Notifications**

- Appeal acknowledged
- Panel constituted
- Outcome issued

**Service level & escalation**

- Appeal window and determination deadlines are tracked.

**Evidence**

- Appeal submission and grounds
- Panel composition
- Panel reasoning and outcome

**Audit**

- Lodgement, panel appointment, deliberation milestones and outcome.

**Exceptions**

- Out-of-time appeal
- Withdrawn appeal
- Partial variation

**Demo notes**

- Independence of the panel is the headline control to explain.

**Screenshots:** `app-appeals`

## Entity Network, Ownership & UBO

_Chapter: ownership-ubo · module: F8A Entity network / ownership / UBO · audience: internal · status: AVAILABLE · AI: DETERMINISTIC AUTOMATION_

Maintain a canonical, effective-dated picture of who owns and controls each regulated entity — including through non-regulated intermediate holding companies — and derive ultimate beneficial owners deterministically under a governed policy.

**Actors:** Licensee Primary User (declaration through post-licensing), Licensing Officer / Analyst (maker), Supervisor (checker), Super Admin (UBO policy governance)

**Preconditions**

- Canonical parties and party kinds (person, organisation, trust, foundation, partnership) recorded
- Ownership interests recorded with effective dates and provenance
- An approved, effective-dated UBO policy (thresholds and control test) for the regulator

**Where to start**

- Entity structure — `/entities/:entityId/structure`
- Entity 360 → Ownership — `/entities/:entityId/360`

**Process flow**

1. Ownership and control facts are recorded canonically, each with a source, effective dates and provenance.
2. Changes are proposed as a governed change set (maker), submitted, and independently approved (checker) before they affect the canonical record.
3. Traversal walks the ownership chain from the regulated entity upward, bounded by the configured node and depth caps.
4. Economic and voting percentages are multiplied along each path and aggregated across multiple paths.
5. A natural person qualifies as a calculated UBO only where the governed threshold is met on economic or voting interest, or where a governed control determination applies.
6. Cycles, incomplete chains and scope-restricted branches are reported explicitly rather than silently dropped.
7. Results are presented as at a chosen date and consumed by Entity 360 and supervisory intelligence.

**Status lifecycle**

- `Proposed` — A change set exists but the canonical record is unchanged.
- `Submitted` — Awaiting an independent approver.
- `Approved / Applied` — The canonical ownership record has been updated with provenance.
- `Rejected / Withdrawn` — No mutation occurred.
- `Superseded` — An interest ended and a later effective-dated record applies.

**User actions**

- Propose ownership change → Creates a change set; nothing is written to the canonical ledger yet.
- Approve change set → Applies the change atomically with provenance; self-approval is denied.
- Run UBO as at date → Re-computes the ownership picture using the policy in force on that date.
- View path detail → Shows each ownership path and its multiplied percentages.

**Maker-checker:** Structural change is strictly maker-checker: the proposer cannot approve, and approval is verified by database guards, not the UI.

**Notifications**

- Change set submitted for approval
- Change set approved/rejected
- Ownership change applied

**Service level & escalation**

- Approval turnaround follows the configured structural-change SLA.

**Evidence**

- Change set with proposer, approver, timestamps and rationale
- Source documents behind each interest
- Computed UBO results with the policy version used

**Audit**

- Proposal, submission, approval, application and idempotent replay attempts are all recorded.

**Exceptions**

- Cycle detected — reported, not silently resolved
- Incomplete chain — the branch is marked incomplete
- Node limit reached — truncated result with the boundary shown
- Regulator scope restricted — branch redacted as REGULATOR_SCOPE_RESTRICTED
- No effective UBO policy — configuration required

> AI: UBO calculation is deterministic mathematics under an approved policy. It must NEVER be presented as an AI capability.

**Demo notes**

- Explain that recorded (declared) UBO and calculated UBO are different things and both are shown.
- Show an as-at date changing the answer because ownership is effective-dated.
- Show an explicit incomplete/cycle/scope boundary — honesty about limits is a strength.

**Screenshots:** `e360-structure`, `e360-overview`

## Administration & Configuration

_Chapter: administration · module: Administration · audience: internal · status: AVAILABLE · AI: NO AI_

Configure the regulatory operating model — master data, forms, workflows, fees, SLAs, notifications, access — without code changes, under audit.

**Actors:** Super Admin, Administrator

**Preconditions**

- Administrative permissions granted through dynamic RBAC

**Where to start**

- Admin Control Panel — `/admin`
- Settings — `/settings`
- Employee management — `/admin/users`
- Role management — `/admin/roles`

**Process flow**

1. Open the Admin Control Panel to see configuration coverage and gaps.
2. Maintain master data (regulators, sectors, sub-sectors, categories, services).
3. Build and version forms; schedule publication.
4. Configure fees, currencies, returns, SLAs, notification templates and escalations.
5. Manage employees, roles, permissions and external portal access.
6. Every change is written through governed RPCs and appears in the audit trail.

**Status lifecycle**

- `Draft configuration` — Not yet effective.
- `Published / Active` — In force for new activity.
- `Scheduled` — Will take effect on a future date.
- `Archived` — No longer used for new activity; historical records keep their original version.

**User actions**

- Publish form version → Makes a new version effective; historical submissions keep their original schema.
- Grant role/permission → Changes what a user can do; effective on next context refresh and fully audited.
- Update fee/currency configuration → Applies to future assessments only.

**Maker-checker:** Sensitive configuration is applied through governed change sets requiring an independent approver.

**Notifications**

- Configuration change notifications where subscribed
- Access granted/revoked notices

**Service level & escalation**

- Not applicable except for access-request handling where configured.

**Evidence**

- Configuration version history with actor and effective dates

**Audit**

- All configuration writes, including who approved them.

**Exceptions**

- Rolled-back configuration
- Scheduled change cancelled
- Permission revoked

**Demo notes**

- Stress configuration-not-code: a regulator can change its operating model itself.
- Show that permission changes are audited and coverage is measurable.

**Screenshots:** `adm-control-panel`, `adm-users`, `adm-roles`, `adm-settings`

## Audit, Evidence & Traceability

_Chapter: audit-evidence · module: Audit & evidence · audience: internal · status: AVAILABLE · AI: NO AI_

Prove, after the fact, who did what, when, on what basis and with what authority — for internal assurance, external audit and legal challenge.

**Actors:** Super Admin, Administrator, Legal / Compliance Reviewer, Auditors

**Preconditions**

- Audit logging active (it is always on for governed writes)

**Where to start**

- Activity logs — `/admin/audit-logs`
- Compliance audit logs — `/admin/compliance-audit-logs`
- Case audit — `/admin/case-audit`
- Audit export — `/admin/audit-export`

**Process flow**

1. Every governed write records actor, action, entity, timestamp (UTC) and reason where required.
2. Records are append-only; corrections are new entries, never edits.
3. Case audit assembles a chronological view for a single record.
4. Evidence (documents, filings, decisions) is retained with signed, time-limited access URLs.
5. Audit packs can be exported for a period, module or case.

**Status lifecycle**

- `Recorded` — The event is in the audit trail and cannot be altered.
- `Exported` — Included in an audit extract with its own access record.

**User actions**

- Filter audit trail → Narrows by actor, module, entity or period.
- Open case audit → Shows the full chronology for one record.
- Export → Produces an extract; the export itself is audited.

**Maker-checker:** Not applicable — audit is a record, not a decision. No user can delete or amend audit entries.

**Notifications**

- Security-event alerts where configured

**Service level & escalation**

- Not applicable.

**Evidence**

- The audit trail is itself the evidence layer for every other module.

**Audit**

- Access to confidential material and exports is itself audited.

**Exceptions**

- Failed write attempts and denied authorisations are recorded, not hidden.

**Demo notes**

- Open one record and show its complete chronology — this is the strongest regulator-grade proof point.
- Point out that denied attempts are also recorded.

**Screenshots:** `adm-audit-logs`

## Analytics & Reporting

_Chapter: analytics · module: Analytics & reporting · audience: any · status: AVAILABLE · AI: AI-ASSISTED_

Turn operational and supervisory data into management information: volumes, timeliness, risk distribution, conduct trends and portfolio views.

**Actors:** Supervisor, Analyst, Administrator, Executive audience

**Preconditions**

- Operational data recorded in the underlying modules
- Report templates configured where custom reporting is used

**Where to start**

- Analytics dashboard — `/analytics`
- Executive dashboard — `/executive`
- Reports — `/reports`

**Process flow**

1. Select the dashboard or report template.
2. Apply scope filters (regulator, sector, period, entity).
3. Read deterministic figures computed from canonical records.
4. Optionally request AI advisory commentary on the figures.
5. Export to CSV/JSON for onward use.

**Status lifecycle**

- `Live` — Figures reflect current canonical data at the time of query.

**User actions**

- Filter → Restricts the population; scope restrictions still apply.
- Export → Produces a data extract; the export is audited.
- Request insight → Requests advisory AI commentary on the displayed figures.

**Maker-checker:** Not applicable to reading. Adopting AI-drafted commentary into a management report requires human review.

**Notifications**

- Scheduled report delivery where configured

**Service level & escalation**

- Dashboards surface SLA breaches from the operational modules.

**Evidence**

- Report definitions and export records

**Audit**

- Report exports and access to restricted analytics.

**Exceptions**

- Empty population
- Restricted scope reducing the visible population

> AI: The DASHBOARD_INSIGHTS surface comments on figures. The figures themselves are deterministic and are never produced by AI.

**Demo notes**

- Say clearly: the numbers are deterministic; only the commentary is AI-drafted.
- Show scope filtering to prove regulator isolation.

**Screenshots:** `ana-dashboard`, `rep-dashboard`, `ai-insights`

## AI & Human-Controlled Governance

_Chapter: ai-governance · module: AI governance · audience: internal · status: AVAILABLE · AI: HUMAN DECISION_

Allow AI to assist supervisory work while guaranteeing that every regulatory decision remains a human decision, and that every AI use is registered, instructed, monitored and auditable.

**Actors:** Super Admin (governance owner), Supervisor / Analyst (users of advisory output), Assurance reviewer

**Preconditions**

- An approved model in the model registry
- An active, approved AI surface
- A versioned instruction record
- AI Gateway availability

**Where to start**

- AI governance overview — `/governance/ai`
- Models — `/governance/ai/models`
- Surfaces — `/governance/ai/surfaces`
- Instructions — `/governance/ai/instructions`
- Assurance — `/governance/ai/assurance`
- Exceptions — `/governance/ai/exceptions`
- Activity / provenance — `/governance/ai/activity`

**Process flow**

1. A model is registered and approved for use.
2. A surface (a specific business use of AI) is registered with its business purpose, advisory classification and required human review.
3. Instructions for the surface are versioned and approved.
4. A user requests advisory output from a permitted screen.
5. The request executes server-side; inputs are restricted to recorded facts the user is already entitled to see.
6. Output is presented as a draft for human review — accept, edit or reject.
7. The request, output and the human response are recorded in the AI activity ledger.
8. Exceptions, kill switches and assurance reviews govern ongoing use.

**Status lifecycle**

- `Draft` — Registered but not usable.
- `Active` — Approved and available on its surface.
- `Suspended` — Disabled by governance with a recorded reason; the workflow continues manually.
- `Retired` — No longer available; history is retained.

**User actions**

- Generate draft → Requests advisory output; nothing is written to an operational record.
- Accept / adopt → A human adopts wording into their own record — the human is the author of record.
- Edit → The human modifies the draft before adoption; the original draft is retained.
- Reject → The draft is discarded with the rejection recorded.
- Suspend surface (kill switch) → Immediately stops AI use on that surface; deterministic/manual working continues.

**Maker-checker:** AI never participates in maker-checker. It cannot be a maker, a checker or an approver. Every approval remains between two authorised humans.

**Notifications**

- AI exception raised
- Surface suspended
- Assurance review due

**Service level & escalation**

- Assurance review cycles are scheduled; overdue reviews are visible in the governance overview.

**Evidence**

- Model, model version, instruction version, prompt/inputs classification, output, user, timestamp, human response and override reason

**Audit**

- Every AI request and every human response is written to the AI activity ledger and cannot be edited.

**Exceptions**

- AI unavailable → the user continues manually
- Prohibited action attempted → blocked and recorded
- Output rejected by the reviewer

> AI: This chapter governs AI; the decision authority described here is always human.

**Demo notes**

- Lead with governance, not capability: registry, instructions, assurance, exceptions, kill switch.
- Show a real advisory output and then show the human accepting or rejecting it.
- Show the provenance record — model, version, user, response.

**Screenshots:** `ai-overview`, `ai-models`, `ai-surfaces`, `ai-instructions`, `ai-assurance`, `ai-exceptions`, `ai-activity`

## Roles and personas

### Super Admin (`super_admin`)

_Internal regulator user · application roles: super_admin_

Owns platform configuration, access control and governance registries for the regulator. Keeps the system operable without becoming the regulatory decision-maker.

**Starting dashboard:** Admin Control Panel — `/admin`

**Menu**

- Home
- Administration
- Insights & Reporting
- Supervision
- Licensing & Authorisation

**Responsibilities**

- Provision internal employees and assign roles
- Maintain modules, permissions and navigation entries
- Maintain fee, currency, returns, SLA and notification configuration
- Approve AI model/surface lifecycle changes and review AI exceptions
- Preserve audit integrity and evidence retention

**Can do**

- Create/deactivate internal users and roles
- Change configuration through governed admin RPCs (all audited)
- Traverse ownership/UBO structures across regulators
- Export audit and evidence packs

**Cannot do**

- Approve their own maker-checker submission (self-approval is denied server-side)
- Insert or update regulatory records directly from the browser (all financial, structural and lifecycle DML is revoked from browser roles)
- Alter a frozen historical record (immutability is enforced in the database)
- Delete audit entries

**Maker-checker:** May act as maker or checker on configuration change sets, but never both on the same record. Independent-approver checks are enforced by database guards, not the UI.

**Daily workflow**

1. Review Admin Control Panel metrics and pending configuration requests
2. Clear access-provisioning requests (employees, roles, external portal access)
3. Review AI exceptions and assurance reviews
4. Spot-check audit logs and security events

**Work queues**

- /my-work
- /admin
- /governance/ai/exceptions
- /admin/security-events

**Enforced by**

- has_role(auth.uid(), 'super_admin')
- sec_get_user_context()
- governed admin_* RPCs
- RLS on configuration tables

### Administrator (`admin`)

_Internal regulator user · application roles: admin_

Day-to-day operational administration: users, master data, templates, notifications and module configuration within the assigned regulator.

**Starting dashboard:** Admin Control Panel — `/admin`

**Menu**

- Home
- Administration
- Licensing & Authorisation
- Returns & Data
- Correspondence & Cases

**Responsibilities**

- Maintain sectors, sub-sectors, categories and services
- Publish and version forms
- Maintain fee schedules and licence lifecycle configuration
- Maintain notification templates and escalation rules

**Can do**

- Propose and apply configuration through audited RPCs where permitted
- Manage employee accounts within permitted modules
- Trigger governed data operations (bulk intake, due-date extensions) where granted

**Cannot do**

- Grant themselves permissions outside their role
- Take licensing or enforcement decisions unless the decision-authority matrix grants it
- Bypass maker-checker on configuration change sets

**Maker-checker:** Usually the maker for configuration and master-data change sets; a Super Admin or second Administrator approves.

**Daily workflow**

1. Check Admin Control Panel for configuration gaps
2. Process access and portal requests
3. Verify notification delivery/channel health
4. Maintain reference data requested by supervisors

**Work queues**

- /my-work
- /admin
- /admin/notification-channel-health

**Enforced by**

- dynamic RBAC (sec_permissions/role grants)
- governed admin RPCs
- RLS regulator scoping

### Supervisor (`supervisor`)

_Internal regulator user · application roles: supervisor_

Accountable supervisory officer for assigned entities: approves recommendations, owns supervisory judgement and drives risk-based action.

**Starting dashboard:** Dashboard — `/dashboard`

**Menu**

- Home
- My Work
- Entities & Registry
- Supervision
- Returns & Data
- Correspondence & Cases

**Responsibilities**

- Approve or reject recommendations prepared by officers/analysts
- Own the supervisory plan and risk rating for assigned entities
- Decide return acceptance, RFIs and extensions where authorised
- Escalate to enforcement where warranted

**Can do**

- Approve maker submissions from other users
- Record supervisory judgement, commentary and ratings
- Request information (RFI) and set deadlines
- Adopt or reject AI-drafted narrative after review

**Cannot do**

- Approve their own recommendation
- See entities outside their regulator/assignment scope (traversal returns REGULATOR_SCOPE_RESTRICTED boundaries)
- Edit submitted filings or frozen assessments

**Maker-checker:** Primarily the checker/decision-maker. When a supervisor prepares a recommendation, an independent approver is required.

**Daily workflow**

1. Open My Work and clear approvals awaiting decision
2. Review overdue/rejected returns and breaches
3. Review entity risk movement and supervisory attention
4. Record decisions with rationale

**Work queues**

- /my-work
- /returns/queue
- /supervision/breaches
- /conduct/work-queue
- /prudential/work

**Enforced by**

- workflow approval resolver (server-side)
- entity_supervision_assignments scope
- independent-approver database guards

### Licensing Officer (`licensing_officer`)

_Internal regulator user · application roles: licensing_officer_

Processes registrations, applications and post-licensing service requests up to a recommendation, and administers licence issuance once approved.

**Starting dashboard:** Dashboard — `/dashboard`

**Menu**

- Home
- My Work
- Licensing & Authorisation
- Entities & Registry

**Responsibilities**

- Verify applicant identity, completeness and fee settlement
- Raise RFIs and record assessment findings
- Prepare a recommendation for approval
- Issue licences and licence documents after approval

**Can do**

- Move an application through assessment states
- Request information and record evidence
- Submit a recommendation for independent decision

**Cannot do**

- Approve their own recommendation
- Issue a licence without a recorded approval decision
- Waive fees or override an assessment without governed authority

**Maker-checker:** The maker in licensing. Decision authority sits with Supervisor / decision-authority matrix holders.

**Daily workflow**

1. Clear the registration review queue
2. Work the application queue oldest-SLA first
3. Chase outstanding RFIs and fee settlement
4. Prepare recommendations and issue approved licences

**Work queues**

- /my-work
- /admin/registration-review
- /applications/queue
- /licenses/lifecycle

**Enforced by**

- application workflow RPCs
- licence issuance server contract
- maker-checker segregation guards

### Analyst (`analyst`)

_Internal regulator user · application roles: analyst_

Performs analysis on filings, complaints, conduct signals and market intelligence, and prepares findings for supervisory decision.

**Starting dashboard:** Dashboard — `/dashboard`

**Menu**

- Home
- My Work
- Returns & Data
- Correspondence & Cases
- Insights & Reporting

**Responsibilities**

- Validate and analyse submitted returns
- Triage complaints and conduct signals
- Prepare findings, drafts and analysis packs
- Highlight anomalies for supervisory attention

**Can do**

- Record analysis, findings and recommendations
- Raise RFIs where permitted
- Request AI advisory drafts and edit them before submission

**Cannot do**

- Accept or reject a filing where that authority is reserved
- Close an investigation alone
- Change risk ratings without approval

**Maker-checker:** Maker for analysis and findings; a Supervisor reviews and decides.

**Daily workflow**

1. Review new submissions and validation exceptions
2. Triage new complaints/signals
3. Update analysis records and escalate exceptions

**Work queues**

- /my-work
- /returns-management
- /complaints/intake-queue
- /conduct/work-queue

**Enforced by**

- module permissions (dynamic RBAC)
- review/decision RPC guards
- RLS regulator scoping

### Legal / Compliance Reviewer (`legal_compliance`)

_Internal regulator user · application roles: legal_compliance_

Provides legal and compliance assurance over decisions, enforcement action, appeals and regulatory correspondence.

**Starting dashboard:** Dashboard — `/dashboard`

**Menu**

- Home
- My Work
- Correspondence & Cases
- Supervision

**Responsibilities**

- Review the legal soundness of proposed decisions
- Support enforcement and appeal processes
- Confirm evidence sufficiency and record retention

**Can do**

- Record legal review outcomes
- Participate in appeal panels where appointed
- Access evidence packs for assigned matters

**Cannot do**

- Substitute their own decision for the designated decision-maker
- Alter supervisory findings

**Maker-checker:** Independent reviewer role; may be a required concurrence step where configured.

**Daily workflow**

1. Clear legal review tasks
2. Review appeals in progress
3. Confirm enforcement documentation

**Work queues**

- /my-work
- /enforcement
- /admin/license-appeals

**Enforced by**

- decision-authority matrix
- appeal panel membership records
- RLS on case records

### Applicant (`applicant`)

_External portal user · application roles: applicant_

A prospective regulated person or firm that has registered an account and is preparing/submitting a licence application.

**Starting dashboard:** Dashboard — `/dashboard`

**Menu**

- Home
- My Licenses
- License Requests
- Payments
- Notifications

**Responsibilities**

- Complete registration truthfully
- Complete all mandatory application forms
- Pay assessed fees
- Respond to RFIs by the stated deadline

**Can do**

- Create and edit a draft application
- Upload evidence
- Pay fees and download receipts
- Withdraw an application before decision
- Track status

**Cannot do**

- See any other applicant or licensee record
- See internal assessment notes, internal AI advisory output or supervisory information
- Change a submitted application except through a permitted amendment/resubmission
- Approve anything

**Maker-checker:** Outside the regulator maker-checker chain. Submission is an applicant declaration, not an approval.

**Daily workflow**

1. Continue the draft application
2. Upload requested evidence
3. Settle outstanding fees
4. Check status and notifications

**Work queues**

- /dashboard
- /applications
- /notifications

**Enforced by**

- portal access contract (portalAccess)
- RLS owner scoping
- server-side submission enforcement (verify-and-submit)

### Pre-Licensee Applicant (`pre_licensee`)

_External portal user · application roles: pre_licensee_

An entity whose registration has been accepted but which is not yet licensed. Access is whitelist-limited to pre-licensing activity.

**Starting dashboard:** Pre-Licensee Dashboard — `/dashboard`

**Menu**

- Home
- My Licenses
- Pre Licensing Applications
- Payments

**Responsibilities**

- Complete pre-licensing filings
- Respond to RFIs
- Settle fees

**Can do**

- Create pre-licensing applications
- Upload evidence
- Pay fees

**Cannot do**

- Access post-licensing services or regulatory returns (menu entries stay locked until an eligible licence exists)
- Access any internal surface

**Maker-checker:** Not applicable.

**Daily workflow**

1. Continue pre-licensing filings
2. Track application status

**Work queues**

- /dashboard
- /applications?type=pre

**Enforced by**

- licence entitlement gate (requiresLicenceEntitlement + DB write checks)
- portal access whitelist
- RLS

### Licensee Primary User (`licensee_primary`)

_External portal user · application roles: licensee_primary_

The accountable portal user for a licensed entity. Submits regulatory filings and service requests on the entity’s behalf.

**Starting dashboard:** Licensee Dashboard — `/dashboard`

**Menu**

- Home
- My Licenses
- License Requests
- Regulatory Returns
- Payments
- Correspondence
- Notifications

**Responsibilities**

- Keep entity information current
- File regulatory returns by the due date
- Submit post-licensing service requests for structural or governance change
- Settle assessed fees and penalties

**Can do**

- Edit and SUBMIT filings and requests
- Declare ownership/governance changes for regulatory approval
- Pay fees, view receipts, view penalty notices
- Respond to RFIs

**Cannot do**

- See other entities’ data
- See internal supervisory assessments, internal AI governance or enforcement internals
- Approve its own regulatory request (approval is a regulator function)
- Edit an accepted filing (amendment is a governed process)

**Maker-checker:** Inside the entity, the primary user is the submitting authority. Regulator-side approval is always separate.

**Daily workflow**

1. Check return deadlines and notifications
2. Complete and submit filings
3. Respond to RFIs
4. Settle fees

**Work queues**

- /dashboard
- /entity/returns/dashboard
- /entity/complaint-rfis
- /notifications

**Enforced by**

- licensee access matrix
- entity membership + RLS
- governed intake/submission RPCs

### Licensee Secondary User (`licensee_secondary`)

_External portal user · application roles: licensee_secondary_

A delegated preparer for a licensed entity: prepares filings but cannot make the final submission where reserved.

**Starting dashboard:** Licensee Dashboard — `/dashboard`

**Menu**

- Home
- My Licenses
- Regulatory Returns
- Payments

**Responsibilities**

- Prepare filings and gather evidence
- Keep drafts accurate and complete

**Can do**

- Create/edit drafts
- Upload documents
- View fees and filings

**Cannot do**

- Submit where submission is reserved to the primary user
- Manage entity web users
- Approve anything

**Maker-checker:** Preparer only. The primary user performs the entity declaration/submission.

**Daily workflow**

1. Prepare drafts
2. Collect evidence
3. Hand over to the primary user for submission

**Work queues**

- /dashboard
- /entity/returns

**Enforced by**

- licensee access matrix (primary vs secondary capability)
- submission RPC authority checks

## Entity 360

### Group — Identity & authorisation



### Group — Ownership & control



### Group — Reporting & obligations



### Group — Prudential & risk



### Group — Conduct & financial crime



### Group — Supervisory action



### Group — Records & provenance



### Identity (`identity`)

_Group: identity · audience: any · status: AVAILABLE_

The canonical record of who the entity is: registered and trading names, statutory identifiers issued by other authorities, and the verification state of each identifier.

**Question answered:** Am I looking at the right legal person, and has its identity been verified?

**Why it matters:** Identity is the anchor for every other record. Misidentification breaks attribution of filings, payments, ownership and enforcement, and is the most common cause of supervisory error.

**As-at behaviour:** Supports the As At date control: selecting a historical date replays the state that was recorded as at that date, rather than showing today’s values.

**Source of information**

- Registration & onboarding (F3)
- Licensing decisions (F4)
- Governed entity-change requests (F5)

**Important fields**

- `Name` — The name recorded as at the selected date, not simply the latest name.
- `Identifier type / Identifier` — External statutory identifiers such as company or tax registration numbers.
- `Issued by` — The authority that issued the identifier — the basis for cross-authority matching.
- `Verification` — Whether the regulator has verified the identifier against source evidence.
- `Valid from / Valid to` — The period the identifier or name was in force.

**How to interpret**

- An unverified identifier is not an error in itself, but it weakens every downstream match.
- Multiple historical names usually indicate a rebrand or restructure — check Group relationships and Regulatory requests for the change that caused it.

**What to investigate**

- Names changed shortly before an application, filing deadline or enforcement action.
- Identifiers that remain unverified long after licensing.
- The same identifier appearing on more than one entity record.

**Related processes**

- Registration & Onboarding — `/help/user-manual#registration`
- Post-Licensing Services — `/help/user-manual#post-licensing`

### Licences (`licences`)

_Group: identity · audience: any · status: AVAILABLE_

Every authorisation the entity holds or has held, with scope, conditions, regulator and validity period.

**Question answered:** What is this firm actually allowed to do, on whose authority, and until when?

**Why it matters:** The licence defines the regulatory perimeter. Activity outside scope, or after expiry, is unauthorised business.

**As-at behaviour:** Supports the As At date control: selecting a historical date replays the state that was recorded as at that date, rather than showing today’s values.

**Source of information**

- Licensing decisions (F4)
- Licence lifecycle events — renewal, variation, suspension, revocation (F5)

**Important fields**

- `Licence number` — The public authorisation reference used on the register and in correspondence.
- `Type / Permitted scope` — The regulated activities authorised — the perimeter test.
- `Licence status` — Issued, active, in grace, suspended, lapsed or revoked.
- `Conditions` — Count of binding conditions attached to the authorisation.
- `Effective from / Expires` — Validity window driving renewal obligations and grace handling.

**How to interpret**

- A licence in grace still authorises activity, but a renewal obligation is already overdue.
- Conditions greater than zero means the licence must be read together with its condition schedule before judging compliance.

**What to investigate**

- Activity or filings that imply business outside the permitted scope.
- Repeated short-notice renewals or repeated variations of scope.
- Suspensions followed quickly by new applications elsewhere in the group.

**Related processes**

- Licensing & Authorisation — `/help/user-manual#licensing`
- Post-Licensing Services — `/help/user-manual#post-licensing`

### Business profile (`business_profile`)

_Group: identity · audience: any · status: AVAILABLE_

The activities, products, distribution channels and jurisdictions through which the firm actually operates.

**Question answered:** What business is this firm really doing, and where?

**Why it matters:** Business model drives inherent risk. Comparing the declared model with the authorised scope is the fastest way to detect perimeter drift.

**As-at behaviour:** Supports the As At date control: selecting a historical date replays the state that was recorded as at that date, rather than showing today’s values.

**Source of information**

- Licence application forms (F4)
- Post-licensing change requests (F5)
- Periodic returns (F7)

**Important fields**

- `Activity / Product` — What is sold and under which regulated activity heading.
- `Channel` — How customers are reached — branch, agent, digital, intermediary.
- `Jurisdiction` — Where the business is conducted, driving cross-border considerations.
- `From / To` — When each line of business started and, if applicable, ceased.

**How to interpret**

- New products or channels appearing without a corresponding approved change request is a supervisory flag.
- Jurisdictions outside the licensed footprint require an explicit basis.

**What to investigate**

- Products present in returns data but absent from the profile.
- Digital or agent channels introduced without notification.

**Related processes**

- Post-Licensing Services — `/help/user-manual#post-licensing`
- Regulatory Returns — `/help/user-manual#returns`

### Ownership (`ownership`)

_Group: ownership · audience: any · status: AVAILABLE_

The shareholding and control register: who holds economic interest, who holds voting rights, who is a controller, and who is recorded as a beneficial owner.

**Question answered:** Who owns this firm, in what proportions, and who can actually direct it?

**Why it matters:** Ownership determines who must be assessed as fit and proper, who can extract value from the firm and who is accountable when things fail.

**As-at behaviour:** Supports the As At date control: selecting a historical date replays the state that was recorded as at that date, rather than showing today’s values.

**Source of information**

- Governed ownership change sets with maker-checker approval (F8A-B1)
- Licence application ownership disclosures (F4)

**Important fields**

- `Owner / Owner type` — The holder, which may be a person, an organisation, a trust, a foundation or a partnership.
- `Economic %` — Share of economic benefit.
- `Voting %` — Share of voting power — the control measure, which can differ sharply from economic interest.
- `Direct` — Whether the holding is held directly in this entity or through an intermediate layer.
- `Controller` — Whether the holder is treated as a controller for regulatory purposes.
- `Recorded UBO` — A beneficial owner as declared/recorded — distinct from the calculated UBO result.
- `Approval` — Whether the ownership position has passed governed maker-checker approval.
- `Source` — Where the record came from — application, change set, or migration.

**How to interpret**

- Recorded UBO is a declaration. The calculated UBO in Ownership & UBO analysis is derived deterministically from the ownership ledger and may differ — that difference is itself supervisory information.
- A large voting percentage with a small economic percentage indicates control disproportionate to investment.
- Positions in a proposed or pending approval state are not yet canonical.

**What to investigate**

- Holdings kept just below a notification or approval threshold.
- Divergence between declared UBOs and the calculated UBO set.
- Ownership changes not accompanied by a fit & proper assessment.

**Related processes**

- Ownership, Control & UBO — `/help/user-manual#ownership-ubo`
- Post-Licensing Services — `/help/user-manual#post-licensing`

### Governance (`governance`)

_Group: ownership · audience: any · status: AVAILABLE_

Directors, senior officers and other approved appointments, with appointment and cessation dates.

**Question answered:** Who runs this firm day to day, and were those people approved?

**Why it matters:** Governance quality is a leading indicator. Board turnover, vacancies in control functions and unapproved appointments frequently precede failure.

**As-at behaviour:** Supports the As At date control: selecting a historical date replays the state that was recorded as at that date, rather than showing today’s values.

**Source of information**

- Appointment and change-of-officer requests (F5)
- Fit & proper assessments (F9)

**Important fields**

- `Individual / Role` — The person and the position held.
- `Approval` — Whether the appointment has regulatory approval where approval is required.
- `Appointed / Ceased` — Tenure, which drives turnover analysis.
- `Executive` — Distinguishes executive management from non-executive oversight.

**How to interpret**

- A vacant or long-unfilled control function (compliance, risk, AML) is a material concern even when every other indicator is clean.
- Short average tenure across several officers suggests instability or dominance by a controller.

**What to investigate**

- Officers acting before approval was granted.
- Simultaneous resignations of independent directors.
- The same individual holding key roles across several regulated entities.

**Related processes**

- Post-Licensing Services — `/help/user-manual#post-licensing`
- Ownership, Control & UBO — `/help/user-manual#ownership-ubo`

### Group relationships (`relationships`)

_Group: ownership · audience: any · status: AVAILABLE_

Parents, subsidiaries, affiliates and other recorded structural relationships, with direction and validity.

**Question answered:** What group does this firm belong to, and what sits above and below it?

**Why it matters:** Group structure carries contagion risk, intra-group exposure and the potential to obscure control behind layers.

**As-at behaviour:** Supports the As At date control: selecting a historical date replays the state that was recorded as at that date, rather than showing today’s values.

**Source of information**

- Canonical relationship ledger (F8A-B1)
- Licence application group disclosures (F4)

**Important fields**

- `Related party / Party type` — The counterparty in the relationship and its legal nature.
- `Relationship` — Parent, subsidiary, affiliate or other recorded structural link.
- `Direction` — Whether the related party sits above or below this entity.
- `Source` — Provenance of the relationship record.

**How to interpret**

- Relationships are recorded facts, not inferences. Indirect control is calculated separately in Ownership & UBO analysis.
- A related party that is itself regulated may be outside your supervisory scope and will then be shown as a restricted boundary.

**What to investigate**

- Layers of holding companies in opaque jurisdictions with no operating purpose.
- Relationships terminated immediately before a supervisory event.

**Related processes**

- Ownership, Control & UBO — `/help/user-manual#ownership-ubo`

### Fit & proper (`fit_and_proper`)

_Group: ownership · audience: any · status: AVAILABLE_

Assessment outcomes for controllers and senior individuals, with determination and recorded rationale.

**Question answered:** Have the people who own and run this firm been assessed, and what was decided?

**Why it matters:** Fit & proper is the gate that keeps unsuitable persons out of regulated positions and is a precondition for several licensing and post-licensing outcomes.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Fit & proper assessments (F9)
- Post-licensing nomination linkage (F5-B4)

**Important fields**

- `Individual / Proposed role` — Who was assessed and for what position.
- `Assessment` — Where the assessment has reached in its workflow.
- `Determination` — The outcome recorded by the authorised decision-maker.
- `Submitted / Determined` — The elapsed assessment time, relevant to SLA performance.
- `Rationale` — The recorded reasoning that makes the determination defensible.

**How to interpret**

- An open assessment blocks the dependent post-licensing effect — approval is fail-closed, not advisory.
- A determination without rationale is an evidence gap and should be raised.

**What to investigate**

- Individuals in post while an assessment remains open.
- Adverse media handled by an AI reading with no officer verification recorded.

**Related processes**

- Licensing & Authorisation — `/help/user-manual#licensing`
- AI Governance — `/help/user-manual#ai-governance`

### Return filings (`returns`)

_Group: obligations · audience: any · status: AVAILABLE_

The filing history against every reporting obligation, by period, with status, due date and version.

**Question answered:** Has this firm filed what it owes, on time, and how often has it had to correct itself?

**Why it matters:** Reporting discipline is the cheapest and most reliable early-warning signal available to a supervisor.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Regulatory returns lifecycle (F7)
- Obligation generation from licence and sector configuration

**Important fields**

- `Return / Period` — Which return and which reporting period.
- `Filing status` — Draft, submitted, under review, accepted, amended or overdue.
- `Due / Submitted` — The deterministic due date and the actual submission timestamp (UTC).
- `Version` — Amendment count — each amendment is a new version with its own evidence.

**How to interpret**

- Overdue status is calculated deterministically from the obligation due date; late fees are owned by the fees module, not the returns module.
- Rising version numbers on the same period indicate data-quality problems at source.

**What to investigate**

- Persistent last-day filing followed by amendment.
- Extensions requested repeatedly for the same return.
- Periods with no obligation generated where the licence implies one.

**Related processes**

- Regulatory Returns — `/help/user-manual#returns`
- Fees & Payments — `/help/user-manual#fees-payments`

### Prudential (`prudential`)

_Group: risk · audience: internal · status: AVAILABLE_

Capital, liquidity and asset-quality metrics assessed against the applicable prudential requirements.

**Question answered:** Is this firm financially sound, and where is it close to a limit?

**Why it matters:** Prudential breach is the trigger for the most intrusive supervisory tools available.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Prudential supervision monitoring sweeps (F8)
- Financial returns data (F7)

**Important fields**

- `Metric` — The prudential indicator being measured.
- `Value vs threshold` — The reported position against the configured requirement.
- `Breach state` — Whether a threshold has been crossed and a breach recorded.
- `As of period` — The reporting period the metric belongs to.

**How to interpret**

- Metrics are computed deterministically from filed data — the AI prudential narrative only describes them and proposes no rating.
- A near-threshold trend over several periods usually matters more than a single breach.

**What to investigate**

- Metrics that improve sharply only in the final reporting period before a deadline.
- Breaches with no corresponding supervisory action recorded.

**Related processes**

- AI Governance — `/help/user-manual#ai-governance`
- Regulatory Returns — `/help/user-manual#returns`

### Risk rating (`risk`)

_Group: risk · audience: internal · status: AVAILABLE_

The composite supervisory risk score and band, together with the drivers behind it.

**Question answered:** How risky is this firm relative to the rest of the portfolio, and why?

**Why it matters:** Risk rating drives supervisory intensity, cycle length and resource allocation.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Supervisory risk model configuration
- Prudential, conduct and compliance inputs

**Important fields**

- `Composite score / band` — The overall rating and the band it falls into.
- `Drivers` — The components contributing most to the score.
- `Last assessed` — Whether the rating is current or stale.

**How to interpret**

- Rating is a supervisory judgement supported by deterministic inputs; it is not an AI output.
- A stale rating on a firm whose profile has changed is itself a finding.

**What to investigate**

- Band changes without a recorded supervisory rationale.
- Firms whose drivers have deteriorated but whose band has not moved.

**Related processes**

- Analytics & Reporting — `/help/user-manual#analytics`

### Supervision (`supervision`)

_Group: risk · audience: internal · status: AVAILABLE_

The assigned supervisor, the supervisory plan cycle and the actions outstanding against it.

**Question answered:** Who owns this firm inside the regulator, and what have we committed to do?

**Why it matters:** Clear ownership and a live plan are the difference between supervision and observation.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Entity supervision assignments
- Supervisory plans and actions (F8)

**Important fields**

- `Assigned supervisor` — The accountable officer; also determines scoped visibility.
- `Plan cycle` — The supervisory period the plan covers.
- `Outstanding actions` — Committed activities not yet completed.

**How to interpret**

- Supervisory assignment also affects who can see this entity — scope is enforced server-side.
- Overdue plan actions on a high-risk firm are an escalation trigger.

**What to investigate**

- High-risk firms with no assigned supervisor.
- Plans that roll forward unchanged year after year.

**Related processes**

- Thematic & Supervisory Reviews — `/help/user-manual#thematic-reviews`

### Market conduct (`market_conduct`)

_Group: conduct · audience: internal · status: AVAILABLE_

Complaints, conduct alerts and recorded customer-outcome issues affecting this firm.

**Question answered:** Is this firm treating its customers fairly?

**Why it matters:** Conduct failure damages consumers directly and is often visible long before it appears in prudential numbers.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Complaint management (F-complaints)
- Conduct monitoring and thematic work

**Important fields**

- `Issue / Alert` — The conduct matter recorded.
- `Volume and trend` — Complaint counts against portfolio norms.
- `Outcome` — How matters were resolved and whether redress was made.

**How to interpret**

- Compare complaint volume to customer base, not to other firms in absolute terms.
- Cross-entity narrative commentary here is AI-assisted and must be verified before use.

**What to investigate**

- Clusters of complaints about one product or channel.
- Complaints resolved without redress where harm is evident.

**Related processes**

- Complaints — `/help/user-manual#complaints`
- Market Conduct — `/help/user-manual#market-conduct`

### AML/CFT (`aml`)

_Group: conduct · audience: internal · status: AVAILABLE_

The financial-crime risk assessment of the firm and the open findings against it.

**Question answered:** How exposed is this firm to money laundering and terrorist financing, and is it managing it?

**Why it matters:** AML/CFT failure carries international consequences well beyond the individual firm.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- AML risk assessment
- Examination findings (F8)

**Important fields**

- `Inherent risk / residual risk` — Exposure before and after the firm’s controls.
- `Open findings` — Deficiencies not yet remediated.
- `Remediation due` — Committed closure dates.

**How to interpret**

- A low residual risk depends entirely on control effectiveness evidence being current.

**What to investigate**

- Overdue remediation.
- Residual risk reduced without evidence of control testing.

**Related processes**

- Investigations & Enforcement — `/help/user-manual#investigations`

### AML restricted (`aml_confidential`)

_Group: conduct · audience: internal · status: AVAILABLE_

Restricted financial-crime intelligence, visible only to cleared staff.

**Question answered:** Is there sensitive intelligence about this firm that only cleared officers may see?

**Why it matters:** Some financial-crime material cannot be shared with the firm or with uncleared staff without prejudicing action.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Restricted intelligence records held under additional access control

**Important fields**

- `Restricted record` — The intelligence item, shown only where clearance permits.
- `Clearance basis` — Why the viewer is permitted to see it.

**How to interpret**

- Absence of content does not mean absence of intelligence — it may mean the viewer is not cleared.
- Visibility is enforced server-side; the manual’s persona filter is documentation only.

**What to investigate**

- Nothing should be exported from this section without an explicit handling decision.

**Related processes**

- Investigations & Enforcement — `/help/user-manual#investigations`

### Operational resilience (`resilience`)

_Group: conduct · audience: internal · status: AVAILABLE_

Outsourcing arrangements, critical service providers and recorded operational incidents.

**Question answered:** Can this firm keep delivering critical services, and what depends on third parties?

**Why it matters:** Concentration on a shared provider turns a single vendor failure into a market-wide event.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Outsourcing notifications (F5)
- Incident reporting

**Important fields**

- `Provider / service` — The third party and the function it performs.
- `Criticality` — Whether the service is material to continuity.
- `Incidents` — Recorded outages and their impact.

**How to interpret**

- Compare providers across your portfolio — concentration is only visible in aggregate.

**What to investigate**

- Critical outsourcing with no notification on file.
- Repeat incidents with the same provider.

**Related processes**

- Post-Licensing Services — `/help/user-manual#post-licensing`

### Examinations (`examinations`)

_Group: oversight · audience: internal · status: AVAILABLE_

Onsite and offsite examinations performed on the firm, with their findings and closure state.

**Question answered:** What have we examined, what did we find, and has it been fixed?

**Why it matters:** Examination findings are the evidentiary backbone of later enforcement.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Examination programme (F8)
- Thematic reviews

**Important fields**

- `Examination / scope` — What was examined and how.
- `Findings` — Deficiencies raised, with severity.
- `Closure state` — Whether remediation has been accepted.

**How to interpret**

- Repeat findings across cycles indicate a governance failure, not an isolated control gap.

**What to investigate**

- Findings closed without evidence.
- Long gaps since the last examination on a high-risk firm.

**Related processes**

- Thematic & Supervisory Reviews — `/help/user-manual#thematic-reviews`

### Enforcement (`enforcement`)

_Group: oversight · audience: internal · status: AVAILABLE_

Directions, sanctions and monetary penalties issued to the firm.

**Question answered:** What formal action has the regulator taken, and has the firm complied?

**Why it matters:** Enforcement is the credibility of the regime; it must be accurate, currency-correct and defensible.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Enforcement workspace
- Penalty register with server-authoritative currency resolution

**Important fields**

- `Action / direction` — What was required of the firm.
- `Penalty amount and currency` — The monetary sanction in the regulator’s resolved base currency, with provenance.
- `Compliance state` — Whether the direction has been complied with.

**How to interpret**

- Penalty currency is resolved server-side from the regulator’s configuration; displayed currency carries provenance.
- An unpaid penalty appears in the fees and payments ledger, not only here.

**What to investigate**

- Directions past their compliance date.
- Penalties recorded but never settled.

**Related processes**

- Investigations & Enforcement — `/help/user-manual#investigations`
- Fees & Payments — `/help/user-manual#fees-payments`

### Regulatory requests (`regulatory_requests`)

_Group: oversight · audience: any · status: AVAILABLE_

Information requests issued to the firm and controlled change submissions made by it.

**Question answered:** What is currently open between the regulator and this firm?

**Why it matters:** Open requests are the live workload of supervision and the clearest SLA measure on both sides.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Post-licensing service requests (F5)
- RFIs raised in licensing, returns and complaints

**Important fields**

- `Request type` — Information request or controlled change.
- `Status` — Open, responded, closed or overdue.
- `Due date` — The response deadline driving escalation.

**How to interpret**

- A controlled change request that has been approved will have produced a governed post-approval effect elsewhere in the profile.

**What to investigate**

- Overdue responses.
- Approved changes with no corresponding effect recorded.

**Related processes**

- Post-Licensing Services — `/help/user-manual#post-licensing`

### Documents (`documents`)

_Group: records · audience: any · status: AVAILABLE_

The evidence on file for this entity, with version and validity.

**Question answered:** What documentary evidence do we hold, and is it still valid?

**Why it matters:** Evidence that cannot be produced later is evidence the regulator does not have.

**As-at behaviour:** Supports the As At date control: selecting a historical date replays the state that was recorded as at that date, rather than showing today’s values.

**Source of information**

- Secure document storage across registration, licensing, returns and supervision

**Important fields**

- `Document / type` — What the evidence is and which process produced it.
- `Version` — Superseded documents remain available for audit.
- `Validity` — Expiry-bearing documents such as certificates and attestations.

**How to interpret**

- Access is through short-lived signed links; the access itself is audited.

**What to investigate**

- Expired mandatory documents.
- Evidence replaced immediately before an examination.

**Related processes**

- Audit & Evidence — `/help/user-manual#audit-evidence`

### Correspondence (`correspondence`)

_Group: records · audience: any · status: AVAILABLE_

The formal communications exchanged with the entity, as a single thread history.

**Question answered:** What have we formally said to this firm, and what has it said to us?

**Why it matters:** Regulatory action depends on being able to prove the firm was told, when and in what terms.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Correspondence threads
- Notification delivery records

**Important fields**

- `Thread / subject` — The matter under discussion.
- `Direction` — Outbound from the regulator or inbound from the firm.
- `Sent / received (UTC)` — The timestamps that establish notice.

**How to interpret**

- Delivery failure of a formal notice is a material fact — check the delivery record, not just the send record.

**What to investigate**

- Unanswered formal correspondence.
- Notices with failed delivery.

**Related processes**

- Correspondence & Cases — `/help/user-manual#correspondence`

### Provenance (`provenance`)

_Group: records · audience: internal · status: AVAILABLE_

The record of where each canonical value came from, who changed it, and when.

**Question answered:** Why does the profile say what it says, and on whose authority?

**Why it matters:** Provenance is what makes the profile defensible in an appeal, a tribunal or an external assessment.

**As-at behaviour:** Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.

**Source of information**

- Change sets, governed RPCs and the audit trail across all modules

**Important fields**

- `Value / field` — The canonical item whose history is shown.
- `Source process` — The governed process that wrote it.
- `Actor and UTC timestamp` — Who acted and exactly when.
- `Reason` — The rationale recorded at the time of the change.

**How to interpret**

- Every canonical change has a governed writer; direct database edits by users are not possible from the browser.
- A value with no provenance entry predates canonical governance and should be treated as unverified.

**What to investigate**

- Values changed outside a recognised process.
- Changes without a recorded reason.

**Related processes**

- Audit & Evidence — `/help/user-manual#audit-evidence`

## AI and human-controlled governance

Every AI surface is advisory. AI never approves, prices, rates, scores or files anything — a named person makes and owns every regulatory decision.

**Automation classification**

- **DETERMINISTIC AUTOMATION** — Rules and mathematics executed by the server. Same inputs always produce the same output, and the output is reproducible and auditable. This is NOT AI. (e.g. Ownership traversal and UBO percentage mathematics; Return due-date generation and overdue calculation; Fee assessment, late-fee tiers and FX conversion at an effective-dated rate; Workflow routing and approval-authority resolution)
- **AI-ASSISTED** — A language model drafts narrative, summaries, observations or questions from data the platform already holds. The output is advisory, must be reviewed by a human, and never becomes canonical by itself. (e.g. Application assessment observations; Prudential and supervisory analysis narratives; Conduct intelligence and management-reporting drafting; Fit & proper media reading summaries)
- **HUMAN DECISION** — A determination made by an authorised officer and recorded with rationale. Authority comes from the decision-authority matrix and is enforced server-side under maker-checker. (e.g. Registration acceptance, licence approval and refusal; Fit & proper determinations; Risk ratings, enforcement action and penalties; Waivers, refunds and amendment acceptance)

**Claims that must never be made**

- AI does not autonomously issue regulatory decisions.
- AI does not replace maker-checker; approval authority is unchanged and enforced server-side.
- UBO and ownership mathematics is deterministic, not AI.
- Do not claim predictive accuracy, hit rates or model performance without measured evidence.
- Do not describe deterministic rules (due dates, fees, FX, routing, traversal) as AI.
- Do not present unfinished or placeholder AI capability as operational.
- Do not claim AI can alter canonical regulatory data — every surface has authoritative_write_path = NONE.
- Do not present the output as a regulatory finding, decision, rating or determination, and do not claim accuracy figures that have not been measured.

### Application assessment support (`APPLICATION_ASSESSMENT`)

_Module: application_management · audience: internal · status: AVAILABLE · route `/applications/queue`_

Highlights points in a submitted licence application that an assessor may wish to consider, so nothing obvious is missed on a first read.

**Input**

- Submitted application forms and declared data
- Attached document metadata
- Sector and licence-type context

**Output**

- Observations and points to consider
- Questions an assessor may wish to raise as an RFI

**Confidence:** No numeric confidence score is produced. Treat every observation as a prompt for officer verification.

**Explanation:** Observations reference the application content they were drawn from, so the assessor can check each one against the filing.

**Human control**

- The assessor reads the observations alongside the application; nothing is pre-filled into the assessment record.
- The assessor decides what, if anything, becomes an RFI or an assessment finding.

**Decision authority:** HUMAN DECISION. Recommendation and approval remain with the assessing officer and an independent approver under maker-checker.

**Provenance**

- Approved model recorded on the surface
- Instructions resolved server-side in the edge function
- Invocation logged in the AI activity ledger

**Failure behaviour:** If the model is unavailable the assessment proceeds normally without observations. Assessment never depends on AI availability.

**Governance**

- Registered in the AI surface registry with an advisory classification and lifecycle state.
- Bound to an approved model in the AI model registry.
- Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.
- Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.
- No authoritative write path — the surface cannot alter canonical regulatory data.

### Prudential analysis narrative (`PRUDENTIAL_ANALYSIS`)

_Module: prudential_supervision · audience: internal · status: AVAILABLE · route `/supervision/prudential`_

Drafts a narrative reading of already-computed prudential indicators so a supervisor can prepare analysis faster.

**Input**

- Deterministically computed prudential metrics and thresholds
- Reporting period context

**Output**

- Narrative reading of the recorded indicators
- Movement explanations and suggested lines of enquiry

**Confidence:** No confidence score. The metrics are deterministic; only the wording is generated.

**Explanation:** The narrative names the metrics and periods it describes so each statement is checkable against the figures.

**Human control**

- Supervisor reviews and edits the wording before it is used in any supervisory product.

**Decision authority:** HUMAN DECISION. The surface proposes no rating and takes no supervisory action.

**Provenance**

- Approved model on the surface
- Server-side instruction resolution
- AI activity ledger entry per invocation

**Failure behaviour:** The prudential dashboard and metrics remain fully available; only the narrative is absent.

**Governance**

- Registered in the AI surface registry with an advisory classification and lifecycle state.
- Bound to an approved model in the AI model registry.
- Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.
- Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.
- No authoritative write path — the surface cannot alter canonical regulatory data.

### Supervisory analysis report (`SUPERVISORY_ANALYSIS`)

_Module: supervisory_intelligence · audience: internal · status: AVAILABLE · route `/governance/ai/activity`_

Drafts a supervisory analysis report from recorded supervisory data for officer review.

**Input**

- Recorded supervisory data for the selected entity or portfolio
- Period and scope selected by the officer

**Output**

- Draft analysis sections
- Observations and suggested follow-up

**Confidence:** No confidence score is claimed.

**Explanation:** Draft sections cite the supervisory records they summarise.

**Human control**

- The officer accepts, edits or discards the draft; nothing is published automatically.

**Decision authority:** HUMAN DECISION.

**Provenance**

- Approved model
- Server-side instructions
- AI activity ledger

**Failure behaviour:** Analysis is prepared manually; the underlying data views are unaffected.

**Governance**

- Registered in the AI surface registry with an advisory classification and lifecycle state.
- Bound to an approved model in the AI model registry.
- Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.
- Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.
- No authoritative write path — the surface cannot alter canonical regulatory data.

### Cross-entity supervisory intelligence advisory (`CROSS_ENTITY_INTELLIGENCE`)

_Module: market_conduct · audience: internal · status: AVAILABLE · route `/conduct/intelligence`_

Drafts narrative readings, movement explanations, questions and hypotheses over deterministic cross-entity conduct facts for supervisory review.

**Input**

- Deterministic cross-entity conduct facts and aggregates

**Output**

- Narrative readings
- Questions and hypotheses for supervisors to test

**Confidence:** No confidence score. Hypotheses are explicitly unproven and labelled as such.

**Explanation:** Each statement is tied to the deterministic fact set it was drawn from.

**Human control**

- A supervisor must test any hypothesis before it influences supervisory work.

**Decision authority:** HUMAN DECISION. The surface confirms no risk and changes no record.

**Provenance**

- Approved model
- Server-side instructions
- AI activity ledger

**Failure behaviour:** The deterministic conduct facts remain available without narrative.

**Governance**

- Registered in the AI surface registry with an advisory classification and lifecycle state.
- Bound to an approved model in the AI model registry.
- Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.
- Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.
- No authoritative write path — the surface cannot alter canonical regulatory data.

### Supervisory planning assistance (`SUPERVISORY_PLANNING_ASSISTANCE`)

_Module: market_conduct · audience: internal · status: AVAILABLE · route `/supervision/plans`_

Assists supervisors in drafting planning wording strictly from recorded supervisory information.

**Input**

- Recorded supervisory plan, coverage and risk information

**Output**

- Draft planning wording and coverage commentary

**Confidence:** No confidence score.

**Explanation:** Released instruction versions only, resolved server-side, so the drafting basis is reproducible.

**Human control**

- Mandatory human review before any wording enters an operational record.

**Decision authority:** HUMAN DECISION. Plan content and approval remain with the accountable supervisor.

**Provenance**

- Approved model
- Released instruction version recorded per invocation
- AI activity ledger

**Failure behaviour:** Planning continues manually.

**Governance**

- Registered in the AI surface registry with an advisory classification and lifecycle state.
- Bound to an approved model in the AI model registry.
- Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.
- Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.
- No authoritative write path — the surface cannot alter canonical regulatory data.

### Supervisory management reporting assistance (`MANAGEMENT_REPORTING_ASSISTANCE`)

_Module: market_conduct · audience: internal · status: AVAILABLE · route `/governance/ai/instructions`_

Assists supervisors in drafting management commentary strictly from deterministic supervisory management information: summarising the period, explaining recorded movements, narrating emerging risk reporting, commenting on recorded coverage and summarising an evidence pack.

**Input**

- Deterministic supervisory management information for the reported period

**Output**

- Draft management commentary sections
- Evidence-pack summary

**Confidence:** No confidence score.

**Explanation:** Released instruction versions only, resolved server-side.

**Human control**

- Mandatory human review before any wording is adopted into management reporting.

**Decision authority:** HUMAN DECISION.

**Provenance**

- Approved model
- Released instruction version
- AI activity ledger

**Failure behaviour:** Management reporting is drafted manually from the same deterministic figures.

**Governance**

- Registered in the AI surface registry with an advisory classification and lifecycle state.
- Bound to an approved model in the AI model registry.
- Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.
- Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.
- No authoritative write path — the surface cannot alter canonical regulatory data.

### Fit and proper media reading (`FP_MEDIA_READING`)

_Module: fit_and_proper · audience: internal · status: AVAILABLE · route `/fit-and-proper/individuals`_

Summarises openly available media material gathered during fit-and-proper screening so an officer can verify it efficiently.

**Input**

- Openly available media material supplied to the screening process

**Output**

- Summary of the material and the points an officer should verify

**Confidence:** No confidence score, and no assertion that the material is true, relevant or about the correct individual.

**Explanation:** Each summary point references the source material it came from.

**Human control**

- The officer verifies identity and relevance before any of it informs an assessment.

**Decision authority:** HUMAN DECISION. The surface records no finding and no determination.

**Provenance**

- Approved model
- Server-side instructions
- AI activity ledger

**Failure behaviour:** Screening proceeds with manual review of the material.

**Governance**

- Registered in the AI surface registry with an advisory classification and lifecycle state.
- Bound to an approved model in the AI model registry.
- Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.
- Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.
- No authoritative write path — the surface cannot alter canonical regulatory data.

### Dashboard observations (`DASHBOARD_INSIGHTS`)

_Module: analytics · audience: internal · status: AVAILABLE · route `/analytics/ai-insights`_

Suggests observations on dashboard figures to speed up interpretation.

**Input**

- Deterministically computed dashboard aggregates

**Output**

- Short observations on movements and outliers

**Confidence:** No confidence score. The figures themselves are deterministic.

**Explanation:** Observations name the metric and period they refer to.

**Human control**

- Observations are commentary only and are never stored as supervisory findings.

**Decision authority:** HUMAN DECISION.

**Provenance**

- Approved model
- Server-side instructions
- AI activity ledger

**Failure behaviour:** The dashboard renders all figures without commentary.

**Governance**

- Registered in the AI surface registry with an advisory classification and lifecycle state.
- Bound to an approved model in the AI model registry.
- Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.
- Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.
- No authoritative write path — the surface cannot alter canonical regulatory data.

## End-to-end journeys

### A — Registration → Licensing → Entity 360

_Audience: any · status: AVAILABLE · modules: F3 Registration → F4 Licensing → F6 Fees & Payments → F9 Fit & proper → Entity 360_

Show how an unknown applicant becomes a known, authorised regulated entity with a complete supervisory profile, without a single value being typed directly into the database.

**Steps**

1. **applicant** — Register on the public portal, verify email by OTP and submit the onboarding wizard. (`/register`) → Registration submitted with a reference and an SLA clock. _[NO AI]_
2. **licensing_officer** — Review the registration for identity and completeness; raise a query if needed. (`/admin/registration-review`) → Registration recommended for acceptance, with recorded notes. _[NO AI]_
3. **supervisor** — Independently accept the registration. (`/admin/registration-review`) → Identity established; portal account provisioned with a temporary password and forced change. _[HUMAN DECISION]_
4. **applicant** — Sign in, create a licence application and complete every mandatory form. (`/applications/new`) → All forms marked complete; nominated individuals recorded for fit & proper. _[NO AI]_
5. **system** — Assess the application fee from the configured schedule. → Server-authoritative assessment of record created in the applicant currency. _[DETERMINISTIC AUTOMATION]_
6. **applicant** — Pay the assessed fee and submit the application. (`/applications`) → Receipt issued by a governed function; submission accepted only after server-side re-verification. _[DETERMINISTIC AUTOMATION]_
7. **licensing_officer** — Assess the application, optionally reading the advisory AI observations, and raise RFIs. (`/applications/queue`) → Assessment findings and officer recommendation recorded. _[AI-ASSISTED]_
8. **legal_compliance** — Complete fit & proper determinations for nominated individuals. (`/fit-and-proper/individuals`) → Determinations recorded with rationale. _[HUMAN DECISION]_
9. **supervisor** — Take the licensing decision as an independent approver. (`/applications/queue`) → Licence issued with number, scope, conditions and validity; notification and certificate produced. _[HUMAN DECISION]_
10. **supervisor** — Open Entity 360 for the new licensee. (`/admin/licensees`) → Identity, licences, business profile, ownership, governance, documents and provenance are all populated from the processes above. _[NO AI]_

**Evidence**

- Registration payload and versions
- Application form versions and documents
- Assessment of record, payment and receipt
- Fit & proper determinations
- Decision record with rationale
- Audit trail of every transition

### B — Post-Licence Structural Change

_Audience: any · status: AVAILABLE · modules: F5 Post-licensing services → F9 Fit & proper → F8A Relationship foundation → Entity 360_

Show that changes after licensing are controlled regulatory events which produce governed effects on the canonical record — not free-text edits.

**Steps**

1. **licensee_primary** — Open the post-licence service catalogue and start the applicable change request. (`/post-license/new`) → Governed intake context created; only services applicable to the licence and taxonomy are offered. _[DETERMINISTIC AUTOMATION]_
2. **licensee_primary** — Complete the service forms, nominate any individuals, attach evidence and pay any assessed fee. (`/applications`) → Request submitted; server re-verifies completeness, eligibility and fee settlement. _[NO AI]_
3. **system** — Resolve the workflow route and the required approval authority. → Request routed to the correct queue; the effect plan is resolved from the canonical service→effect mapping. _[DETERMINISTIC AUTOMATION]_
4. **licensing_officer** — Assess the request and record a recommendation. (`/licensing/regulatory-requests`) → Recommendation recorded; any fit & proper blocker is visible and fail-closed. _[HUMAN DECISION]_
5. **legal_compliance** — Complete any required fit & proper determination for the nominated subject. (`/fit-and-proper/individuals`) → Linkage satisfied, or the approval remains blocked. _[HUMAN DECISION]_
6. **supervisor** — Approve the request as an independent authority. (`/licensing/regulatory-requests`) → Approval recorded with rationale. _[HUMAN DECISION]_
7. **system** — Execute the post-approval effect plan idempotently. → Canonical effect applied — licence variation, officer change, establishment opening/closure or entity change — with an effect-ledger entry and provenance. _[DETERMINISTIC AUTOMATION]_
8. **supervisor** — Verify the change in Entity 360 and step the As At date back. (`/admin/licensees`) → The new position is canonical; the prior position is still replayable historically. _[NO AI]_

**Evidence**

- Service request and forms
- Fee assessment and receipt where applicable
- Fit & proper determination
- Approval record with rationale
- Effect ledger entry and acknowledgement
- Provenance entries for every changed value

### C — Regulatory Returns

_Audience: any · status: AVAILABLE · modules: F7 Regulatory returns → F6 Fees & Payments (late fees) → Entity 360_

Show the full reporting cycle: obligation generation, filing, validation, review, amendment and overdue handling with deterministic dates.

**Steps**

1. **system** — Generate obligations from the return configuration, period end and cutoff. → Obligations with deterministic due dates and a regulator snapshot appear in the entity calendar. _[DETERMINISTIC AUTOMATION]_
2. **licensee_primary** — Open the obligation and complete the return, saving progress. (`/returns/obligations`) → Draft saved with auto-save; calculated fields evaluated by the safe arithmetic parser. _[DETERMINISTIC AUTOMATION]_
3. **licensee_primary** — Submit the return. (`/returns/obligations`) → Server-side validation runs; an immutable submitted version and a currency snapshot are recorded. _[DETERMINISTIC AUTOMATION]_
4. **analyst** — Review the filing in the returns queue and raise an RFI if data quality is inadequate. (`/returns/queue`) → RFI issued with a deadline, or the filing is recommended for acceptance. _[HUMAN DECISION]_
5. **supervisor** — Independently accept the filing. (`/returns/queue`) → Filing accepted under maker-checker; the obligation is satisfied. _[HUMAN DECISION]_
6. **licensee_primary** — File an amendment for a corrected figure. (`/returns/obligations`) → New version created; the prior version and its schema remain intact for audit. _[NO AI]_
7. **system** — Run the overdue sweep for unfiled obligations. → Overdue status set deterministically; late fees are raised by the fees module, which owns them. _[DETERMINISTIC AUTOMATION]_
8. **supervisor** — Open Entity 360 → Return filings. (`/admin/licensees`) → The whole filing history, versions and timeliness picture is visible in one place. _[NO AI]_

**Evidence**

- Immutable submitted versions
- Validation results
- RFI thread and responses
- Extension approvals where granted
- Acceptance record under maker-checker

### D — Fees / Payment / Receipt / Currency

_Audience: any · status: AVAILABLE · modules: F6 Fees, payments & multi-currency → F4 Licensing → F7 Returns (late fees) → Enforcement penalties_

Show that money is handled as an immutable ledger with a server-authoritative assessment of record, governed receipts and effective-dated FX.

**Steps**

1. **system** — Resolve the applicable fee from the schedule and raise the assessment of record. → Assessment created server-side with itemised breakdown; the browser cannot price anything. _[DETERMINISTIC AUTOMATION]_
2. **licensee_primary** — Open the outstanding balance and review the itemised breakdown. (`/payments`) → Authoritative outstanding balance displayed in the correct currency. _[DETERMINISTIC AUTOMATION]_
3. **licensee_primary** — Pay through the payment surface (simulated gateway in demo environments). (`/payments`) → Payment recorded as a ledger entry; the ledger is append-only. _[NO AI]_
4. **system** — Issue the receipt through the governed receipt-issuance function. → Receipt minted server-side; the browser cannot mint receipts. _[DETERMINISTIC AUTOMATION]_
5. **admin** — Reconcile an offline payment in the finance panel. (`/payments`) → Reconciliation recorded against the authoritative outstanding balance. _[HUMAN DECISION]_
6. **admin** — Approve a waiver or refund within the configured caps. (`/admin/fee-management`) → Governed reversal recorded with reason; value capping and admin-only approval enforced server-side. _[HUMAN DECISION]_
7. **analyst** — View reporting in the entity reporting currency. (`/analytics`) → Amounts converted at the effective-dated FX rate, with the source rate and base currency shown as provenance. _[DETERMINISTIC AUTOMATION]_

**Evidence**

- Assessment of record and itemised breakdown
- Append-only ledger entries
- Server-issued receipts
- Waiver/refund approvals with reasons
- FX rate and provenance on every converted figure

### E — Complaint → Investigation / Supervisory Action

_Audience: any · status: AVAILABLE · modules: Complaints → Market conduct → Investigations & enforcement → Entity 360_

Show how a single consumer complaint is triaged, investigated and, where warranted, converted into supervisory or enforcement action.

**Steps**

1. **applicant** — Submit a complaint on the public portal and note the tracking reference. (`/complaints/submit`) → Complaint recorded with contact details auto-linked where the complainant is a known user. _[NO AI]_
2. **licensing_officer** — Triage the complaint in the intake queue: classify, check for duplicates and assign. (`/complaints/intake`) → Complaint classified by type, deduplicated and assigned to an investigator. _[DETERMINISTIC AUTOMATION]_
3. **analyst** — Investigate: request information from the firm, record findings and evidence. (`/complaints`) → Investigation record built with a documented evidence trail. _[NO AI]_
4. **supervisor** — Review the conduct picture across the portfolio, optionally reading the advisory cross-entity narrative. (`/conduct/attention`) → Pattern assessed; a thematic or firm-specific action is considered. _[AI-ASSISTED]_
5. **supervisor** — Decide the outcome: closure with reasons, redress, supervisory action or referral to enforcement. (`/complaints`) → Outcome recorded with rationale; the complainant is notified. _[HUMAN DECISION]_
6. **legal_compliance** — Where referred, progress the enforcement matter and any penalty. (`/enforcement/queue`) → Direction or penalty recorded with server-resolved currency and provenance. _[HUMAN DECISION]_
7. **supervisor** — Confirm the picture in Entity 360 → Market conduct and Enforcement. (`/admin/licensees`) → The complaint, the investigation and the action are all visible against the firm. _[NO AI]_

**Evidence**

- Complaint submission and tracking record
- Duplicate/escalation decisions
- Investigation findings and evidence
- Outcome rationale and complainant notification
- Enforcement record and penalty provenance

### F — Ownership → Indirect Ownership → UBO

_Audience: internal · status: AVAILABLE · modules: F8A-B1 Relationship foundation → F8A-B2 Ownership traversal & UBO → F9 Fit & proper → Entity 360_

Show that beneficial ownership is derived deterministically from a governed ownership ledger, with policy-based thresholds, bounded traversal and explicit boundaries — not estimated, and not AI.

**Steps**

1. **licensing_officer** — Propose an ownership change set for the entity. (`/admin/licensees`) → Change set created in a proposed state; nothing is canonical yet. _[NO AI]_
2. **licensing_officer** — Submit the change set for approval and attempt to approve it personally. (`/admin/licensees`) → Self-approval is denied by the database — maker-checker is a server contract. _[DETERMINISTIC AUTOMATION]_
3. **supervisor** — Independently approve and apply the change set. (`/admin/licensees`) → Ownership rows become canonical with provenance and an audit entry. _[HUMAN DECISION]_
4. **supervisor** — Add an intermediate holding layer so ownership becomes indirect. (`/admin/licensees`) → A multi-layer ownership chain exists in the canonical ledger. _[NO AI]_
5. **system** — Traverse the ownership graph and compute effective interests. → Economic and voting interests are computed separately by multiplication along each path and aggregated across paths; cycles are detected; depth and node caps bound the expansion. _[DETERMINISTIC AUTOMATION]_
6. **system** — Apply the governed, effective-dated UBO policy. → A natural person qualifies as a UBO only via the economic threshold, the voting threshold or an explicit governed control determination. Terminal natural-person status alone does not qualify anyone. _[DETERMINISTIC AUTOMATION]_
7. **supervisor** — Review the UBO result, the contributing paths and any unresolved boundary. (`/admin/licensees`) → UBO set with paths, plus explicit boundaries such as node-limit truncation or a regulator-scope restricted branch. _[NO AI]_
8. **supervisor** — Compare the calculated UBO set with the recorded (declared) UBOs and act on any difference. (`/admin/licensees`) → Divergence becomes a supervisory question, potentially a fit & proper or information request. _[HUMAN DECISION]_

**Evidence**

- Change-set proposal, approval and apply records
- Canonical ownership ledger with provenance
- Effective-dated UBO policy version used for the calculation
- Traversal result with paths, boundaries and truncation flags
- Audit entries for every governed step

## Contextual help anchors

- About Entity 360 — surface `entity-360` → anchor `entity-360` (internal)
- About entity structure & ownership — surface `entity-structure` → anchor `entity-360-ownership` (internal)
- How UBO is calculated — surface `ownership-ubo` → anchor `ownership-ubo` (internal)
- Learn about licensing — surface `licensing` → anchor `licensing` (any)
- Learn about registration — surface `registration` → anchor `registration` (any)
- Learn about post-licence services — surface `post-licensing` → anchor `post-licensing` (any)
- Learn about returns — surface `returns` → anchor `returns` (any)
- Learn about fees & payments — surface `fees-payments` → anchor `fees-payments` (any)
- Learn about complaints — surface `complaints` → anchor `complaints` (any)
- Learn about enforcement — surface `enforcement` → anchor `investigations` (internal)
- Learn about AI governance — surface `ai-governance` → anchor `ai-governance` (internal)
- Learn about market conduct — surface `market-conduct` → anchor `market-conduct` (internal)

