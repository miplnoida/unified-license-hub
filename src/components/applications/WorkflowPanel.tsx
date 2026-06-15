import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { useWorkflowSteps, useWorkflowInstances, type WorkflowActionType } from '@/hooks/useWorkflowEngine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_ROLES, ROLE_LABELS, type AppRole } from '@/types/platform';
import {
  CheckCircle, XCircle, ArrowUp, ArrowDown, ArrowRight, Shield, Loader2, Clock, Copy, Mail,
  CircleDot, Circle, AlertTriangle, PauseCircle, MessageSquare, User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { isRemarksRequired, hasNoAllowedActions, REMARKS_REQUIRED_ACTIONS } from '@/lib/workflowActionFilter';
import { useStepActions, type StepAction } from '@/hooks/useStepActions';

interface CanActResult {
  can_act: boolean;
  reason: string;
  step_id: string | null;
  step_name: string | null;
  required_role_id: string | null;
  required_role_name: string | null;
  required_system_role: string | null;
  legacy_approver_role: string | null;
  actor_system_roles: string[];
  actor_dynamic_role_ids: string[];
  allowed_actions: WorkflowActionType[];
  is_internal?: boolean;
  is_first_step?: boolean;
  is_last_step?: boolean;
  can_add_remark?: boolean;
  can_reject?: boolean;
  can_forward?: boolean;
  can_approve?: boolean;
  can_send_back?: boolean;
  can_escalate?: boolean;
  can_request_resubmission?: boolean;
  can_return_for_correction?: boolean;
  can_request_more_info?: boolean;
}

function useCanActOnStep(userId: string | undefined, stepId: string | undefined) {
  return useQuery({
    queryKey: ['user_can_act_on_workflow_step', userId, stepId],
    enabled: !!userId && !!stepId,
    queryFn: async (): Promise<CanActResult | null> => {
      const { data, error } = await supabase.rpc('user_can_act_on_workflow_step' as any, {
        _user_id: userId!,
        _step_id: stepId!,
      });
      if (error) {
        console.warn('user_can_act_on_workflow_step RPC failed:', error);
        return null;
      }
      return data as unknown as CanActResult;
    },
    staleTime: 30_000,
  });
}

function useDynamicRolesMap() {
  return useQuery({
    queryKey: ['dynamic-roles-map'],
    queryFn: async () => {
      const { data } = await supabase.from('roles' as any).select('id, name');
      const map: Record<string, string> = {};
      ((data as any[]) || []).forEach(r => { if (r.id) map[r.id] = r.name; });
      return map;
    },
    staleTime: 5 * 60_000,
  });
}

interface ActionRecord {
  id: string;
  step_id: string | null;
  actor_id: string | null;
  action_type: string;
  action: string;
  comments: string | null;
  created_at: string;
}

type WorkflowEntity = 'application' | 'registration';

function useEntityActions(entityType: WorkflowEntity, entityId: string) {
  return useQuery({
    queryKey: ['approval_actions', entityType, entityId],
    enabled: !!entityId,
    queryFn: async () => {
      const filterCol = entityType === 'application' ? 'application_id' : 'entity_id';
      let query = supabase
        .from('approval_actions')
        .select('id, step_id, actor_id, action_type, action, comments, created_at, entity_type, entity_id, application_id')
        .order('created_at', { ascending: true });
      query = entityType === 'application'
        ? query.eq('application_id', entityId)
        : query.eq('entity_type', 'registration').eq('entity_id', entityId);
      const { data, error } = await query;
      if (error) {
        console.warn('approval_actions fetch failed:', error);
        return [] as ActionRecord[];
      }
      return ((data || []) as any[]).map(r => ({
        id: r.id, step_id: r.step_id, actor_id: r.actor_id,
        action_type: r.action_type, action: r.action,
        comments: r.comments, created_at: r.created_at,
      })) as ActionRecord[];
    },
    staleTime: 15_000,
  });
}

function useActorsMap(actorIds: string[]) {
  const key = useMemo(() => Array.from(new Set(actorIds.filter(Boolean))).sort(), [actorIds]);
  return useQuery({
    queryKey: ['workflow_panel_actors', key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', key);
      const map: Record<string, { name: string; email: string | null }> = {};
      ((data as any[]) || []).forEach(p => {
        map[p.id] = { name: p.full_name || p.email || 'Unknown user', email: p.email };
      });
      return map;
    },
    staleTime: 5 * 60_000,
  });
}

const ACTION_LABELS: Record<string, string> = {
  approve: 'Approved',
  reject: 'Rejected',
  send_back: 'Sent back',
  escalate: 'Escalated',
  request_resubmission: 'Requested resubmission',
  return_for_correction: 'Returned for correction',
  request_more_info: 'Requested more information',
  remark: 'Remark added',
};

function actionLabel(actionType: string) {
  return ACTION_LABELS[actionType] || actionType.replace(/_/g, ' ');
}

function actionSuccessMessage(actionType: WorkflowActionType, isFinalApprove: boolean, entityNoun: string): string {
  const Noun = entityNoun.charAt(0).toUpperCase() + entityNoun.slice(1);
  if (actionType === 'approve') return isFinalApprove ? `${Noun} approved.` : `${Noun} forwarded to the next review step.`;
  if (actionType === 'reject') return `${Noun} rejected.`;
  if (actionType === 'send_back') return `${Noun} sent back.`;
  if (actionType === 'escalate') return `${Noun} escalated.`;
  if (actionType === 'request_resubmission') return 'Resubmission requested.';
  if (actionType === 'return_for_correction') return `${Noun} returned for correction.`;
  if (actionType === 'request_more_info') return 'More information requested.';
  return `Action recorded: ${actionLabel(actionType)}`;
}

function remarksRequiredMessage(actionType: WorkflowActionType, entityNoun: string): string {
  switch (actionType) {
    case 'reject': return `Remarks are required to reject this ${entityNoun}.`;
    case 'request_resubmission': return 'Remarks are required to request resubmission.';
    case 'return_for_correction': return 'Remarks are required to return for correction.';
    case 'request_more_info': return 'Remarks are required to request more information.';
    case 'approve': return 'Remarks are required for this approval.';
    default: return 'Remarks are required for this action.';
  }
}

async function safeCopy(text: string, successMsg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMsg);
  } catch {
    toast.error('Unable to copy to clipboard. Please copy manually.');
  }
}

interface Props {
  applicationId: string;
  workflowId: string | null;
  workflowEnabled: boolean;
  applicationStatus: string;
  onStatusChange?: () => void;
  /** Entity behind this workflow. Defaults to 'application' for backward compat. */
  entityType?: WorkflowEntity;
  /** Display noun for messages/titles ('application' or 'registration'). Defaults from entityType. */
  entityNoun?: string;
}

export function WorkflowPanel({ applicationId, workflowId, workflowEnabled, applicationStatus, onStatusChange, entityType = 'application', entityNoun }: Props) {
  if (!workflowEnabled) return null;
  return (
    <WorkflowPanelContent
      applicationId={applicationId}
      workflowId={workflowId}
      applicationStatus={applicationStatus}
      onStatusChange={onStatusChange}
      entityType={entityType}
      entityNoun={entityNoun ?? (entityType === 'registration' ? 'registration' : 'application')}
    />
  );
}

function WorkflowPanelContent({ applicationId, workflowId, applicationStatus, onStatusChange, entityType, entityNoun }: Omit<Props, 'workflowEnabled'> & { entityType: WorkflowEntity; entityNoun: string }) {
  const { user } = useAuth();
  const { hasModuleAccess, enforceDynamic } = useUserDynamicPermissions();
  const [comment, setComment] = useState('');
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const processing = processingAction !== null;
  const [approvalResult, setApprovalResult] = useState<{
    license_number?: string;
    web_user_email?: string;
    web_user_created?: boolean;
    password_setup_url?: string | null;
    provisioning_warning?: string | null;
  } | null>(null);

  const moduleKey = entityType === 'registration' ? 'registration_management' : 'application_management';
  const isInternal = !!user && (enforceDynamic ? hasModuleAccess(moduleKey as any) : INTERNAL_ROLES.includes(user.role));
  const { data: steps = [] } = useWorkflowSteps(workflowId);
  const { data: instances = [] } = useWorkflowInstances(entityType, applicationId);
  const { data: actions = [] } = useEntityActions(entityType, applicationId);
  const queryClient = useQueryClient();

  const activeInstance = instances.find(i => i.status === 'active');
  const pausedInstance = instances.find(i => i.status === 'paused');
  const liveInstance = activeInstance || pausedInstance;

  // Resolve current step: prefer approval_steps.id match, then snapshot key (registrations).
  const currentStep = useMemo(() => {
    if (!liveInstance) return null;
    const byId = steps.find(s => s.id === (liveInstance as any).current_step_id);
    if (byId) return byId;
    const key = (liveInstance as any).current_step_key as string | undefined;
    if (key) {
      const byKey = steps.find(s => (s as any).local_id === key || s.id === key);
      if (byKey) return byKey;
    }
    return null;
  }, [liveInstance, steps]);
  const currentStepIdx = currentStep ? steps.findIndex(s => s.id === currentStep.id) : -1;
  const isLastLevel = currentStepIdx >= 0 && currentStepIdx === steps.length - 1;
  const isPaused = !activeInstance && !!pausedInstance;

  const { data: canActResult } = useCanActOnStep(user?.id, activeInstance ? currentStep?.id : undefined);
  const { data: configuredStepActions = [] } = useStepActions(currentStep?.id);
  const { data: dynamicRolesMap = {} } = useDynamicRolesMap();

  const actorIds = useMemo(() => actions.map(a => a.actor_id).filter((x): x is string => !!x), [actions]);
  const { data: actorsMap = {} } = useActorsMap(actorIds);

  const actionsByStep = useMemo(() => {
    const map = new Map<string, ActionRecord[]>();
    actions.forEach(a => {
      if (!a.step_id) return;
      const arr = map.get(a.step_id) || [];
      arr.push(a);
      map.set(a.step_id, arr);
    });
    return map;
  }, [actions]);

  type StepStatus = 'completed' | 'current' | 'upcoming' | 'paused' | 'returned';
  const stepStatuses = useMemo<StepStatus[]>(() => {
    return steps.map((s, idx) => {
      const history = actionsByStep.get(s.id) || [];
      const decisive = [...history].reverse().find(a =>
        ['approve', 'reject', 'send_back', 'escalate', 'request_resubmission', 'return_for_correction', 'request_more_info'].includes(a.action_type),
      );
      if (currentStep && s.id === currentStep.id) {
        if (isPaused) return 'paused';
        return 'current';
      }
      if (decisive) {
        if (decisive.action_type === 'send_back') return 'returned';
        return 'completed';
      }
      if (currentStepIdx >= 0 && idx < currentStepIdx) return 'completed';
      return 'upcoming';
    });
  }, [steps, actionsByStep, currentStep, currentStepIdx, isPaused]);

  // Collect approver user_ids across all steps (specific_users mode) so we can
  // resolve their display names without a query-per-step.
  const specificApproverIds = useMemo(() => {
    const ids = new Set<string>();
    steps.forEach((s: any) => {
      if (s?.approver_type === 'specific_users') {
        const cfg = (s.approver_config || {}) as { user_ids?: string[] };
        (cfg.user_ids || []).forEach(id => id && ids.add(id));
      }
    });
    return Array.from(ids);
  }, [steps]);

  const { data: approverNamesMap = {} } = useQuery({
    queryKey: ['workflow-specific-approvers', specificApproverIds.sort().join(',')],
    enabled: specificApproverIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', specificApproverIds);
      const map: Record<string, string> = {};
      ((data as any[]) || []).forEach(p => {
        map[p.id] = p.full_name || p.email || p.id;
      });
      return map;
    },
    staleTime: 60_000,
  });

  const stepRoleLabel = (step: any): string => {
    if ((step?.approver_type ?? 'role_based_user') === 'specific_users') {
      const cfg = (step?.approver_config || {}) as { user_ids?: string[] };
      const ids = cfg.user_ids || [];
      if (ids.length === 0) return 'Specific users (none selected)';
      const names = ids.map(id => approverNamesMap[id] || 'User');
      const head = names.slice(0, 3).join(', ');
      const extra = names.length > 3 ? ` +${names.length - 3} more` : '';
      return `Specific user${ids.length > 1 ? 's' : ''}: ${head}${extra}`;
    }
    if (step?.approver_role_id) return dynamicRolesMap[step.approver_role_id] || 'Configured role missing';
    return `Legacy role: ${ROLE_LABELS[step?.approver_role as AppRole] || step?.approver_role}`;
  };


  const focusStepId = currentStep?.id ?? steps[steps.length - 1]?.id;
  const [openStepId, setOpenStepId] = useState<string | undefined>(focusStepId);
  useEffect(() => {
    if (focusStepId) setOpenStepId(focusStepId);
  }, [focusStepId]);

  // Declared BEFORE any early return to preserve hook order (fixes React error #310).
  const pauseCauseAction = useMemo(() => {
    if (!isPaused) return null;
    const causes = new Set(['request_resubmission', 'return_for_correction', 'request_more_info']);
    return [...actions].reverse().find(a => causes.has(a.action_type)) || null;
  }, [actions, isPaused]);

  // ─── Early-return guards (after ALL hooks above) ───
  if (!workflowId) {
    return (
      <Card><CardContent className="py-6 text-sm text-muted-foreground">
        No workflow is attached to this {entityNoun}.
      </CardContent></Card>
    );
  }
  if (!isInternal) {
    return (
      <Card><CardContent className="py-6 text-sm text-muted-foreground">
        You do not have permission to review this {entityNoun}.
      </CardContent></Card>
    );
  }
  if (!liveInstance) {
    if (instances.length === 0 && ['submitted', 'in_progress', 'pending', 'pending_review', 'under_review', 'in_review'].includes(applicationStatus)) {
      return (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          Workflow has not started yet. It will be created automatically when the {entityNoun} is submitted.
        </CardContent></Card>
      );
    }
    return (
      <Card><CardContent className="py-6 text-sm text-muted-foreground">
        No active workflow instance found for this {entityNoun}.
      </CardContent></Card>
    );
  }
  if (!currentStep) {
    return (
      <Card><CardContent className="py-6 text-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Current workflow step could not be resolved</p>
            <p className="text-xs text-muted-foreground mt-1">
              The workflow instance references a step that is not present in the current workflow version.
              Please check the workflow configuration.
            </p>
          </div>
        </div>
      </CardContent></Card>
    );
  }

  // Per-action permissions (backend authoritative).
  const canAddRemark = !!canActResult?.can_add_remark && entityType === 'application';
  const canReject = !!canActResult?.can_reject && !isPaused;
  const canForward = !!canActResult?.can_forward && !isPaused;
  const canApprove = !!canActResult?.can_approve && !isPaused;
  const canSendBack = !!canActResult?.can_send_back && !isPaused;
  const canEscalate = !!canActResult?.can_escalate && !isPaused;
  const canRequestResubmission = !!canActResult?.can_request_resubmission && !isPaused;
  const canReturnForCorrection = !!canActResult?.can_return_for_correction && !isPaused;
  const canRequestMoreInfo = !!canActResult?.can_request_more_info && !isPaused;
  const permissionsUnknown = activeInstance && canActResult === null;

  const handleAction = async (actionType: WorkflowActionType) => {
    if (!user || !activeInstance || !currentStep) return;
    if (isRemarksRequired(actionType) && !comment.trim()) {
      toast.error(remarksRequiredMessage(actionType, entityNoun));
      return;
    }
    setProcessingAction(actionType);
    try {
      const fnName = entityType === 'registration' ? 'perform-registration-workflow-action' : 'perform-workflow-action';
      const body: Record<string, unknown> = entityType === 'registration'
        ? {
            registration_id: applicationId,
            instance_id: activeInstance.id,
            step_id: currentStep.id,
            action_type: actionType,
            comments: comment,
          }
        : {
            application_id: applicationId,
            instance_id: activeInstance.id,
            step_id: currentStep.id,
            action_type: actionType,
            comments: comment,
          };
      const { data, error } = await supabase.functions.invoke(fnName, { body });
      if (error) {
        let serverMsg = error.message || 'Action failed';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const eb = await ctx.json();
            if (eb?.error) serverMsg = eb.error;
          }
        } catch { /* ignore */ }
        toast.error(serverMsg);
        return;
      }
      if (data?.error) { toast.error(data.error); return; }

      if (entityType === 'application' && actionType === 'approve' && isLastLevel) {
        setApprovalResult({
          license_number: data.license_number,
          web_user_email: data.web_user_email,
          web_user_created: data.web_user_created,
          password_setup_url: data.password_setup_url,
          provisioning_warning: data.provisioning_warning ?? null,
        });
        toast.success(data.message || `Application approved! License: ${data.license_number || ''}`.trim());
      } else {
        toast.success(data?.message || actionSuccessMessage(actionType, isLastLevel, entityNoun));
      }
      setComment('');
      // Invalidate all related queries (instance + history + permissions)
      queryClient.invalidateQueries({ queryKey: ['workflow_instances'] });
      queryClient.invalidateQueries({ queryKey: ['approval_actions'] });
      queryClient.invalidateQueries({ queryKey: ['user_can_act_on_workflow_step'] });
      queryClient.invalidateQueries({ queryKey: entityType === 'registration' ? ['registrations'] : ['applications'] });
      onStatusChange?.();
    } catch (err: any) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleAddRemark = async () => {
    if (!user || !activeInstance || !currentStep) return;
    const trimmed = comment.trim();
    if (!trimmed) { toast.error('Please enter a remark.'); return; }
    setProcessingAction('__remark__');
    try {
      const { data, error } = await supabase.functions.invoke('add-application-remark', {
        body: { application_id: applicationId, instance_id: activeInstance.id, step_id: currentStep.id, comments: trimmed },
      });
      if (error) {
        let msg = error.message || 'Failed to add remark';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* ignore */ }
        toast.error(msg);
        return;
      }
      if ((data as any)?.error) { toast.error((data as any).error); return; }
      toast.success('Remark added');
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['approval_actions'] });
      onStatusChange?.();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add remark');
    } finally {
      setProcessingAction(null);
    }
  };

  // ─── Build action buttons from configured `approval_step_actions` rows
  //     (enabled only), intersected with backend per-action permissions.
  //     Falls back to legacy hardcoded buttons only when NO config rows exist.
  type ActionDef = {
    type: WorkflowActionType;
    label: string;
    icon: React.ReactNode;
    variant: 'default' | 'destructive' | 'outline';
    requireComments: boolean;
  };

  const fallbackLabel = (type: WorkflowActionType): string => {
    switch (type) {
      case 'approve': return isLastLevel ? 'Approve' : 'Forward to Next Level';
      case 'reject': return 'Reject';
      case 'send_back': return 'Send Back';
      case 'escalate': return 'Escalate';
      case 'request_resubmission': return 'Request Resubmission';
      case 'return_for_correction': return 'Return for Correction';
      case 'request_more_info': return 'Request More Information';
      default: return type;
    }
  };
  const iconFor = (type: WorkflowActionType): React.ReactNode => {
    switch (type) {
      case 'approve': return isLastLevel
        ? <CheckCircle className="h-4 w-4 mr-1" />
        : <ArrowRight className="h-4 w-4 mr-1" />;
      case 'reject': return <XCircle className="h-4 w-4 mr-1" />;
      case 'send_back': return <ArrowDown className="h-4 w-4 mr-1" />;
      case 'escalate': return <ArrowUp className="h-4 w-4 mr-1" />;
      default: return <ArrowDown className="h-4 w-4 mr-1" />;
    }
  };
  const variantFor = (type: WorkflowActionType): 'default' | 'destructive' | 'outline' =>
    type === 'reject' ? 'destructive' : type === 'approve' ? 'default' : 'outline';

  const canByType: Record<WorkflowActionType, boolean> = {
    approve: (!!canActResult?.can_approve || !!canActResult?.can_forward) && !isPaused,
    reject: !!canActResult?.can_reject && !isPaused,
    send_back: !!canActResult?.can_send_back && !isPaused,
    escalate: !!canActResult?.can_escalate && !isPaused,
    request_resubmission: !!canActResult?.can_request_resubmission && !isPaused,
    return_for_correction: !!canActResult?.can_return_for_correction && !isPaused,
    request_more_info: !!canActResult?.can_request_more_info && !isPaused,
  };

  const enabledConfigured = (configuredStepActions as StepAction[])
    .filter(a => a.is_enabled)
    .slice()
    .sort((a, b) => (a.sort_order - b.sort_order) || a.action_type.localeCompare(b.action_type));

  const actionButtonsList: ActionDef[] = [];
  if (enabledConfigured.length > 0) {
    // Dedupe by action_type (first wins) so a single configured action_type
    // never renders twice.
    const seen = new Set<WorkflowActionType>();
    for (const row of enabledConfigured) {
      const type = row.action_type as WorkflowActionType;
      if (seen.has(type)) continue;
      seen.add(type);
      if (!canByType[type]) continue;
      actionButtonsList.push({
        type,
        label: row.label?.trim() || fallbackLabel(type),
        icon: iconFor(type),
        variant: variantFor(type),
        requireComments: !!row.require_comments,
      });
    }
  } else {
    // Legacy fallback: no per-action config rows configured for this step.
    // Mirror prior behavior using canActResult flags directly.
    if (canByType.approve && isLastLevel) {
      actionButtonsList.push({ type: 'approve', label: 'Approve', icon: iconFor('approve'), variant: 'default', requireComments: REMARKS_REQUIRED_ACTIONS.includes('approve') });
    } else if (canByType.approve) {
      actionButtonsList.push({ type: 'approve', label: 'Forward to Next Level', icon: iconFor('approve'), variant: 'default', requireComments: REMARKS_REQUIRED_ACTIONS.includes('approve') });
    }
    (['reject','send_back','escalate','request_resubmission','return_for_correction','request_more_info'] as WorkflowActionType[]).forEach(t => {
      if (canByType[t]) {
        actionButtonsList.push({
          type: t,
          label: fallbackLabel(t),
          icon: iconFor(t),
          variant: variantFor(t),
          requireComments: REMARKS_REQUIRED_ACTIONS.includes(t),
        });
      }
    });
  }


  const noWorkflowActions = actionButtonsList.length === 0;
  const stepHasNoAllowedActions = hasNoAllowedActions(canActResult?.allowed_actions ?? (currentStep as any).allowed_actions);
  const anyRemarksRequired = actionButtonsList.some(a => REMARKS_REQUIRED_ACTIONS.includes(a.type));
  const remarksRequiredLabels = actionButtonsList.filter(a => REMARKS_REQUIRED_ACTIONS.includes(a.type)).map(a => a.label);

  const remarksBlock = !isPaused && (canAddRemark || !noWorkflowActions) && (
    <div className="space-y-2">
      <Label className="text-sm">
        Remarks / Comments
        {anyRemarksRequired && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder={
          anyRemarksRequired
            ? `Required for: ${remarksRequiredLabels.join(', ')}.`
            : 'Record an observation, query, or note for the assigned approver…'
        }
        rows={3}
        disabled={processing}
      />
      {noWorkflowActions && canAddRemark && (
        <p className="text-xs text-muted-foreground">
          This step is assigned to <strong>{stepRoleLabel(currentStep)}</strong>. You can add a remark for the
          audit trail; you are not authorized to advance this workflow.
        </p>
      )}
    </div>
  );

  const actionButtons = !isPaused && (
    <div className="flex gap-2 flex-wrap">
      {actionButtonsList.map(a => {
        const isThisProcessing = processingAction === a.type;
        const requiresRemarks = REMARKS_REQUIRED_ACTIONS.includes(a.type);
        return (
          <Button
            key={a.label}
            variant={a.variant}
            size="sm"
            onClick={() => handleAction(a.type)}
            disabled={processing}
            title={requiresRemarks ? 'Remarks required' : undefined}
          >
            {isThisProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : a.icon}
            {a.label}
            {requiresRemarks && (
              <span className="ml-2 inline-flex items-center rounded-sm bg-background/20 px-1 text-[10px] font-medium">
                Remarks required
              </span>
            )}
          </Button>
        );
      })}
      {canAddRemark && noWorkflowActions && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddRemark}
          disabled={processing || !comment.trim()}
        >
          {processingAction === '__remark__' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
          Add Remark
        </Button>
      )}
    </div>
  );

  const renderStepHistory = (stepId: string) => {
    const list = actionsByStep.get(stepId) || [];
    if (list.length === 0) {
      return <p className="text-xs text-muted-foreground">No recorded actions for this step yet.</p>;
    }
    return (
      <div className="space-y-2">
        {list.map(a => {
          const actor = a.actor_id ? actorsMap[a.actor_id] : null;
          return (
            <div key={a.id} className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium">{actionLabel(a.action_type)}</span>
                <span className="text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <UserIcon className="h-3 w-3" />
                <span>{actor?.name || (a.actor_id ? 'Unknown user' : 'System')}</span>
                {actor?.email && <span className="text-muted-foreground/70">· {actor.email}</span>}
              </div>
              {a.comments && (
                <p className="whitespace-pre-wrap text-foreground/80 border-l-2 border-border pl-2">{a.comments}</p>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // pauseCauseAction is computed above (hoisted before early returns)


  const renderStatusBadge = (status: StepStatus) => {
    switch (status) {
      case 'completed': return <Badge variant="approved" className="text-[10px]">Completed</Badge>;
      case 'current':   return <Badge variant="pending" className="text-[10px]">Pending Action</Badge>;
      case 'paused':    return <Badge variant="outline" className="text-[10px] border-warning text-warning">Awaiting Applicant</Badge>;
      case 'returned':  return <Badge variant="outline" className="text-[10px] border-warning text-warning">Sent Back</Badge>;
      default:          return <Badge variant="outline" className="text-[10px]">Upcoming</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          {entityType === 'registration' ? 'Registration Workflow Review' : 'Workflow Review'} — Level {Math.max(currentStepIdx, 0) + 1} of {steps.length}
          {isPaused && (
            <Badge variant="outline" className="ml-2 border-warning text-warning text-[10px]">
              <PauseCircle className="h-3 w-3 mr-1" /> Paused
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isPaused && (
          <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm space-y-2">
            <div className="flex items-center gap-2 font-medium text-warning">
              <PauseCircle className="h-4 w-4" />
              Workflow paused — awaiting applicant
            </div>
            {pauseCauseAction ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Last action: <strong>{actionLabel(pauseCauseAction.action_type)}</strong>
                  {' · '}
                  {new Date(pauseCauseAction.created_at).toLocaleString()}
                  {pauseCauseAction.actor_id && actorsMap[pauseCauseAction.actor_id] && (
                    <> · by {actorsMap[pauseCauseAction.actor_id].name}</>
                  )}
                </p>
                {pauseCauseAction.comments && (
                  <p className="whitespace-pre-wrap border-l-2 border-warning/40 pl-2">{pauseCauseAction.comments}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">The workflow will resume once the applicant resubmits.</p>
            )}
          </div>
        )}

        {permissionsUnknown && (
          <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs">
              Unable to verify your workflow permissions. Please refresh or contact an administrator.
            </p>
          </div>
        )}

        <Accordion
          type="single"
          collapsible
          value={openStepId}
          onValueChange={(v) => setOpenStepId(v || undefined)}
          className="w-full divide-y rounded-md border border-border/60"
        >
          {steps.map((s, idx) => {
            const status = stepStatuses[idx];
            const isCurrent = status === 'current' || status === 'paused';
            const isDone = status === 'completed' || status === 'returned';
            const StatusIcon = isDone ? CheckCircle : isCurrent ? CircleDot : Circle;
            return (
              <AccordionItem
                key={s.id}
                value={s.id}
                className={cn('border-0 px-3', isCurrent && 'bg-primary/5')}
              >
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex flex-1 items-center gap-3 pr-3 text-left">
                    <StatusIcon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isDone && 'text-success',
                        isCurrent && 'text-primary',
                        !isDone && !isCurrent && 'text-muted-foreground/50',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm truncate', isCurrent ? 'font-semibold' : 'font-medium')}>
                        Step {idx + 1}: {s.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{stepRoleLabel(s)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.sla_hours ? (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {s.sla_hours}h
                        </span>
                      ) : null}
                      {renderStatusBadge(status)}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  {isCurrent && !isPaused ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{s.name}</span>
                        <Badge variant="outline" className="text-xs">
                          Pending: {stepRoleLabel(s)}
                        </Badge>
                      </div>
                      {s.sla_hours && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          SLA: {s.sla_hours}h
                        </div>
                      )}

                      {(actionsByStep.get(s.id)?.length ?? 0) > 0 && (
                        <>
                          <Separator />
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">Activity on this step</p>
                            {renderStepHistory(s.id)}
                          </div>
                        </>
                      )}

                      <Separator />

                      {stepHasNoAllowedActions && noWorkflowActions && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="font-medium text-destructive">No reviewer actions are configured or enabled for this step</p>
                            <p className="text-xs text-muted-foreground">
                              Ask an administrator to enable at least one action under <em>Edit Steps → Step Actions</em>.
                            </p>
                          </div>
                        </div>
                      )}

                      {!stepHasNoAllowedActions && noWorkflowActions && canActResult && (
                        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="font-medium">You don't have permission to act on this step</p>
                            <p className="text-xs text-muted-foreground">
                              Required role: <strong>{canActResult.required_role_name || canActResult.required_system_role || stepRoleLabel(s)}</strong>.
                              {canActResult.reason && <> Reason: {canActResult.reason}.</>}
                            </p>
                          </div>
                        </div>
                      )}

                      {remarksBlock}
                      {actionButtons}
                    </div>
                  ) : isCurrent && isPaused ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        This step is paused while the applicant responds. Approval actions are disabled until the applicant resubmits.
                      </p>
                      {renderStepHistory(s.id)}
                    </div>
                  ) : isDone ? (
                    renderStepHistory(s.id)
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This step is upcoming. It will become actionable once previous steps are completed.
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>

      {/* Approval Result Dialog — never shows plaintext password */}
      <Dialog open={!!approvalResult} onOpenChange={() => setApprovalResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Application Approved
            </DialogTitle>
            <DialogDescription>
              The license has been generated and the licensee account is ready.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {approvalResult?.license_number && (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">License Number</p>
                  <p className="font-mono font-bold text-lg">{approvalResult.license_number}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => safeCopy(approvalResult.license_number!, 'License number copied')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}

            {approvalResult?.web_user_created && approvalResult?.web_user_email && (
              <div className="space-y-3 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Licensee Account</p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{approvalResult.web_user_email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => safeCopy(approvalResult.web_user_email!, 'Email copied')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  A secure password setup link has been generated for the licensee. They must set their own password before first login.
                </p>
                {approvalResult.password_setup_url && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => safeCopy(approvalResult.password_setup_url!, 'Setup link copied — share securely with the licensee')}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Password Setup Link
                  </Button>
                )}
              </div>
            )}

            {approvalResult?.provisioning_warning && (
              <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-warning">Licensee account provisioning needs attention</p>
                  <p className="text-xs text-muted-foreground mt-1">{approvalResult.provisioning_warning}</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
