/**
 * MC-06 — Business language for the pattern (cluster) layer.
 *
 * A Pattern is a recurring behaviour or trend detected by an explainable rule.
 * It is not a Signal (supervisory intelligence requiring assessment), not an
 * Alert (attention/threshold notification) and not a Complaint (an individual
 * consumer case). Nothing technical — rule internals, identifiers, table names
 * or dedupe keys — is ever shown to a supervisor, so every raw value used by
 * the UI is translated here.
 */

export const PATTERN_TYPE_LABEL: Record<string, string> = {
  entity_signal_recurrence: 'Repeated concerns at one entity',
  entity_product_signal_recurrence: 'Repeated concerns on one product',
  entity_channel_signal_recurrence: 'Repeated concerns on one channel',
  complaint_issue_recurrence: 'Repeated consumer complaints on the same issue',
  complaint_outcome_recurrence: 'Repeated adverse complaint outcomes',
  rising_signal_frequency: 'Rising frequency of concerns',
  severity_concentration: 'Concentration of serious concerns',
  systemic_potential_recurrence: 'Repeated concerns with systemic potential',
  sector_product_cross_entity: 'Same product concern across several entities',
};

/** One-line "what happened" description per pattern type. */
export const PATTERN_TYPE_NARRATIVE: Record<string, string> = {
  entity_signal_recurrence: 'The same entity has attracted repeated supervisory concerns within the review window.',
  entity_product_signal_recurrence: 'Repeated supervisory concerns relate to the same product at the same entity.',
  entity_channel_signal_recurrence: 'Repeated supervisory concerns relate to the same distribution channel at the same entity.',
  complaint_issue_recurrence: 'Consumers have raised the same type of complaint against this entity more than once in the review window.',
  complaint_outcome_recurrence: 'Several complaints against this entity have concluded with adverse outcomes for consumers.',
  rising_signal_frequency: 'The volume of supervisory concerns has increased materially compared with the preceding period.',
  severity_concentration: 'An unusually high share of the concerns recorded in the window are serious.',
  systemic_potential_recurrence: 'Repeated concerns have been assessed as having potential to affect the wider market.',
  sector_product_cross_entity: 'The same product concern has appeared at more than one entity in this sector.',
};

export const PATTERN_STATUS_LABEL: Record<string, string> = {
  open: 'Awaiting review',
  under_review: 'Under review',
  confirmed: 'Confirmed pattern',
  dismissed: 'Dismissed',
};

export const PATTERN_STATUS_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  open: 'secondary',
  under_review: 'secondary',
  confirmed: 'destructive',
  dismissed: 'outline',
};

export const PATTERN_SEVERITY_LABEL: Record<string, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};

export const PATTERN_SEVERITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline', medium: 'secondary', high: 'default', critical: 'destructive',
};

/** Business names for the member record kinds — kept deliberately distinct. */
export const MEMBER_KIND_LABEL: Record<string, string> = {
  signal: 'Conduct signals',
  complaint: 'Consumer complaints',
  complaint_outcome: 'Complaint outcomes',
};

export const MEMBER_KIND_SINGULAR: Record<string, string> = {
  signal: 'Conduct signal',
  complaint: 'Consumer complaint',
  complaint_outcome: 'Complaint outcome',
};

export const MEMBER_KIND_DESCRIPTION: Record<string, string> = {
  signal: 'Supervisory intelligence items that contributed to this pattern. Each remains a separate signal for assessment.',
  complaint: 'Individual consumer cases that contributed to this pattern. The cases are unaffected by the pattern.',
  complaint_outcome: 'Concluded complaint decisions that contributed to this pattern.',
};

export const PATTERN_HISTORY_LABEL: Record<string, string> = {
  DETECTED: 'Pattern detected',
  RE_EVALUATED: 'Pattern re-evaluated',
  REVIEW: 'Review decision recorded',
  EVIDENCE_LINKED: 'Evidence attached',
  SIGNAL_RAISED: 'Conduct signal raised',
  ALERT_RAISED: 'Conduct alert raised',
};

export const EVIDENCE_TYPE_LABEL: Record<string, string> = {
  document: 'Document', email: 'Email', call_transcript: 'Call transcript',
  system_log: 'System log', screenshot: 'Screenshot', contract: 'Contract',
  metric: 'Metric extract', other: 'Other',
};

/** Plain-language comparison wording. */
export const OPERATOR_PHRASE: Record<string, string> = {
  '>': 'more than',
  '>=': 'at least',
  '<': 'less than',
  '<=': 'no more than',
  '=': 'exactly',
  '==': 'exactly',
};

/** Business names for the measures a rule can evaluate. */
export const METRIC_LABEL: Record<string, string> = {
  entity_signal_recurrence: 'Concerns recorded for the entity',
  entity_product_signal_recurrence: 'Concerns recorded for the product',
  entity_channel_signal_recurrence: 'Concerns recorded for the channel',
  complaint_issue_recurrence: 'Complaints on the same issue',
  complaint_outcome_recurrence: 'Adverse complaint outcomes',
  rising_signal_frequency: 'Increase against the previous period',
  severity_concentration: 'Share of serious concerns',
  systemic_potential_recurrence: 'Concerns with systemic potential',
  sector_product_cross_entity: 'Entities affected by the same product concern',
};

export const humanise = (value?: string | null) =>
  !value ? '—' : value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export const label = (map: Record<string, string>, value?: string | null) =>
  !value ? '—' : map[value] ?? humanise(value);

/** "9 complaints" / "38%" — a measured value in supervisor language. */
export function formatMeasure(value?: number | string | null, unit?: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const rounded = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return unit === 'percent' ? `${rounded}%` : rounded;
}

/** "9 vs limit of 5" for the register's measure column. */
export function measureVsThreshold(
  value?: number | string | null,
  threshold?: number | string | null,
  unit?: string | null,
  operator?: string | null,
): string {
  const measured = formatMeasure(value, unit);
  if (threshold === null || threshold === undefined) return measured;
  const phrase = OPERATOR_PHRASE[operator ?? ''] ?? 'above';
  return `${measured} (rule: ${phrase} ${formatMeasure(threshold, unit)})`;
}

/** "What happened" sentence for the pattern detail header. */
export function patternNarrative(p: {
  pattern_type?: string | null;
  entity_name?: string | null;
  product_name?: string | null;
  channel_name?: string | null;
  member_count?: number | null;
  distinct_entity_count?: number | null;
  window_days?: number | null;
}): string {
  const base = PATTERN_TYPE_NARRATIVE[p.pattern_type ?? '']
    ?? 'A recurring behaviour has been detected by a supervisory monitoring rule.';
  const bits: string[] = [];
  if (p.entity_name) bits.push(p.entity_name);
  else if ((p.distinct_entity_count ?? 0) > 1) bits.push(`${p.distinct_entity_count} entities`);
  if (p.product_name) bits.push(`product: ${p.product_name}`);
  if (p.channel_name) bits.push(`channel: ${p.channel_name}`);
  const where = bits.length ? ` Affected: ${bits.join(' · ')}.` : '';
  const count = p.member_count
    ? ` ${p.member_count} record${p.member_count === 1 ? '' : 's'} contributed${p.window_days ? ` over ${p.window_days} days` : ''}.`
    : '';
  return `${base}${where}${count}`;
}

/**
 * "Why was this detected" in one sentence, from the rule's measure, threshold
 * and comparison — never the stored rule definition.
 */
export function patternReason(p: {
  metric?: string | null;
  metric_value?: number | string | null;
  metric_unit?: string | null;
  threshold_value?: number | string | null;
  comparison_operator?: string | null;
  rule_code?: string | null;
}): string {
  const measure = METRIC_LABEL[p.metric ?? ''] ?? humanise(p.metric);
  const phrase = OPERATOR_PHRASE[p.comparison_operator ?? ''] ?? 'above';
  return `${measure} reached ${formatMeasure(p.metric_value, p.metric_unit)}, and the rule flags anything ${phrase} ${formatMeasure(p.threshold_value, p.metric_unit)}.`;
}

/** Deterministic "what should I review next" checklist. */
export function reviewNextSteps(p: {
  status?: string | null;
  member_count?: number | null;
  evidence_count?: number | string | null;
  raised_signal?: boolean;
  raised_alert?: boolean;
}): string[] {
  const steps: string[] = [];
  if (p.status === 'open') {
    steps.push('Open the contributing records and confirm they describe the same underlying behaviour.');
    steps.push('Record a review decision to take the pattern under review.');
  }
  if (p.status === 'under_review') {
    steps.push('Complete the assessment of the contributing records and any related supervisory history.');
    if (!Number(p.evidence_count ?? 0)) steps.push('Attach supporting evidence held in the conduct evidence repository.');
    steps.push('Confirm the pattern if the recurring behaviour is substantiated, or dismiss it with a reason.');
  }
  if (p.status === 'confirmed') {
    if (!p.raised_signal) steps.push('Raise a conduct signal so the behaviour is formally assessed as supervisory intelligence.');
    if (!p.raised_alert) steps.push('Raise a conduct alert if the concern requires immediate supervisory attention.');
    if (p.raised_signal && p.raised_alert) steps.push('Follow the raised signal and alert to completion — no further action is required on the pattern.');
  }
  if (p.status === 'dismissed') {
    steps.push('No action required. Reopen the pattern for review only if new information emerges.');
  }
  return steps.length ? steps : ['No action is outstanding on this pattern.'];
}

/** Whole days between two timestamps. */
export function windowLength(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / 86_400_000));
}
