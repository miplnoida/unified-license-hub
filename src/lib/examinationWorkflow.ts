import type { ExaminationStage } from '@/hooks/useExaminations';

/**
 * Presentation-only helpers for the examination module.
 *
 * The backend stage machine, RPCs, validations and audit behaviour are
 * untouched — this file only maps existing stages/data onto business
 * language for non-technical supervisory users.
 */

export type ExaminationPhase = 'preparation' | 'examination' | 'reporting' | 'remediation' | 'complete';

export const EXAMINATION_PHASES: { value: ExaminationPhase; label: string; description: string }[] = [
  { value: 'preparation', label: 'Preparation', description: 'Plan, scope and request information' },
  { value: 'examination', label: 'Examination', description: 'Perform fieldwork and hold the exit meeting' },
  { value: 'reporting', label: 'Reporting', description: 'Draft, issue and finalise the report' },
  { value: 'remediation', label: 'Remediation', description: 'Track corrective actions to completion' },
  { value: 'complete', label: 'Complete', description: 'Examination closed' },
];

const STAGE_PHASE: Record<string, ExaminationPhase> = {
  planned: 'preparation',
  scoping: 'preparation',
  pre_exam_request: 'preparation',
  fieldwork: 'examination',
  exit_meeting: 'examination',
  draft_report: 'reporting',
  management_response: 'reporting',
  final_report: 'reporting',
  remediation: 'remediation',
  closed: 'complete',
};

export const stagePhase = (stage?: string | null): ExaminationPhase | null =>
  stage ? STAGE_PHASE[stage] ?? null : null;

export const phaseLabel = (phase?: ExaminationPhase | null) =>
  EXAMINATION_PHASES.find(p => p.value === phase)?.label ?? '—';

/** Business-language label for the action that moves the examination to `toStage`. */
const ACTION_LABELS: Record<string, string> = {
  scoping: 'Start scoping',
  pre_exam_request: 'Finish scoping and continue',
  fieldwork: 'Start fieldwork',
  exit_meeting: 'Record exit meeting',
  draft_report: 'Prepare draft report',
  management_response: 'Record management response',
  final_report: 'Prepare final report',
  remediation: 'Start remediation',
  closed: 'Complete examination',
};

export const businessActionLabel = (toStage?: string | null) =>
  (toStage && ACTION_LABELS[toStage]) || 'Continue';

/** Short plain-language description of what the current stage asks the user to do. */
const STAGE_GUIDANCE: Record<string, string> = {
  planned: 'Assign the examination team and begin scoping.',
  scoping: 'Complete and approve the examination scope before fieldwork can begin.',
  pre_exam_request: 'Issue the information requests the entity must respond to before fieldwork.',
  fieldwork: 'Document examination procedures and evidence, and obtain independent review.',
  exit_meeting: 'Record the exit meeting outcome with the entity.',
  draft_report: 'Prepare the draft report, obtain approval and issue it to the entity.',
  management_response: "Record the entity's management response to the draft report.",
  final_report: 'Prepare and issue the final report.',
  remediation: 'Track corrective actions until every finding is resolved.',
  closed: 'This examination is closed. All sections are read-only.',
  cancelled: 'This examination was cancelled. All sections are read-only.',
};

export const stageGuidance = (stage?: string | null) =>
  (stage && STAGE_GUIDANCE[stage]) || '';

/** Which workspace panel is the "current step" for a given stage. */
export type CurrentStepKey = 'team' | 'scoping' | 'data-requests' | 'workpapers' | 'exit-meeting' | 'reports' | 'findings';

const STAGE_STEP: Record<string, CurrentStepKey> = {
  planned: 'team',
  scoping: 'scoping',
  pre_exam_request: 'data-requests',
  fieldwork: 'workpapers',
  exit_meeting: 'exit-meeting',
  draft_report: 'reports',
  management_response: 'reports',
  final_report: 'reports',
  remediation: 'findings',
  closed: 'findings',
  cancelled: 'findings',
};

export const currentStepKey = (stage?: string | null): CurrentStepKey =>
  (stage && STAGE_STEP[stage]) || 'scoping';

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface Guidance {
  /** Items the user must clear before the examination can progress. */
  blockers: string[];
  /** Progress checklist for the current step. */
  checklist: ChecklistItem[];
}

export interface GuidanceInput {
  stage?: string | null;
  scoping?: { objectives?: string | null; approved_at?: string | null } | null;
  team?: any[];
  dataRequests?: any[];
  workpapers?: any[];
  findings?: any[];
  reports?: any[];
  exitMeeting?: { meeting_date?: string | null; matters_discussed?: string | null } | null;
}

/**
 * Derives checklist + blocking items from data already loaded in the workspace.
 * These mirror the database guardrails surfaced by `examinationErrorMessage`,
 * so the UI warns about exactly what the RPC enforces — it never bypasses it.
 */
export function deriveGuidance(input: GuidanceInput): Guidance {
  const {
    stage,
    scoping,
    team = [],
    dataRequests = [],
    workpapers = [],
    findings = [],
    reports = [],
    exitMeeting,
  } = input;

  const hasLead = team.some((t: any) => t.team_role === 'lead_examiner');
  const scopeApproved = !!scoping?.approved_at;
  const outstandingRequests = dataRequests.filter((r: any) => r.status !== 'received').length;
  const workpapersPending = workpapers.filter((w: any) => !w.reviewed_at).length;
  const openFindings = findings.filter((f: any) => f.status !== 'closed');
  const findingsWithoutAction = openFindings.filter((f: any) => !f.remediation_action_id).length;
  const openActions = findings.filter(
    (f: any) => f.remediation_action_id && f.action && f.action.status !== 'completed' && f.action.status !== 'closed',
  ).length;

  const blockers: string[] = [];
  const checklist: ChecklistItem[] = [];

  switch (stage) {
    case 'planned':
      checklist.push({ label: 'Examination team assigned', done: team.length > 0 });
      checklist.push({ label: 'Lead examiner assigned', done: hasLead });
      if (!hasLead) blockers.push('A lead examiner is required before fieldwork can begin.');
      break;
    case 'scoping':
      checklist.push({ label: 'Lead examiner assigned', done: hasLead });
      checklist.push({ label: 'Objectives entered', done: !!scoping?.objectives });
      checklist.push({ label: 'Scoping memo approved', done: scopeApproved });
      if (!scopeApproved) blockers.push('The scoping memo must be approved before fieldwork can begin.');
      if (!hasLead) blockers.push('A lead examiner is required before fieldwork can begin.');
      break;
    case 'pre_exam_request':
      checklist.push({ label: 'Information requests created', done: dataRequests.length > 0 });
      checklist.push({
        label: 'All requests issued',
        done: dataRequests.length > 0 && dataRequests.every((r: any) => r.status !== 'draft'),
      });
      if (outstandingRequests > 0) {
        blockers.push(`${outstandingRequests} information request${outstandingRequests === 1 ? '' : 's'} still awaiting a response.`);
      }
      break;
    case 'fieldwork':
      checklist.push({ label: 'Workpapers recorded', done: workpapers.length > 0 });
      checklist.push({ label: 'All workpapers independently reviewed', done: workpapers.length > 0 && workpapersPending === 0 });
      if (workpapersPending > 0) {
        blockers.push(`${workpapersPending} workpaper${workpapersPending === 1 ? '' : 's'} still require reviewer sign-off.`);
      }
      break;
    case 'exit_meeting':
      checklist.push({ label: 'Exit meeting date recorded', done: !!exitMeeting?.meeting_date });
      checklist.push({ label: 'Matters discussed recorded', done: !!exitMeeting?.matters_discussed });
      break;
    case 'draft_report':
      checklist.push({ label: 'Draft report prepared', done: reports.some((r: any) => r.report_type === 'draft') });
      checklist.push({
        label: 'Draft report issued to entity',
        done: reports.some((r: any) => r.report_type === 'draft' && r.status === 'issued'),
      });
      break;
    case 'management_response':
      checklist.push({
        label: 'Management response recorded',
        done: reports.some((r: any) => !!r.management_response),
      });
      break;
    case 'final_report':
      checklist.push({ label: 'Final report prepared', done: reports.some((r: any) => r.report_type === 'final') });
      checklist.push({ label: 'All workpapers reviewed', done: workpapersPending === 0 });
      checklist.push({ label: 'Every open finding has a corrective action', done: findingsWithoutAction === 0 });
      if (workpapersPending > 0) {
        blockers.push(`${workpapersPending} workpaper${workpapersPending === 1 ? '' : 's'} require reviewer sign-off before the report can be finalised.`);
      }
      if (findingsWithoutAction > 0) {
        blockers.push(`${findingsWithoutAction} finding${findingsWithoutAction === 1 ? '' : 's'} still require corrective actions.`);
      }
      break;
    case 'remediation':
      checklist.push({ label: 'Every finding has a corrective action', done: findingsWithoutAction === 0 });
      checklist.push({ label: 'All corrective actions completed', done: openActions === 0 });
      if (openActions > 0) {
        blockers.push(`${openActions} corrective action${openActions === 1 ? ' is' : 's are'} still open. The examination cannot close until they are resolved.`);
      }
      if (findingsWithoutAction > 0) {
        blockers.push(`${findingsWithoutAction} finding${findingsWithoutAction === 1 ? '' : 's'} still require corrective actions.`);
      }
      break;
    default:
      break;
  }

  return { blockers, checklist };
}

/** Plain-language workpaper status derived from existing timestamps. */
export function workpaperStatusLabel(w: { prepared_at?: string | null; reviewed_at?: string | null }) {
  if (w.reviewed_at) return 'Reviewed and signed off';
  if (w.prepared_at) return 'Prepared — awaiting independent review';
  return 'Draft — awaiting preparer sign-off';
}

/** Plain-language data-request status. */
export function dataRequestStatusLabel(r: { status?: string | null; due_date?: string | null }) {
  if (r.status === 'received') return 'Response received';
  if (r.status === 'issued') {
    if (r.due_date && new Date(r.due_date) < new Date()) return 'Overdue';
    return 'Awaiting response';
  }
  return 'Not yet sent';
}

/** Report process step labels, in order. */
export const REPORT_STEPS = [
  { key: 'draft', label: 'Prepare report' },
  { key: 'in_review', label: 'Internal review' },
  { key: 'approved', label: 'Approval' },
  { key: 'issued', label: 'Issued to entity' },
  { key: 'response', label: 'Management response' },
] as const;

export function reportStepIndex(r: { status?: string | null; management_response?: string | null }) {
  if (r.management_response) return 4;
  const order = ['draft', 'in_review', 'approved', 'issued'];
  const idx = order.indexOf(String(r.status ?? 'draft'));
  return idx < 0 ? 0 : idx;
}

export function reportStatusLabel(r: { status?: string | null; management_response?: string | null }) {
  if (r.management_response) return 'Management response recorded';
  switch (r.status) {
    case 'draft': return 'Draft prepared — awaiting internal review';
    case 'in_review': return 'Review complete — awaiting approval';
    case 'approved': return 'Approved — ready to send to entity';
    case 'issued': return 'Issued to entity — awaiting management response';
    default: return String(r.status ?? '—');
  }
}

export const isTerminalStage = (stage?: string | null) => stage === 'closed' || stage === 'cancelled';
