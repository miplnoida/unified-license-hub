/**
 * Small helper shared between FillReturnPage's header strip / tab list and the
 * ReturnReviewPanel so both views describe form completion the same way.
 *
 * Rules:
 *  - not_started  → no non-empty value entered for that form
 *  - in_progress  → has non-empty values but the user hasn't marked it done
 *  - completed    → user has explicitly marked the form as complete
 *
 * Submission is gated on every linked form being `completed`.
 */

export type ReturnFormStatus = 'not_started' | 'in_progress' | 'completed';

export function hasAnyValue(data: Record<string, any> | undefined): boolean {
  if (!data) return false;
  for (const [key, val] of Object.entries(data)) {
    if (key === '__repeatable' || key.startsWith('_repeatable_')) continue;
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' && val.trim() === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;
    return true;
  }
  return false;
}

export function getReturnFormStatus(
  formId: string,
  allData: Record<string, Record<string, any>>,
  completedSet: Set<string>,
): ReturnFormStatus {
  if (completedSet.has(formId)) return 'completed';
  if (hasAnyValue(allData[formId])) return 'in_progress';
  return 'not_started';
}

export function statusLabel(s: ReturnFormStatus): string {
  if (s === 'completed') return 'Completed';
  if (s === 'in_progress') return 'In Progress';
  return 'Not Started';
}
