/**
 * Phase 3D — assessment historical comparison classes.
 * Mirrors `public.fp_assessment_comparison()` output.
 */
export type FpChangeClass = 'new' | 'changed' | 'unchanged' | 'resolved' | 'worsened';

export const FP_CHANGE_META: Record<FpChangeClass, { label: string; className: string }> = {
  new: { label: 'New', className: 'bg-warning/15 text-warning border-warning/30' },
  changed: { label: 'Changed', className: 'bg-primary/10 text-primary border-primary/30' },
  unchanged: { label: 'Unchanged', className: 'bg-muted text-muted-foreground border-border' },
  resolved: { label: 'Resolved', className: 'bg-success/15 text-success border-success/30' },
  worsened: { label: 'Worsened', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const SEV_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };

/** Client-side mirror of the SQL classification — used by unit tests. */
export function classifyChange(
  current: { severity?: string | null } | null,
  prior: { severity?: string | null } | null
): FpChangeClass {
  if (!prior) return 'new';
  if (!current) return 'resolved';
  const c = SEV_RANK[current.severity ?? 'none'] ?? 0;
  const p = SEV_RANK[prior.severity ?? 'none'] ?? 0;
  if (c > p) return 'worsened';
  if (c !== p) return 'changed';
  return 'unchanged';
}
