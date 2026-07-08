export const FP_ASSESSMENT_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  SCREENING: 'screening',
  AWAITING_COMMITTEE: 'awaiting_committee',
  DETERMINED: 'determined',
  CLOSED: 'closed',
  WITHDRAWN: 'withdrawn',
} as const;

/** A declaration can only be requested while the assessment is still in Draft. */
export function canRequestDeclaration(status: string | null | undefined): boolean {
  return status === FP_ASSESSMENT_STATUS.DRAFT;
}
