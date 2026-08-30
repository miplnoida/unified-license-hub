/**
 * Canonical User Manual & Demo Playbook registry — TYPES.
 *
 * This registry is DOCUMENTATION ONLY. It drives:
 *   - the in-application manual at /help/user-manual,
 *   - the generated markdown under docs/user-manual/,
 *   - the documentation coverage gate (npm run verify:user-manual).
 *
 * It must never be imported by business logic and must contain no React,
 * so plain node/bun tooling can consume it.
 */

/** Documentation visibility. Never a security control — routes/RLS enforce access. */
export type ManualAudience = 'internal' | 'external' | 'any';

/** Honest implementation state of a documented capability. */
export type FeatureStatus =
  | 'AVAILABLE'
  | 'CONFIGURATION REQUIRED'
  | 'IN DEVELOPMENT'
  | 'TRACK-B / FUTURE'
  | 'FINAL-E2E VERIFICATION PENDING';

/** How (or whether) AI participates in a documented process. */
export type AiInvolvement =
  | 'NO AI'
  | 'DETERMINISTIC AUTOMATION'
  | 'AI-ASSISTED'
  | 'HUMAN DECISION';

export type PersonaKey =
  | 'super_admin'
  | 'admin'
  | 'supervisor'
  | 'licensing_officer'
  | 'analyst'
  | 'legal_compliance'
  | 'applicant'
  | 'pre_licensee'
  | 'licensee_primary'
  | 'licensee_secondary';

export interface PersonaDoc {
  key: PersonaKey;
  label: string;
  audience: ManualAudience;
  /** Application role(s) in `app_role` that map to this persona. */
  roles: string[];
  purpose: string;
  startingDashboard: { label: string; route: string };
  mainMenu: string[];
  access: string[];
  responsibilities: string[];
  canDo: string[];
  cannotDo: string[];
  makerChecker: string;
  dailyWorkflow: string[];
  workQueue: string[];
  usefulReports: string[];
  /** Server contract(s) that actually enforce this persona's authority. */
  enforcedBy: string[];
}

/** A screen/route referenced from the manual. */
export interface ManualLink {
  label: string;
  route: string;
  audience?: ManualAudience;
}

export interface ProcessSection {
  /** Stable anchor id, e.g. `licensing`. */
  id: string;
  title: string;
  chapter: string;
  audience: ManualAudience;
  status: FeatureStatus;
  /** Free-form module classification used by the coverage gate. */
  module: string;
  purpose: string;
  actors: string[];
  preconditions: string[];
  whereToStart: ManualLink[];
  processFlow: string[];
  statusLifecycle: { status: string; meaning: string }[];
  userActions: { action: string; effect: string }[];
  makerChecker: string;
  notifications: string[];
  slaEscalation: string[];
  evidence: string[];
  audit: string[];
  exceptions: string[];
  aiInvolvement: AiInvolvement;
  aiNote?: string;
  screenshots: string[];
  demoNotes: string[];
  relatedSections?: string[];
}

export interface NarrativeSection {
  id: string;
  title: string;
  chapter: string;
  audience: ManualAudience;
  status: FeatureStatus;
  /** Markdown-ish paragraphs / bullet blocks. */
  body: { heading?: string; paragraphs?: string[]; bullets?: string[] }[];
  screenshots?: string[];
  links?: ManualLink[];
}

export interface Chapter {
  id: string;
  title: string;
  audience: ManualAudience;
  summary: string;
  /** Ordered ids of process/narrative sections belonging to the chapter. */
  sectionIds: string[];
}

export interface JourneyStep {
  step: number;
  actor: PersonaKey | 'system';
  action: string;
  route?: string;
  outcome: string;
  aiInvolvement: AiInvolvement;
}

export interface JourneyDoc {
  id: string;
  code: string;
  title: string;
  audience: ManualAudience;
  status: FeatureStatus;
  purpose: string;
  modulesTraversed: string[];
  steps: JourneyStep[];
  evidence: string[];
  demoNotes: string[];
  screenshots: string[];
}

export interface Entity360SectionDoc {
  /** Must match a key in E360_SECTIONS (sectionCatalogue.tsx). */
  key: string;
  group: string;
  label: string;
  audience: ManualAudience;
  whatIsIt: string;
  questionAnswered: string;
  regulatoryImportance: string;
  sourceOfInformation: string[];
  temporal: string;
  importantFields: { field: string; meaning: string }[];
  howToInterpret: string[];
  whatToInvestigate: string[];
  relatedProcesses: ManualLink[];
  demoTalkingPoints: string[];
  screenshots: string[];
  status: FeatureStatus;
}

export interface AiSurfaceDoc {
  /** Must match `ai_governance_surfaces.code`. */
  code: string;
  label: string;
  owningModule: string;
  audience: ManualAudience;
  status: FeatureStatus;
  businessPurpose: string;
  input: string[];
  output: string[];
  confidence: string;
  explanation: string;
  humanControl: string[];
  decisionAuthority: string;
  provenance: string[];
  failureBehaviour: string;
  governance: string[];
  route?: string;
  screenshots: string[];
}

export interface AiDemoScenario {
  id: string;
  title: string;
  persona: PersonaKey;
  startingScreen: ManualLink;
  scenario: string;
  whatToClick: string[];
  aiOutputToHighlight: string[];
  confidenceAndRationale: string;
  humanDecisionPoint: string;
  overrideDemonstration: string;
  auditEvidence: string[];
  keyTalkingPoint: string;
}

export interface DemoScriptStep {
  step: number;
  persona: PersonaKey;
  screen: ManualLink;
  sequence: string;
  expectedScreen: string;
  keyMessage: string;
  aiTalkingPoint?: string;
  fallback: string;
}

export interface DemoScript {
  id: string;
  title: string;
  durationMinutes: number;
  audienceNote: string;
  focus: string[];
  recordsToUse: string[];
  steps: DemoScriptStep[];
}

export type ScreenshotStatus =
  | 'CURRENT'
  | 'NEEDS_CAPTURE'
  | 'NEEDS_REFRESH'
  | 'FINAL_E2E_VERIFIED';

export interface ScreenshotEntry {
  id: string;
  persona: PersonaKey | 'public' | 'shared';
  process: string;
  route: string;
  section: string;
  caption: string;
  /** Public path under /user-manual/screenshots/... — empty until captured. */
  file: string;
  head: string;
  capturedDate: string;
  dataClassification: 'SYNTHETIC/DEMO-SAFE' | 'NON-SENSITIVE CONFIGURATION' | 'PENDING CAPTURE';
  chapter: string;
  status: ScreenshotStatus;
  /**
   * Mandatory whenever `status` is NEEDS_CAPTURE: the honest reason the running
   * environment could not produce the shot (missing persona session, missing
   * demo-safe record, configuration required). Never fabricate the image.
   */
  needsCaptureReason?: string;
}

export interface ManualMeta {
  version: string;
  generatedDate: string;
  verifiedDate: string;
  repositoryHead: string;
  certificationStatus: string;
  lastE2eVerifiedHead: string | null;
  manualStatus: string;
  route: string;
  menuLocation: string;
}
