/**
 * Centralized workflow service.
 * Ensures only one workflow instance per application.
 */
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';

interface StartWorkflowResult {
  workflowId: string | null;
  firstStepId: string | null;
  instanceId: string | null;
  matched: boolean;
}

/**
 * Find and start a workflow for a given application.
 * Returns info about the matched workflow, or { matched: false } if none found.
 * Prevents duplicate workflow instances for the same application.
 */
export async function startWorkflowForApplication(
  applicationId: string,
  licenseType: string,
): Promise<StartWorkflowResult> {
  // 1. Check if a workflow instance already exists for this application
  const { data: existing } = await supabase
    .from('workflow_instances')
    .select('id, workflow_id, current_step_id')
    .eq('entity_id', applicationId)
    .eq('entity_type', 'application')
    .in('status', ['active', 'paused'])
    .limit(1);

  if (existing && existing.length > 0) {
    // Already has an active workflow — return it
    return {
      workflowId: (existing[0] as any).workflow_id,
      firstStepId: (existing[0] as any).current_step_id,
      instanceId: (existing[0] as any).id,
      matched: true,
    };
  }

  // 2. Find matching workflow: exact match first, then prefix match
  let matchedWorkflow: { id: string; license_type: string } | null = null;

  const { data: exactWorkflows } = await supabase
    .from('approval_workflows')
    .select('id, license_type')
    .eq('license_type', licenseType)
    .eq('entity_type', 'application')
    .eq('is_active', true)
    .limit(1);

  if (exactWorkflows && exactWorkflows.length > 0) {
    matchedWorkflow = exactWorkflows[0];
  } else {
    const { data: allWorkflows } = await supabase
      .from('approval_workflows')
      .select('id, license_type')
      .eq('entity_type', 'application')
      .eq('is_active', true);

    if (allWorkflows) {
      matchedWorkflow = allWorkflows.find(w =>
        licenseType.toLowerCase().startsWith(w.license_type.toLowerCase())
      ) || null;
    }
  }

  if (!matchedWorkflow) {
    return { workflowId: null, firstStepId: null, instanceId: null, matched: false };
  }

  // 3. Get first step
  const { data: steps } = await supabase
    .from('approval_steps')
    .select('id')
    .eq('workflow_id', matchedWorkflow.id)
    .order('step_order', { ascending: true })
    .limit(1);

  const firstStepId = steps?.[0]?.id || null;

  // 4. Create instance
  const { data: instance, error } = await supabase
    .from('workflow_instances')
    .insert({
      workflow_id: matchedWorkflow.id,
      entity_type: 'application',
      entity_id: applicationId,
      current_step_id: firstStepId,
      status: 'active',
    } as any)
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create workflow instance:', error);
    return { workflowId: matchedWorkflow.id, firstStepId, instanceId: null, matched: true };
  }

  // 5. Update application with workflow references
  await supabase.from('applications').update({
    workflow_id: matchedWorkflow.id,
    current_step_id: firstStepId,
  } as any).eq('id', applicationId);

  await logAudit({
    action: 'workflow_started',
    entityType: 'workflow_instance',
    entityId: (instance as any)?.id,
    newValue: { workflow_id: matchedWorkflow.id, application_id: applicationId },
  });

  return {
    workflowId: matchedWorkflow.id,
    firstStepId,
    instanceId: (instance as any)?.id || null,
    matched: true,
  };
}
