import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import { resolveAvailableActions, isRemarksRequired, hasNoAllowedActions, REMARKS_REQUIRED_ACTIONS } from '@/lib/workflowActionFilter';

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
  const [processing, setProcessing] = useState(false);
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
  const isFirstLevel = currentStepIdx === 0;
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

  const userRoleMatchesStep = !!canActResult?.can_act;

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

  // Read-only view for users not assigned to the current step
  if (!userRoleMatchesStep) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Workflow Review — Level {currentStepIdx + 1} of {steps.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
          <p className="text-xs text-muted-foreground">
            This step is assigned to <strong>{stepRoleLabel(currentStep)}</strong>. You can view details and history but cannot take action on this step.
          </p>
          <ProgressTimeline />
        </CardContent>
      </Card>
    );
  }

  // Comments-required actions must match backend rules — shared helper.
  const handleAction = async (actionType: WorkflowActionType) => {
    if (!user || !activeInstance || !currentStep) return;

    if (isRemarksRequired(actionType) && !comment.trim()) {
      toast.error('Remarks are mandatory for this action');
      return;
    }

    setProcessing(true);
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

      // Edge function now returns proper non-2xx codes. supabase-js surfaces
      // these as `error` (FunctionsHttpError) with the response body in
      // error.context. Try to extract the structured { error, code } payload.
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

      // Final approval response carries license info
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
      setProcessing(false);
    }
  };

  // Build available actions strictly from the backend's allowed_actions list.
  // The backend RPC is the single source of truth: it intersects the step's
  // configured allowed_actions with this user's authorization. If the backend
  // returns nothing usable, NO action buttons render — including
  // "Forward to Next Level".
  const backendAllowed = canActResult?.allowed_actions;
  const stepAllowed = (currentStep as any).allowed_actions as WorkflowActionType[] | undefined;
  const effectiveAllowed = Array.isArray(backendAllowed) ? backendAllowed : stepAllowed;
  const noAllowedActions = hasNoAllowedActions(effectiveAllowed);
  const allowedTypes = resolveAvailableActions({
    isFirstLevel,
    isLastLevel,
    allowedActions: effectiveAllowed,
  });

  if (import.meta.env.DEV) {
    // Safe dev-only diagnostics — IDs and role names only, no secrets.
    // eslint-disable-next-line no-console
    console.debug('[WorkflowPanel] gating', {
      application_id: applicationId,
      workflow_id: workflowId,
      workflow_instance_id: activeInstance?.id,
      current_step_id: currentStep?.id,
      current_step_order: currentStep?.step_order,
      step_approver_role: currentStep?.approver_role,
      step_approver_role_id: currentStep?.approver_role_id,
      user_id: user?.id,
      user_role: user?.role,
      can_act: canActResult?.can_act,
      reason: canActResult?.reason,
      actor_dynamic_role_ids: canActResult?.actor_dynamic_role_ids,
      backend_allowed_actions: backendAllowed,
      step_allowed_actions: stepAllowed,
      rendered_actions: allowedTypes,
    });
  }

  const VISUALS: Record<WorkflowActionType, { label: string; icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' }> = {
    approve: isLastLevel
      ? { label: 'Approve', icon: <CheckCircle className="h-4 w-4 mr-1" />, variant: 'default' }
      : { label: 'Forward to Next Level', icon: <ArrowRight className="h-4 w-4 mr-1" />, variant: 'default' },
    reject: { label: 'Reject', icon: <XCircle className="h-4 w-4 mr-1" />, variant: 'destructive' },
    send_back: { label: 'Send Back to Junior', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' },
    escalate: { label: 'Escalate to Senior', icon: <ArrowUp className="h-4 w-4 mr-1" />, variant: 'outline' },
    request_resubmission: { label: 'Request Resubmission', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' },
  };
  const actions = allowedTypes.map(t => ({ type: t, ...VISUALS[t] }));

  // Remarks are required only when at least one visible action requires them.
  const anyRemarksRequired = allowedTypes.some(t => REMARKS_REQUIRED_ACTIONS.includes(t));
  const remarksRequiredLabels = allowedTypes
    .filter(t => REMARKS_REQUIRED_ACTIONS.includes(t))
    .map(t => VISUALS[t].label);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Workflow Review — Level {currentStepIdx + 1} of {steps.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{currentStep.name}</span>
          <Badge variant="outline" className="text-xs">
            {stepRoleLabel(currentStep)}
          </Badge>
        </div>

        {currentStep.sla_hours && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            SLA: {currentStep.sla_hours}h
          </div>
        )}

        <ProgressTimeline />

        <Separator />

        {noAllowedActions ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-destructive">No actions configured for this step</p>
              <p className="text-xs text-muted-foreground">
                This workflow step has no <code className="font-mono">allowed_actions</code> defined, so no
                approval, rejection, or routing actions can be taken here. Ask an administrator to update the
                workflow step configuration.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label className="text-sm">
                Remarks / Description
                {anyRemarksRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder={
                  anyRemarksRequired
                    ? `Required for: ${remarksRequiredLabels.join(', ')}. Optional for other actions.`
                    : 'Optional remarks for this action.'
                }
                rows={3}
                disabled={processing}
              />
            </div>

            <div className="flex gap-2 flex-wrap">
              {actions.map(a => (
                <Button
                  key={a.type + a.label}
                  variant={a.variant}
                  size="sm"
                  onClick={() => handleAction(a.type)}
                  disabled={processing}
                >
                  {processing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : a.icon}
                  {a.label}
                </Button>
              ))}
            </div>
          </>
        )}
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
