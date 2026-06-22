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

export function getWorkflowTypeOptions(workflowTypes: WorkflowTypeConfig[]): Array<{
  key: WorkflowEntityType;
  label: string;
  description: string | null;
}> {
  return filterActiveWorkflowTypes(workflowTypes).map((item) => ({
    key: item.key,
    label: item.display_label,
    description: item.description,
  }));
}

// Synthetic actions like `request_info` and `delegate` were never fully
// implemented (no assignee handoff, no notifications, no state semantics) and
// have been removed from the public action surface. `allowed_actions` on each
// approval step is the single source of truth.
export type WorkflowActionType =
  | 'approve'
  | 'reject'
  | 'send_back'
  | 'escalate'
  | 'request_resubmission'
  | 'return_for_correction'
  | 'request_more_info';

export const ACTION_LABELS: Record<WorkflowActionType, string> = {
  approve: 'Approve',
  reject: 'Reject',
  send_back: 'Send Back',
  escalate: 'Escalate',
  request_resubmission: 'Request Resubmission',
  return_for_correction: 'Return for Correction',
  request_more_info: 'Request More Information',
};

export const ACTION_COLORS: Record<WorkflowActionType, string> = {
  approve: 'bg-success/10 text-success border-success/30',
  reject: 'bg-destructive/10 text-destructive border-destructive/30',
  send_back: 'bg-warning/10 text-warning border-warning/30',
  escalate: 'bg-accent text-accent-foreground border-accent',
  request_resubmission: 'bg-warning/10 text-warning border-warning/30',
  return_for_correction: 'bg-warning/10 text-warning border-warning/30',
  request_more_info: 'bg-info/10 text-info border-info/30',
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

export type ApproverType = 'role_based_user' | 'specific_users';

export interface ApproverConfig {
  role_ids?: string[];
  user_ids?: string[];
}

export interface WorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  name: string;
  description: string | null;
  approver_role: AppRole;
  approver_role_id: string | null;
  approver_type: ApproverType;
  approver_config: ApproverConfig;
  auto_approve_on_timeout: boolean;
  step_entry_notifications_enabled: boolean;
  step_type: string;
  sla_hours: number | null;
  is_required: boolean;
  allowed_actions: WorkflowActionType[];
  escalation_role: string | null;
  escalation_after_hours: number | null;
  sla_warning_threshold_percent: number | null;
  sla_pause_on_rfi: boolean;
  sla_warning_template_id: string | null;
  sla_breach_template_id: string | null;
  condition: any | null;
  require_digital_signature: boolean;
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

export async function fetchWorkflowTypeConfigs(): Promise<WorkflowTypeConfig[]> {
  const { data, error } = await supabase
    .from('approval_workflow_types')
    .select('key, display_label, description, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('display_label', { ascending: true });

  if (error) throw error;
  return (data || []) as WorkflowTypeConfig[];
}

export function useWorkflowTypeConfigs() {
  return useQuery({
    queryKey: ['approval_workflow_types'],
    queryFn: fetchWorkflowTypeConfigs,
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

/**
 * Atomic create-with-steps. Calls the `create_approval_workflow_with_steps`
 * RPC so the workflow row AND all of its steps are inserted in a single DB
 * transaction. If any step fails (role, RLS, constraint, etc.) the entire
 * workflow is rolled back automatically — there is no possibility of an
 * orphan zero-step workflow, even if the network drops mid-call.
 */
export function useCreateWorkflowWithSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      workflow: {
        name: string;
        description?: string | null;
        license_type: string;
        entity_type: WorkflowEntityType;
        regulator_id?: string | null;
        sector_id?: string | null;
        category_id?: string | null;
        is_active?: boolean;
      };
      steps: Array<{
        step_order?: number;
        name: string;
        description?: string | null;
        approver_role: AppRole;
        approver_role_id?: string | null;
        step_type?: string;
        is_required?: boolean;
        sla_hours?: number;
        allowed_actions: WorkflowActionType[];
        escalation_role?: string | null;
        escalation_after_hours?: number | null;
      }>;
    }) => {
      const { data, error } = await supabase.rpc(
        'create_approval_workflow_with_steps' as any,
        {
          _workflow: params.workflow as any,
          _steps: params.steps as any,
        } as any,
      );
      if (error) {
        if ((error as any).code === '23505') {
          throw new Error('Workflow already exists for this sector and used-for type.');
        }
        throw error;
      }
      const result = (data || {}) as { workflow_id?: string; step_count?: number };
      if (!result.workflow_id) {
        throw new Error('create_approval_workflow_with_steps returned no workflow id');
      }
      await logAudit({
        action: 'workflow_created',
        entityType: 'approval_workflow',
        entityId: result.workflow_id,
        newValue: {
          name: params.workflow.name,
          entity_type: params.workflow.entity_type,
          step_count: result.step_count ?? params.steps.length,
          atomic: true,
        },
      });
      return result.workflow_id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval_workflows'] });
      qc.invalidateQueries({ queryKey: ['approval_steps'] });
    },
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
      await logAudit({
        action: 'workflow_updated',
        entityType: 'approval_workflow',
        entityId: id,
        newValue: updates,
      });
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
      if (steps.length === 0) return;
      // Derive workflow_id from the first step. All steps in a reorder set
      // must belong to the same workflow; the RPC enforces this server-side.
      const { data: row, error: lookupErr } = await supabase
        .from('approval_steps')
        .select('workflow_id')
        .eq('id', steps[0].id)
        .maybeSingle();
      if (lookupErr) throw lookupErr;
      const workflowId = (row as any)?.workflow_id;
      if (!workflowId) throw new Error('Cannot determine workflow for reorder');

      const { error } = await supabase.rpc('reorder_approval_steps' as any, {
        _workflow_id: workflowId,
        _orders: steps.map(s => ({ id: s.id, step_order: s.step_order })) as any,
      });
      if (error) throw error;
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
 * Centralized workflow-action mutation. Routes to the correct edge function
 * based on entity_type:
 *   - 'application'  → perform-workflow-action
 *   - 'registration' → perform-registration-workflow-action
 *
 * Backward compat: callers that pass only `application_id` are treated as
 * application actions, preserving the original signature.
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
      /** Application workflow (legacy / default). */
      application_id?: string;
      /** Generic entity workflow. */
      entity_type?: 'application' | 'registration';
      entity_id?: string;
    }) => {
      const entityType: 'application' | 'registration' =
        params.entity_type ?? 'application';
      const entityId = params.entity_id ?? params.application_id;
      if (!entityId) throw new Error('entity_id or application_id is required');

      const fnName = entityType === 'registration'
        ? 'perform-registration-workflow-action'
        : 'perform-workflow-action';
      const body = entityType === 'registration'
        ? {
            registration_id: entityId,
            instance_id: params.instance_id,
            step_id: params.step_id,
            action_type: params.action_type,
            comments: params.comments,
          }
        : {
            application_id: entityId,
            instance_id: params.instance_id,
            step_id: params.step_id,
            action_type: params.action_type,
            comments: params.comments,
            delegated_to: params.delegated_to,
          };

      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) throw new Error(error.message || 'Action failed');
      if ((data as any)?.error) throw new Error((data as any).error);
      await logAudit({
        action: `workflow_${params.action_type}`,
        entityType: 'workflow_instance',
        entityId: params.instance_id,
        newValue: { step_id: params.step_id, action: params.action_type, entity_type: entityType },
      });
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['workflow_instances'] });
      qc.invalidateQueries({ queryKey: ['approval_actions'] });
      qc.invalidateQueries({
        queryKey: [vars.entity_type === 'registration' ? 'registrations' : 'applications'],
      });
    },
  });
}

