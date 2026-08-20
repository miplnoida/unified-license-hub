import { supabase } from '@/integrations/supabase/client';

/**
 * Governed Application / approval-lifecycle operations.
 *
 * Formal application actions, triage (priority + officer assignment) and draft
 * deletion run as database operations that derive the actor server-side, check
 * `application_management` authority (or applicant ownership), validate the
 * application state, require a rationale where one is mandatory and write
 * exactly ONE audit entry inside the same transaction.
 *
 * The browser must never write `public.approval_actions` /
 * `public.approval_step_actions`, nor any regulatory column on
 * `public.applications` (status, priority, assignment, decision timestamps) —
 * direct DML is revoked. Ordinary draft answer editing (`applications.data`)
 * stays in the Form workflow and is deliberately NOT governed here.
 *
 * Do NOT add client-side audit calls around these helpers.
 */

async function call<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) throw new Error(error.message);
  if (data && typeof data === 'object' && (data as any).error) {
    throw new Error((data as any).error);
  }
  return data as T;
}

/**
 * Record a formal, non-final application action (edit request lifecycle,
 * resubmission record, recorded decision-option outcome, workflow annotation).
 * Final approve / reject / cancel are refused here — they belong to the
 * governed decision workflow.
 */
export const applicationRecordAction = (input: {
  applicationId: string;
  action: string;
  comments?: string | null;
  metadata?: Record<string, unknown> | null;
}) =>
  call<{ success: boolean; action_id: string }>('application_record_action', {
    _application_id: input.applicationId,
    _action: input.action,
    _comments: input.comments ?? null,
    _metadata: input.metadata ?? {},
  });

/** Set priority and/or assigned officer on one or many applications. */
export const applicationTriageUpdate = (input: {
  applicationIds: string[];
  priority?: number | null;
  priorityReason?: string | null;
  assignedTo?: string | null;
}) =>
  call<{ success: boolean; updated: number }>('application_triage_update', {
    _application_ids: input.applicationIds,
    _priority: input.priority ?? null,
    _priority_reason: input.priorityReason ?? null,
    _assigned_to: input.assignedTo ?? null,
  });

/** Delete the caller's own draft application. */
export const applicationDeleteDraft = (applicationId: string) =>
  call<{ success: boolean }>('application_delete_draft', { _application_id: applicationId });
