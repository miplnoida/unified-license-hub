/**
 * Phase 3B — Personal Questionnaire validation states.
 *
 * Derived from the existing form response; no second form engine. Values must
 * match the `fp_assessments.pq_state` guard trigger.
 */
export type PqState =
  | 'draft'
  | 'incomplete'
  | 'ready_to_submit'
  | 'submitted'
  | 'amendment_required';

export const PQ_STATE_META: Record<PqState, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-muted text-muted-foreground border-border' },
  incomplete: { label: 'Incomplete', className: 'bg-warning/15 text-warning border-warning/30' },
  ready_to_submit: { label: 'Ready to submit', className: 'bg-primary/10 text-primary border-primary/30' },
  submitted: { label: 'Submitted', className: 'bg-success/15 text-success border-success/30' },
  amendment_required: {
    label: 'Amendment required',
    className: 'bg-destructive/15 text-destructive border-destructive/30',
  },
};

export interface PqField {
  id: string;
  label?: string | null;
  is_required?: boolean | null;
}

/**
 * Derive the PQ state from required-field completeness.
 * Never discards values: it only reports state, it does not mutate answers.
 */
export function derivePqState(
  fields: PqField[],
  values: Record<string, unknown>,
  opts: { submitted?: boolean; amendmentRequired?: boolean; touched?: boolean } = {}
): PqState {
  if (opts.amendmentRequired) return 'amendment_required';
  if (opts.submitted) return 'submitted';

  const answered = (id: string) => {
    const v = values?.[id];
    if (v === null || v === undefined) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  };

  const anyAnswered = fields.some((f) => answered(f.id));
  if (!anyAnswered && !opts.touched) return 'draft';

  const missing = fields.filter((f) => f.is_required && !answered(f.id));
  return missing.length === 0 ? 'ready_to_submit' : 'incomplete';
}

/** Required field ids still missing — used to explain the `incomplete` state. */
export function missingRequiredFields(
  fields: PqField[],
  values: Record<string, unknown>
): PqField[] {
  return fields.filter((f) => {
    if (!f.is_required) return false;
    const v = values?.[f.id];
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim().length === 0;
    if (Array.isArray(v)) return v.length === 0;
    return false;
  });
}
