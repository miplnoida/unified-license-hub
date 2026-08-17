export interface DecisionActionRationale {
  action?: string | null;
  action_type?: string | null;
  comments?: string | null;
}

const FINAL_ACTIONS = new Set([
  'approve', 'approved', 'conditional_approve', 'conditionally_approved',
  'reject', 'rejected', 'return', 'resubmission_requested', 'defer', 'deferred',
]);

/** Resolve canonical rationale, falling back to final-action remarks from older workflows. */
export function resolveDecisionRationale(
  applicationRationale: string | null | undefined,
  actions: DecisionActionRationale[],
): string {
  const canonical = applicationRationale?.trim();
  if (canonical) return canonical;

  const match = actions.find((row) => {
    const action = row.action?.trim().toLowerCase();
    const actionType = row.action_type?.trim().toLowerCase();
    return Boolean(row.comments?.trim()) && (
      (action ? FINAL_ACTIONS.has(action) : false) ||
      (actionType ? FINAL_ACTIONS.has(actionType) : false)
    );
  });
  return match?.comments?.trim() ?? '';
}