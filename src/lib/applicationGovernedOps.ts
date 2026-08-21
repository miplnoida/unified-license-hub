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

/**
 * Save draft answers on an application. The database derives the actor,
 * checks applicant ownership / `application_management.edit`, refuses
 * non-editable states and only writes `data` / `license_type` /
 * `regulator_id` — never a regulatory column.
 */
export const applicationDraftSave = (input: {
  applicationId: string;
  data: Record<string, unknown>;
  licenseType?: string | null;
  regulatorId?: string | null;
}) =>
  call<{ success: boolean; application_id: string }>('application_draft_save', {
    _application_id: input.applicationId,
    _data: input.data,
    _license_type: input.licenseType ?? null,
    _regulator_id: input.regulatorId ?? null,
  });

/** Create a draft application (governed insert — browser DML is revoked). */
export const applicationCreateDraft = (input: {
  licenseType: string;
  data?: Record<string, unknown>;
  regulatorId?: string | null;
}) =>
  call<{ id: string } & Record<string, unknown>>('create_application_draft', {
    _license_type: input.licenseType,
    _data: input.data ?? {},
    _regulator_id: input.regulatorId ?? null,
  });

/**
 * Close an open application RFI. The database records the closing officer and
 * timestamp, reverts a parked application to `under_review` and audits.
 */
export const applicationRfiClose = (rfiId: string, closureNotes?: string | null) =>
  call<{ success: boolean; status_reverted_from: string | null }>('application_rfi_close', {
    _rfi_id: rfiId,
    _closure_notes: closureNotes ?? null,
  });

export interface ApplicationFormRequirement {
  template_id: string;
  template_name: string;
  is_required: boolean;
  sequence: number;
  form_version_id: string | null;
  form_version: number | null;
}

export interface ApplicationClassificationResult {
  success: boolean;
  application_id: string;
  resolved: boolean;
  source: 'package' | 'template_taxonomy' | 'none';
  scope: string | null;
  package_id: string | null;
  items: ApplicationFormRequirement[];
  form_template_ids: string[];
  form_version_ids: Record<string, string>;
  archived_form_answers: number;
}

/**
 * EPR-05 — governed classification update.
 *
 * The server validates the sector / sub-sector / category relationship, resolves
 * the applicable package (or configured template ladder), pins the published
 * form versions, decides which draft answers stay compatible (incompatible ones
 * are archived, never destroyed) and returns the authoritative requirement set.
 *
 * The browser must NEVER compute the applicable form set — no client template
 * matching, no client pruning of `forms_data` / `form_version_ids`.
 */
export const applicationClassificationUpdate = (input: {
  applicationId: string;
  sectorId?: string | null;
  subSectorId?: string | null;
  categoryId?: string | null;
  licenseType?: string | null;
}) =>
  call<ApplicationClassificationResult>('application_classification_update', {
    _application_id: input.applicationId,
    _sector_id: input.sectorId || null,
    _sub_sector_id: input.subSectorId || null,
    _category_id: input.categoryId || null,
    _license_type: input.licenseType ?? null,
  });

