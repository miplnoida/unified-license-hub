import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { useWorkflowSteps, useWorkflowInstances, type WorkflowActionType } from '@/hooks/useWorkflowEngine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_ROLES, ROLE_LABELS, type AppRole } from '@/types/platform';
import {
  CheckCircle, XCircle, ArrowUp, ArrowDown, ArrowRight, Shield, Loader2, Clock,
  CircleDot, Circle, AlertTriangle, PauseCircle, User as UserIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { isRemarksRequired, hasNoAllowedActions } from '@/lib/workflowActionFilter';
import { WorkflowActionPreviewDialog, type ActionNotificationOverride } from '@/components/applications/WorkflowActionPreviewDialog';
import { useStepActions, type StepAction } from '@/hooks/useStepActions';
import { SlaStatusBadge, SlaProgressPanel } from '@/components/workflows/SlaIndicator';
import { useWorkflowSLA } from '@/hooks/useWorkflowSLA';
import { formatDateTime } from '@/lib/datetime';

function StepSlaBadge({
  startedAt,
  slaHours,
  warningPct,
  escalationAfterHours,
  paused,
}: {
  startedAt: string | null;
  slaHours: number | null;
  warningPct: number | null;
  escalationAfterHours: number | null;
  paused: boolean;
}) {
  const sla = useWorkflowSLA({
    startedAt,
    slaHours,
    warningThresholdPercent: warningPct,
    escalationAfterHours,
    paused,
  });
  if (sla.status === 'unknown') return null;
  return <SlaStatusBadge sla={sla} />;
}

interface CanActResult {
  can_act: boolean;
  reason?: string;
  step_id: string | null;
  step_name: string | null;
  required_role_id: string | null;
  required_role_name: string | null;
  required_system_role?: string | null;
  legacy_approver_role?: string | null;
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
        _user_id: userId!, _step_id: stepId!,
      });
      if (error) return null;
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
  signature_data_url?: string | null;
}

function useReturnActions(returnId: string) {
  return useQuery({
    queryKey: ['approval_actions', 'return', returnId],
    enabled: !!returnId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('approval_actions')
        .select('id, step_id, actor_id, action_type, action, comments, created_at, signature_data_url')
        .eq('entity_type', 'return')
        .eq('entity_id', returnId)
        .order('created_at', { ascending: true });
      if (error) return [] as ActionRecord[];
      return ((data || []) as any[]).map(r => ({
        id: r.id, step_id: r.step_id, actor_id: r.actor_id,
        action_type: r.action_type, action: r.action,
        comments: r.comments, created_at: r.created_at,
        signature_data_url: r.signature_data_url ?? null,
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
      // Secure resolver: covers staff and external (applicant) identities so
      // actor lines never fall back to "Unknown user" for reviewer roles.
      const { data } = await supabase.rpc('resolve_user_display_names' as any, { _ids: key });
      const map: Record<string, { name: string; email: string | null }> = {};
      ((data as any[]) || []).forEach((p: any) => {
        map[p.id] = { name: p.display_name || p.email || 'Unknown user', email: p.email };
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

function actionSuccessMessage(actionType: WorkflowActionType, isFinalApprove: boolean): string {
  if (actionType === 'approve') return isFinalApprove ? 'Return approved.' : 'Return forwarded to the next review step.';
  if (actionType === 'reject') return 'Return rejected.';
  if (actionType === 'send_back') return 'Return sent back.';
  if (actionType === 'escalate') return 'Return escalated.';
  if (actionType === 'request_resubmission') return 'Resubmission requested.';
  if (actionType === 'return_for_correction') return 'Return sent back for correction.';
  if (actionType === 'request_more_info') return 'More information requested.';
  return `Action recorded: ${actionLabel(actionType)}`;
}

function remarksRequiredMessage(actionType: WorkflowActionType): string {
  switch (actionType) {
    case 'reject': return 'Remarks are required to reject this return.';
    case 'request_resubmission': return 'Remarks are required to request resubmission.';
    case 'return_for_correction': return 'Remarks are required to return for correction.';
    case 'request_more_info': return 'Remarks are required to request more information.';
    case 'approve': return 'Remarks are required for this approval.';
    default: return 'Remarks are required for this action.';
  }
}

interface Props {
  returnId: string;
  workflowId: string | null;
  workflowEnabled: boolean;
  returnStatus: string;
  onStatusChange?: () => void;
  returnSubmittedAt?: string | null;
  returnCreatedAt?: string | null;
}

export function ReturnWorkflowPanel({ returnId, workflowId, workflowEnabled, returnStatus, onStatusChange, returnSubmittedAt, returnCreatedAt }: Props) {
  if (!workflowEnabled) return null;
  return (
    <ReturnWorkflowPanelContent
      returnId={returnId}
      workflowId={workflowId}
      returnStatus={returnStatus}
      onStatusChange={onStatusChange}
      returnSubmittedAt={returnSubmittedAt}
      returnCreatedAt={returnCreatedAt}
    />
  );
}

function ReturnWorkflowPanelContent({ returnId, workflowId, returnStatus, onStatusChange, returnSubmittedAt, returnCreatedAt }: Omit<Props, 'workflowEnabled'>) {
  const { user } = useAuth();
  const { hasModuleAccess, enforceDynamic } = useUserDynamicPermissions();
  const [comment, setComment] = useState('');
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const processing = processingAction !== null;
  const [previewState, setPreviewState] = useState<{ actionType: WorkflowActionType; label: string; requireComments: boolean; requireSignature: boolean } | null>(null);

  const isInternal = !!user && (enforceDynamic
    ? hasModuleAccess('returns_management') || hasModuleAccess('application_management')
    : INTERNAL_ROLES.includes(user.role));

  const { data: steps = [] } = useWorkflowSteps(workflowId);
  const { data: instances = [] } = useWorkflowInstances('return', returnId);
  const { data: actions = [] } = useReturnActions(returnId);
  const queryClient = useQueryClient();

  const activeInstance = instances.find(i => i.status === 'active');
  const pausedInstance = instances.find(i => i.status === 'paused');
  const terminalInstance = instances.find(i => i.status === 'completed' || i.status === 'cancelled');

  const RESUMED_STATUSES = new Set(['SUB', 'submitted', 'in_review', 'under_review', 'in_progress', 'pending_review']);
  const applicantHasResubmitted = !!returnStatus && RESUMED_STATUSES.has(String(returnStatus));
  const treatPausedAsActive = !activeInstance && !!pausedInstance && applicantHasResubmitted;
  const liveInstance = activeInstance || pausedInstance || terminalInstance;
  const isTerminal = !activeInstance && !pausedInstance && !!terminalInstance;
  const terminalKind = isTerminal ? (terminalInstance as any).status as 'completed' | 'cancelled' : null;

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
  const isPaused = !activeInstance && !!pausedInstance && !treatPausedAsActive && !isTerminal;

  const { data: canActResult } = useCanActOnStep(
    user?.id,
    !isTerminal && (activeInstance || treatPausedAsActive) ? currentStep?.id : undefined,
  );
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
      if (isTerminal) {
        if (decisive) return decisive.action_type === 'send_back' ? 'returned' : 'completed';
        // A step at or before the outcome step was passed through, even when no
        // decisive action was recorded on it (e.g. only a saved comment).
        if (currentStepIdx >= 0 && idx <= currentStepIdx) {
          return terminalKind === 'cancelled' && idx === currentStepIdx ? 'returned' : 'completed';
        }
        if (currentStep && s.id === currentStep.id) return terminalKind === 'cancelled' ? 'returned' : 'completed';
        return 'upcoming';
      }

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
  }, [steps, actionsByStep, currentStep, currentStepIdx, isPaused, isTerminal, terminalKind]);

  const stepStartedAt = useMemo<Array<string | null>>(() => {
    const decisiveSet = new Set([
      'approve', 'reject', 'send_back', 'escalate',
      'request_resubmission', 'return_for_correction', 'request_more_info',
    ]);
    const instanceStart = (liveInstance as any)?.started_at ?? (liveInstance as any)?.created_at ?? null;
    const firstStepStart = returnSubmittedAt || returnCreatedAt || instanceStart;
    return steps.map((s, idx) => {
      const status = stepStatuses[idx];
      if (status === 'upcoming') return null;
      if (idx === 0) return firstStepStart;
      const prev = steps[idx - 1];
      const prevHistory = actionsByStep.get(prev.id) || [];
      const prevDecisive = [...prevHistory].reverse().find(a => decisiveSet.has(a.action_type));
      return prevDecisive?.created_at ?? instanceStart;
    });
  }, [steps, stepStatuses, actionsByStep, liveInstance, returnSubmittedAt, returnCreatedAt]);

  const specificApproverIds = useMemo(() => {
    const ids = new Set<string>();
    (steps as any[]).forEach((s) => {
      if (s?.approver_type === 'specific_users') {
        const cfg = (s.approver_config || {}) as { user_ids?: string[] };
        (cfg.user_ids || []).forEach((id) => id && ids.add(id));
      }
    });
    return Array.from(ids);
  }, [steps]);

  const { data: approverNamesMap = {} } = useQuery({
    queryKey: ['return-workflow-specific-approvers', specificApproverIds.sort().join(',')],
    enabled: specificApproverIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', specificApproverIds);
      const map: Record<string, string> = {};
      ((data as any[]) || []).forEach((p) => {
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
      const names = ids.map((id) => approverNamesMap[id] || 'User');
      const head = names.slice(0, 3).join(', ');
      const extra = names.length > 3 ? ` +${names.length - 3} more` : '';
      return `Specific user${ids.length > 1 ? 's' : ''}: ${head}${extra}`;
    }
    // A step may allow several roles; show them all rather than only the first.
    const cfgRoleIds = ((step?.approver_config || {}) as { role_ids?: string[] }).role_ids || [];
    const roleIds = Array.from(new Set([step?.approver_role_id, ...cfgRoleIds].filter(Boolean))) as string[];
    if (roleIds.length > 0) {
      const names = roleIds.map((id) => dynamicRolesMap[id]).filter(Boolean) as string[];
      if (names.length === 0) return 'Configured role missing';
      const head = names.slice(0, 3).join(', ');
      const extra = names.length > 3 ? ` +${names.length - 3} more` : '';
      return `${head}${extra}`;
    }
    return ROLE_LABELS[step?.approver_role as AppRole] || step?.approver_role;
  };

  // Once a step has recorded activity, show WHO acted instead of the (often
  // broad) configured approver role.
  const stepActorLabel = (step: any, status: string): string => {
    const list = actionsByStep.get(step.id) || [];
    if (list.length > 0 && (status === 'completed' || status === 'returned')) {
      const decisiveTypes = new Set(['approve', 'reject', 'send_back', 'escalate', 'request_resubmission', 'return_for_correction', 'request_more_info', 'validate']);
      const chosen = [...list].reverse().find((a) => decisiveTypes.has(a.action_type)) || list[list.length - 1];
      const actorName = chosen.actor_id ? (actorsMap[chosen.actor_id]?.name || 'Unknown user') : 'System';
      const verb = chosen.action_type === 'save_comment' || chosen.action_type === 'remark'
        ? 'Comment by'
        : `${actionLabel(chosen.action_type)} by`;
      return `${verb} ${actorName}`;
    }
    return `Assigned to ${stepRoleLabel(step)}`;
  };


  const focusStepId = currentStep?.id ?? steps[steps.length - 1]?.id;
  const [openStepId, setOpenStepId] = useState<string | undefined>(focusStepId);
  useEffect(() => {
    if (focusStepId) setOpenStepId(focusStepId);
  }, [focusStepId]);

  const pauseCauseAction = useMemo(() => {
    if (!isPaused) return null;
    const causes = new Set(['request_resubmission', 'return_for_correction', 'request_more_info']);
    return [...actions].reverse().find(a => causes.has(a.action_type)) || null;
  }, [actions, isPaused]);

  // ─── Early-return guards ───
  if (!workflowId) {
    return (
      <Card><CardContent className="py-6 text-sm text-muted-foreground">
        No workflow is attached to this return.
      </CardContent></Card>
    );
  }
  if (!isInternal) {
    return (
      <Card><CardContent className="py-6 text-sm text-muted-foreground">
        You do not have permission to review this return.
      </CardContent></Card>
    );
  }
  if (!liveInstance) {
    if (instances.length === 0 && String(returnStatus).toUpperCase() === 'SUB') {
      return (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          Workflow has not started yet. It will be created automatically when the return is submitted.
        </CardContent></Card>
      );
    }
    return (
      <Card><CardContent className="py-6 text-sm text-muted-foreground">
        No active workflow instance found for this return.
      </CardContent></Card>
    );
  }

  if (isTerminal) {
    const terminalAt = (liveInstance as any).completed_at
      ?? (liveInstance as any).updated_at
      ?? (liveInstance as any).ended_at
      ?? null;
    const terminalAtLabel = terminalAt ? formatDateTime(terminalAt) : null;
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Workflow Review — Level {steps.length} of {steps.length}
            <Badge
              variant="outline"
              className={cn(
                'ml-2 text-[10px]',
                terminalKind === 'cancelled' ? 'border-muted-foreground text-muted-foreground' : 'border-success text-success',
              )}
            >
              {terminalKind === 'cancelled' ? 'Cancelled' : 'Completed'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className={cn(
              'rounded-md border p-3 text-sm space-y-1',
              terminalKind === 'cancelled' ? 'border-muted bg-muted/40' : 'border-success/40 bg-success/5',
            )}
          >
            <div
              className={cn(
                'flex items-center gap-2 font-medium',
                terminalKind === 'cancelled' ? 'text-muted-foreground' : 'text-success',
              )}
            >
              <CheckCircle className="h-4 w-4" />
              {terminalKind === 'cancelled'
                ? 'Workflow cancelled'
                : `Workflow completed${terminalAtLabel ? ` on ${terminalAtLabel}` : ''}`}
            </div>
            {terminalKind !== 'cancelled' && (
              <p className="text-xs text-muted-foreground">
                Final outcome: <strong className="capitalize">{String(returnStatus).replace(/_/g, ' ')}</strong>
              </p>
            )}
          </div>

          <Accordion
            type="single"
            collapsible
            value={openStepId}
            onValueChange={(v) => setOpenStepId(v || undefined)}
            className="w-full divide-y rounded-md border border-border/60"
          >
            {steps.map((s, idx) => {
              const status = stepStatuses[idx];
              const isDone = status === 'completed' || status === 'returned';
              const StatusIcon = isDone ? CheckCircle : Circle;
              return (
                <AccordionItem key={s.id} value={s.id} className="border-0 px-3">
                  <AccordionTrigger className="hover:no-underline py-3">
                    <div className="flex flex-1 items-center gap-3 pr-3 text-left">
                      <StatusIcon
                        className={cn('h-4 w-4 shrink-0', isDone ? 'text-success' : 'text-muted-foreground/50')}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate font-medium">Step {idx + 1}: {s.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{stepActorLabel(s, status)}</p>

                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {s.sla_hours ? (
                          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {s.sla_hours}h
                          </span>
                        ) : null}
                        {status === 'completed' && <Badge variant="approved" className="text-[10px]">Completed</Badge>}
                        {status === 'returned' && <Badge variant="outline" className="text-[10px] border-warning text-warning">Sent Back</Badge>}
                        {status === 'upcoming' && <Badge variant="outline" className="text-[10px]">Not reached</Badge>}
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-4">
                    {isDone ? (
                      (() => {
                        const list = actionsByStep.get(s.id) || [];
                        if (list.length === 0) return <p className="text-xs text-muted-foreground">No recorded actions for this step.</p>;
                        return (
                          <div className="space-y-2">
                            {list.map(a => {
                              const actor = a.actor_id ? actorsMap[a.actor_id] : null;
                              return (
                                <div key={a.id} className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs space-y-1">
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <span className="font-medium">{actionLabel(a.action_type)}</span>
                                    <span className="text-muted-foreground">{formatDateTime(a.created_at)}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <UserIcon className="h-3 w-3" />
                                    <span>{actor?.name || (a.actor_id ? 'Unknown user' : 'System')}</span>
                                    {actor?.email && <span className="text-muted-foreground/70">· {actor.email}</span>}
                                  </div>
                                  {a.comments && (
                                    <p className="whitespace-pre-wrap text-foreground/80 border-l-2 border-border pl-2">{a.comments}</p>
                                  )}
                                  {a.signature_data_url && (
                                    <div className="pt-1">
                                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Signature</p>
                                      <img
                                        src={a.signature_data_url}
                                        alt="Digital signature"
                                        className="h-12 rounded border border-border bg-white object-contain"
                                      />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        This step was never reached because the workflow ended earlier.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>
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

  const permissionsUnknown = !!activeInstance && canActResult === null;

  const executeAction = async (
    actionType: WorkflowActionType,
    overrides: ActionNotificationOverride[] = [],
    signatureDataUrl: string | null = null,
  ) => {
    if (!user || !liveInstance || !currentStep) return;
    setProcessingAction(actionType);
    try {
      const { data, error } = await supabase.functions.invoke('perform-return-workflow-action', {
        body: {
          return_id: returnId,
          instance_id: liveInstance.id,
          step_id: currentStep.id,
          action_type: actionType,
          comments: comment,
          notification_overrides: overrides,
          signature_data_url: signatureDataUrl,
        },
      });
      if (error) {
        let msg = error.message || 'Action failed';
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
      if (data?.error) { toast.error(data.error); return; }
      toast.success((data as any)?.message || actionSuccessMessage(actionType, isLastLevel));
      setComment('');
      setPreviewState(null);
      queryClient.invalidateQueries({ queryKey: ['workflow_instances'] });
      queryClient.invalidateQueries({ queryKey: ['approval_actions'] });
      queryClient.invalidateQueries({ queryKey: ['user_can_act_on_workflow_step'] });
      queryClient.invalidateQueries({ queryKey: ['returns_filed'] });
      queryClient.invalidateQueries({ queryKey: ['returns_filed', returnId] });
      queryClient.invalidateQueries({ queryKey: ['return_requests', returnId] });
      queryClient.invalidateQueries({ queryKey: ['return_audit_log', returnId] });
      onStatusChange?.();
    } catch (e: any) {
      toast.error(e?.message || 'Action failed');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleAction = (actionType: WorkflowActionType, requireCommentsOverride?: boolean) => {
    if (!user || !liveInstance || !currentStep) return;
    const requiresRemarks = requireCommentsOverride ?? isRemarksRequired(actionType);
    if (requiresRemarks && !comment.trim()) {
      toast.error(remarksRequiredMessage(actionType));
      return;
    }
    const def = actionButtonsList.find(a => a.type === actionType);
    const cfgRow = (configuredStepActions as StepAction[]).find(
      a => a.action_type === actionType && a.is_enabled,
    );
    setPreviewState({
      actionType,
      label: def?.label ?? actionType,
      requireComments: requiresRemarks,
      requireSignature: !!cfgRow?.require_digital_signature || !!(currentStep as any)?.require_digital_signature,
    });
  };

  type ActionDef = {
    type: WorkflowActionType;
    label: string;
    icon: React.ReactNode;
    variant: 'default' | 'destructive' | 'outline';
    requireComments: boolean;
  };

  const fallbackLabel = (type: WorkflowActionType): string => {
    switch (type) {
      case 'approve': return 'Approve';
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
      case 'approve': return <CheckCircle className="h-4 w-4 mr-1" />;
      case 'reject': return <XCircle className="h-4 w-4 mr-1" />;
      case 'send_back': return <ArrowDown className="h-4 w-4 mr-1" />;
      case 'escalate': return <ArrowUp className="h-4 w-4 mr-1" />;
      default: return <ArrowRight className="h-4 w-4 mr-1" />;
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
    save_comment: !!(canActResult as any)?.can_add_remark && !isPaused,
  };

  const enabledConfigured = (configuredStepActions as StepAction[])
    .filter(a => a.is_enabled)
    .slice()
    .sort((a, b) => (a.sort_order - b.sort_order) || a.action_type.localeCompare(b.action_type));

  const actionButtonsList: ActionDef[] = [];
  {
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
  }

  const noWorkflowActions = actionButtonsList.length === 0;
  const noConfiguredActions = enabledConfigured.length === 0;
  const anyRemarksRequired = actionButtonsList.some(a => a.requireComments);
  const remarksRequiredLabels = actionButtonsList.filter(a => a.requireComments).map(a => a.label);

  const remarksBlock = !isPaused && !noWorkflowActions && (
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
    </div>
  );

  const actionButtons = !isPaused && (
    <div className="flex gap-2 flex-wrap">
      {actionButtonsList.map(a => {
        const isThisProcessing = processingAction === a.type;
        const requiresRemarks = a.requireComments;
        return (
          <Button
            key={a.label}
            variant={a.variant}
            size="sm"
            onClick={() => handleAction(a.type, a.requireComments)}
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
                <span className="text-muted-foreground">{formatDateTime(a.created_at)}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <UserIcon className="h-3 w-3" />
                <span>{actor?.name || (a.actor_id ? 'Unknown user' : 'System')}</span>
                {actor?.email && <span className="text-muted-foreground/70">· {actor.email}</span>}
              </div>
              {a.comments && (
                <p className="whitespace-pre-wrap text-foreground/80 border-l-2 border-border pl-2">{a.comments}</p>
              )}
              {a.signature_data_url && (
                <div className="pt-1">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Signature</p>
                  <img
                    src={a.signature_data_url}
                    alt="Digital signature"
                    className="h-12 rounded border border-border bg-white object-contain"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderStatusBadge = (status: StepStatus) => {
    switch (status) {
      case 'completed': return <Badge variant="approved" className="text-[10px]">Completed</Badge>;
      case 'current':   return <Badge variant="pending" className="text-[10px]">Pending Action</Badge>;
      case 'paused':    return <Badge variant="outline" className="text-[10px] border-warning text-warning">Awaiting Licensee</Badge>;
      case 'returned':  return <Badge variant="outline" className="text-[10px] border-warning text-warning">Sent Back</Badge>;
      default:          return <Badge variant="outline" className="text-[10px]">Upcoming</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Workflow Review — Level {Math.max(currentStepIdx, 0) + 1} of {steps.length}
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
              Workflow paused — awaiting licensee
            </div>
            {pauseCauseAction ? (
              <div className="text-xs text-muted-foreground space-y-1">
                <p>
                  Last action: <strong>{actionLabel(pauseCauseAction.action_type)}</strong>
                  {' · '}
                  {formatDateTime(pauseCauseAction.created_at)}
                  {pauseCauseAction.actor_id && actorsMap[pauseCauseAction.actor_id] && (
                    <> · by {actorsMap[pauseCauseAction.actor_id].name}</>
                  )}
                </p>
                {pauseCauseAction.comments && (
                  <p className="whitespace-pre-wrap border-l-2 border-warning/40 pl-2">{pauseCauseAction.comments}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">The workflow will resume once the licensee resubmits.</p>
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
                      <p className="text-xs text-muted-foreground truncate">{stepActorLabel(s, status)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {s.sla_hours ? (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {s.sla_hours}h
                        </span>
                      ) : null}
                      {(s as any).require_digital_signature && (
                        <Badge variant="outline" className="text-[10px]" title="Approvers on this step must sign">
                          Signature required
                        </Badge>
                      )}
                      {(status === 'current' || status === 'paused') && s.sla_hours ? (
                        <StepSlaBadge
                          startedAt={stepStartedAt[idx]}
                          slaHours={s.sla_hours}
                          warningPct={s.sla_warning_threshold_percent}
                          escalationAfterHours={s.escalation_after_hours}
                          paused={status === 'paused'}
                        />
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
                        <SlaProgressPanel
                          input={{
                            startedAt: stepStartedAt[idx],
                            slaHours: s.sla_hours,
                            warningThresholdPercent: s.sla_warning_threshold_percent,
                            escalationAfterHours: s.escalation_after_hours,
                            paused: false,
                          }}
                          title={`SLA · ${s.name}`}
                        />
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

                      {noConfiguredActions && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="font-medium text-destructive">No actions are configured for this step.</p>
                            <p className="text-xs text-muted-foreground">
                              Ask an administrator to enable at least one action under <em>Edit Steps → Step Actions</em>.
                            </p>
                          </div>
                        </div>
                      )}

                      {!noConfiguredActions && noWorkflowActions && canActResult && (
                        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-sm">
                          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="font-medium">You are not authorized to act on this step</p>
                            <p className="text-xs text-muted-foreground">
                              {(s as any).approver_type === 'specific_users'
                                ? <>This step is assigned to <strong>{stepRoleLabel(s)}</strong>. Only the assigned user(s) can take action.</>
                                : <>Required role: <strong>{canActResult.required_role_name || canActResult.required_system_role || stepRoleLabel(s)}</strong>.</>}
                              {canActResult.reason && canActResult.reason !== 'WRONG_APPROVER' && <> Reason: {canActResult.reason}.</>}
                            </p>
                          </div>
                        </div>
                      )}

                      {(s as any).require_digital_signature && (
                        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs">
                          <Shield className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                          <span>This step requires a digital signature. You'll be prompted to sign when you submit an action.</span>
                        </div>
                      )}

                      {remarksBlock}
                      {actionButtons}
                    </div>
                  ) : isCurrent && isPaused ? (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        This step is paused while the licensee responds. Approval actions are disabled until the licensee resubmits.
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

      {previewState && currentStep && (
        <WorkflowActionPreviewDialog
          open={!!previewState}
          onOpenChange={(v) => { if (!v) setPreviewState(null); }}
          stepId={currentStep.id}
          actionType={previewState.actionType}
          actionLabel={previewState.label}
          comments={comment}
          entityType="return"
          entityId={returnId}
          actorName={user?.email || null}
          processing={processing}
          requireSignature={previewState.requireSignature}
          onConfirm={(overrides, signatureDataUrl) => executeAction(previewState.actionType, overrides, signatureDataUrl ?? null)}
        />
      )}
    </Card>
  );
}
