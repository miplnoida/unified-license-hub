import { supabase } from '@/integrations/supabase/client';

/**
 * Shared resolver that determines whether the approval-workflow review step
 * is effectively ON for a given application/license-request.
 *
 * Single source of truth for:
 * - ApplicationDetail visibility of WorkflowPanel vs Manual Review Actions
 * - WorkflowPanel internal short-circuit
 * - Application queue badges
 * - Server-/client-side workflow action gating UI
 *
 * Authoritative signals (all must be true for ON):
 *   1. Global `site_settings.review_settings.application_review_enabled` (default true)
 *   2. A workflow can be matched for the application by scope
 *      (license_type + regulator + sector/category, with hierarchical fallback)
 *   3. That matched workflow's `approval_workflows.is_active` = true
 *   4. That workflow has at least one row in `approval_steps`
 *
 * If any signal is false → workflow approval is OFF and the WorkflowPanel
 * MUST NOT render even when `applications.workflow_id` / `current_step_id`
 * / existing `workflow_instances` rows still exist (those may be stale).
 */

export interface WorkflowApprovalContext {
  /** application row (or just the fields we need) */
  application: {
    id?: string;
    license_type?: string | null;
    regulator_id?: string | null;
    workflow_id?: string | null;
    data?: Record<string, any> | null;
  };
}

export interface WorkflowApprovalResolution {
  /** Final ON/OFF — feed this directly to <WorkflowPanel workflowEnabled={...}/> */
  enabled: boolean;
  /** Why it was ON/OFF — useful for the admin diagnostics card */
  reason:
    | 'global_disabled'
    | 'no_matched_workflow'
    | 'workflow_inactive'
    | 'no_steps'
    | 'enabled';
  /** Global toggle value */
  globalReviewEnabled: boolean;
  /** Workflow row resolved by scope (may differ from app.workflow_id) */
  matchedWorkflow: { id: string; is_active: boolean; license_type: string } | null;
  /** Step count for matched workflow */
  stepCount: number;
}

/**
 * Read the global review-enabled flag from site_settings.review_settings.
 * Defaults to TRUE when not set (back-compat).
 */
export async function getGlobalReviewEnabled(): Promise<boolean> {
  const { data } = await (supabase
    .from('site_settings' as any)
    .select('value')
    .eq('key', 'review_settings')
    .maybeSingle() as any);
  const val = (data as any)?.value?.application_review_enabled;
  return val === undefined || val === null ? true : !!val;
}

/**
 * Match a workflow for the given application by scope, with hierarchical fallback:
 *   1. exact regulator + license_type + category_id
 *   2. exact regulator + license_type + sector_id
 *   3. exact regulator + license_type
 *   4. license_type only (prefix-tolerant match)
 */
async function matchWorkflowForApplication(
  appRow: WorkflowApprovalContext['application'],
): Promise<{ id: string; is_active: boolean; license_type: string } | null> {
  const sectorId = (appRow?.data as any)?.sector_id as string | undefined;
  const categoryId = (appRow?.data as any)?.category_id as string | undefined;
  const licenseType = appRow?.license_type;
  if (!licenseType) return null;

  if (appRow?.regulator_id) {
    const { data } = await supabase
      .from('approval_workflows')
      .select('id, is_active, license_type, sector_id, category_id')
      .eq('license_type', licenseType)
      .eq('entity_type', 'application')
      .eq('regulator_id', appRow.regulator_id);

    const candidates = (data || []) as any[];
    const found =
      candidates.find((w) => categoryId && w.category_id === categoryId) ||
      candidates.find((w) => sectorId && w.sector_id === sectorId) ||
      candidates[0] ||
      null;
    if (found) return found as any;
  }

  // Fallback: license_type only (prefix-tolerant match)
  const { data } = await supabase
    .from('approval_workflows')
    .select('id, is_active, license_type')
    .eq('entity_type', 'application');

  const lt = String(licenseType).toLowerCase();
  return (
    ((data || []) as any[]).find((w) => {
      const wl = String(w.license_type || '').toLowerCase();
      return (
        wl !== '' &&
        (lt === wl || lt.startsWith(`${wl} `) || lt.startsWith(`${wl}_`) || lt.startsWith(`${wl}-`))
      );
    }) || null
  );
}

/**
 * Main entry point — resolve the effective workflow-approval ON/OFF state
 * for an application. Always honours all four authoritative signals.
 */
export async function resolveWorkflowApproval(
  ctx: WorkflowApprovalContext,
): Promise<WorkflowApprovalResolution> {
  const globalReviewEnabled = await getGlobalReviewEnabled();

  if (!globalReviewEnabled) {
    return {
      enabled: false,
      reason: 'global_disabled',
      globalReviewEnabled,
      matchedWorkflow: null,
      stepCount: 0,
    };
  }

  const matchedWorkflow = await matchWorkflowForApplication(ctx.application);

  if (!matchedWorkflow) {
    return {
      enabled: false,
      reason: 'no_matched_workflow',
      globalReviewEnabled,
      matchedWorkflow: null,
      stepCount: 0,
    };
  }

  if (!matchedWorkflow.is_active) {
    return {
      enabled: false,
      reason: 'workflow_inactive',
      globalReviewEnabled,
      matchedWorkflow,
      stepCount: 0,
    };
  }

  const { count } = await supabase
    .from('approval_steps')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', matchedWorkflow.id);

  const stepCount = count || 0;
  if (stepCount === 0) {
    return {
      enabled: false,
      reason: 'no_steps',
      globalReviewEnabled,
      matchedWorkflow,
      stepCount: 0,
    };
  }

  return {
    enabled: true,
    reason: 'enabled',
    globalReviewEnabled,
    matchedWorkflow,
    stepCount,
  };
}
