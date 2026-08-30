import type { AiSurfaceDoc } from './types';

/**
 * Governed AI surface documentation.
 *
 * One entry per row in `ai_governance_surfaces`. The coverage gate compares
 * these codes against the live registry (or the recorded census below when the
 * database is unavailable) and fails on any undocumented surface.
 *
 * Every surface in this platform is ADVISORY_HUMAN_REVIEWED with
 * authoritative_write_path = NONE. No AI surface writes canonical regulatory
 * data and no AI surface takes a regulatory decision.
 */

/** Live census recorded at the manual HEAD (8 governed surfaces, all ACTIVE). */
export const AI_SURFACE_CENSUS = {
  recordedAt: '2026-08-30',
  governedSurfaces: 8,
  activeSurfaces: 8,
  advisoryClassification: 'ADVISORY_HUMAN_REVIEWED (enforced by check constraint)',
  authoritativeWritePath: 'NONE (enforced by check constraint)',
};

/** How to describe automation honestly. */
export const AUTOMATION_CLASSIFICATION: { kind: string; meaning: string; examples: string[] }[] = [
  {
    kind: 'DETERMINISTIC AUTOMATION',
    meaning:
      'Rules and mathematics executed by the server. Same inputs always produce the same output, and the output is reproducible and auditable. This is NOT AI.',
    examples: [
      'Ownership traversal and UBO percentage mathematics',
      'Return due-date generation and overdue calculation',
      'Fee assessment, late-fee tiers and FX conversion at an effective-dated rate',
      'Workflow routing and approval-authority resolution',
    ],
  },
  {
    kind: 'AI-ASSISTED',
    meaning:
      'A language model drafts narrative, summaries, observations or questions from data the platform already holds. The output is advisory, must be reviewed by a human, and never becomes canonical by itself.',
    examples: [
      'Application assessment observations',
      'Prudential and supervisory analysis narratives',
      'Conduct intelligence and management-reporting drafting',
      'Fit & proper media reading summaries',
    ],
  },
  {
    kind: 'HUMAN DECISION',
    meaning:
      'A determination made by an authorised officer and recorded with rationale. Authority comes from the decision-authority matrix and is enforced server-side under maker-checker.',
    examples: [
      'Registration acceptance, licence approval and refusal',
      'Fit & proper determinations',
      'Risk ratings, enforcement action and penalties',
      'Waivers, refunds and amendment acceptance',
    ],
  },
];

const COMMON_GOVERNANCE = [
  'Registered in the AI surface registry with an advisory classification and lifecycle state.',
  'Bound to an approved model in the AI model registry.',
  'Every invocation is written to the AI activity/provenance ledger with actor, surface, model and UTC timestamp.',
  'Suspension is supported: a surface can be suspended with a recorded reason and stops being callable.',
  'No authoritative write path — the surface cannot alter canonical regulatory data.',
];

const NOT_CLAIM_BASE =
  'Do not present the output as a regulatory finding, decision, rating or determination, and do not claim accuracy figures that have not been measured.';

export const AI_SURFACES: AiSurfaceDoc[] = [
  {
    code: 'APPLICATION_ASSESSMENT',
    label: 'Application assessment support',
    owningModule: 'application_management',
    audience: 'internal',
    status: 'AVAILABLE',
    businessPurpose:
      'Highlights points in a submitted licence application that an assessor may wish to consider, so nothing obvious is missed on a first read.',
    input: ['Submitted application forms and declared data', 'Attached document metadata', 'Sector and licence-type context'],
    output: ['Observations and points to consider', 'Questions an assessor may wish to raise as an RFI'],
    confidence:
      'No numeric confidence score is produced. Treat every observation as a prompt for officer verification.',
    explanation:
      'Observations reference the application content they were drawn from, so the assessor can check each one against the filing.',
    humanControl: [
      'The assessor reads the observations alongside the application; nothing is pre-filled into the assessment record.',
      'The assessor decides what, if anything, becomes an RFI or an assessment finding.',
    ],
    decisionAuthority:
      'HUMAN DECISION. Recommendation and approval remain with the assessing officer and an independent approver under maker-checker.',
    provenance: ['Approved model recorded on the surface', 'Instructions resolved server-side in the edge function', 'Invocation logged in the AI activity ledger'],
    failureBehaviour:
      'If the model is unavailable the assessment proceeds normally without observations. Assessment never depends on AI availability.',
    governance: COMMON_GOVERNANCE,
    route: '/applications/queue',
    screenshots: ['lic-app-queue', 'ai-surfaces'],
  },
  {
    code: 'PRUDENTIAL_ANALYSIS',
    label: 'Prudential analysis narrative',
    owningModule: 'prudential_supervision',
    audience: 'internal',
    status: 'AVAILABLE',
    businessPurpose:
      'Drafts a narrative reading of already-computed prudential indicators so a supervisor can prepare analysis faster.',
    input: ['Deterministically computed prudential metrics and thresholds', 'Reporting period context'],
    output: ['Narrative reading of the recorded indicators', 'Movement explanations and suggested lines of enquiry'],
    confidence: 'No confidence score. The metrics are deterministic; only the wording is generated.',
    explanation: 'The narrative names the metrics and periods it describes so each statement is checkable against the figures.',
    humanControl: ['Supervisor reviews and edits the wording before it is used in any supervisory product.'],
    decisionAuthority: 'HUMAN DECISION. The surface proposes no rating and takes no supervisory action.',
    provenance: ['Approved model on the surface', 'Server-side instruction resolution', 'AI activity ledger entry per invocation'],
    failureBehaviour: 'The prudential dashboard and metrics remain fully available; only the narrative is absent.',
    governance: COMMON_GOVERNANCE,
    route: '/supervision/prudential',
    screenshots: ['prud-dashboard', 'ai-activity'],
  },
  {
    code: 'SUPERVISORY_ANALYSIS',
    label: 'Supervisory analysis report',
    owningModule: 'supervisory_intelligence',
    audience: 'internal',
    status: 'AVAILABLE',
    businessPurpose: 'Drafts a supervisory analysis report from recorded supervisory data for officer review.',
    input: ['Recorded supervisory data for the selected entity or portfolio', 'Period and scope selected by the officer'],
    output: ['Draft analysis sections', 'Observations and suggested follow-up'],
    confidence: 'No confidence score is claimed.',
    explanation: 'Draft sections cite the supervisory records they summarise.',
    humanControl: ['The officer accepts, edits or discards the draft; nothing is published automatically.'],
    decisionAuthority: 'HUMAN DECISION.',
    provenance: ['Approved model', 'Server-side instructions', 'AI activity ledger'],
    failureBehaviour: 'Analysis is prepared manually; the underlying data views are unaffected.',
    governance: COMMON_GOVERNANCE,
    route: '/governance/ai/activity',
    screenshots: ['ai-activity'],
  },
  {
    code: 'CROSS_ENTITY_INTELLIGENCE',
    label: 'Cross-entity supervisory intelligence advisory',
    owningModule: 'market_conduct',
    audience: 'internal',
    status: 'AVAILABLE',
    businessPurpose:
      'Drafts narrative readings, movement explanations, questions and hypotheses over deterministic cross-entity conduct facts for supervisory review.',
    input: ['Deterministic cross-entity conduct facts and aggregates'],
    output: ['Narrative readings', 'Questions and hypotheses for supervisors to test'],
    confidence: 'No confidence score. Hypotheses are explicitly unproven and labelled as such.',
    explanation: 'Each statement is tied to the deterministic fact set it was drawn from.',
    humanControl: ['A supervisor must test any hypothesis before it influences supervisory work.'],
    decisionAuthority: 'HUMAN DECISION. The surface confirms no risk and changes no record.',
    provenance: ['Approved model', 'Server-side instructions', 'AI activity ledger'],
    failureBehaviour: 'The deterministic conduct facts remain available without narrative.',
    governance: COMMON_GOVERNANCE,
    route: '/conduct/intelligence',
    screenshots: ['cond-attention', 'ai-activity'],
  },
  {
    code: 'SUPERVISORY_PLANNING_ASSISTANCE',
    label: 'Supervisory planning assistance',
    owningModule: 'market_conduct',
    audience: 'internal',
    status: 'AVAILABLE',
    businessPurpose: 'Assists supervisors in drafting planning wording strictly from recorded supervisory information.',
    input: ['Recorded supervisory plan, coverage and risk information'],
    output: ['Draft planning wording and coverage commentary'],
    confidence: 'No confidence score.',
    explanation: 'Released instruction versions only, resolved server-side, so the drafting basis is reproducible.',
    humanControl: ['Mandatory human review before any wording enters an operational record.'],
    decisionAuthority: 'HUMAN DECISION. Plan content and approval remain with the accountable supervisor.',
    provenance: ['Approved model', 'Released instruction version recorded per invocation', 'AI activity ledger'],
    failureBehaviour: 'Planning continues manually.',
    governance: COMMON_GOVERNANCE,
    route: '/supervision/plans',
    screenshots: ['ai-instructions'],
  },
  {
    code: 'MANAGEMENT_REPORTING_ASSISTANCE',
    label: 'Supervisory management reporting assistance',
    owningModule: 'market_conduct',
    audience: 'internal',
    status: 'AVAILABLE',
    businessPurpose:
      'Assists supervisors in drafting management commentary strictly from deterministic supervisory management information: summarising the period, explaining recorded movements, narrating emerging risk reporting, commenting on recorded coverage and summarising an evidence pack.',
    input: ['Deterministic supervisory management information for the reported period'],
    output: ['Draft management commentary sections', 'Evidence-pack summary'],
    confidence: 'No confidence score.',
    explanation: 'Released instruction versions only, resolved server-side.',
    humanControl: ['Mandatory human review before any wording is adopted into management reporting.'],
    decisionAuthority: 'HUMAN DECISION.',
    provenance: ['Approved model', 'Released instruction version', 'AI activity ledger'],
    failureBehaviour: 'Management reporting is drafted manually from the same deterministic figures.',
    governance: COMMON_GOVERNANCE,
    route: '/governance/ai/instructions',
    screenshots: ['ai-instructions', 'ai-assurance'],
  },
  {
    code: 'FP_MEDIA_READING',
    label: 'Fit and proper media reading',
    owningModule: 'fit_and_proper',
    audience: 'internal',
    status: 'AVAILABLE',
    businessPurpose:
      'Summarises openly available media material gathered during fit-and-proper screening so an officer can verify it efficiently.',
    input: ['Openly available media material supplied to the screening process'],
    output: ['Summary of the material and the points an officer should verify'],
    confidence:
      'No confidence score, and no assertion that the material is true, relevant or about the correct individual.',
    explanation: 'Each summary point references the source material it came from.',
    humanControl: ['The officer verifies identity and relevance before any of it informs an assessment.'],
    decisionAuthority: 'HUMAN DECISION. The surface records no finding and no determination.',
    provenance: ['Approved model', 'Server-side instructions', 'AI activity ledger'],
    failureBehaviour: 'Screening proceeds with manual review of the material.',
    governance: COMMON_GOVERNANCE,
    route: '/fit-and-proper/individuals',
    screenshots: ['fpa-individuals'],
  },
  {
    code: 'DASHBOARD_INSIGHTS',
    label: 'Dashboard observations',
    owningModule: 'analytics',
    audience: 'internal',
    status: 'AVAILABLE',
    businessPurpose: 'Suggests observations on dashboard figures to speed up interpretation.',
    input: ['Deterministically computed dashboard aggregates'],
    output: ['Short observations on movements and outliers'],
    confidence: 'No confidence score. The figures themselves are deterministic.',
    explanation: 'Observations name the metric and period they refer to.',
    humanControl: ['Observations are commentary only and are never stored as supervisory findings.'],
    decisionAuthority: 'HUMAN DECISION.',
    provenance: ['Approved model', 'Server-side instructions', 'AI activity ledger'],
    failureBehaviour: 'The dashboard renders all figures without commentary.',
    governance: COMMON_GOVERNANCE,
    route: '/analytics/ai-insights',
    screenshots: ['ai-insights', 'ana-dashboard'],
  },
];

export const AI_SURFACE_BY_CODE: Record<string, AiSurfaceDoc> = Object.fromEntries(
  AI_SURFACES.map((s) => [s.code, s]),
);

/** Statements that must never be made about this platform's AI. */
export const AI_MUST_NOT_CLAIM: string[] = [
  'AI does not autonomously issue regulatory decisions.',
  'AI does not replace maker-checker; approval authority is unchanged and enforced server-side.',
  'UBO and ownership mathematics is deterministic, not AI.',
  'Do not claim predictive accuracy, hit rates or model performance without measured evidence.',
  'Do not describe deterministic rules (due dates, fees, FX, routing, traversal) as AI.',
  'Do not present unfinished or placeholder AI capability as operational.',
  'Do not claim AI can alter canonical regulatory data — every surface has authoritative_write_path = NONE.',
  NOT_CLAIM_BASE,
];
