/**
 * Workflow stage → notification event key mapping.
 *
 * The workflow designer must only offer notification points the dispatcher can
 * actually execute. Every stage type below maps to a canonical event key that
 * lives in `notification_event_configs`, so designer settings and the event
 * configuration screen manage the same records.
 */
export type WorkflowNotificationStage =
  | 'stage_entry'
  | 'stage_exit'
  | 'transition'
  | 'assignment'
  | 'sla_warning'
  | 'sla_breach'
  | 'external_party';

export interface WorkflowStageEvent {
  stage: WorkflowNotificationStage;
  label: string;
  eventKey: string;
  description: string;
  /** Recipient rule types that make sense for this stage. */
  suggestedRules: string[];
}

export const WORKFLOW_STAGE_EVENTS: WorkflowStageEvent[] = [
  {
    stage: 'stage_entry',
    label: 'Stage entry',
    eventKey: 'workflow.stage_entry',
    description: 'Fires when a record moves into a workflow step.',
    suggestedRules: ['workflow_step_approvers', 'assigned_officer', 'role'],
  },
  {
    stage: 'stage_exit',
    label: 'Stage exit',
    eventKey: 'workflow.stage_exit',
    description: 'Fires when a record leaves a workflow step.',
    suggestedRules: ['previous_workflow_actors', 'supervisor'],
  },
  {
    stage: 'transition',
    label: 'Transition',
    eventKey: 'workflow.transition',
    description: 'Fires on any approve / return / reject transition.',
    suggestedRules: ['next_step_role', 'previous_workflow_actors', 'applicant'],
  },
  {
    stage: 'assignment',
    label: 'Assignment',
    eventKey: 'workflow.assignment',
    description: 'Fires when a record is assigned to an officer.',
    suggestedRules: ['assigned_officer', 'supervisor'],
  },
  {
    stage: 'sla_warning',
    label: 'SLA warning',
    eventKey: 'workflow.sla_warning',
    description: 'Fires before an SLA deadline is reached.',
    suggestedRules: ['assigned_officer', 'supervisor', 'sla_process_team_leads'],
  },
  {
    stage: 'sla_breach',
    label: 'SLA breach',
    eventKey: 'workflow.sla_breach',
    description: 'Fires when an SLA deadline is missed.',
    suggestedRules: ['supervisor', 'sla_process_team_leads', 'regulator_team'],
  },
  {
    stage: 'external_party',
    label: 'External applicant / entity',
    eventKey: 'workflow.external_notice',
    description: 'Notifies the applicant or licensed entity outside the regulator.',
    suggestedRules: ['applicant', 'entity_primary_users', 'entity_secondary_users'],
  },
];

export function eventKeyForStage(stage: WorkflowNotificationStage): string {
  return WORKFLOW_STAGE_EVENTS.find((s) => s.stage === stage)?.eventKey || '';
}

export function stageForEventKey(eventKey: string): WorkflowNotificationStage | null {
  return WORKFLOW_STAGE_EVENTS.find((s) => s.eventKey === eventKey)?.stage ?? null;
}

/** All workflow-owned event keys, used to filter designer dropdowns. */
export const WORKFLOW_EVENT_KEYS = WORKFLOW_STAGE_EVENTS.map((s) => s.eventKey);
