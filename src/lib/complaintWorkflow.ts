/**
 * Pure derivations for the guided complaint case workspace.
 *
 * IMPORTANT: this file contains NO complaint state machine. Step order, step
 * labels and available actions come exclusively from the configured Complaint
 * Management Workflow (`get_complaint_tracking` /
 * `get_complaint_available_actions`). Everything here only *summarises* data
 * that the server already returned, so admin configuration changes flow
 * through without a code change.
 */

export type CaseSection =
  | 'overview'
  | 'current'
  | 'casework'
  | 'comms'
  | 'ai'
  | 'history';


export type CaseWorkSection =
  | 'jurisdiction'
  | 'triage'
  | 'investigation'
  | 'rfis'
  | 'classification'
  | 'outcome'
  | 'redress'
  | 'closure'
  | 'review';


export interface TrackingStep {
  step_key: string;
  label: string;
  order: number;
  is_current: boolean;
  is_terminal: boolean;
  is_start: boolean;
}

export interface ComplaintTracking {
  complaint_number?: string | null;
  status?: string | null;
  current_step_key?: string | null;
  current_step_label?: string | null;
  assigned_user_name?: string | null;
  assigned_role?: string | null;
  due_at?: string | null;
  sla_status?: string | null;
  instance_updated_at?: string | null;
  steps?: TrackingStep[];
  events?: unknown[];
  is_internal?: boolean;
  error?: string;
}

export interface WorkflowAction {
  action_key: string;
  label: string;
  action_type?: string;
  require_comments?: boolean;
  required_fields?: Array<{ key: string; label: string; required?: boolean; type?: string }>;
  target_step_key?: string | null;
  sort_order?: number;
  mutation_kind?: string | null;
}

export interface TaskLike {
  id: string;
  status: string;
  title?: string | null;
  due_date?: string | null;
}

export interface RfiLike {
  id: string;
  status: string;
  approval_state: string;
  due_at?: string | null;
  items?: Array<{ response_status: string; required?: boolean }>;
}

export interface ClosureReviewLike {
  decision: string;
  decided_at: string;
  qa_required?: boolean | null;
  evidence_complete?: boolean | null;
}

/* ------------------------------------------------------------------ tasks */

export interface TaskSummary {
  total: number;
  completed: number;
  open: number;
  overdue: number;
  label: string;
}

export function summariseTasks(tasks: TaskLike[] | undefined | null): TaskSummary {
  const rows = (tasks ?? []).filter(t => t.status !== 'cancelled');
  const completed = rows.filter(t => t.status === 'completed').length;
  const open = rows.length - completed;
  const now = Date.now();
  const overdue = rows.filter(
    t => t.status !== 'completed' && t.due_date && new Date(t.due_date).getTime() < now,
  ).length;
  return {
    total: rows.length,
    completed,
    open,
    overdue,
    label: rows.length === 0 ? 'No investigation work items created' : `${completed} of ${rows.length} done`,
  };
}

/* ------------------------------------------------------------------- RFIs */

export type RfiState =
  | 'none'
  | 'draft'
  | 'pending_approval'
  | 'rejected'
  | 'awaiting_response'
  | 'response_received'
  | 'closed';

export interface RfiSummary {
  state: RfiState;
  label: string;
  detail: string | null;
  dueAt: string | null;
  answered: number;
  totalQuestions: number;
  /** The RFI that currently needs the most attention (if any). */
  focusId: string | null;
  openCount: number;
}

const RFI_LABELS: Record<RfiState, string> = {
  none: 'No information request raised',
  draft: 'Draft being prepared internally',
  pending_approval: 'Awaiting internal approval',
  rejected: 'Returned for rework',
  awaiting_response: 'Waiting for regulated entity',
  response_received: 'Response received — review needed',
  closed: 'Information request closed',
};

/** Priority order — the most "attention needed" state wins. */
const RFI_PRIORITY: RfiState[] = [
  'rejected',
  'response_received',
  'pending_approval',
  'awaiting_response',
  'draft',
  'closed',
  'none',
];

function rfiState(r: RfiLike): RfiState {
  if (r.approval_state === 'rejected') return 'rejected';
  if (r.approval_state === 'pending_approval') return 'pending_approval';
  if (r.approval_state === 'draft') return r.status === 'cancelled' ? 'closed' : 'draft';
  // dispatched
  if (r.status === 'closed' || r.status === 'cancelled') return 'closed';
  if (r.status === 'submitted') return 'response_received';
  return 'awaiting_response';
}

export function summariseRfis(rfis: RfiLike[] | undefined | null): RfiSummary {
  const rows = rfis ?? [];
  if (rows.length === 0) {
    return {
      state: 'none',
      label: RFI_LABELS.none,
      detail: null,
      dueAt: null,
      answered: 0,
      totalQuestions: 0,
      focusId: null,
      openCount: 0,
    };
  }
  const scored = rows.map(r => ({ r, s: rfiState(r) }));
  scored.sort((a, b) => RFI_PRIORITY.indexOf(a.s) - RFI_PRIORITY.indexOf(b.s));
  const focus = scored[0];
  const items = focus.r.items ?? [];
  const answered = items.filter(i => i.response_status === 'responded').length;
  const openCount = scored.filter(x => x.s !== 'closed' && x.s !== 'none').length;
  const detailParts: string[] = [];
  if (items.length) detailParts.push(`${answered} of ${items.length} questions answered`);
  if (rows.length > 1) detailParts.push(`${rows.length} requests on this case`);
  return {
    state: focus.s,
    label: RFI_LABELS[focus.s],
    detail: detailParts.length ? detailParts.join(' · ') : null,
    dueAt: focus.r.due_at ?? null,
    answered,
    totalQuestions: items.length,
    focusId: focus.r.id,
    openCount,
  };
}

/* ---------------------------------------------------------------- closure */

/**
 * Plain-language label + meaning for a recorded closure/QA decision, so no
 * screen has to print raw codes like `qa_approved` to a business user.
 */
export function closureDecisionLabel(decision: string | null | undefined): {
  label: string;
  meaning: string;
} {
  switch (decision) {
    case 'closure_proposed':
      return {
        label: 'Proposed for closure',
        meaning: 'the officer recommended closing this complaint',
      };
    case 'closed':
      return {
        label: 'Closure assessment recorded',
        meaning: 'the closure assessment has been completed and recorded',
      };
    case 'qa_approved':
      return {
        label: 'QA approved',
        meaning: 'the closure assessment passed quality review',
      };
    case 'qa_returned':
      return {
        label: 'Returned to officer',
        meaning: 'quality review sent the assessment back for more work',
      };
    default:
      return { label: 'Decision recorded', meaning: '' };
  }
}


export interface ClosureSummary {
  latestDecision: string | null;
  decidedAt: string | null;
  qaRequired: boolean;
  qaApproved: boolean;
  proposed: boolean;
  label: string;
}

export function summariseClosure(reviews: ClosureReviewLike[] | undefined | null): ClosureSummary {
  const rows = [...(reviews ?? [])].sort(
    (a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime(),
  );
  const latest = rows[0];
  const qaApproved = rows.some(r => r.decision === 'qa_approved');
  const proposed = rows.some(r => r.decision === 'closure_proposed' || r.decision === 'closed');
  // QA review was removed from the closure flow; historical rows may still
  // carry the flag, but it never blocks closure any more.
  const qaRequired = false;
  const label = !latest
    ? 'No closure assessment recorded'
    : latest.decision === 'qa_approved'
      ? 'QA approved'
      : latest.decision === 'qa_returned'
        ? 'Returned to officer by QA'
        : latest.decision === 'closure_proposed'
          ? 'Closure recommended'
          : 'Closure assessment recorded';
  return {
    latestDecision: latest?.decision ?? null,
    decidedAt: latest?.decided_at ?? null,
    qaRequired,
    qaApproved,
    proposed,
    label,
  };
}

/* -------------------------------------------------- closure phase gating */

const CLOSURE_HINTS = ['clos', 'resolv', 'qa', 'final', 'outcome'];

/**
 * Whether closure/QA work is relevant *yet*. Presentation-only gate: the
 * server remains authoritative for what can actually be recorded.
 */
export function isClosurePhaseRelevant(
  actions: WorkflowAction[] | undefined | null,
  status: string | null | undefined,
  closure: ClosureSummary,
): boolean {
  if (closure.latestDecision) return true;
  if (status === 'resolved' || status === 'closed') return true;
  return (actions ?? []).some(a => {
    const hay = `${a.action_key} ${a.label} ${a.target_step_key ?? ''}`.toLowerCase();
    return CLOSURE_HINTS.some(h => hay.includes(h));
  });
}

/* --------------------------------------------------------------- readiness */

export interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  kind: 'required' | 'recommended';
  section?: CaseWorkSection;
}

export function buildReadiness(input: {
  tracking: ComplaintTracking | null | undefined;
  tasks: TaskSummary;
  rfi: RfiSummary;
  closure: ClosureSummary;
  closurePhase: boolean;
  hasLicensee: boolean;
  lastCommunicationAt?: string | null;
}): ReadinessItem[] {
  const items: ReadinessItem[] = [];

  if (input.tracking?.assigned_user_name || input.tracking?.assigned_role) {
    items.push({
      key: 'assigned',
      label: `Case owner: ${input.tracking.assigned_user_name || input.tracking.assigned_role}`,
      done: true,
      kind: 'required',
    });
  } else {
    items.push({
      key: 'assigned',
      label: 'No case owner recorded on the workflow step',
      done: false,
      kind: 'recommended',
    });
  }

  items.push({
    key: 'licensee',
    label: input.hasLicensee ? 'Regulated entity linked' : 'Regulated entity not linked',
    done: input.hasLicensee,
    kind: 'recommended',
    section: 'classification',
  });

  items.push({
    key: 'tasks',
    label:
      input.tasks.total === 0
        ? 'No investigation work items created'
        : `Investigation checklist: ${input.tasks.label}`,
    done: input.tasks.total > 0 && input.tasks.open === 0,
    kind: 'recommended',

    section: 'investigation',
  });

  if (input.rfi.state !== 'none') {
    items.push({
      key: 'rfi',
      label: `Information request: ${input.rfi.label}`,
      done: input.rfi.state === 'closed',
      kind: 'recommended',
      section: 'rfis',
    });
  }

  if (input.closurePhase) {
    items.push({
      key: 'closure',
      label: `Closure assessment: ${input.closure.label}`,
      done: input.closure.qaApproved || input.closure.latestDecision === 'closed',
      kind: 'recommended',
      section: 'closure',
    });
  }

  return items;
}

/* ----------------------------------------------------------- waiting state */

export interface WaitingState {
  label: string;
  detail: string | null;
}

export function deriveWaitingState(input: {
  actions: WorkflowAction[] | undefined | null;
  rfi: RfiSummary;
  closure: ClosureSummary;
  closurePhase: boolean;
  tracking: ComplaintTracking | null | undefined;
}): WaitingState | null {
  if (input.rfi.state === 'awaiting_response') {
    return {
      label: 'Waiting for the regulated entity to respond',
      detail: input.rfi.dueAt ? `Information request due ${new Date(input.rfi.dueAt).toLocaleDateString()}` : input.rfi.detail,
    };
  }
  if (input.rfi.state === 'pending_approval') {
    return {
      label: 'Waiting for internal approval of the information request',
      detail: input.rfi.detail,
    };
  }
  if ((input.actions ?? []).length === 0) {
    const who = input.tracking?.assigned_user_name || input.tracking?.assigned_role;
    const step = input.tracking?.current_step_label;
    return {
      label: who ? `Waiting for ${who} to act on this step` : 'No action is available to you at this step',
      detail: step
        ? `Current step: ${step}. This step is restricted to the roles configured for it in the approval workflow.`
        : null,
    };
  }

  return null;
}

/* ------------------------------------------------------------ misc helpers */

export function stepProgress(steps: TrackingStep[] | undefined | null): { index: number; total: number } {
  const rows = [...(steps ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const idx = rows.findIndex(s => s.is_current);
  return { index: idx >= 0 ? idx + 1 : 0, total: rows.length };
}

/** Human "your task" line derived from the configured action labels. */
export function yourTaskLine(actions: WorkflowAction[] | undefined | null): string | null {
  const rows = actions ?? [];
  if (rows.length === 0) return null;
  if (rows.length === 1) return `Your task: ${rows[0].label}`;
  return `You have ${rows.length} available actions on this step`;
}

export function targetStepLabel(
  action: WorkflowAction,
  steps: TrackingStep[] | undefined | null,
): string | null {
  if (!action.target_step_key) return null;
  const step = (steps ?? []).find(s => s.step_key === action.target_step_key);
  return step?.label ?? action.target_step_key;
}

/* ------------------------------------------------ investigation relevance */

export type InvestigationMode = 'not_relevant' | 'active' | 'read_only';

/**
 * Presentation-only decision on whether investigation work items / internal
 * notes should be editable at the complaint's *current* configured workflow
 * step.
 *
 * Deliberately configuration-driven: it never matches on step names or
 * statuses like "investigation". The only signals used are ones the configured
 * Complaint Management Workflow already returns —
 *   - is there a current step at all (`get_complaint_tracking`),
 *   - is that step terminal,
 *   - does this viewer have any available configured action on it
 *     (`get_complaint_available_actions`).
 * The server/RLS remains authoritative for what can actually be written.
 */
export function deriveInvestigationMode(input: {
  tracking: ComplaintTracking | null | undefined;
  actions: WorkflowAction[] | undefined | null;
  status: string | null | undefined;
  hasRecords: boolean;
  /** true while tracking/actions are still loading or failed to load. */
  contextUnknown?: boolean;
}): InvestigationMode {
  const status = String(input.status ?? '').toLowerCase();
  if (status === 'closed' || status === 'resolved' || status === 'rejected') return 'read_only';

  // Without trustworthy workflow context, fall back to previous behaviour
  // (editable unless closed) rather than blocking legitimate case work.
  if (input.contextUnknown) return 'active';

  const steps = input.tracking?.steps ?? [];
  const current = steps.find(s => s.is_current);
  const hasCurrentStep = !!(input.tracking?.current_step_key || current);

  if (!hasCurrentStep) return input.hasRecords ? 'read_only' : 'not_relevant';
  if (current?.is_terminal) return 'read_only';
  if ((input.actions ?? []).length === 0) return 'read_only';
  return 'active';
}
