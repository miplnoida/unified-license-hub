import { supabase } from '@/integrations/supabase/client';

/**
 * Resolves whether a configurable approval workflow is ON for a given return.
 * Mirrors src/lib/workflowApprovalResolver.ts for applications.
 */
export interface ReturnApprovalContext {
  return: {
    id: string;
    sector_id?: string | null;
    subsector_id?: string | null;
    return_configuration_id?: string | null;
    workflow_id?: string | null;
  };
}

export interface ReturnApprovalResolution {
  enabled: boolean;
  reason: 'global_disabled' | 'no_matched_workflow' | 'workflow_inactive' | 'no_steps' | 'enabled';
  globalReviewEnabled: boolean;
  matchedWorkflowId: string | null;
  stepCount: number;
}

export async function getGlobalReturnReviewEnabled(): Promise<boolean> {
  const { data } = await (supabase
    .from('site_settings' as any)
    .select('value')
    .eq('key', 'review_settings')
    .maybeSingle() as any);
  const val = (data as any)?.value?.return_review_enabled;
  // Default ON
  return val === undefined || val === null ? true : !!val;
}

export async function resolveReturnWorkflow(ctx: ReturnApprovalContext): Promise<ReturnApprovalResolution> {
  const globalReviewEnabled = await getGlobalReturnReviewEnabled();
  if (!globalReviewEnabled) {
    return { enabled: false, reason: 'global_disabled', globalReviewEnabled, matchedWorkflowId: null, stepCount: 0 };
  }

  const { data: workflowIdRpc } = await (supabase as any).rpc('resolve_return_workflow', { _return_id: ctx.return.id });
  const workflowId = (workflowIdRpc as string | null) || ctx.return.workflow_id || null;

  if (!workflowId) {
    return { enabled: false, reason: 'no_matched_workflow', globalReviewEnabled, matchedWorkflowId: null, stepCount: 0 };
  }

  const { data: wf } = await supabase
    .from('approval_workflows')
    .select('id, is_active')
    .eq('id', workflowId)
    .maybeSingle();
  if (!wf || !(wf as any).is_active) {
    return { enabled: false, reason: 'workflow_inactive', globalReviewEnabled, matchedWorkflowId: workflowId, stepCount: 0 };
  }

  const { count } = await supabase
    .from('approval_steps')
    .select('id', { count: 'exact', head: true })
    .eq('workflow_id', workflowId);
  const stepCount = count || 0;
  if (stepCount === 0) {
    return { enabled: false, reason: 'no_steps', globalReviewEnabled, matchedWorkflowId: workflowId, stepCount: 0 };
  }

  return { enabled: true, reason: 'enabled', globalReviewEnabled, matchedWorkflowId: workflowId, stepCount };
}
