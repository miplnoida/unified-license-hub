/**
 * Unified Rule Engine (ADM-RE-001/002/003) — shared client model.
 *
 * Pure helpers only: rule-type catalogue, condition/action shapes, the
 * plain-language rule summary shown in the editor preview, and the same
 * validation rules the database enforces server-side (R-ADM-019/020/021).
 * No existing module rule tables are touched by this engine.
 */

export type RuleType =
  | 'threshold'
  | 'trend'
  | 'peer_comparison'
  | 'pattern_detection'
  | 'cross_field_validation'
  | 'routing'
  | 'sla'
  | 'condition_monitoring'
  | 'recurrence'
  | 'scheduling'
  | 'macro_overlay'
  | 'group_contagion';

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type RuleStatus = 'draft' | 'active' | 'inactive';

export const RULE_TYPES: { value: RuleType; label: string; blurb: string }[] = [
  { value: 'threshold', label: 'Threshold', blurb: 'Metric breaches a fixed value.' },
  { value: 'trend', label: 'Trend / Sequential', blurb: 'Metric moves the same way over consecutive periods.' },
  { value: 'peer_comparison', label: 'Peer Comparison', blurb: 'Metric deviates from the sector peer average.' },
  { value: 'pattern_detection', label: 'Pattern Detection', blurb: 'Event count over a rolling window.' },
  { value: 'cross_field_validation', label: 'Cross-Field Validation', blurb: 'Relationship between two metrics must hold.' },
  { value: 'routing', label: 'Routing', blurb: 'Route a record to a role, team or queue.' },
  { value: 'sla', label: 'SLA', blurb: 'Stage exceeds its allowed duration.' },
  { value: 'condition_monitoring', label: 'Condition Monitoring', blurb: 'Licence condition deadlines and satisfaction.' },
  { value: 'recurrence', label: 'Recurrence', blurb: 'The same issue repeats for one entity.' },
  { value: 'scheduling', label: 'Scheduling', blurb: 'Calendar or event driven trigger.' },
  { value: 'macro_overlay', label: 'Macro Overlay', blurb: 'Sector-wide metric movement.' },
  { value: 'group_contagion', label: 'Group Contagion', blurb: 'Related group members breach together.' },
];

export const RULE_MODULES = [
  'licensing',
  'fit_and_proper',
  'prudential',
  'market_conduct',
  'returns',
  'enforcement',
  'notifications',
  'general',
] as const;

export const OPERATORS = [
  { value: 'lt', label: 'is less than', symbol: '<' },
  { value: 'lte', label: 'is less than or equal to', symbol: '≤' },
  { value: 'gt', label: 'is greater than', symbol: '>' },
  { value: 'gte', label: 'is greater than or equal to', symbol: '≥' },
  { value: 'eq', label: 'equals', symbol: '=' },
  { value: 'neq', label: 'does not equal', symbol: '≠' },
] as const;

export type Operator = (typeof OPERATORS)[number]['value'];

export const PATTERN_EVENT_TYPES = [
  { value: 'complaint', label: 'Complaints received' },
  { value: 'complaint_upheld', label: 'Complaints upheld' },
  { value: 'late_return', label: 'Late return submissions' },
  { value: 'threshold_breach', label: 'Prudential threshold breaches' },
] as const;

export const PATTERN_GROUPINGS = [
  { value: 'entity', label: 'Entity' },
  { value: 'product', label: 'Product' },
  { value: 'conduct_category', label: 'Conduct category' },
  { value: 'sector', label: 'Sector' },
] as const;

export const SCHEDULE_EVENTS = [
  { value: 'return_submitted', label: 'Return submitted' },
  { value: 'licence_expiring', label: 'Licence expiring in N days' },
  { value: 'condition_deadline', label: 'Condition deadline in N days' },
  { value: 'assessment_completed', label: 'Assessment completed' },
] as const;

export const ACTION_TYPES = [
  { value: 'generate_alert', label: 'Generate Alert' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'update_risk_status', label: 'Update Entity Risk Status' },
  { value: 'initiate_workflow', label: 'Initiate Workflow' },
  { value: 'log_ewi_event', label: 'Log Early-Warning Event' },
] as const;

export interface Predicate {
  metric_key?: string;
  operator?: Operator;
  value?: string | number;
  unit?: string;
  compare_metric_key?: string;
  field?: string;
}

export interface RuleConditions {
  predicates?: Predicate[];
  logic?: 'AND' | 'OR';
  sector_ids?: string[];
  /* trend */
  direction?: 'increasing' | 'decreasing';
  periods?: number;
  period_type?: 'monthly' | 'quarterly' | 'annual';
  magnitude_pct?: number;
  /* peer comparison / macro overlay */
  peer_deviation_pct?: number;
  /* pattern detection */
  event_type?: string;
  count_threshold?: number;
  window_days?: number;
  group_by?: string;
  comparison?: 'absolute' | 'sector_average';
  /* routing */
  destination_type?: 'role' | 'team' | 'user' | 'queue';
  destination?: string;
  /* scheduling */
  schedule_mode?: 'calendar' | 'event';
  frequency?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  day_offset?: number;
  event?: string;
  days_before?: number;
  /* sla */
  workflow_id?: string;
  stage?: string;
  duration_hours?: number;
  warning_pct?: number;
  /* group contagion */
  min_group_members?: number;
}

export interface RuleAction {
  type: string;
  template?: string;
  event_key?: string;
  recipient_role?: string;
  assigned_role?: string;
  due_in_days?: number;
  risk_status?: string;
  workflow_id?: string;
  workflow_name?: string;
  note?: string;
}

export interface EngineRule {
  id: string;
  rule_code: string;
  name: string;
  description: string | null;
  rule_type: RuleType;
  module: string;
  sub_module: string | null;
  tags: string[];
  severity: Severity;
  conditions: RuleConditions;
  actions: RuleAction[];
  suppression_days: number;
  status: RuleStatus;
  version: number;
  last_triggered_at: string | null;
  trigger_count: number;
  deactivation_reason: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export function emptyConditions(type: RuleType): RuleConditions {
  const base: RuleConditions = { predicates: [{ operator: 'lt' }], logic: 'AND', sector_ids: [] };
  switch (type) {
    case 'trend':
      return { ...base, direction: 'decreasing', periods: 3, period_type: 'quarterly' };
    case 'pattern_detection':
      return { ...base, event_type: 'complaint', count_threshold: 5, window_days: 30, group_by: 'entity', comparison: 'absolute' };
    case 'peer_comparison':
    case 'macro_overlay':
      return { ...base, peer_deviation_pct: 20 };
    case 'routing':
      return { ...base, destination_type: 'role', predicates: [{ field: '', operator: 'eq', value: '' }] };
    case 'scheduling':
      return { ...base, schedule_mode: 'calendar', frequency: 'monthly', day_offset: 0 };
    case 'sla':
      return { ...base, duration_hours: 72, warning_pct: 80 };
    case 'condition_monitoring':
      return { ...base, days_before: 14 };
    case 'group_contagion':
      return { ...base, min_group_members: 2 };
    default:
      return base;
  }
}

const opLabel = (op?: string) => OPERATORS.find((o) => o.value === op)?.label ?? 'compares to';
const titleCase = (s: string) => s.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Number of sectors is resolved by the caller; names keep the summary readable. */
export interface SummaryContext {
  sectorNames?: string[];
  workflowNames?: Record<string, string>;
}

/** Live plain-language description of the configured rule (ADM-RE-002). */
export function describeRule(
  rule: Pick<EngineRule, 'name' | 'rule_type' | 'severity' | 'conditions' | 'actions' | 'suppression_days'>,
  ctx: SummaryContext = {},
): string {
  const c = rule.conditions || {};
  const p = (c.predicates || [])[0] || {};
  const scope = (ctx.sectorNames && ctx.sectorNames.length)
    ? ` for ${ctx.sectorNames.join(', ')} entities`
    : '';
  let when = '';

  switch (rule.rule_type) {
    case 'threshold':
      when = `${titleCase(String(p.metric_key || 'the selected metric'))} ${opLabel(p.operator)} ${p.value ?? '—'}${p.unit ? ` ${p.unit}` : ''}`;
      break;
    case 'trend':
      when = `${titleCase(String(p.metric_key || 'the selected metric'))} is ${c.direction || 'decreasing'} for ${c.periods ?? 0} consecutive ${c.period_type || 'quarterly'} periods${c.magnitude_pct ? ` by more than ${c.magnitude_pct}% in total` : ''}`;
      break;
    case 'peer_comparison':
      when = `${titleCase(String(p.metric_key || 'the selected metric'))} deviates from the sector peer average by more than ${c.peer_deviation_pct ?? 0}%`;
      break;
    case 'macro_overlay':
      when = `the sector average for ${titleCase(String(p.metric_key || 'the selected metric'))} moves by more than ${c.peer_deviation_pct ?? 0}%`;
      break;
    case 'pattern_detection':
      when = `${titleCase(String(c.event_type || 'events'))} reach ${c.count_threshold ?? 0} or more per ${c.group_by || 'entity'} within a rolling ${c.window_days ?? 0} day window${c.comparison === 'sector_average' ? ', measured against the sector average' : ''}`;
      break;
    case 'cross_field_validation':
      when = `${titleCase(String(p.metric_key || 'field A'))} ${opLabel(p.operator)} ${titleCase(String(p.compare_metric_key || 'field B'))}`;
      break;
    case 'routing':
      when = `${(c.predicates || []).map((x) => `${titleCase(String(x.field || 'field'))} ${opLabel(x.operator)} "${x.value ?? ''}"`).join(` ${c.logic || 'AND'} `)}`;
      break;
    case 'sla':
      when = `a case stays in ${c.stage || 'the configured stage'} for more than ${c.duration_hours ?? 0} hours (warning at ${c.warning_pct ?? 0}% of the limit)`;
      break;
    case 'condition_monitoring':
      when = `a licence condition falls due within ${c.days_before ?? 0} days and is not yet satisfied`;
      break;
    case 'recurrence':
      when = `${titleCase(String(c.event_type || 'the same issue'))} recurs ${c.count_threshold ?? 2} or more times for the same entity within ${c.window_days ?? 0} days`;
      break;
    case 'scheduling':
      when = c.schedule_mode === 'event'
        ? `${titleCase(String(c.event || 'the selected event'))} occurs${c.days_before ? ` within ${c.days_before} days` : ''}`
        : `the ${c.frequency || 'monthly'} schedule is reached${c.day_offset ? ` with a ${c.day_offset} day offset` : ''}`;
      break;
    case 'group_contagion':
      when = `${c.min_group_members ?? 2} or more members of the same financial group breach ${titleCase(String(p.metric_key || 'the selected metric'))}`;
      break;
    default:
      when = 'the configured conditions are met';
  }

  const actions = (rule.actions || []).map((a) => {
    switch (a.type) {
      case 'generate_alert': return `raise a ${rule.severity} alert`;
      case 'send_notification': return `notify ${a.recipient_role ? titleCase(a.recipient_role) : 'the configured recipients'}`;
      case 'create_task': return `create a task for ${a.assigned_role ? titleCase(a.assigned_role) : 'the assigned role'}${a.due_in_days ? ` due in ${a.due_in_days} days` : ''}`;
      case 'update_risk_status': return `set the entity risk status to ${a.risk_status || 'the configured band'}`;
      case 'initiate_workflow': return `start the ${a.workflow_name || ctx.workflowNames?.[a.workflow_id || ''] || 'selected'} workflow`;
      case 'log_ewi_event': return 'log an early-warning event';
      default: return a.type;
    }
  });

  const suppression = rule.suppression_days > 0
    ? ` Repeat matches for the same entity are suppressed for ${rule.suppression_days} days${rule.severity === 'critical' ? ', except critical severity which always fires' : ''}.`
    : '';

  const actionText = actions.length ? actions.join(', ') : 'take no action yet';
  return `When ${when}${scope}, ${actionText}.${suppression}`;
}

/** Mirrors public.engine_rule_validate so the UI blocks before the server does. */
export function validateRule(rule: {
  name?: string;
  rule_type: RuleType;
  conditions: RuleConditions;
  actions: RuleAction[];
}): string[] {
  const errs: string[] = [];
  const c = rule.conditions || {};
  if (!rule.name?.trim()) errs.push('Rule name is required.');
  if (!(c.predicates || []).length) errs.push('At least one condition is required.');
  if (!(rule.actions || []).length) errs.push('At least one action on trigger is required.');

  if (
    ['threshold', 'trend', 'peer_comparison', 'macro_overlay', 'group_contagion'].includes(rule.rule_type) &&
    !(c.sector_ids || []).length
  ) {
    errs.push('Sector scope is required for threshold and early-warning rules.');
  }

  if (rule.rule_type === 'pattern_detection' && Number(c.window_days || 0) < 7) {
    errs.push('Pattern detection time window must be at least 7 days.');
  }

  for (const a of rule.actions || []) {
    if (a.type === 'initiate_workflow' && !a.workflow_id) errs.push('Initiate Workflow action requires a workflow.');
    if (a.type === 'generate_alert' && !a.template?.trim()) errs.push('Generate Alert action requires alert text.');
    if (a.type === 'send_notification' && !a.event_key?.trim()) errs.push('Send Notification action requires a notification event.');
    if (a.type === 'create_task' && !a.assigned_role?.trim()) errs.push('Create Task action requires an assigned role.');
  }
  return Array.from(new Set(errs));
}

/** Renders `{{metric}}`, `{{entity}}`, `{{value}}` style alert templates. */
export function renderTemplate(template: string, vars: Record<string, unknown>): string {
  return (template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? `{{${key}}}` : String(v);
  });
}
