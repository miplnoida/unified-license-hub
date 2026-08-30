import type { Entity360SectionDoc } from './types';

/**
 * Entity 360 documentation.
 *
 * One entry per ACTIVE section in `E360_SECTIONS`
 * (src/components/entity-detail/sectionCatalogue.tsx). The coverage gate
 * (`npm run verify:user-manual`) fails when a catalogue section is missing here
 * or when a documented key no longer exists in the catalogue.
 *
 * This is written for regulators, not as a data dictionary.
 */

/** The seven supervisory groups, explained in business language. */
export const E360_GROUP_DOCS: {
  key: string;
  label: string;
  whyRegulatorsUseIt: string;
  typicalQuestions: string[];
}[] = [
  {
    key: 'identity',
    label: 'Identity & authorisation',
    whyRegulatorsUseIt:
      'Everything else is only meaningful once you are certain who the entity is and exactly what it is permitted to do. This group answers the perimeter question: is this firm authorised, for what activity, under which conditions, and for how long.',
    typicalQuestions: [
      'Is this firm authorised today, and under which licence number?',
      'What activities is it permitted to carry on, and where?',
      'Are there licence conditions that constrain what it may do?',
    ],
  },
  {
    key: 'ownership',
    label: 'Ownership & control',
    whyRegulatorsUseIt:
      'Supervisory risk follows control, not paperwork. This group establishes who ultimately owns and directs the firm, whether those people have been assessed as fit and proper, and how the firm sits inside a wider group.',
    typicalQuestions: [
      'Who ultimately benefits from and controls this firm?',
      'Have the controllers and directors been assessed and approved?',
      'Does the group structure create contagion or opacity?',
    ],
  },
  {
    key: 'obligations',
    label: 'Reporting & obligations',
    whyRegulatorsUseIt:
      'Timely, complete reporting is the primary evidence of a well-run firm. This group shows what the entity owes the regulator and whether it has actually delivered it.',
    typicalQuestions: [
      'What must this firm file, and has it filed on time?',
      'Are there overdue or repeatedly amended filings?',
      'Is the reporting quality deteriorating?',
    ],
  },
  {
    key: 'risk',
    label: 'Prudential & risk',
    whyRegulatorsUseIt:
      'This group carries the financial-soundness picture and the regulator’s own judgement of risk, so supervisory attention can be allocated where failure would do most harm.',
    typicalQuestions: [
      'Is the firm financially sound against its prudential requirements?',
      'What is its risk rating and what is driving it?',
      'Who supervises it and what is outstanding on the plan?',
    ],
  },
  {
    key: 'conduct',
    label: 'Conduct & financial crime',
    whyRegulatorsUseIt:
      'A solvent firm can still harm customers or be abused for financial crime. This group holds customer-outcome evidence, AML/CFT posture and operational resilience.',
    typicalQuestions: [
      'Are customers being treated fairly, and what do complaints show?',
      'What is the firm’s financial-crime risk and are findings being closed?',
      'Could an outsourcing or incident failure interrupt a critical service?',
    ],
  },
  {
    key: 'oversight',
    label: 'Supervisory action',
    whyRegulatorsUseIt:
      'This group records what the regulator has actually done: examinations performed, enforcement taken and requests still outstanding. It is the accountability record of supervision itself.',
    typicalQuestions: [
      'What has the regulator already found and required?',
      'Have previous findings and directions been complied with?',
      'What is currently awaiting a response from the firm?',
    ],
  },
  {
    key: 'records',
    label: 'Records & provenance',
    whyRegulatorsUseIt:
      'Regulatory decisions must be defensible. This group holds the evidence on file, the formal correspondence trail and the record of where every canonical value came from and when it changed.',
    typicalQuestions: [
      'What evidence supports what we believe about this firm?',
      'What have we formally told the firm, and when?',
      'Who changed this value, from what, and on whose authority?',
    ],
  },
];

const AS_AT =
  'Supports the As At date control: selecting a historical date replays the state that was recorded as at that date, rather than showing today’s values.';
const CURRENT_ONLY =
  'Shown as the current recorded position with its own event dates. It is not replayed by the As At control; use the underlying process history for point-in-time questions.';

export const ENTITY_360_SECTIONS: Entity360SectionDoc[] = [
  {
    key: 'identity',
    group: 'identity',
    label: 'Identity',
    audience: 'any',
    whatIsIt:
      'The canonical record of who the entity is: registered and trading names, statutory identifiers issued by other authorities, and the verification state of each identifier.',
    questionAnswered: 'Am I looking at the right legal person, and has its identity been verified?',
    regulatoryImportance:
      'Identity is the anchor for every other record. Misidentification breaks attribution of filings, payments, ownership and enforcement, and is the most common cause of supervisory error.',
    sourceOfInformation: [
      'Registration & onboarding (F3)',
      'Licensing decisions (F4)',
      'Governed entity-change requests (F5)',
    ],
    temporal: AS_AT,
    importantFields: [
      { field: 'Name', meaning: 'The name recorded as at the selected date, not simply the latest name.' },
      { field: 'Identifier type / Identifier', meaning: 'External statutory identifiers such as company or tax registration numbers.' },
      { field: 'Issued by', meaning: 'The authority that issued the identifier — the basis for cross-authority matching.' },
      { field: 'Verification', meaning: 'Whether the regulator has verified the identifier against source evidence.' },
      { field: 'Valid from / Valid to', meaning: 'The period the identifier or name was in force.' },
    ],
    howToInterpret: [
      'An unverified identifier is not an error in itself, but it weakens every downstream match.',
      'Multiple historical names usually indicate a rebrand or restructure — check Group relationships and Regulatory requests for the change that caused it.',
    ],
    whatToInvestigate: [
      'Names changed shortly before an application, filing deadline or enforcement action.',
      'Identifiers that remain unverified long after licensing.',
      'The same identifier appearing on more than one entity record.',
    ],
    relatedProcesses: [
      { label: 'Registration & Onboarding', route: '/help/user-manual#registration' },
      { label: 'Post-Licensing Services', route: '/help/user-manual#post-licensing' },
    ],
    demoTalkingPoints: [
      'Identity is established once, at registration, and reused everywhere.',
      'Move the As At date back and show the name as it stood then.',
    ],
    screenshots: ['e360-overview'],
    status: 'AVAILABLE',
  },
  {
    key: 'licences',
    group: 'identity',
    label: 'Licences',
    audience: 'any',
    whatIsIt: 'Every authorisation the entity holds or has held, with scope, conditions, regulator and validity period.',
    questionAnswered: 'What is this firm actually allowed to do, on whose authority, and until when?',
    regulatoryImportance:
      'The licence defines the regulatory perimeter. Activity outside scope, or after expiry, is unauthorised business.',
    sourceOfInformation: ['Licensing decisions (F4)', 'Licence lifecycle events — renewal, variation, suspension, revocation (F5)'],
    temporal: AS_AT,
    importantFields: [
      { field: 'Licence number', meaning: 'The public authorisation reference used on the register and in correspondence.' },
      { field: 'Type / Permitted scope', meaning: 'The regulated activities authorised — the perimeter test.' },
      { field: 'Licence status', meaning: 'Issued, active, in grace, suspended, lapsed or revoked.' },
      { field: 'Conditions', meaning: 'Count of binding conditions attached to the authorisation.' },
      { field: 'Effective from / Expires', meaning: 'Validity window driving renewal obligations and grace handling.' },
    ],
    howToInterpret: [
      'A licence in grace still authorises activity, but a renewal obligation is already overdue.',
      'Conditions greater than zero means the licence must be read together with its condition schedule before judging compliance.',
    ],
    whatToInvestigate: [
      'Activity or filings that imply business outside the permitted scope.',
      'Repeated short-notice renewals or repeated variations of scope.',
      'Suspensions followed quickly by new applications elsewhere in the group.',
    ],
    relatedProcesses: [
      { label: 'Licensing & Authorisation', route: '/help/user-manual#licensing' },
      { label: 'Post-Licensing Services', route: '/help/user-manual#post-licensing' },
    ],
    demoTalkingPoints: [
      'Show that the licence record is produced by the licensing decision, never typed in by hand.',
      'Open the conditions count and explain condition-based supervision.',
    ],
    screenshots: ['e360-overview', 'lic-register'],
    status: 'AVAILABLE',
  },
  {
    key: 'business_profile',
    group: 'identity',
    label: 'Business profile',
    audience: 'any',
    whatIsIt: 'The activities, products, distribution channels and jurisdictions through which the firm actually operates.',
    questionAnswered: 'What business is this firm really doing, and where?',
    regulatoryImportance:
      'Business model drives inherent risk. Comparing the declared model with the authorised scope is the fastest way to detect perimeter drift.',
    sourceOfInformation: ['Licence application forms (F4)', 'Post-licensing change requests (F5)', 'Periodic returns (F7)'],
    temporal: AS_AT,
    importantFields: [
      { field: 'Activity / Product', meaning: 'What is sold and under which regulated activity heading.' },
      { field: 'Channel', meaning: 'How customers are reached — branch, agent, digital, intermediary.' },
      { field: 'Jurisdiction', meaning: 'Where the business is conducted, driving cross-border considerations.' },
      { field: 'From / To', meaning: 'When each line of business started and, if applicable, ceased.' },
    ],
    howToInterpret: [
      'New products or channels appearing without a corresponding approved change request is a supervisory flag.',
      'Jurisdictions outside the licensed footprint require an explicit basis.',
    ],
    whatToInvestigate: [
      'Products present in returns data but absent from the profile.',
      'Digital or agent channels introduced without notification.',
    ],
    relatedProcesses: [
      { label: 'Post-Licensing Services', route: '/help/user-manual#post-licensing' },
      { label: 'Regulatory Returns', route: '/help/user-manual#returns' },
    ],
    demoTalkingPoints: ['Contrast the business profile with the licence scope on the same screen.'],
    screenshots: ['e360-overview'],
    status: 'AVAILABLE',
  },
  {
    key: 'ownership',
    group: 'ownership',
    label: 'Ownership',
    audience: 'any',
    whatIsIt:
      'The shareholding and control register: who holds economic interest, who holds voting rights, who is a controller, and who is recorded as a beneficial owner.',
    questionAnswered: 'Who owns this firm, in what proportions, and who can actually direct it?',
    regulatoryImportance:
      'Ownership determines who must be assessed as fit and proper, who can extract value from the firm and who is accountable when things fail.',
    sourceOfInformation: [
      'Governed ownership change sets with maker-checker approval (F8A-B1)',
      'Licence application ownership disclosures (F4)',
    ],
    temporal: AS_AT,
    importantFields: [
      { field: 'Owner / Owner type', meaning: 'The holder, which may be a person, an organisation, a trust, a foundation or a partnership.' },
      { field: 'Economic %', meaning: 'Share of economic benefit.' },
      { field: 'Voting %', meaning: 'Share of voting power — the control measure, which can differ sharply from economic interest.' },
      { field: 'Direct', meaning: 'Whether the holding is held directly in this entity or through an intermediate layer.' },
      { field: 'Controller', meaning: 'Whether the holder is treated as a controller for regulatory purposes.' },
      { field: 'Recorded UBO', meaning: 'A beneficial owner as declared/recorded — distinct from the calculated UBO result.' },
      { field: 'Approval', meaning: 'Whether the ownership position has passed governed maker-checker approval.' },
      { field: 'Source', meaning: 'Where the record came from — application, change set, or migration.' },
    ],
    howToInterpret: [
      'Recorded UBO is a declaration. The calculated UBO in Ownership & UBO analysis is derived deterministically from the ownership ledger and may differ — that difference is itself supervisory information.',
      'A large voting percentage with a small economic percentage indicates control disproportionate to investment.',
      'Positions in a proposed or pending approval state are not yet canonical.',
    ],
    whatToInvestigate: [
      'Holdings kept just below a notification or approval threshold.',
      'Divergence between declared UBOs and the calculated UBO set.',
      'Ownership changes not accompanied by a fit & proper assessment.',
    ],
    relatedProcesses: [
      { label: 'Ownership, Control & UBO', route: '/help/user-manual#ownership-ubo' },
      { label: 'Post-Licensing Services', route: '/help/user-manual#post-licensing' },
    ],
    demoTalkingPoints: [
      'Every ownership row here was proposed and independently approved — self-approval is denied by the database.',
      'Point out the separation of economic and voting percentages.',
    ],
    screenshots: ['e360-structure'],
    status: 'AVAILABLE',
  },
  {
    key: 'governance',
    group: 'ownership',
    label: 'Governance',
    audience: 'any',
    whatIsIt: 'Directors, senior officers and other approved appointments, with appointment and cessation dates.',
    questionAnswered: 'Who runs this firm day to day, and were those people approved?',
    regulatoryImportance:
      'Governance quality is a leading indicator. Board turnover, vacancies in control functions and unapproved appointments frequently precede failure.',
    sourceOfInformation: ['Appointment and change-of-officer requests (F5)', 'Fit & proper assessments (F9)'],
    temporal: AS_AT,
    importantFields: [
      { field: 'Individual / Role', meaning: 'The person and the position held.' },
      { field: 'Approval', meaning: 'Whether the appointment has regulatory approval where approval is required.' },
      { field: 'Appointed / Ceased', meaning: 'Tenure, which drives turnover analysis.' },
      { field: 'Executive', meaning: 'Distinguishes executive management from non-executive oversight.' },
    ],
    howToInterpret: [
      'A vacant or long-unfilled control function (compliance, risk, AML) is a material concern even when every other indicator is clean.',
      'Short average tenure across several officers suggests instability or dominance by a controller.',
    ],
    whatToInvestigate: [
      'Officers acting before approval was granted.',
      'Simultaneous resignations of independent directors.',
      'The same individual holding key roles across several regulated entities.',
    ],
    relatedProcesses: [
      { label: 'Post-Licensing Services', route: '/help/user-manual#post-licensing' },
      { label: 'Ownership, Control & UBO', route: '/help/user-manual#ownership-ubo' },
    ],
    demoTalkingPoints: ['Show the As At date replaying the board as it stood at a past date.'],
    screenshots: ['e360-structure'],
    status: 'AVAILABLE',
  },
  {
    key: 'relationships',
    group: 'ownership',
    label: 'Group relationships',
    audience: 'any',
    whatIsIt: 'Parents, subsidiaries, affiliates and other recorded structural relationships, with direction and validity.',
    questionAnswered: 'What group does this firm belong to, and what sits above and below it?',
    regulatoryImportance:
      'Group structure carries contagion risk, intra-group exposure and the potential to obscure control behind layers.',
    sourceOfInformation: ['Canonical relationship ledger (F8A-B1)', 'Licence application group disclosures (F4)'],
    temporal: AS_AT,
    importantFields: [
      { field: 'Related party / Party type', meaning: 'The counterparty in the relationship and its legal nature.' },
      { field: 'Relationship', meaning: 'Parent, subsidiary, affiliate or other recorded structural link.' },
      { field: 'Direction', meaning: 'Whether the related party sits above or below this entity.' },
      { field: 'Source', meaning: 'Provenance of the relationship record.' },
    ],
    howToInterpret: [
      'Relationships are recorded facts, not inferences. Indirect control is calculated separately in Ownership & UBO analysis.',
      'A related party that is itself regulated may be outside your supervisory scope and will then be shown as a restricted boundary.',
    ],
    whatToInvestigate: [
      'Layers of holding companies in opaque jurisdictions with no operating purpose.',
      'Relationships terminated immediately before a supervisory event.',
    ],
    relatedProcesses: [{ label: 'Ownership, Control & UBO', route: '/help/user-manual#ownership-ubo' }],
    demoTalkingPoints: ['Explain that structural facts and calculated control are deliberately separated.'],
    screenshots: ['e360-structure'],
    status: 'AVAILABLE',
  },
  {
    key: 'fit_and_proper',
    group: 'ownership',
    label: 'Fit & proper',
    audience: 'any',
    whatIsIt: 'Assessment outcomes for controllers and senior individuals, with determination and recorded rationale.',
    questionAnswered: 'Have the people who own and run this firm been assessed, and what was decided?',
    regulatoryImportance:
      'Fit & proper is the gate that keeps unsuitable persons out of regulated positions and is a precondition for several licensing and post-licensing outcomes.',
    sourceOfInformation: ['Fit & proper assessments (F9)', 'Post-licensing nomination linkage (F5-B4)'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Individual / Proposed role', meaning: 'Who was assessed and for what position.' },
      { field: 'Assessment', meaning: 'Where the assessment has reached in its workflow.' },
      { field: 'Determination', meaning: 'The outcome recorded by the authorised decision-maker.' },
      { field: 'Submitted / Determined', meaning: 'The elapsed assessment time, relevant to SLA performance.' },
      { field: 'Rationale', meaning: 'The recorded reasoning that makes the determination defensible.' },
    ],
    howToInterpret: [
      'An open assessment blocks the dependent post-licensing effect — approval is fail-closed, not advisory.',
      'A determination without rationale is an evidence gap and should be raised.',
    ],
    whatToInvestigate: [
      'Individuals in post while an assessment remains open.',
      'Adverse media handled by an AI reading with no officer verification recorded.',
    ],
    relatedProcesses: [
      { label: 'Licensing & Authorisation', route: '/help/user-manual#licensing' },
      { label: 'AI Governance', route: '/help/user-manual#ai-governance' },
    ],
    demoTalkingPoints: ['Show the fail-closed link: no positive determination, no dependent approval.'],
    screenshots: ['fpa-individuals'],
    status: 'AVAILABLE',
  },
  {
    key: 'returns',
    group: 'obligations',
    label: 'Return filings',
    audience: 'any',
    whatIsIt: 'The filing history against every reporting obligation, by period, with status, due date and version.',
    questionAnswered: 'Has this firm filed what it owes, on time, and how often has it had to correct itself?',
    regulatoryImportance:
      'Reporting discipline is the cheapest and most reliable early-warning signal available to a supervisor.',
    sourceOfInformation: ['Regulatory returns lifecycle (F7)', 'Obligation generation from licence and sector configuration'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Return / Period', meaning: 'Which return and which reporting period.' },
      { field: 'Filing status', meaning: 'Draft, submitted, under review, accepted, amended or overdue.' },
      { field: 'Due / Submitted', meaning: 'The deterministic due date and the actual submission timestamp (UTC).' },
      { field: 'Version', meaning: 'Amendment count — each amendment is a new version with its own evidence.' },
    ],
    howToInterpret: [
      'Overdue status is calculated deterministically from the obligation due date; late fees are owned by the fees module, not the returns module.',
      'Rising version numbers on the same period indicate data-quality problems at source.',
    ],
    whatToInvestigate: [
      'Persistent last-day filing followed by amendment.',
      'Extensions requested repeatedly for the same return.',
      'Periods with no obligation generated where the licence implies one.',
    ],
    relatedProcesses: [
      { label: 'Regulatory Returns', route: '/help/user-manual#returns' },
      { label: 'Fees & Payments', route: '/help/user-manual#fees-payments' },
    ],
    demoTalkingPoints: ['Open a filing and show the immutable submitted version alongside its amendment.'],
    screenshots: ['ret-queue', 'ret-obligations'],
    status: 'AVAILABLE',
  },
  {
    key: 'prudential',
    group: 'risk',
    label: 'Prudential',
    audience: 'internal',
    whatIsIt: 'Capital, liquidity and asset-quality metrics assessed against the applicable prudential requirements.',
    questionAnswered: 'Is this firm financially sound, and where is it close to a limit?',
    regulatoryImportance: 'Prudential breach is the trigger for the most intrusive supervisory tools available.',
    sourceOfInformation: ['Prudential supervision monitoring sweeps (F8)', 'Financial returns data (F7)'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Metric', meaning: 'The prudential indicator being measured.' },
      { field: 'Value vs threshold', meaning: 'The reported position against the configured requirement.' },
      { field: 'Breach state', meaning: 'Whether a threshold has been crossed and a breach recorded.' },
      { field: 'As of period', meaning: 'The reporting period the metric belongs to.' },
    ],
    howToInterpret: [
      'Metrics are computed deterministically from filed data — the AI prudential narrative only describes them and proposes no rating.',
      'A near-threshold trend over several periods usually matters more than a single breach.',
    ],
    whatToInvestigate: [
      'Metrics that improve sharply only in the final reporting period before a deadline.',
      'Breaches with no corresponding supervisory action recorded.',
    ],
    relatedProcesses: [
      { label: 'AI Governance', route: '/help/user-manual#ai-governance' },
      { label: 'Regulatory Returns', route: '/help/user-manual#returns' },
    ],
    demoTalkingPoints: ['Emphasise: the numbers are deterministic, the narrative is advisory AI.'],
    screenshots: ['prud-dashboard'],
    status: 'AVAILABLE',
  },
  {
    key: 'risk',
    group: 'risk',
    label: 'Risk rating',
    audience: 'internal',
    whatIsIt: 'The composite supervisory risk score and band, together with the drivers behind it.',
    questionAnswered: 'How risky is this firm relative to the rest of the portfolio, and why?',
    regulatoryImportance: 'Risk rating drives supervisory intensity, cycle length and resource allocation.',
    sourceOfInformation: ['Supervisory risk model configuration', 'Prudential, conduct and compliance inputs'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Composite score / band', meaning: 'The overall rating and the band it falls into.' },
      { field: 'Drivers', meaning: 'The components contributing most to the score.' },
      { field: 'Last assessed', meaning: 'Whether the rating is current or stale.' },
    ],
    howToInterpret: [
      'Rating is a supervisory judgement supported by deterministic inputs; it is not an AI output.',
      'A stale rating on a firm whose profile has changed is itself a finding.',
    ],
    whatToInvestigate: ['Band changes without a recorded supervisory rationale.', 'Firms whose drivers have deteriorated but whose band has not moved.'],
    relatedProcesses: [{ label: 'Analytics & Reporting', route: '/help/user-manual#analytics' }],
    demoTalkingPoints: ['Show how the rating routes the firm into the supervisory plan.'],
    screenshots: ['prud-dashboard'],
    status: 'AVAILABLE',
  },
  {
    key: 'supervision',
    group: 'risk',
    label: 'Supervision',
    audience: 'internal',
    whatIsIt: 'The assigned supervisor, the supervisory plan cycle and the actions outstanding against it.',
    questionAnswered: 'Who owns this firm inside the regulator, and what have we committed to do?',
    regulatoryImportance: 'Clear ownership and a live plan are the difference between supervision and observation.',
    sourceOfInformation: ['Entity supervision assignments', 'Supervisory plans and actions (F8)'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Assigned supervisor', meaning: 'The accountable officer; also determines scoped visibility.' },
      { field: 'Plan cycle', meaning: 'The supervisory period the plan covers.' },
      { field: 'Outstanding actions', meaning: 'Committed activities not yet completed.' },
    ],
    howToInterpret: [
      'Supervisory assignment also affects who can see this entity — scope is enforced server-side.',
      'Overdue plan actions on a high-risk firm are an escalation trigger.',
    ],
    whatToInvestigate: ['High-risk firms with no assigned supervisor.', 'Plans that roll forward unchanged year after year.'],
    relatedProcesses: [{ label: 'Thematic & Supervisory Reviews', route: '/help/user-manual#thematic-reviews' }],
    demoTalkingPoints: ['Explain regulator scoping: officers see the entities they supervise.'],
    screenshots: ['prud-dashboard'],
    status: 'AVAILABLE',
  },
  {
    key: 'market_conduct',
    group: 'conduct',
    label: 'Market conduct',
    audience: 'internal',
    whatIsIt: 'Complaints, conduct alerts and recorded customer-outcome issues affecting this firm.',
    questionAnswered: 'Is this firm treating its customers fairly?',
    regulatoryImportance:
      'Conduct failure damages consumers directly and is often visible long before it appears in prudential numbers.',
    sourceOfInformation: ['Complaint management (F-complaints)', 'Conduct monitoring and thematic work'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Issue / Alert', meaning: 'The conduct matter recorded.' },
      { field: 'Volume and trend', meaning: 'Complaint counts against portfolio norms.' },
      { field: 'Outcome', meaning: 'How matters were resolved and whether redress was made.' },
    ],
    howToInterpret: [
      'Compare complaint volume to customer base, not to other firms in absolute terms.',
      'Cross-entity narrative commentary here is AI-assisted and must be verified before use.',
    ],
    whatToInvestigate: ['Clusters of complaints about one product or channel.', 'Complaints resolved without redress where harm is evident.'],
    relatedProcesses: [
      { label: 'Complaints', route: '/help/user-manual#complaints' },
      { label: 'Market Conduct', route: '/help/user-manual#market-conduct' },
    ],
    demoTalkingPoints: ['Trace one complaint from public submission to the conduct picture here.'],
    screenshots: ['cond-work-queue', 'cmp-analytics'],
    status: 'AVAILABLE',
  },
  {
    key: 'aml',
    group: 'conduct',
    label: 'AML/CFT',
    audience: 'internal',
    whatIsIt: 'The financial-crime risk assessment of the firm and the open findings against it.',
    questionAnswered: 'How exposed is this firm to money laundering and terrorist financing, and is it managing it?',
    regulatoryImportance: 'AML/CFT failure carries international consequences well beyond the individual firm.',
    sourceOfInformation: ['AML risk assessment', 'Examination findings (F8)'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Inherent risk / residual risk', meaning: 'Exposure before and after the firm’s controls.' },
      { field: 'Open findings', meaning: 'Deficiencies not yet remediated.' },
      { field: 'Remediation due', meaning: 'Committed closure dates.' },
    ],
    howToInterpret: ['A low residual risk depends entirely on control effectiveness evidence being current.'],
    whatToInvestigate: ['Overdue remediation.', 'Residual risk reduced without evidence of control testing.'],
    relatedProcesses: [{ label: 'Investigations & Enforcement', route: '/help/user-manual#investigations' }],
    demoTalkingPoints: ['Use this to show risk-based supervision in practice.'],
    screenshots: ['e360-overview'],
    status: 'AVAILABLE',
  },
  {
    key: 'aml_confidential',
    group: 'conduct',
    label: 'AML restricted',
    audience: 'internal',
    whatIsIt: 'Restricted financial-crime intelligence, visible only to cleared staff.',
    questionAnswered: 'Is there sensitive intelligence about this firm that only cleared officers may see?',
    regulatoryImportance:
      'Some financial-crime material cannot be shared with the firm or with uncleared staff without prejudicing action.',
    sourceOfInformation: ['Restricted intelligence records held under additional access control'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Restricted record', meaning: 'The intelligence item, shown only where clearance permits.' },
      { field: 'Clearance basis', meaning: 'Why the viewer is permitted to see it.' },
    ],
    howToInterpret: [
      'Absence of content does not mean absence of intelligence — it may mean the viewer is not cleared.',
      'Visibility is enforced server-side; the manual’s persona filter is documentation only.',
    ],
    whatToInvestigate: ['Nothing should be exported from this section without an explicit handling decision.'],
    relatedProcesses: [{ label: 'Investigations & Enforcement', route: '/help/user-manual#investigations' }],
    demoTalkingPoints: [
      'Do not open restricted content in an external-facing demo.',
      'Use it to demonstrate that confidentiality is enforced by the server, not the screen.',
    ],
    screenshots: [],
    status: 'AVAILABLE',
  },
  {
    key: 'resilience',
    group: 'conduct',
    label: 'Operational resilience',
    audience: 'internal',
    whatIsIt: 'Outsourcing arrangements, critical service providers and recorded operational incidents.',
    questionAnswered: 'Can this firm keep delivering critical services, and what depends on third parties?',
    regulatoryImportance:
      'Concentration on a shared provider turns a single vendor failure into a market-wide event.',
    sourceOfInformation: ['Outsourcing notifications (F5)', 'Incident reporting'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Provider / service', meaning: 'The third party and the function it performs.' },
      { field: 'Criticality', meaning: 'Whether the service is material to continuity.' },
      { field: 'Incidents', meaning: 'Recorded outages and their impact.' },
    ],
    howToInterpret: ['Compare providers across your portfolio — concentration is only visible in aggregate.'],
    whatToInvestigate: ['Critical outsourcing with no notification on file.', 'Repeat incidents with the same provider.'],
    relatedProcesses: [{ label: 'Post-Licensing Services', route: '/help/user-manual#post-licensing' }],
    demoTalkingPoints: ['Show sector-wide provider concentration as a supervisory question.'],
    screenshots: ['e360-overview'],
    status: 'AVAILABLE',
  },
  {
    key: 'examinations',
    group: 'oversight',
    label: 'Examinations',
    audience: 'internal',
    whatIsIt: 'Onsite and offsite examinations performed on the firm, with their findings and closure state.',
    questionAnswered: 'What have we examined, what did we find, and has it been fixed?',
    regulatoryImportance: 'Examination findings are the evidentiary backbone of later enforcement.',
    sourceOfInformation: ['Examination programme (F8)', 'Thematic reviews'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Examination / scope', meaning: 'What was examined and how.' },
      { field: 'Findings', meaning: 'Deficiencies raised, with severity.' },
      { field: 'Closure state', meaning: 'Whether remediation has been accepted.' },
    ],
    howToInterpret: ['Repeat findings across cycles indicate a governance failure, not an isolated control gap.'],
    whatToInvestigate: ['Findings closed without evidence.', 'Long gaps since the last examination on a high-risk firm.'],
    relatedProcesses: [{ label: 'Thematic & Supervisory Reviews', route: '/help/user-manual#thematic-reviews' }],
    demoTalkingPoints: ['Link an examination finding through to an enforcement outcome.'],
    screenshots: ['thm-reviews'],
    status: 'AVAILABLE',
  },
  {
    key: 'enforcement',
    group: 'oversight',
    label: 'Enforcement',
    audience: 'internal',
    whatIsIt: 'Directions, sanctions and monetary penalties issued to the firm.',
    questionAnswered: 'What formal action has the regulator taken, and has the firm complied?',
    regulatoryImportance: 'Enforcement is the credibility of the regime; it must be accurate, currency-correct and defensible.',
    sourceOfInformation: ['Enforcement workspace', 'Penalty register with server-authoritative currency resolution'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Action / direction', meaning: 'What was required of the firm.' },
      { field: 'Penalty amount and currency', meaning: 'The monetary sanction in the regulator’s resolved base currency, with provenance.' },
      { field: 'Compliance state', meaning: 'Whether the direction has been complied with.' },
    ],
    howToInterpret: [
      'Penalty currency is resolved server-side from the regulator’s configuration; displayed currency carries provenance.',
      'An unpaid penalty appears in the fees and payments ledger, not only here.',
    ],
    whatToInvestigate: ['Directions past their compliance date.', 'Penalties recorded but never settled.'],
    relatedProcesses: [
      { label: 'Investigations & Enforcement', route: '/help/user-manual#investigations' },
      { label: 'Fees & Payments', route: '/help/user-manual#fees-payments' },
    ],
    demoTalkingPoints: ['Show currency provenance on a penalty — it is not a display preference.'],
    screenshots: ['enf-queue', 'pen-register'],
    status: 'AVAILABLE',
  },
  {
    key: 'regulatory_requests',
    group: 'oversight',
    label: 'Regulatory requests',
    audience: 'any',
    whatIsIt: 'Information requests issued to the firm and controlled change submissions made by it.',
    questionAnswered: 'What is currently open between the regulator and this firm?',
    regulatoryImportance: 'Open requests are the live workload of supervision and the clearest SLA measure on both sides.',
    sourceOfInformation: ['Post-licensing service requests (F5)', 'RFIs raised in licensing, returns and complaints'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Request type', meaning: 'Information request or controlled change.' },
      { field: 'Status', meaning: 'Open, responded, closed or overdue.' },
      { field: 'Due date', meaning: 'The response deadline driving escalation.' },
    ],
    howToInterpret: ['A controlled change request that has been approved will have produced a governed post-approval effect elsewhere in the profile.'],
    whatToInvestigate: ['Overdue responses.', 'Approved changes with no corresponding effect recorded.'],
    relatedProcesses: [{ label: 'Post-Licensing Services', route: '/help/user-manual#post-licensing' }],
    demoTalkingPoints: ['Follow an approved change request through to its effect on the canonical record.'],
    screenshots: ['lic-requests'],
    status: 'AVAILABLE',
  },
  {
    key: 'documents',
    group: 'records',
    label: 'Documents',
    audience: 'any',
    whatIsIt: 'The evidence on file for this entity, with version and validity.',
    questionAnswered: 'What documentary evidence do we hold, and is it still valid?',
    regulatoryImportance: 'Evidence that cannot be produced later is evidence the regulator does not have.',
    sourceOfInformation: ['Secure document storage across registration, licensing, returns and supervision'],
    temporal: AS_AT,
    importantFields: [
      { field: 'Document / type', meaning: 'What the evidence is and which process produced it.' },
      { field: 'Version', meaning: 'Superseded documents remain available for audit.' },
      { field: 'Validity', meaning: 'Expiry-bearing documents such as certificates and attestations.' },
    ],
    howToInterpret: ['Access is through short-lived signed links; the access itself is audited.'],
    whatToInvestigate: ['Expired mandatory documents.', 'Evidence replaced immediately before an examination.'],
    relatedProcesses: [{ label: 'Audit & Evidence', route: '/help/user-manual#audit-evidence' }],
    demoTalkingPoints: ['Mention the 5-minute signed URL and the audit of document access.'],
    screenshots: ['e360-overview'],
    status: 'AVAILABLE',
  },
  {
    key: 'correspondence',
    group: 'records',
    label: 'Correspondence',
    audience: 'any',
    whatIsIt: 'The formal communications exchanged with the entity, as a single thread history.',
    questionAnswered: 'What have we formally said to this firm, and what has it said to us?',
    regulatoryImportance: 'Regulatory action depends on being able to prove the firm was told, when and in what terms.',
    sourceOfInformation: ['Correspondence threads', 'Notification delivery records'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Thread / subject', meaning: 'The matter under discussion.' },
      { field: 'Direction', meaning: 'Outbound from the regulator or inbound from the firm.' },
      { field: 'Sent / received (UTC)', meaning: 'The timestamps that establish notice.' },
    ],
    howToInterpret: ['Delivery failure of a formal notice is a material fact — check the delivery record, not just the send record.'],
    whatToInvestigate: ['Unanswered formal correspondence.', 'Notices with failed delivery.'],
    relatedProcesses: [{ label: 'Correspondence & Cases', route: '/help/user-manual#correspondence' }],
    demoTalkingPoints: ['Show a single thread carrying the whole conversation on one matter.'],
    screenshots: ['corr-inbox'],
    status: 'AVAILABLE',
  },
  {
    key: 'provenance',
    group: 'records',
    label: 'Provenance',
    audience: 'internal',
    whatIsIt: 'The record of where each canonical value came from, who changed it, and when.',
    questionAnswered: 'Why does the profile say what it says, and on whose authority?',
    regulatoryImportance:
      'Provenance is what makes the profile defensible in an appeal, a tribunal or an external assessment.',
    sourceOfInformation: ['Change sets, governed RPCs and the audit trail across all modules'],
    temporal: CURRENT_ONLY,
    importantFields: [
      { field: 'Value / field', meaning: 'The canonical item whose history is shown.' },
      { field: 'Source process', meaning: 'The governed process that wrote it.' },
      { field: 'Actor and UTC timestamp', meaning: 'Who acted and exactly when.' },
      { field: 'Reason', meaning: 'The rationale recorded at the time of the change.' },
    ],
    howToInterpret: [
      'Every canonical change has a governed writer; direct database edits by users are not possible from the browser.',
      'A value with no provenance entry predates canonical governance and should be treated as unverified.',
    ],
    whatToInvestigate: ['Values changed outside a recognised process.', 'Changes without a recorded reason.'],
    relatedProcesses: [{ label: 'Audit & Evidence', route: '/help/user-manual#audit-evidence' }],
    demoTalkingPoints: [
      'This is the strongest single screen for a regulator audience — it proves the record is defensible.',
    ],
    screenshots: ['adm-audit-logs'],
    status: 'AVAILABLE',
  },
];

export const ENTITY_360_BY_KEY: Record<string, Entity360SectionDoc> = Object.fromEntries(
  ENTITY_360_SECTIONS.map((s) => [s.key, s]),
);
