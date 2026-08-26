/**
 * Canonical respondent match states (MC-01 intake contract, stored in
 * `complaint_respondents.match_state`) and the business language used to
 * describe them on screen. Never render the raw stored code when a canonical
 * state is recognised.
 */
export const RESPONDENT_MATCH_STATES = [
  'MATCHED_REGULATED',
  'MATCHED_PREVIOUSLY_REGULATED',
  'UNMATCHED',
  'SUSPECTED_UNAUTHORISED',
  'INTERMEDIARY',
  'PENDING_MATCH',
] as const;

export type RespondentMatchState = (typeof RESPONDENT_MATCH_STATES)[number];

export const RESPONDENT_MATCH_STATE_LABEL: Record<RespondentMatchState, string> = {
  MATCHED_REGULATED: 'Currently regulated',
  MATCHED_PREVIOUSLY_REGULATED: 'Previously regulated',
  UNMATCHED: 'Entity not yet matched',
  SUSPECTED_UNAUTHORISED: 'Suspected unauthorized provider',
  INTERMEDIARY: 'Intermediary / agent / broker',
  PENDING_MATCH: 'Matching required',
};

/** Business label for a stored match state; never leaks a recognised enum code. */
export function respondentMatchStateLabel(state?: string | null): string {
  if (!state) return 'Match state not recorded';
  const key = String(state).trim().toUpperCase() as RespondentMatchState;
  return RESPONDENT_MATCH_STATE_LABEL[key] ?? 'Match state not recorded';
}
