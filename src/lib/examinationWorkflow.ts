import type { ExaminationStage } from '@/hooks/useExaminations';
import { engagementPhrasing } from '@/lib/supervisoryEngagement';

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

export const businessActionLabel = (toStage?: string | null, engagementType?: string | null) =>
  engagementPhrasing((toStage && ACTION_LABELS[toStage]) || 'Continue', engagementType);

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

export const stageGuidance = (stage?: string | null, engagementType?: string | null) =>
  engagementPhrasing((stage && STAGE_GUIDANCE[stage]) || '', engagementType);

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

/** Section of the workspace where a blocking item can be resolved. */
export type BlockerSection = CurrentStepKey;

export interface Blocker {
  text: string;
  section?: BlockerSection;
}

export interface Guidance {
  /** Items relating to the current step that the user should clear. */
  blockers: Blocker[];
  /**
   * Mandatory prerequisites the database enforces for the next stage transition.
   * While any of these are present the progression action is disabled.
   */
  transitionBlockers: Blocker[];
  /** Progress checklist for the current step. */
  checklist: ChecklistItem[];
}

/** A supporting area the current step depends on, shown as an orchestration row. */
export interface DependencyRow {
  key: BlockerSection;
  title: string;
  detail: string;
  ok: boolean;
}


export interface GuidanceInput {
  stage?: string | null;
  /** The stage the primary action would move to — used to warn before the RPC rejects it. */
  nextStage?: string | null;
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
 * Blockers cover both the current step and the guard rules the database enforces
 * for the next transition, so the user is warned before the RPC rejects the move.
 * These mirror `examinationErrorMessage` — the UI never bypasses the guardrails.
 */
export function deriveGuidance(input: GuidanceInput): Guidance {
  const {
    stage,
    nextStage,
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

  const blockers: Blocker[] = [];
  const transitionBlockers: Blocker[] = [];
  const checklist: ChecklistItem[] = [];
  const add = (text: string, section?: BlockerSection) => {
    if (!blockers.some(b => b.text === text)) blockers.push({ text, section });
  };
  const addT = (text: string, section?: BlockerSection) => {
    if (!transitionBlockers.some(b => b.text === text)) transitionBlockers.push({ text, section });
  };


  switch (stage) {
    case 'planned':
      checklist.push({ label: 'Examination team assigned', done: team.length > 0 });
      checklist.push({ label: 'Lead examiner assigned', done: hasLead });
      break;
    case 'scoping':
      checklist.push({ label: 'Lead examiner assigned', done: hasLead });
      checklist.push({ label: 'Objectives entered', done: !!scoping?.objectives });
      checklist.push({ label: 'Scoping memo approved', done: scopeApproved });
      break;
    case 'pre_exam_request':
      checklist.push({ label: 'Information requests created', done: dataRequests.length > 0 });
      checklist.push({
        label: 'All requests issued',
        done: dataRequests.length > 0 && dataRequests.every((r: any) => r.status !== 'draft'),
      });
      if (outstandingRequests > 0) {
        add(
          `${outstandingRequests} information request${outstandingRequests === 1 ? ' is' : 's are'} still awaiting a response.`,
          'data-requests',
        );
      }
      break;
    case 'fieldwork':
      checklist.push({ label: 'Workpapers recorded', done: workpapers.length > 0 });
      checklist.push({ label: 'All workpapers independently reviewed', done: workpapers.length > 0 && workpapersPending === 0 });
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
      break;
    case 'remediation':
      checklist.push({ label: 'Every finding has a corrective action', done: findingsWithoutAction === 0 });
      checklist.push({ label: 'All corrective actions completed', done: openActions === 0 });
      break;
    default:
      break;
  }

  // Mandatory guard rules the database enforces on the next transition.
  if (nextStage === 'fieldwork') {
    if (!scopeApproved) addT('The scoping memo must be approved before fieldwork can begin.', 'scoping');
    if (!hasLead) addT('A lead examiner must be assigned before fieldwork can begin.', 'team');
  }
  if (nextStage === 'final_report') {
    if (workpapersPending > 0) {
      addT(
        `${workpapersPending} workpaper${workpapersPending === 1 ? ' requires' : 's require'} reviewer sign-off before the report can be finalised.`,
        'workpapers',
      );
    }
    if (findingsWithoutAction > 0) {
      addT(
        `${findingsWithoutAction} finding${findingsWithoutAction === 1 ? ' still requires' : 's still require'} a corrective action before the report can be finalised.`,
        'findings',
      );
    }
  }
  if (nextStage === 'closed' && openActions > 0) {
    addT(
      `${openActions} corrective action${openActions === 1 ? ' is' : 's are'} still open. The examination cannot close until they are resolved.`,
      'findings',
    );
  }

  return { blockers, transitionBlockers, checklist };
}

/**
 * Supporting areas the current step depends on. Rendered on Current step as
 * compact orchestration rows so the user can open the specialised screen
 * without leaving the guided workflow.
 */
export function dependencies(input: GuidanceInput): DependencyRow[] {
  const { stage, workpapers = [], findings = [], reports = [], dataRequests = [] } = input;
  const reviewed = workpapers.filter((w: any) => w.reviewed_at).length;
  const openFindings = findings.filter((f: any) => f.status !== 'closed');
  const withoutAction = openFindings.filter((f: any) => !f.remediation_action_id).length;
  const outstanding = dataRequests.filter((r: any) => r.status !== 'received').length;
  const openActions = findings.filter(
    (f: any) => f.remediation_action_id && f.action && f.action.status !== 'completed' && f.action.status !== 'closed',
  ).length;

  const wp: DependencyRow = {
    key: 'workpapers',
    title: 'Workpapers',
    detail: workpapers.length
      ? reviewed === workpapers.length
        ? 'All reviewed'
        : `${reviewed} of ${workpapers.length} reviewed`
      : 'No workpapers recorded yet',
    ok: workpapers.length > 0 && reviewed === workpapers.length,
  };

  const fnd: DependencyRow = {
    key: 'findings',
    title: 'Findings',
    detail: openFindings.length
      ? withoutAction
        ? `${withoutAction} finding${withoutAction === 1 ? '' : 's'} without a corrective action`
        : `${openFindings.length} open finding${openFindings.length === 1 ? '' : 's'}, all with corrective actions`
      : 'No open findings',
    ok: withoutAction === 0,
  };

  const requests: DependencyRow = {
    key: 'data-requests',
    title: 'Information requests',
    detail: dataRequests.length
      ? outstanding
        ? `${outstanding} awaiting a response`
        : 'All responses received'
      : 'No requests issued',
    ok: dataRequests.length > 0 && outstanding === 0,
  };

  const draftIssued = reports.some((r: any) => r.report_type === 'draft' && r.status === 'issued');
  const finalPrepared = reports.some((r: any) => r.report_type === 'final');
  const responseRecorded = reports.some((r: any) => !!r.management_response);

  switch (stage) {
    case 'fieldwork':
      return [requests, wp, fnd];
    case 'exit_meeting':
      return [wp, fnd];
    case 'draft_report':
      return [
        wp,
        fnd,
        { key: 'reports', title: 'Draft report', detail: draftIssued ? 'Issued to entity' : 'Not yet issued to the entity', ok: draftIssued },
      ];
    case 'management_response':
      return [
        wp,
        fnd,
        {
          key: 'reports',
          title: 'Management response',
          detail: responseRecorded ? 'Recorded' : 'Not yet recorded',
          ok: responseRecorded,
        },
      ];
    case 'final_report':
      return [
        wp,
        fnd,
        { key: 'reports', title: 'Final report', detail: finalPrepared ? 'Prepared' : 'Not yet prepared', ok: finalPrepared },
      ];
    case 'remediation':
      return [
        fnd,
        {
          key: 'findings',
          title: 'Corrective actions',
          detail: openActions ? `${openActions} still open` : 'All completed',
          ok: openActions === 0,
        },
      ];
    default:
      return [];
  }
}


export interface CapturedArea {
  key: BlockerSection;
  title: string;
  /** Plain-language lines describing what has been captured. Empty = nothing recorded. */
  lines: string[];
  status?: string;
  tone?: 'warn' | 'ok';
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

/** Read-only summary of everything already captured, for the Overview tab. */
export function capturedSummary(input: GuidanceInput): CapturedArea[] {
  const {
    scoping, team = [], dataRequests = [], workpapers = [], findings = [], reports = [], exitMeeting,
  } = input;

  const lead = (team.find((t: any) => t.team_role === 'lead_examiner') as any)?.member_name;
  const received = dataRequests.filter((r: any) => r.status === 'received').length;
  const issued = dataRequests.filter((r: any) => r.status === 'issued').length;
  const draftReq = dataRequests.filter((r: any) => r.status === 'draft').length;
  const overdue = dataRequests.filter(
    (r: any) => r.status === 'issued' && r.due_date && new Date(r.due_date) < new Date(),
  ).length;
  const reviewed = workpapers.filter((w: any) => w.reviewed_at).length;
  const openFindings = findings.filter((f: any) => f.status !== 'closed');
  const withoutAction = openFindings.filter((f: any) => !f.remediation_action_id).length;
  const focus = Array.isArray((scoping as any)?.risk_focus_areas)
    ? ((scoping as any).risk_focus_areas as any[]).filter(Boolean)
    : String((scoping as any)?.risk_focus_areas ?? '').split(',').map(s => s.trim()).filter(Boolean);

  const areas: CapturedArea[] = [];

  areas.push({
    key: 'scoping',
    title: 'Scoping memo',
    status: scoping?.approved_at ? 'Approved' : scoping?.objectives ? 'Drafted — not approved' : undefined,
    tone: scoping?.approved_at ? 'ok' : scoping?.objectives ? 'warn' : undefined,
    lines: [
      scoping?.objectives ? `Objectives: ${scoping.objectives}` : '',
      focus.length ? `Risk focus: ${focus.join(', ')}` : '',
      scoping?.approved_at ? `Approved ${fmtDate(scoping.approved_at)}` : '',
    ].filter(Boolean),
  });

  areas.push({
    key: 'team',
    title: 'Examination team',
    status: team.length ? `${team.length} member${team.length === 1 ? '' : 's'}` : undefined,
    tone: lead ? 'ok' : team.length ? 'warn' : undefined,
    lines: [
      lead ? `Lead examiner: ${lead}` : team.length ? 'No lead examiner assigned' : '',
      ...team
        .filter((t: any) => t.team_role !== 'lead_examiner')
        .map((t: any) => `${t.member_name ?? 'Team member'}${t.team_role ? ` — ${String(t.team_role).replace(/_/g, ' ')}` : ''}`),
    ].filter(Boolean),
  });

  areas.push({
    key: 'data-requests',
    title: 'Information requests',
    status: dataRequests.length ? `${received} of ${dataRequests.length} received` : undefined,
    tone: dataRequests.length ? (received === dataRequests.length ? 'ok' : 'warn') : undefined,
    lines: dataRequests.length
      ? [
          `${issued} awaiting a response, ${draftReq} not yet sent`,
          overdue ? `${overdue} overdue` : '',
        ].filter(Boolean)
      : [],
  });

  areas.push({
    key: 'workpapers',
    title: 'Workpapers',
    status: workpapers.length ? `${reviewed} of ${workpapers.length} reviewed` : undefined,
    tone: workpapers.length ? (reviewed === workpapers.length ? 'ok' : 'warn') : undefined,
    lines: workpapers.map((w: any) => `${w.area ?? 'Workpaper'} — ${workpaperStatusLabel(w)}`),
  });

  areas.push({
    key: 'exit-meeting',
    title: 'Exit meeting',
    status: exitMeeting?.meeting_date ? `Held ${fmtDate(exitMeeting.meeting_date)}` : undefined,
    tone: exitMeeting?.meeting_date ? 'ok' : undefined,
    lines: [exitMeeting?.matters_discussed ? `Matters discussed: ${exitMeeting.matters_discussed}` : ''].filter(Boolean),
  });

  areas.push({
    key: 'reports',
    title: 'Reports',
    status: reports.length ? `${reports.length} report${reports.length === 1 ? '' : 's'}` : undefined,
    lines: reports.map(
      (r: any) => `${String(r.report_type ?? 'report').replace(/_/g, ' ')} — ${reportStatusLabel(r)}`,
    ),
  });

  areas.push({
    key: 'findings',
    title: 'Findings and remediation',
    status: findings.length ? `${openFindings.length} open of ${findings.length}` : undefined,
    tone: withoutAction ? 'warn' : findings.length ? 'ok' : undefined,
    lines: findings.length
      ? [
          `${findings.length} finding${findings.length === 1 ? '' : 's'} recorded`,
          withoutAction
            ? `${withoutAction} without a corrective action`
            : 'Every open finding has a corrective action',
        ]
      : [],
  });

  return areas;
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
