import { supabase } from '@/integrations/supabase/client';
import { getApplicationCategory } from '@/lib/applicationCategory';

/**
 * Workflow entity_type values matched for an application during lookup.
 * The new `pre_application` / `post_application` rows are preferred. Legacy
 * `application` rows are still accepted as a fallback for un-migrated configs.
 */
function entityTypesForApplication(appRow: { data?: Record<string, any> | null }): string[] {
  const category = getApplicationCategory(appRow?.data);
  const primary = category === 'post_license' ? 'post_application' : 'pre_application';
  return [primary, 'application'];
}

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
    | 'attached_active_workflow'
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
async function resolveEffectiveRegulator(
  regulatorId: string | null | undefined,
  sectorId: string | undefined,
  categoryId: string | undefined,
): Promise<string | null> {
  // Category -> sector -> regulator
  if (categoryId) {
    const { data: cat } = await supabase
      .from('categories')
      .select('sector_id')
      .eq('id', categoryId)
      .maybeSingle();
    const catSector = (cat as any)?.sector_id as string | undefined;
    if (catSector) {
      const { data: s } = await supabase
        .from('sectors')
        .select('regulator_id')
        .eq('id', catSector)
        .maybeSingle();
      if ((s as any)?.regulator_id) return (s as any).regulator_id;
    }
  }
  if (sectorId) {
    const { data: s } = await supabase
      .from('sectors')
      .select('regulator_id')
      .eq('id', sectorId)
      .maybeSingle();
    if ((s as any)?.regulator_id) return (s as any).regulator_id;
  }
  return regulatorId || null;
}

async function matchWorkflowForApplication(
  appRow: WorkflowApprovalContext['application'],
): Promise<{ id: string; is_active: boolean; license_type: string } | null> {
  const sectorId = (appRow?.data as any)?.sector_id as string | undefined;
  const categoryId = (appRow?.data as any)?.category_id as string | undefined;
  const licenseType = appRow?.license_type;
  if (!licenseType) return null;

  const effectiveRegulator = await resolveEffectiveRegulator(
    appRow?.regulator_id,
    sectorId,
    categoryId,
  );

  const entityTypes = entityTypesForApplication({ data: appRow?.data });

  if (effectiveRegulator) {
    const { data } = await supabase
      .from('approval_workflows')
      .select('id, is_active, license_type, sector_id, category_id, entity_type')
      .eq('license_type', licenseType)
      .in('entity_type', entityTypes)
      .eq('regulator_id', effectiveRegulator);

    const candidates = (data || []) as any[];
    // Prefer rows of the primary (non-legacy) entity_type
    const primaryType = entityTypes[0];
    const ranked = [
      ...candidates.filter((w) => w.entity_type === primaryType),
      ...candidates.filter((w) => w.entity_type !== primaryType),
    ];
    const found =
      ranked.find((w) => categoryId && w.category_id === categoryId) ||
      ranked.find((w) => sectorId && w.sector_id === sectorId) ||
      ranked[0] ||
      null;
    if (found) return found as any;
  }

  // Fallback: license_type only (prefix-tolerant match)
  const { data } = await supabase
    .from('approval_workflows')
    .select('id, is_active, license_type, entity_type')
    .in('entity_type', entityTypes);

  const lt = String(licenseType).toLowerCase();
  const primaryType = entityTypes[0];
  const matches = ((data || []) as any[]).filter((w) => {
    const wl = String(w.license_type || '').toLowerCase();
    return (
      wl !== '' &&
      (lt === wl || lt.startsWith(`${wl} `) || lt.startsWith(`${wl}_`) || lt.startsWith(`${wl}-`))
    );
  });
  return (
    matches.find((w) => w.entity_type === primaryType) || matches[0] || null
  );
}

async function resolveAttachedActiveWorkflow(
  appRow: WorkflowApprovalContext['application'],
): Promise<{ workflow: { id: string; is_active: boolean; license_type: string }; stepCount: number } | null> {
  if (!appRow?.id || !appRow?.workflow_id) return null;

  const { data: attachedWorkflow } = await supabase
    .from('approval_workflows')
    .select('id, is_active, license_type')
    .eq('id', appRow.workflow_id)
    .maybeSingle();

  const workflow = attachedWorkflow as { id: string; is_active: boolean; license_type: string } | null;
  if (!workflow?.id || !workflow.is_active) return null;

  const { count } = await supabase
    .from('approval_steps')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', workflow.id);

  const stepCount = count || 0;
  if (stepCount === 0) return null;

  const { data: activeInstance } = await supabase
    .from('workflow_instances')
    .select('id')
    .eq('entity_type', 'application')
    .eq('entity_id', appRow.id)
    .eq('workflow_id', workflow.id)
    .in('status', ['active', 'paused'])
    .limit(1)
    .maybeSingle();

  if (!activeInstance) return null;

  return { workflow, stepCount };
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

  const attachedActiveWorkflow = await resolveAttachedActiveWorkflow(ctx.application);
  if (attachedActiveWorkflow) {
    return {
      enabled: true,
      reason: 'attached_active_workflow',
      globalReviewEnabled,
      matchedWorkflow: attachedActiveWorkflow.workflow,
      stepCount: attachedActiveWorkflow.stepCount,
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
