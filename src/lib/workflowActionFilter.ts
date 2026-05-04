/**
 * Pure helpers for filtering workflow actions in the UI.
 *
 * The single source of truth for what a step allows is the step's
 * `allowed_actions` array. Synthetic actions (`request_info`, `delegate`)
 * are no longer in the public action surface — see useWorkflowEngine.ts.
 */

import type { WorkflowActionType } from '@/hooks/useWorkflowEngine';

export interface CandidateAction {
  type: WorkflowActionType;
  label: string;
}

export interface BuildActionsParams {
  isFirstLevel: boolean;
  isLastLevel: boolean;
  /** allowed_actions on the current step (server-authoritative). */
  allowedActions: WorkflowActionType[] | null | undefined;
}

/**
 * Given the position of the current step + the step's allowed_actions,
 * return the set of action types that should be offered to the user.
 *
 * Mirrors the candidate-list logic in WorkflowPanel.tsx so it can be tested.
 */
export function resolveAvailableActions({ isFirstLevel, isLastLevel, allowedActions }: BuildActionsParams): WorkflowActionType[] {
  const candidate: WorkflowActionType[] = [];
  if (isLastLevel) {
    candidate.push('approve', 'reject');
  } else {
    candidate.push('approve'); // "Forward to Next Level"
  }
  if (!isFirstLevel && !isLastLevel) candidate.push('send_back');
  if (!isLastLevel) candidate.push('escalate');
  candidate.push('request_resubmission');

  // Server-authoritative allowed_actions; fall back to the legacy default.
  const allowed = new Set<string>(
    Array.isArray(allowedActions) && allowedActions.length > 0
      ? allowedActions
      : ['approve', 'reject', 'send_back'],
  );
  return candidate.filter(a => allowed.has(a));
}

/** Actions that always require non-empty remarks (matches server enforcement). */
export const REMARKS_REQUIRED_ACTIONS: WorkflowActionType[] = ['approve', 'reject', 'request_resubmission'];

export function isRemarksRequired(actionType: WorkflowActionType): boolean {
  return REMARKS_REQUIRED_ACTIONS.includes(actionType);
}
