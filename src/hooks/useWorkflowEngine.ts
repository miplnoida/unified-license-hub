import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import type { AppRole } from '@/types/platform';

// ─── Types ───

/**
 * Workflow entity types.
 *
 * Note: the combined `'application'` type has been split into
 * `'pre_application'` and `'post_application'` so admins can configure
 * independent approval flows for pre-license vs post-license applications.
 * `'registration'` is offered as a top-level workflow for licensee registration
 * approvals. Legacy `'application'` rows are migrated to `'pre_application'`.
 */
export type WorkflowEntityType =
  | 'registration'
  | 'pre_application'
  | 'post_application'
  | 'complaint'
  | 'inspection'
  | 'return';

export const FALLBACK_WORKFLOW_TYPE_LABELS: Record<WorkflowEntityType, string> = {
  registration: 'Registration',
  pre_application: 'Pre Application',
  post_application: 'Post Application',
  complaint: 'Complaint',
  inspection: 'Inspection',
  return: 'Compliance Return',
};

export interface WorkflowTypeConfig {
  key: WorkflowEntityType;
  display_label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

/**
 * Entity types whose workflow lookup also accepts the legacy `application`
 * row as a fallback. Lets older configurations keep working until an admin
 * splits them explicitly into pre / post.
 */
export const LEGACY_APPLICATION_ENTITY_TYPES: ReadonlyArray<WorkflowEntityType> = [
  'pre_application',
  'post_application',
];

export function getWorkflowTypeLabel(
  entityType: string | null | undefined,
  workflowTypes?: Array<Pick<WorkflowTypeConfig, 'key' | 'display_label'>>,
): string {
  if (!entityType) return '';
  const configured = workflowTypes?.find((item) => item.key === entityType);
  if (configured?.display_label) return configured.display_label;
  return FALLBACK_WORKFLOW_TYPE_LABELS[entityType as WorkflowEntityType] || entityType;
}

export function filterActiveWorkflowTypes(workflowTypes: WorkflowTypeConfig[]): WorkflowTypeConfig[] {
  return [...workflowTypes]
    .filter((item) => item.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.display_label.localeCompare(b.display_label));
}

// Synthetic actions like `request_info` and `delegate` were never fully
// implemented (no assignee handoff, no notifications, no state semantics) and
// have been removed from the public action surface. `allowed_actions` on each
// approval step is the single source of truth.
export type WorkflowActionType = 'approve' | 'reject' | 'send_back' | 'escalate' | 'request_resubmission';

export const ACTION_LABELS: Record<WorkflowActionType, string> = {
  approve: 'Approve',
  reject: 'Reject',
  send_back: 'Send Back',
  escalate: 'Escalate',
  request_resubmission: 'Request Resubmission',
};

export const ACTION_COLORS: Record<WorkflowActionType, string> = {
  approve: 'bg-success/10 text-success border-success/30',
  reject: 'bg-destructive/10 text-destructive border-destructive/30',
  send_back: 'bg-warning/10 text-warning border-warning/30',
  escalate: 'bg-accent text-accent-foreground border-accent',
  request_resubmission: 'bg-warning/10 text-warning border-warning/30',
};

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  license_type: string;
  entity_type: string;
  is_active: boolean;
  regulator_id: string | null;
  sector_id: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  description: string | null;
  approver_role: AppRole;
  approver_role_id: string | null;
  step_type: string;
  sla_hours: number | null;
  is_required: boolean;
  allowed_actions: WorkflowActionType[];
  escalation_role: string | null;
  escalation_after_hours: number | null;
  condition: any | null;
  created_at: string;
}

export interface WorkflowInstance {
  id: string;
  workflow_id: string;
  entity_type: string;
  entity_id: string;
  current_step_id: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowAction {
  id: string;
  application_id: string;
  step_id: string | null;
  actor_id: string;
  action: string;
  action_type: string;
  comments: string | null;
  delegated_to: string | null;
  workflow_instance_id: string | null;
  sla_deadline: string | null;
  responded_at: string | null;
  created_at: string;
}

export function useWorkflowTypeConfigs() {
  return useQuery({
    queryKey: ['approval_workflow_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_workflow_types')
        .select('key, display_label, description, is_active, sort_order')
        .order('sort_order', { ascending: true })
        .order('display_label', { ascending: true });

      if (error) throw error;
      return (data || []) as WorkflowTypeConfig[];
    },
  });
}

// ─── Queries ───

export function useWorkflows(regulatorId?: string | null, entityType?: string) {
  return useQuery({
    queryKey: ['approval_workflows', regulatorId, entityType],
    queryFn: async () => {
      let query = supabase.from('approval_workflows').select('*').order('created_at', { ascending: false });
      if (regulatorId) query = query.eq('regulator_id', regulatorId);
      if (entityType) query = query.eq('entity_type', entityType);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as Workflow[];
    },
  });
}

export function useWorkflow(id: string | null) {
  return useQuery({
    queryKey: ['approval_workflows', 'detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('approval_workflows').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as unknown as Workflow | null;
    },
    enabled: !!id,
  });
}

export function useWorkflowSteps(workflowId: string | null) {
  return useQuery({
    queryKey: ['approval_steps', workflowId],
    queryFn: async () => {
      if (!workflowId) return [];
      const { data, error } = await supabase
        .from('approval_steps')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('step_order', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as WorkflowStep[];
    },
    enabled: !!workflowId,
  });
}

export function useWorkflowInstances(entityType?: string, entityId?: string) {
  return useQuery({
    queryKey: ['workflow_instances', entityType, entityId],
    queryFn: async () => {
      let query = supabase.from('workflow_instances').select('*').order('created_at', { ascending: false });
      if (entityType) query = query.eq('entity_type', entityType);
      if (entityId) query = query.eq('entity_id', entityId);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as WorkflowInstance[];
    },
  });
}

export function useWorkflowActions(instanceId?: string) {
  return useQuery({
    queryKey: ['approval_actions', 'instance', instanceId],
    queryFn: async () => {
      if (!instanceId) return [];
      const { data, error } = await supabase
        .from('approval_actions')
        .select('*')
        .eq('workflow_instance_id', instanceId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as WorkflowAction[];
    },
    enabled: !!instanceId,
  });
}

// ─── Mutations ───

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      name: string;
      description?: string;
      license_type: string;
      entity_type: WorkflowEntityType;
      regulator_id?: string | null;
      sector_id?: string | null;
      category_id?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('approval_workflows')
        .insert({
          name: params.name,
          description: params.description || null,
          license_type: params.license_type,
          entity_type: params.entity_type,
          regulator_id: params.regulator_id || null,
          sector_id: params.sector_id || null,
          category_id: params.category_id || null,
        } as any)
        .select()
        .single();
      if (error) {
        // Postgres unique_violation surfaces from the
        // approval_workflows_unique_scope_used_for unique index.
        if ((error as any).code === '23505') {
          throw new Error('Workflow already exists for this sector and used-for type.');
        }
        throw error;
      }
      await logAudit({
        action: 'workflow_created',
        entityType: 'approval_workflow',
        entityId: (data as any).id,
        newValue: { name: params.name, entity_type: params.entity_type },
      });
      return data as unknown as Workflow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval_workflows'] }),
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Workflow> & { id: string }) => {
      const { error } = await supabase.from('approval_workflows').update(updates as any).eq('id', id);
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('Workflow already exists for this sector and used-for type.');
        }
        throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval_workflows'] }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('approval_workflows').delete().eq('id', id);
      if (error) throw error;
      await logAudit({ action: 'workflow_deleted', entityType: 'approval_workflow', entityId: id });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval_workflows'] }),
  });
}

export function useCreateStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      workflow_id: string;
      step_order: number;
      name: string;
      approver_role: AppRole;
      approver_role_id?: string | null;
      step_type?: string;
      sla_hours?: number;
      allowed_actions?: WorkflowActionType[];
      escalation_role?: string;
      escalation_after_hours?: number;
    }) => {
      const { data, error } = await supabase
        .from('approval_steps')
        .insert({
          workflow_id: params.workflow_id,
          step_order: params.step_order,
          name: params.name,
          approver_role: params.approver_role,
          approver_role_id: params.approver_role_id ?? null,
          step_type: params.step_type || 'sequential',
          sla_hours: params.sla_hours || 48,
          // No silent default: callers MUST pass an explicit allowed_actions list.
          // A step with empty/missing allowed_actions surfaces a config warning in
          // WorkflowPanel and the backend rejects every action on it.
          allowed_actions: Array.isArray(params.allowed_actions) ? params.allowed_actions : [],
          escalation_role: params.escalation_role || null,
          escalation_after_hours: params.escalation_after_hours || null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WorkflowStep;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval_steps'] }),
  });
}

export function useUpdateStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WorkflowStep> & { id: string }) => {
      const { error } = await supabase.from('approval_steps').update(updates as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval_steps'] }),
  });
}

export function useDeleteStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('approval_steps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval_steps'] }),
  });
}

export function useReorderSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (steps: { id: string; step_order: number }[]) => {
      for (const step of steps) {
        const { error } = await supabase
          .from('approval_steps')
          .update({ step_order: step.step_order } as any)
          .eq('id', step.id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval_steps'] }),
  });
}

// ─── Workflow Execution ───

export function useStartWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      workflow_id: string;
      entity_type: string;
      entity_id: string;
    }) => {
      // Get first step
      const { data: steps } = await supabase
        .from('approval_steps')
        .select('id')
        .eq('workflow_id', params.workflow_id)
        .order('step_order', { ascending: true })
        .limit(1);
      const firstStepId = steps?.[0]?.id || null;

      const { data, error } = await supabase
        .from('workflow_instances')
        .insert({
          workflow_id: params.workflow_id,
          entity_type: params.entity_type,
          entity_id: params.entity_id,
          current_step_id: firstStepId,
          status: 'active',
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as WorkflowInstance;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflow_instances'] }),
  });
}

/**
 * Centralized: routes ALL workflow actions through the perform-workflow-action
 * edge function which validates the actor, step, action and atomically advances
 * the workflow. Returns the server response.
 */
export function usePerformAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      instance_id: string;
      step_id: string;
      actor_id: string; // kept for API compatibility — server uses authenticated user
      action_type: WorkflowActionType;
      comments?: string;
      delegated_to?: string;
      application_id: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('perform-workflow-action', {
        body: {
          application_id: params.application_id,
          instance_id: params.instance_id,
          step_id: params.step_id,
          action_type: params.action_type,
          comments: params.comments,
          delegated_to: params.delegated_to,
        },
      });
      if (error) throw new Error(error.message || 'Action failed');
      if ((data as any)?.error) throw new Error((data as any).error);
      await logAudit({
        action: `workflow_${params.action_type}`,
        entityType: 'workflow_instance',
        entityId: params.instance_id,
        newValue: { step_id: params.step_id, action: params.action_type },
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflow_instances'] });
      qc.invalidateQueries({ queryKey: ['approval_actions'] });
      qc.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

