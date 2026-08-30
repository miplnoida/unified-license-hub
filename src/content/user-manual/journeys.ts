import type { JourneyDoc } from './types';

/**
 * End-to-end journeys A–F. Each journey crosses module boundaries and is the
 * unit used for demo rehearsal and for the final E2E documentation refresh.
 */
export const JOURNEYS: JourneyDoc[] = [
  {
    id: 'journey-a',
    code: 'A',
    title: 'Registration → Licensing → Entity 360',
    audience: 'any',
    status: 'AVAILABLE',
    purpose:
      'Show how an unknown applicant becomes a known, authorised regulated entity with a complete supervisory profile, without a single value being typed directly into the database.',
    modulesTraversed: ['F3 Registration', 'F4 Licensing', 'F6 Fees & Payments', 'F9 Fit & proper', 'Entity 360'],
    steps: [
      { step: 1, actor: 'applicant', action: 'Register on the public portal, verify email by OTP and submit the onboarding wizard.', route: '/register', outcome: 'Registration submitted with a reference and an SLA clock.', aiInvolvement: 'NO AI' },
      { step: 2, actor: 'licensing_officer', action: 'Review the registration for identity and completeness; raise a query if needed.', route: '/admin/registration-review', outcome: 'Registration recommended for acceptance, with recorded notes.', aiInvolvement: 'NO AI' },
      { step: 3, actor: 'supervisor', action: 'Independently accept the registration.', route: '/admin/registration-review', outcome: 'Identity established; portal account provisioned with a temporary password and forced change.', aiInvolvement: 'HUMAN DECISION' },
      { step: 4, actor: 'applicant', action: 'Sign in, create a licence application and complete every mandatory form.', route: '/applications/new', outcome: 'All forms marked complete; nominated individuals recorded for fit & proper.', aiInvolvement: 'NO AI' },
      { step: 5, actor: 'system', action: 'Assess the application fee from the configured schedule.', outcome: 'Server-authoritative assessment of record created in the applicant currency.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 6, actor: 'applicant', action: 'Pay the assessed fee and submit the application.', route: '/applications', outcome: 'Receipt issued by a governed function; submission accepted only after server-side re-verification.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 7, actor: 'licensing_officer', action: 'Assess the application, optionally reading the advisory AI observations, and raise RFIs.', route: '/applications/queue', outcome: 'Assessment findings and officer recommendation recorded.', aiInvolvement: 'AI-ASSISTED' },
      { step: 8, actor: 'legal_compliance', action: 'Complete fit & proper determinations for nominated individuals.', route: '/fit-and-proper/individuals', outcome: 'Determinations recorded with rationale.', aiInvolvement: 'HUMAN DECISION' },
      { step: 9, actor: 'supervisor', action: 'Take the licensing decision as an independent approver.', route: '/applications/queue', outcome: 'Licence issued with number, scope, conditions and validity; notification and certificate produced.', aiInvolvement: 'HUMAN DECISION' },
      { step: 10, actor: 'supervisor', action: 'Open Entity 360 for the new licensee.', route: '/admin/licensees', outcome: 'Identity, licences, business profile, ownership, governance, documents and provenance are all populated from the processes above.', aiInvolvement: 'NO AI' },
    ],
    evidence: ['Registration payload and versions', 'Application form versions and documents', 'Assessment of record, payment and receipt', 'Fit & proper determinations', 'Decision record with rationale', 'Audit trail of every transition'],
    demoNotes: [
      'This is the strongest opening journey: it proves the record is manufactured by governed process.',
      'Pause at step 3 to show that self-approval is denied by the database, not hidden in the UI.',
      'Finish in Entity 360 → Provenance to show where each value came from.',
    ],
    screenshots: ['pub-register', 'reg-review-queue', 'lic-app-queue', 'lic-register', 'e360-overview'],
  },
  {
    id: 'journey-b',
    code: 'B',
    title: 'Post-Licence Structural Change',
    audience: 'any',
    status: 'AVAILABLE',
    purpose:
      'Show that changes after licensing are controlled regulatory events which produce governed effects on the canonical record — not free-text edits.',
    modulesTraversed: ['F5 Post-licensing services', 'F9 Fit & proper', 'F8A Relationship foundation', 'Entity 360'],
    steps: [
      { step: 1, actor: 'licensee_primary', action: 'Open the post-licence service catalogue and start the applicable change request.', route: '/post-license/new', outcome: 'Governed intake context created; only services applicable to the licence and taxonomy are offered.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 2, actor: 'licensee_primary', action: 'Complete the service forms, nominate any individuals, attach evidence and pay any assessed fee.', route: '/applications', outcome: 'Request submitted; server re-verifies completeness, eligibility and fee settlement.', aiInvolvement: 'NO AI' },
      { step: 3, actor: 'system', action: 'Resolve the workflow route and the required approval authority.', outcome: 'Request routed to the correct queue; the effect plan is resolved from the canonical service→effect mapping.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 4, actor: 'licensing_officer', action: 'Assess the request and record a recommendation.', route: '/licensing/regulatory-requests', outcome: 'Recommendation recorded; any fit & proper blocker is visible and fail-closed.', aiInvolvement: 'HUMAN DECISION' },
      { step: 5, actor: 'legal_compliance', action: 'Complete any required fit & proper determination for the nominated subject.', route: '/fit-and-proper/individuals', outcome: 'Linkage satisfied, or the approval remains blocked.', aiInvolvement: 'HUMAN DECISION' },
      { step: 6, actor: 'supervisor', action: 'Approve the request as an independent authority.', route: '/licensing/regulatory-requests', outcome: 'Approval recorded with rationale.', aiInvolvement: 'HUMAN DECISION' },
      { step: 7, actor: 'system', action: 'Execute the post-approval effect plan idempotently.', outcome: 'Canonical effect applied — licence variation, officer change, establishment opening/closure or entity change — with an effect-ledger entry and provenance.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 8, actor: 'supervisor', action: 'Verify the change in Entity 360 and step the As At date back.', route: '/admin/licensees', outcome: 'The new position is canonical; the prior position is still replayable historically.', aiInvolvement: 'NO AI' },
    ],
    evidence: ['Service request and forms', 'Fee assessment and receipt where applicable', 'Fit & proper determination', 'Approval record with rationale', 'Effect ledger entry and acknowledgement', 'Provenance entries for every changed value'],
    demoNotes: [
      'Emphasise idempotency: replaying the effect does not duplicate it.',
      'Show a blocked approval first, then satisfy the fit & proper linkage and approve — the fail-closed behaviour is the point.',
    ],
    screenshots: ['lic-requests', 'e360-structure', 'e360-overview'],
  },
  {
    id: 'journey-c',
    code: 'C',
    title: 'Regulatory Returns',
    audience: 'any',
    status: 'AVAILABLE',
    purpose:
      'Show the full reporting cycle: obligation generation, filing, validation, review, amendment and overdue handling with deterministic dates.',
    modulesTraversed: ['F7 Regulatory returns', 'F6 Fees & Payments (late fees)', 'Entity 360'],
    steps: [
      { step: 1, actor: 'system', action: 'Generate obligations from the return configuration, period end and cutoff.', outcome: 'Obligations with deterministic due dates and a regulator snapshot appear in the entity calendar.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 2, actor: 'licensee_primary', action: 'Open the obligation and complete the return, saving progress.', route: '/returns/obligations', outcome: 'Draft saved with auto-save; calculated fields evaluated by the safe arithmetic parser.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 3, actor: 'licensee_primary', action: 'Submit the return.', route: '/returns/obligations', outcome: 'Server-side validation runs; an immutable submitted version and a currency snapshot are recorded.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 4, actor: 'analyst', action: 'Review the filing in the returns queue and raise an RFI if data quality is inadequate.', route: '/returns/queue', outcome: 'RFI issued with a deadline, or the filing is recommended for acceptance.', aiInvolvement: 'HUMAN DECISION' },
      { step: 5, actor: 'supervisor', action: 'Independently accept the filing.', route: '/returns/queue', outcome: 'Filing accepted under maker-checker; the obligation is satisfied.', aiInvolvement: 'HUMAN DECISION' },
      { step: 6, actor: 'licensee_primary', action: 'File an amendment for a corrected figure.', route: '/returns/obligations', outcome: 'New version created; the prior version and its schema remain intact for audit.', aiInvolvement: 'NO AI' },
      { step: 7, actor: 'system', action: 'Run the overdue sweep for unfiled obligations.', outcome: 'Overdue status set deterministically; late fees are raised by the fees module, which owns them.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 8, actor: 'supervisor', action: 'Open Entity 360 → Return filings.', route: '/admin/licensees', outcome: 'The whole filing history, versions and timeliness picture is visible in one place.', aiInvolvement: 'NO AI' },
    ],
    evidence: ['Immutable submitted versions', 'Validation results', 'RFI thread and responses', 'Extension approvals where granted', 'Acceptance record under maker-checker'],
    demoNotes: [
      'Show an extension request to explain that deadlines move only through a governed, audited action.',
      'Explain the deliberate separation: returns own timeliness, fees own money.',
    ],
    screenshots: ['ret-obligations', 'ret-queue', 'ret-calendar'],
  },
  {
    id: 'journey-d',
    code: 'D',
    title: 'Fees / Payment / Receipt / Currency',
    audience: 'any',
    status: 'AVAILABLE',
    purpose:
      'Show that money is handled as an immutable ledger with a server-authoritative assessment of record, governed receipts and effective-dated FX.',
    modulesTraversed: ['F6 Fees, payments & multi-currency', 'F4 Licensing', 'F7 Returns (late fees)', 'Enforcement penalties'],
    steps: [
      { step: 1, actor: 'system', action: 'Resolve the applicable fee from the schedule and raise the assessment of record.', outcome: 'Assessment created server-side with itemised breakdown; the browser cannot price anything.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 2, actor: 'licensee_primary', action: 'Open the outstanding balance and review the itemised breakdown.', route: '/payments', outcome: 'Authoritative outstanding balance displayed in the correct currency.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 3, actor: 'licensee_primary', action: 'Pay through the payment surface (simulated gateway in demo environments).', route: '/payments', outcome: 'Payment recorded as a ledger entry; the ledger is append-only.', aiInvolvement: 'NO AI' },
      { step: 4, actor: 'system', action: 'Issue the receipt through the governed receipt-issuance function.', outcome: 'Receipt minted server-side; the browser cannot mint receipts.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 5, actor: 'admin', action: 'Reconcile an offline payment in the finance panel.', route: '/payments', outcome: 'Reconciliation recorded against the authoritative outstanding balance.', aiInvolvement: 'HUMAN DECISION' },
      { step: 6, actor: 'admin', action: 'Approve a waiver or refund within the configured caps.', route: '/admin/fee-management', outcome: 'Governed reversal recorded with reason; value capping and admin-only approval enforced server-side.', aiInvolvement: 'HUMAN DECISION' },
      { step: 7, actor: 'analyst', action: 'View reporting in the entity reporting currency.', route: '/analytics', outcome: 'Amounts converted at the effective-dated FX rate, with the source rate and base currency shown as provenance.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
    ],
    evidence: ['Assessment of record and itemised breakdown', 'Append-only ledger entries', 'Server-issued receipts', 'Waiver/refund approvals with reasons', 'FX rate and provenance on every converted figure'],
    demoNotes: [
      'State plainly that the client never calculates a price and never mints a receipt.',
      'Show the same figure in transaction currency and reporting currency with the rate provenance.',
      'Penalty currency is resolved from the regulator’s configuration — show provenance on a penalty.',
    ],
    screenshots: ['pay-history', 'fee-config', 'cur-settings', 'pen-register'],
  },
  {
    id: 'journey-e',
    code: 'E',
    title: 'Complaint → Investigation / Supervisory Action',
    audience: 'any',
    status: 'AVAILABLE',
    purpose:
      'Show how a single consumer complaint is triaged, investigated and, where warranted, converted into supervisory or enforcement action.',
    modulesTraversed: ['Complaints', 'Market conduct', 'Investigations & enforcement', 'Entity 360'],
    steps: [
      { step: 1, actor: 'applicant', action: 'Submit a complaint on the public portal and note the tracking reference.', route: '/complaints/submit', outcome: 'Complaint recorded with contact details auto-linked where the complainant is a known user.', aiInvolvement: 'NO AI' },
      { step: 2, actor: 'licensing_officer', action: 'Triage the complaint in the intake queue: classify, check for duplicates and assign.', route: '/complaints/intake', outcome: 'Complaint classified by type, deduplicated and assigned to an investigator.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 3, actor: 'analyst', action: 'Investigate: request information from the firm, record findings and evidence.', route: '/complaints', outcome: 'Investigation record built with a documented evidence trail.', aiInvolvement: 'NO AI' },
      { step: 4, actor: 'supervisor', action: 'Review the conduct picture across the portfolio, optionally reading the advisory cross-entity narrative.', route: '/conduct/attention', outcome: 'Pattern assessed; a thematic or firm-specific action is considered.', aiInvolvement: 'AI-ASSISTED' },
      { step: 5, actor: 'supervisor', action: 'Decide the outcome: closure with reasons, redress, supervisory action or referral to enforcement.', route: '/complaints', outcome: 'Outcome recorded with rationale; the complainant is notified.', aiInvolvement: 'HUMAN DECISION' },
      { step: 6, actor: 'legal_compliance', action: 'Where referred, progress the enforcement matter and any penalty.', route: '/enforcement/queue', outcome: 'Direction or penalty recorded with server-resolved currency and provenance.', aiInvolvement: 'HUMAN DECISION' },
      { step: 7, actor: 'supervisor', action: 'Confirm the picture in Entity 360 → Market conduct and Enforcement.', route: '/admin/licensees', outcome: 'The complaint, the investigation and the action are all visible against the firm.', aiInvolvement: 'NO AI' },
    ],
    evidence: ['Complaint submission and tracking record', 'Duplicate/escalation decisions', 'Investigation findings and evidence', 'Outcome rationale and complainant notification', 'Enforcement record and penalty provenance'],
    demoNotes: [
      'Use the public tracking screen first — it lands well with consumer-protection audiences.',
      'Be explicit that the AI narrative at step 4 confirms nothing and changes no record.',
    ],
    screenshots: ['pub-complaint', 'cmp-intake', 'cond-attention', 'enf-queue'],
  },
  {
    id: 'journey-f',
    code: 'F',
    title: 'Ownership → Indirect Ownership → UBO',
    audience: 'internal',
    status: 'AVAILABLE',
    purpose:
      'Show that beneficial ownership is derived deterministically from a governed ownership ledger, with policy-based thresholds, bounded traversal and explicit boundaries — not estimated, and not AI.',
    modulesTraversed: ['F8A-B1 Relationship foundation', 'F8A-B2 Ownership traversal & UBO', 'F9 Fit & proper', 'Entity 360'],
    steps: [
      { step: 1, actor: 'licensing_officer', action: 'Propose an ownership change set for the entity.', route: '/admin/licensees', outcome: 'Change set created in a proposed state; nothing is canonical yet.', aiInvolvement: 'NO AI' },
      { step: 2, actor: 'licensing_officer', action: 'Submit the change set for approval and attempt to approve it personally.', route: '/admin/licensees', outcome: 'Self-approval is denied by the database — maker-checker is a server contract.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 3, actor: 'supervisor', action: 'Independently approve and apply the change set.', route: '/admin/licensees', outcome: 'Ownership rows become canonical with provenance and an audit entry.', aiInvolvement: 'HUMAN DECISION' },
      { step: 4, actor: 'supervisor', action: 'Add an intermediate holding layer so ownership becomes indirect.', route: '/admin/licensees', outcome: 'A multi-layer ownership chain exists in the canonical ledger.', aiInvolvement: 'NO AI' },
      { step: 5, actor: 'system', action: 'Traverse the ownership graph and compute effective interests.', outcome: 'Economic and voting interests are computed separately by multiplication along each path and aggregated across paths; cycles are detected; depth and node caps bound the expansion.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 6, actor: 'system', action: 'Apply the governed, effective-dated UBO policy.', outcome: 'A natural person qualifies as a UBO only via the economic threshold, the voting threshold or an explicit governed control determination. Terminal natural-person status alone does not qualify anyone.', aiInvolvement: 'DETERMINISTIC AUTOMATION' },
      { step: 7, actor: 'supervisor', action: 'Review the UBO result, the contributing paths and any unresolved boundary.', route: '/admin/licensees', outcome: 'UBO set with paths, plus explicit boundaries such as node-limit truncation or a regulator-scope restricted branch.', aiInvolvement: 'NO AI' },
      { step: 8, actor: 'supervisor', action: 'Compare the calculated UBO set with the recorded (declared) UBOs and act on any difference.', route: '/admin/licensees', outcome: 'Divergence becomes a supervisory question, potentially a fit & proper or information request.', aiInvolvement: 'HUMAN DECISION' },
    ],
    evidence: ['Change-set proposal, approval and apply records', 'Canonical ownership ledger with provenance', 'Effective-dated UBO policy version used for the calculation', 'Traversal result with paths, boundaries and truncation flags', 'Audit entries for every governed step'],
    demoNotes: [
      'Say clearly: this is arithmetic on a governed ledger. There is no AI anywhere in this journey.',
      'Show a historical date proving an old policy version still governs the historical result.',
      'Show a restricted cross-regulator branch returning an explicit boundary rather than leaking details.',
    ],
    screenshots: ['e360-structure', 'e360-overview'],
  },
];

export const JOURNEY_BY_ID: Record<string, JourneyDoc> = Object.fromEntries(JOURNEYS.map((j) => [j.id, j]));
