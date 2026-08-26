/**
 * MC-07.3 — Business labels and formatters for the Conduct 360 fact view.
 *
 * The view never shows raw enum tokens, identifiers, table names or RPC names.
 * Everything a supervisor reads passes through this module. Nothing here
 * derives, sums or re-rates an authoritative measure — formatting only.
 */

const HUMANISE_OVERRIDES: Record<string, string> = {
  sla: 'SLA',
  rfi: 'information request',
  ppoc: 'PPOC',
  aml: 'AML',
};

/** Turns a stored token such as `under_review` into `Under review`. */
export function humanise(value: string | null | undefined, fallback = 'Not recorded'): string {
  if (value === null || value === undefined) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  const words = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().split(' ');
  const mapped = words.map((w) => HUMANISE_OVERRIDES[w] ?? w);
  const first = mapped[0];
  return [first.charAt(0).toUpperCase() + first.slice(1), ...mapped.slice(1)].join(' ');
}

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  open: 'Open',
  received: 'Received',
  acknowledged: 'Acknowledged',
  triaged: 'Triaged',
  under_assessment: 'Under assessment',
  under_review: 'Under review',
  under_investigation: 'Under investigation',
  investigation: 'Under investigation',
  awaiting_information: 'Awaiting information',
  pending_response: 'Awaiting response',
  in_progress: 'In progress',
  validated: 'Validated',
  escalated: 'Escalated',
  confirmed: 'Confirmed',
  resolved: 'Resolved',
  closed: 'Closed',
  completed: 'Completed',
  verified: 'Verified',
  paid: 'Paid',
  dismissed: 'Dismissed',
  withdrawn: 'Withdrawn',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  waived: 'Waived',
  discontinued: 'Discontinued',
  unspecified: 'Not recorded',
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  informational: 'Informational',
  unspecified: 'Not rated',
};

const SYSTEMIC_LABEL: Record<string, string> = {
  unassessed: 'Not yet assessed',
  none: 'No systemic potential',
  low: 'Low systemic potential',
  medium: 'Medium systemic potential',
  high: 'High systemic potential',
  confirmed: 'Confirmed systemic potential',
};

const HARM_LABEL: Record<string, string> = {
  none: 'No consumer harm identified',
  minor: 'Minor consumer harm',
  moderate: 'Moderate consumer harm',
  significant: 'Significant consumer harm',
  severe: 'Severe consumer harm',
};

const SLA_STATE_LABEL: Record<string, string> = {
  not_tracked: 'No deadline set',
  within: 'Within deadline',
  on_track: 'Within deadline',
  due_soon: 'Due soon',
  overdue: 'Past deadline',
  breached: 'Past deadline',
};

const OPEN_ITEM_TYPE_LABEL: Record<string, string> = {
  investigation: 'Investigation',
  information_request: 'Information request',
  rfi: 'Information request',
  reconsideration: 'Reconsideration request',
  supervisory_action: 'Supervisory action',
  action: 'Supervisory action',
  complaint: 'Complaint',
};

const COMPARISON_LABEL: Record<string, string> = {
  '>': 'above',
  '>=': 'at or above',
  '<': 'below',
  '<=': 'at or below',
  '=': 'equal to',
  '==': 'equal to',
  gt: 'above',
  gte: 'at or above',
  lt: 'below',
  lte: 'at or below',
  eq: 'equal to',
};

/** Plain-language names for the server measure keys shown as tiles. */
const MEASURE_LABEL: Record<string, string> = {
  complaints_received_in_window: 'Complaints received',
  complaints_open_now: 'Complaints open now',
  complaints_closed_in_window: 'Complaints closed',
  complaints_upheld_in_window: 'Complaints upheld',
  complaints_overdue_now: 'Complaints past deadline',
  signals_raised_in_window: 'Conduct signals raised',
  signals_open_now: 'Conduct signals open now',
  patterns_detected_in_window: 'Patterns detected',
  patterns_confirmed_now: 'Patterns confirmed',
  alerts_raised_in_window: 'Conduct alerts raised',
  alerts_open_now: 'Conduct alerts open now',
  redress_ordered_amount: 'Redress ordered',
  redress_paid_amount: 'Redress paid',
  total: 'Total',
  items_required: 'Redress items required',
  items_completed: 'Redress items completed',
  items_outstanding: 'Redress items outstanding',
  items_overdue: 'Redress items past due date',
  amount_ordered: 'Amount ordered',
  amount_paid: 'Amount paid',
  amount_outstanding: 'Amount outstanding',
  systemic_potential_high: 'Signals with high systemic potential',
  confirmed: 'Confirmed',
  under_review: 'Under review',
  dismissed: 'Dismissed',
  open: 'Open',
  findings_recorded: 'Findings recorded',
  open_complaints: 'Open complaints',
  open_investigations: 'Open investigations',
  open_information_requests: 'Open information requests',
  open_reconsiderations: 'Open reconsideration requests',
  open_supervisory_actions: 'Open supervisory actions',
  overdue_supervisory_actions: 'Supervisory actions past due date',
  complaints_received: 'Complaints received',
  complaints_closed: 'Complaints closed',
  signals_raised: 'Conduct signals raised',
  patterns_detected: 'Patterns detected',
  alerts_raised: 'Conduct alerts raised',
  entity_complaints_in_window: 'Complaints for this entity',
  sector_complaints_in_window: 'Complaints across the sector',
  sector_entities_with_complaints: 'Sector entities with complaints',
  sector_average_complaints_per_entity: 'Sector average per entity',
  sector: 'Sector',
};

const AMOUNT_MEASURE = /(amount|_amount$)/i;

export const isAmountMeasure = (key: string): boolean => AMOUNT_MEASURE.test(key);

export const statusLabel = (v: string | null | undefined) =>
  STATUS_LABEL[String(v ?? '').toLowerCase()] ?? humanise(v, 'Not recorded');
export const severityLabel = (v: string | null | undefined) =>
  SEVERITY_LABEL[String(v ?? '').toLowerCase()] ?? humanise(v, 'Not rated');
export const systemicLabel = (v: string | null | undefined) =>
  SYSTEMIC_LABEL[String(v ?? '').toLowerCase()] ?? humanise(v, 'Not yet assessed');
export const harmLabel = (v: string | null | undefined) =>
  HARM_LABEL[String(v ?? '').toLowerCase()] ?? humanise(v, 'Not assessed');
export const slaStateLabel = (v: string | null | undefined) =>
  SLA_STATE_LABEL[String(v ?? '').toLowerCase()] ?? humanise(v, 'No deadline set');
export const openItemTypeLabel = (v: string | null | undefined) =>
  OPEN_ITEM_TYPE_LABEL[String(v ?? '').toLowerCase()] ?? humanise(v, 'Supervisory item');
export const comparisonLabel = (v: string | null | undefined) =>
  COMPARISON_LABEL[String(v ?? '').trim().toLowerCase()] ?? 'compared with';
export const measureLabel = (key: string) => MEASURE_LABEL[key] ?? humanise(key, key);
export const outcomeLabel = (v: string | null | undefined) =>
  v ? humanise(v, 'Outcome not recorded') : 'Outcome not recorded';

/** Formats a server count exactly as returned — no arithmetic. */
export function formatCount(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString('en-US');
}

export function formatAmount(value: unknown, currency?: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const formatted = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${formatted}` : formatted;
}

export function formatDate(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: unknown): string {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '—';
  return `${formatDate(value)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export const severityTone = (v: string | null | undefined): 'critical' | 'high' | 'medium' | 'low' | 'neutral' => {
  switch (String(v ?? '').toLowerCase()) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'medium': return 'medium';
    case 'low': return 'low';
    default: return 'neutral';
  }
};
