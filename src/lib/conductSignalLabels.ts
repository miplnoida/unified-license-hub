/**
 * MC-05 — Business labels for the signal layer.
 *
 * The UI never shows raw enum values, table names or RPC names. Everything the
 * supervisor reads is translated here.
 */
export const SIGNAL_STATUS_LABEL: Record<string, string> = {
  new: 'New',
  under_review: 'Under review',
  validated: 'Validated',
  escalated: 'Escalated to alert',
  dismissed: 'Dismissed',
  closed: 'Closed',
};

export const SIGNAL_SOURCE_LABEL: Record<string, string> = {
  complaint: 'Consumer complaint',
  complaint_outcome: 'Complaint outcome',
  supervisory_observation: 'Supervisory observation',
  conduct_alert: 'Conduct alert',
  regulatory_return: 'Regulatory return data',
  manual_intelligence: 'Manual intelligence',
};

export const SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};

export const SYSTEMIC_LABEL: Record<string, string> = {
  unassessed: 'Not yet assessed',
  none: 'No systemic potential',
  low: 'Low systemic potential',
  medium: 'Medium systemic potential',
  high: 'High systemic potential',
};

export const ALERT_LINK_LABEL: Record<string, string> = {
  escalated_to: 'Raised from this signal',
  related: 'Related alert',
  source: 'Alert that originated this signal',
};

export const SIGNAL_HISTORY_LABEL: Record<string, string> = {
  CREATE: 'Signal raised',
  ASSIGN: 'Owner assigned',
  VALIDATE: 'Signal validated',
  DISMISS: 'Signal dismissed',
  REOPEN: 'Signal reopened',
  ESCALATE_TO_ALERT: 'Escalated to alert',
  LINK_ALERT: 'Alert linked',
  LINK_SOURCE: 'Source linked',
  LINK_EVIDENCE: 'Evidence linked',
};

export const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  document: 'Document', email: 'Email', call_transcript: 'Call transcript',
  system_log: 'System log', screenshot: 'Screenshot', contract: 'Contract', other: 'Other',
};

export const humanise = (value?: string | null) =>
  !value ? '—' : value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const label = (map: Record<string, string>, value?: string | null) =>
  !value ? '—' : map[value] ?? humanise(value);

export const SEVERITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline', medium: 'secondary', high: 'default', critical: 'destructive',
};

export const STATUS_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  new: 'secondary', under_review: 'secondary', validated: 'default',
  escalated: 'destructive', dismissed: 'outline', closed: 'outline',
};

/** Whole days since the given timestamp. */
export function ageInDays(iso?: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return ms < 0 ? 0 : Math.floor(ms / 86_400_000);
}
