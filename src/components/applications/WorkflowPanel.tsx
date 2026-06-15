import { useState } from 'react';
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
  CheckCircle, XCircle, ArrowUp, ArrowDown, ArrowRight, Shield, Loader2, Clock, Copy, Mail, CircleDot, Circle, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { isRemarksRequired, hasNoAllowedActions, REMARKS_REQUIRED_ACTIONS } from '@/lib/workflowActionFilter';

/**
 * Backend-authoritative check: ask Postgres whether THIS user can act on
 * THIS workflow step right now, and what actions the step allows. The
 * frontend must never independently infer action permissions — that was
 * the source of the "Forward to Next Level" regression for super_admin /
 * application_management users.
 */
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

/**
 * Fetch all dynamic roles so we can render their friendly names on workflow steps
 * that are configured against a specific dynamic role (approver_role_id).
 */
function useDynamicRolesMap() {
  return useQuery({
    queryKey: ['dynamic-roles-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('roles' as any)
        .select('id, name');
      const map: Record<string, string> = {};
      ((data as any[]) || []).forEach(r => { if (r.id) map[r.id] = r.name; });
      return map;
    },
    staleTime: 5 * 60_000,
  });
}

interface Props {
  applicationId: string;
  workflowId: string | null;
  workflowEnabled: boolean;
  applicationStatus: string;
  onStatusChange?: () => void;
}

export function WorkflowPanel({ applicationId, workflowId, workflowEnabled, applicationStatus, onStatusChange }: Props) {
  if (!workflowEnabled) return null;

  return (
    <WorkflowPanelContent
      applicationId={applicationId}
      workflowId={workflowId}
      applicationStatus={applicationStatus}
      onStatusChange={onStatusChange}
    />
  );
}

function WorkflowPanelContent({ applicationId, workflowId, applicationStatus, onStatusChange }: Omit<Props, 'workflowEnabled'>) {
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
  } | null>(null);

  const isInternal = !!user && (enforceDynamic ? hasModuleAccess('application_management') : INTERNAL_ROLES.includes(user.role));
  const { data: steps = [] } = useWorkflowSteps(workflowId);
  const { data: instances = [] } = useWorkflowInstances('application', applicationId);
  const queryClient = useQueryClient();

  const activeInstance = instances.find(i => i.status === 'active');
  const pausedInstance = instances.find(i => i.status === 'paused');

  const currentStep = activeInstance ? steps.find(s => s.id === activeInstance.current_step_id) : null;
  const currentStepIdx = currentStep ? steps.findIndex(s => s.id === currentStep.id) : -1;
  const isLastLevel = currentStepIdx === steps.length - 1;


  // Backend-authoritative authorization. Decides BOTH whether the user may act
  // and which actions the current step allows. Frontend never infers either.
  const { data: canActResult } = useCanActOnStep(user?.id, currentStep?.id);
  const { data: dynamicRolesMap = {} } = useDynamicRolesMap();

  const stepRoleLabel = (step: { approver_role: string; approver_role_id?: string | null }) => {
    if (step.approver_role_id) {
      return dynamicRolesMap[step.approver_role_id] || 'Configured role missing';
    }
    return `Legacy role: ${ROLE_LABELS[step.approver_role as AppRole] || step.approver_role}`;
  };

  

  // Paused workflow → show info only. The backend (verify-and-submit) resumes it on resubmission.
  if (!activeInstance && pausedInstance && isInternal) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Workflow Paused — Awaiting Resubmission
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This application has been sent back to the applicant for resubmission. The workflow will resume once the applicant resubmits.
          </p>
        </CardContent>
      </Card>
    );
  }

  // No instance yet — backend creates it on submit. Show a hint instead of silently creating one.
  if (!workflowId || !isInternal || !activeInstance || !currentStep) {
    if (workflowId && isInternal && instances.length === 0 && ['submitted', 'in_progress'].includes(applicationStatus)) {
      return (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Workflow has not started yet. It will be created automatically when the application is submitted.
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  // Workflow progress timeline
  const ProgressTimeline = () => (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">Workflow Progress</p>
      <ol className="space-y-1.5">
        {steps.map((s, idx) => {
          const isDone = idx < currentStepIdx;
          const isCurrent = idx === currentStepIdx;
          return (
            <li key={s.id} className="flex items-center gap-2 text-xs">
              {isDone ? (
                <CheckCircle className="h-3.5 w-3.5 text-success" />
              ) : isCurrent ? (
                <CircleDot className="h-3.5 w-3.5 text-primary animate-pulse" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
              )}
              <span className={isCurrent ? 'font-medium' : 'text-muted-foreground'}>
                Step {idx + 1}: {s.name}
              </span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {stepRoleLabel(s)}
              </Badge>
            </li>
          );
        })}
      </ol>
    </div>
  );

  // Per-action permissions resolved server-side by user_can_act_on_workflow_step.
  // The frontend never independently infers who can do what — it only renders
  // what the backend authorizes.
  const canAddRemark = !!canActResult?.can_add_remark || (isInternal && !canActResult);
  const canReject = !!canActResult?.can_reject;
  const canForward = !!canActResult?.can_forward;
  const canApprove = !!canActResult?.can_approve;
  const canSendBack = !!canActResult?.can_send_back;
  const canEscalate = !!canActResult?.can_escalate;
  const canRequestResubmission = !!canActResult?.can_request_resubmission;
  const canReturnForCorrection = !!canActResult?.can_return_for_correction;
  const canRequestMoreInfo = !!canActResult?.can_request_more_info;

  // External viewers (not internal staff) see nothing here.
  if (!isInternal) return null;

  const handleAction = async (actionType: WorkflowActionType) => {
    if (!user || !activeInstance || !currentStep) return;

    if (isRemarksRequired(actionType) && !comment.trim()) {
      toast.error(
        actionType === 'reject'
          ? 'Remarks are required to reject this application.'
          : 'Remarks are mandatory for this action',
      );
      return;
    }

    setProcessingAction(actionType);
    try {
      const { data, error } = await supabase.functions.invoke('perform-workflow-action', {
        body: {
          application_id: applicationId,
          instance_id: activeInstance.id,
          step_id: currentStep.id,
          action_type: actionType,
          comments: comment,
        },
      });

      if (error) {
        let serverMsg = error.message || 'Action failed';
        try {
          const ctx = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) serverMsg = body.error;
          }
        } catch { /* ignore */ }
        toast.error(serverMsg);
        return;
      }
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (actionType === 'approve' && isLastLevel) {
        setApprovalResult({
          license_number: data.license_number,
          web_user_email: data.web_user_email,
          web_user_created: data.web_user_created,
          password_setup_url: data.password_setup_url,
        });
        toast.success(`Application approved! License: ${data.license_number}`);
        if (data.provisioning_warning) {
          toast.warning(`Approval committed, but licensee account provisioning needs attention: ${data.provisioning_warning}`);
        }
      } else if (actionType === 'approve') {
        toast.success('Application forwarded to the next review level. Applicant will be notified.');
      } else if (actionType === 'reject') {
        toast.success('Application rejected. Applicant will be notified.');
      } else {
        toast.success(`Action recorded: ${actionType.replace(/_/g, ' ')}`);
      }
      setComment('');
      queryClient.invalidateQueries({ queryKey: ['workflow_instances'] });
      queryClient.invalidateQueries({ queryKey: ['approval_actions'] });
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
    if (!trimmed) {
      toast.error('Please enter a remark.');
      return;
    }
    setProcessingAction('__remark__');
    try {
      const { data, error } = await supabase.functions.invoke('add-application-remark', {
        body: {
          application_id: applicationId,
          instance_id: activeInstance.id,
          step_id: currentStep.id,
          comments: trimmed,
        },
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
      if ((data as any)?.error) {
        toast.error((data as any).error);
        return;
      }
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

  // Build the action buttons strictly from backend per-action flags. The
  // backend RPC is the single source of truth — the frontend never decides
  // who can forward, approve, or reject.
  type ActionDef = { type: WorkflowActionType; label: string; icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' };
  const actions: ActionDef[] = [];
  if (canForward)            actions.push({ type: 'approve',              label: 'Forward to Next Level', icon: <ArrowRight className="h-4 w-4 mr-1" />,  variant: 'default' });
  if (canApprove)            actions.push({ type: 'approve',              label: 'Approve',               icon: <CheckCircle className="h-4 w-4 mr-1" />, variant: 'default' });
  if (canReject)             actions.push({ type: 'reject',               label: 'Reject',                icon: <XCircle className="h-4 w-4 mr-1" />,     variant: 'destructive' });
  if (canSendBack)           actions.push({ type: 'send_back',            label: 'Send Back to Junior',   icon: <ArrowDown className="h-4 w-4 mr-1" />,   variant: 'outline' });
  if (canEscalate)           actions.push({ type: 'escalate',             label: 'Escalate to Senior',    icon: <ArrowUp className="h-4 w-4 mr-1" />,     variant: 'outline' });
  if (canRequestResubmission) actions.push({ type: 'request_resubmission', label: 'Request Resubmission', icon: <ArrowDown className="h-4 w-4 mr-1" />,   variant: 'outline' });
  if (canReturnForCorrection) actions.push({ type: 'return_for_correction', label: 'Return for Correction', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' });
  if (canRequestMoreInfo) actions.push({ type: 'request_more_info', label: 'Request More Information', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' });

  const noWorkflowActions = actions.length === 0;
  const stepHasNoAllowedActions = hasNoAllowedActions(canActResult?.allowed_actions ?? (currentStep as any).allowed_actions);
  const anyRemarksRequired = actions.some(a => REMARKS_REQUIRED_ACTIONS.includes(a.type));
  const remarksRequiredLabels = actions.filter(a => REMARKS_REQUIRED_ACTIONS.includes(a.type)).map(a => a.label);

  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[WorkflowPanel] gating', {
      application_id: applicationId,
      workflow_instance_id: activeInstance?.id,
      current_step_id: currentStep?.id,
      user_id: user?.id,
      reason: canActResult?.reason,
      is_internal: canActResult?.is_internal,
      can_add_remark: canAddRemark,
      can_reject: canReject,
      can_forward: canForward,
      can_approve: canApprove,
      backend_allowed_actions: canActResult?.allowed_actions,
      rendered_actions: actions.map(a => a.label),
    });
  }

  const remarksBlock = (canAddRemark || !noWorkflowActions) && (
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

  const actionButtons = (
    <div className="flex gap-2 flex-wrap">
      {actions.map(a => {
        const isThisProcessing = processingAction === a.type;
        return (
          <Button
            key={a.label}
            variant={a.variant}
            size="sm"
            onClick={() => handleAction(a.type)}
            disabled={processing}
          >
            {isThisProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : a.icon}
            {a.label}
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
          {processingAction === '__remark__' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
          Add Remark
        </Button>
      )}
    </div>
  );

  const defaultOpenStepId = currentStep?.id ?? steps[steps.length - 1]?.id;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Workflow Review — Level {currentStepIdx + 1} of {steps.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Accordion
          type="single"
          collapsible
          defaultValue={defaultOpenStepId}
          className="w-full divide-y rounded-md border border-border/60"
        >
          {steps.map((s, idx) => {
            const isDone = idx < currentStepIdx;
            const isCurrent = idx === currentStepIdx;
            const statusBadge = isDone ? (
              <Badge variant="approved" className="text-[10px]">Completed</Badge>
            ) : isCurrent ? (
              <Badge variant="pending" className="text-[10px]">Pending Action</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">Upcoming</Badge>
            );
            const StatusIcon = isDone ? CheckCircle : isCurrent ? CircleDot : Circle;
            return (
              <AccordionItem
                key={s.id}
                value={s.id}
                className={cn(
                  'border-0 px-3',
                  isCurrent && 'bg-primary/5',
                )}
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
                      {statusBadge}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  {isCurrent ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{currentStep.name}</span>
                        <Badge variant="outline" className="text-xs">
                          Pending: {stepRoleLabel(currentStep)}
                        </Badge>
                      </div>
                      {currentStep.sla_hours && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          SLA: {currentStep.sla_hours}h
                        </div>
                      )}

                      <Separator />

                      {stepHasNoAllowedActions && (
                        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                          <div className="space-y-1">
                            <p className="font-medium text-destructive">No actions configured for this step</p>
                            <p className="text-xs text-muted-foreground">
                              This workflow step has no <code className="font-mono">allowed_actions</code> defined. Ask an
                              administrator to update the workflow step configuration.
                            </p>
                          </div>
                        </div>
                      )}

                      {remarksBlock}
                      {actionButtons}
                    </div>
                  ) : isDone ? (
                    <p className="text-xs text-muted-foreground">
                      This step has been completed. See the activity log for full action history.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This step is pending. It will become actionable once previous steps are completed.
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
                  onClick={() => {
                    navigator.clipboard.writeText(approvalResult.license_number!);
                    toast.success('Copied!');
                  }}
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
                    onClick={() => {
                      navigator.clipboard.writeText(approvalResult.web_user_email!);
                      toast.success('Copied!');
                    }}
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
                    onClick={() => {
                      navigator.clipboard.writeText(approvalResult.password_setup_url!);
                      toast.success('Setup link copied — share securely with the licensee');
                    }}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Password Setup Link
                  </Button>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

