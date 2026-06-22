import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useWorkflowSteps, useWorkflowInstances, type WorkflowActionType } from '@/hooks/useWorkflowEngine';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_ROLES, ROLE_LABELS, type AppRole } from '@/types/platform';
import {
  CheckCircle, XCircle, ArrowUp, ArrowDown, ArrowRight, Shield, Loader2, CircleDot, Circle,
} from 'lucide-react';
import { toast } from 'sonner';
import { isRemarksRequired, hasNoAllowedActions, REMARKS_REQUIRED_ACTIONS } from '@/lib/workflowActionFilter';
import { WorkflowActionPreviewDialog, type ActionNotificationOverride } from '@/components/applications/WorkflowActionPreviewDialog';
import { useStepActions, type StepAction } from '@/hooks/useStepActions';


interface CanActResult {
  can_act: boolean;
  step_id: string | null;
  step_name: string | null;
  required_role_id: string | null;
  required_role_name: string | null;
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

interface Props {
  returnId: string;
  workflowId: string | null;
  workflowEnabled: boolean;
  returnStatus: string;
  onStatusChange?: () => void;
}

export function ReturnWorkflowPanel({ returnId, workflowId, workflowEnabled, returnStatus, onStatusChange }: Props) {
  if (!workflowEnabled) return null;
  return (
    <ReturnWorkflowPanelContent
      returnId={returnId}
      workflowId={workflowId}
      returnStatus={returnStatus}
      onStatusChange={onStatusChange}
    />
  );
}

function ReturnWorkflowPanelContent({ returnId, workflowId, returnStatus, onStatusChange }: Omit<Props, 'workflowEnabled'>) {
  const { user } = useAuth();
  const { hasModuleAccess, enforceDynamic } = useUserDynamicPermissions();
  const [comment, setComment] = useState('');
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ actionType: WorkflowActionType; label: string; requireSignature: boolean } | null>(null);
  const processing = processingAction !== null;


  const isInternal = !!user && (enforceDynamic ? hasModuleAccess('returns_management') || hasModuleAccess('application_management') : INTERNAL_ROLES.includes(user.role));
  const { data: steps = [] } = useWorkflowSteps(workflowId);
  const { data: instances = [] } = useWorkflowInstances('return', returnId);
  const queryClient = useQueryClient();

  const activeInstance = instances.find(i => i.status === 'active');
  const pausedInstance = instances.find(i => i.status === 'paused');
  const currentStep = activeInstance ? steps.find(s => s.id === activeInstance.current_step_id) : null;
  const currentStepIdx = currentStep ? steps.findIndex(s => s.id === currentStep.id) : -1;

  const { data: canActResult } = useCanActOnStep(user?.id, currentStep?.id);
  const { data: configuredStepActions = [] } = useStepActions(currentStep?.id);
  const { data: dynamicRolesMap = {} } = useDynamicRolesMap();


  const stepRoleLabel = (step: { approver_role: string; approver_role_id?: string | null }) => {
    if (step.approver_role_id) return dynamicRolesMap[step.approver_role_id] || 'Configured role missing';
    return ROLE_LABELS[step.approver_role as AppRole] || step.approver_role;
  };

  if (!activeInstance && pausedInstance && isInternal) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Workflow Paused — Awaiting Resubmission
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This return has been sent back to the licensee for revision. The workflow will resume once they resubmit.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!workflowId || !isInternal || !activeInstance || !currentStep) {
    if (workflowId && isInternal && instances.length === 0 && String(returnStatus).toUpperCase() === 'SUB') {
      return (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Workflow has not started yet. Initialize it to begin review.
            <Button
              className="ml-2"
              size="sm"
              onClick={async () => {
                const { error } = await supabase.rpc('start_return_workflow' as any, { _return_id: returnId });
                if (error) toast.error(error.message);
                else {
                  toast.success('Workflow started');
                  queryClient.invalidateQueries({ queryKey: ['workflow_instances', 'return', returnId] });
                  onStatusChange?.();
                }
              }}
            >Start workflow</Button>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  const canAddRemark = !!canActResult?.can_add_remark || (isInternal && !canActResult);
  const canReject = !!canActResult?.can_reject;
  const canForward = !!canActResult?.can_forward;
  const canApprove = !!canActResult?.can_approve;
  const canSendBack = !!canActResult?.can_send_back;
  const canEscalate = !!canActResult?.can_escalate;
  const canRequestResubmission = !!canActResult?.can_request_resubmission;
  const canReturnForCorrection = !!canActResult?.can_return_for_correction;
  const canRequestMoreInfo = !!canActResult?.can_request_more_info;

  if (!isInternal) return null;

  const executeAction = async (actionType: WorkflowActionType, overrides: ActionNotificationOverride[] = [], signatureDataUrl: string | null = null) => {
    if (!user || !activeInstance || !currentStep) return;
    setProcessingAction(actionType);
    try {
      const { data, error } = await supabase.functions.invoke('perform-return-workflow-action', {
        body: {
          return_id: returnId,
          instance_id: activeInstance.id,
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
      toast.success(`Action recorded: ${actionType.replace(/_/g, ' ')}`);
      setComment('');
      setPreviewState(null);
      queryClient.invalidateQueries({ queryKey: ['workflow_instances'] });
      queryClient.invalidateQueries({ queryKey: ['approval_actions'] });
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


  const handleAction = (actionType: WorkflowActionType, label: string) => {
    if (!user || !activeInstance || !currentStep) return;
    if (isRemarksRequired(actionType) && !comment.trim()) {
      toast.error('Remarks are mandatory for this action.');
      return;
    }
    const cfgRow = (configuredStepActions as StepAction[]).find(
      a => a.action_type === actionType && a.is_enabled,
    );
    setPreviewState({ actionType, label, requireSignature: !!cfgRow?.require_digital_signature });
  };


  type ActionDef = { type: WorkflowActionType; label: string; icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' };
  const actions: ActionDef[] = [];
  if (canForward)            actions.push({ type: 'approve', label: 'Forward to Next Level', icon: <ArrowRight className="h-4 w-4 mr-1" />, variant: 'default' });
  if (canApprove)            actions.push({ type: 'approve', label: 'Approve', icon: <CheckCircle className="h-4 w-4 mr-1" />, variant: 'default' });
  if (canReject)             actions.push({ type: 'reject', label: 'Reject', icon: <XCircle className="h-4 w-4 mr-1" />, variant: 'destructive' });
  if (canSendBack)           actions.push({ type: 'send_back', label: 'Send Back', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' });
  if (canEscalate)           actions.push({ type: 'escalate', label: 'Escalate', icon: <ArrowUp className="h-4 w-4 mr-1" />, variant: 'outline' });
  if (canRequestResubmission) actions.push({ type: 'request_resubmission', label: 'Request Edit / Resubmission', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' });
  if (canReturnForCorrection) actions.push({ type: 'return_for_correction', label: 'Return for Correction', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' });
  if (canRequestMoreInfo) actions.push({ type: 'request_more_info', label: 'Request More Information', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' });

  const noActions = actions.length === 0;
  const stepHasNoAllowedActions = hasNoAllowedActions(canActResult?.allowed_actions ?? (currentStep as any).allowed_actions);
  const anyRemarksRequired = actions.some(a => REMARKS_REQUIRED_ACTIONS.includes(a.type));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" /> Approval Workflow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
          <p className="text-xs font-medium text-muted-foreground">Workflow Progress</p>
          <ol className="space-y-1.5">
            {steps.map((s, idx) => {
              const isDone = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;
              return (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  {isDone ? <CheckCircle className="h-3.5 w-3.5 text-success" />
                    : isCurrent ? <CircleDot className="h-3.5 w-3.5 text-primary animate-pulse" />
                    : <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                  <span className={isCurrent ? 'font-medium' : 'text-muted-foreground'}>
                    Step {idx + 1}: {s.name}
                  </span>
                  <Badge variant="outline" className="ml-auto text-[10px]">{stepRoleLabel(s)}</Badge>
                </li>
              );
            })}
          </ol>
        </div>

        <Separator />

        <div>
          <Label htmlFor="return-workflow-comment" className="text-xs">
            Comments / Reason {anyRemarksRequired ? '(required for Approve / Reject / Request Edit)' : '(optional)'}
          </Label>
          <Textarea id="return-workflow-comment" rows={4}
            placeholder="Add a note for the licensee..."
            value={comment} onChange={e => setComment(e.target.value)} disabled={processing} />
        </div>

        {noActions ? (
          <p className="text-xs text-muted-foreground italic">
            {stepHasNoAllowedActions
              ? 'This step has no allowed actions configured. Contact an administrator.'
              : 'You do not have permission to act on the current step.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {actions.map(a => (
              <Button key={a.label} variant={a.variant} disabled={processing}
                onClick={() => handleAction(a.type, a.label)}>
                {processingAction === a.type ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : a.icon}
                {a.label}
              </Button>
            ))}
          </div>
        )}
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
