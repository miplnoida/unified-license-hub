/**
 * Client-side workflow lookup helper.
 *
 * Workflow instance creation/resume/advance is now handled server-side by:
 *   - verify-and-submit       (creates/resumes the instance on submission)
 *   - perform-workflow-action (advances/pauses/completes the instance)
 *   - approve-pre-licensee    (final approval + license issuance, idempotent)
 *
 * This module only reads existing instances. It no longer creates new ones,
 * so the React layer cannot accidentally produce duplicate active instances.
 */
import { supabase } from '@/integrations/supabase/client';

interface FindWorkflowResult {
  workflowId: string | null;
  firstStepId: string | null;
  instanceId: string | null;
  matched: boolean;
}

/**
 * Look up an existing active/paused workflow instance for an application.
 * Returns { matched: false } if none exists. Does NOT create an instance.
 */
export async function findWorkflowForApplication(applicationId: string): Promise<FindWorkflowResult> {
  const { data: existing } = await supabase
    .from('workflow_instances')
    .select('id, workflow_id, current_step_id')
    .eq('entity_id', applicationId)
    .eq('entity_type', 'application')
    .in('status', ['active', 'paused'])
    .limit(1);

  if (existing && existing.length > 0) {
    return {
      workflowId: (existing[0] as any).workflow_id,
      firstStepId: (existing[0] as any).current_step_id,
      instanceId: (existing[0] as any).id,
      matched: true,
    };
  }
  return { workflowId: null, firstStepId: null, instanceId: null, matched: false };
}

/**
 * @deprecated Use the verify-and-submit edge function which handles
 * workflow creation atomically on submission. Kept as a thin shim that
 * only returns existing instances — never creates a new one client-side.
 */
export async function startWorkflowForApplication(
  applicationId: string,
  _licenseType: string,
): Promise<FindWorkflowResult> {
  return findWorkflowForApplication(applicationId);
}
