import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useWorkflowSteps, useWorkflowInstances, usePerformAction, type WorkflowActionType } from '@/hooks/useWorkflowEngine';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_ROLES, ROLE_LABELS, type AppRole } from '@/types/platform';
import {
  CheckCircle, XCircle, ArrowUp, ArrowDown, ArrowRight, Shield, Loader2, Clock, Copy, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  applicationId: string;
  workflowId: string | null;
  applicationStatus: string;
  onStatusChange?: () => void;
}

export function WorkflowPanel({ applicationId, workflowId, applicationStatus, onStatusChange }: Props) {
  const { user } = useAuth();
  const { hasModuleAccess, enforceDynamic } = useUserDynamicPermissions();
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [approvalResult, setApprovalResult] = useState<{
    license_number?: string;
    web_user_email?: string;
    web_user_password?: string;
    web_user_created?: boolean;
  } | null>(null);

  const isInternal = !!user && (enforceDynamic ? hasModuleAccess('application_management') : INTERNAL_ROLES.includes(user.role));
  const { data: steps = [] } = useWorkflowSteps(workflowId);
  const { data: instances = [] } = useWorkflowInstances('application', applicationId);
  const performAction = usePerformAction();

  const [autoCreating, setAutoCreating] = useState(false);
  const queryClient = useQueryClient();

  const activeInstance = instances.find(i => i.status === 'active');
  const pausedInstance = instances.find(i => i.status === 'paused');
  const shouldResumePausedWorkflow = !!pausedInstance && ['submitted', 'in_progress'].includes(applicationStatus);

  // Auto-create workflow instance if application has workflow_id but no instance
  useEffect(() => {
    if (!workflowId || !isInternal || activeInstance || pausedInstance || instances.length > 0 || steps.length === 0 || autoCreating) return;
    setAutoCreating(true);
    const firstStep = steps[0];
    (async () => {
      try {
        await supabase.from('workflow_instances').insert({
          workflow_id: workflowId,
          entity_type: 'application',
          entity_id: applicationId,
          current_step_id: firstStep?.id || null,
          status: 'active',
        } as any);
        queryClient.invalidateQueries({ queryKey: ['workflow_instances'] });
      } catch (e) {
        console.error('Auto-create workflow instance failed', e);
      } finally {
        setAutoCreating(false);
      }
    })();
  }, [workflowId, isInternal, instances.length, steps.length]);

  useEffect(() => {
    if (!workflowId || !pausedInstance || !shouldResumePausedWorkflow || autoCreating) return;
    setAutoCreating(true);

    (async () => {
      try {
        const { error } = await supabase
          .from('workflow_instances')
          .update({ status: 'active' } as any)
          .eq('id', pausedInstance.id)
          .eq('status', 'paused');

        if (error) {
          console.error('Auto-resume workflow instance failed', error);
          return;
        }

        queryClient.invalidateQueries({ queryKey: ['workflow_instances'] });
        onStatusChange?.();
      } finally {
        setAutoCreating(false);
      }
    })();
  }, [workflowId, pausedInstance?.id, shouldResumePausedWorkflow, autoCreating, queryClient, onStatusChange]);

  const currentStep = activeInstance ? steps.find(s => s.id === activeInstance.current_step_id) : null;
  const currentStepIdx = currentStep ? steps.findIndex(s => s.id === currentStep.id) : -1;
  const isFirstLevel = currentStepIdx === 0;
  const isLastLevel = currentStepIdx === steps.length - 1;

  // Check if user's role matches the current step's approver role
  // super_admin can act on any step; other roles must match exactly
  const userRoleMatchesStep = user && currentStep && (
    user.role === 'super_admin' || user.role === currentStep.approver_role
  );

  // If workflow is paused (waiting for resubmission), show info card
  if (!activeInstance && pausedInstance && isInternal && !shouldResumePausedWorkflow) {
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

  if (autoCreating) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
          <span className="text-sm text-muted-foreground">Initializing workflow...</span>
        </CardContent>
      </Card>
    );
  }

  if (!workflowId || !isInternal || !activeInstance || !currentStep) return null;

  // If user's role doesn't match, show read-only status
  if (!userRoleMatchesStep) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Workflow Review — Level {currentStepIdx + 1} of {steps.length}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{currentStep.name}</span>
            <Badge variant="outline" className="text-xs">
              Pending: {ROLE_LABELS[currentStep.approver_role as AppRole] || currentStep.approver_role}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            This step is assigned to <strong>{ROLE_LABELS[currentStep.approver_role as AppRole] || currentStep.approver_role}</strong>. You cannot take action on this step.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleAction = async (actionType: WorkflowActionType) => {
    if (!user || !activeInstance || !currentStep) return;

    // Mandatory remarks for approve/reject
    if ((actionType === 'approve' || actionType === 'reject') && !comment.trim()) {
      toast.error('Remarks are mandatory for Approve / Reject actions');
      return;
    }

    setProcessing(true);
    try {
      // For final-level approvals, use the server-side edge function
      if (actionType === 'approve' && isLastLevel) {
        const { data, error } = await supabase.functions.invoke('approve-pre-licensee', {
          body: { application_id: applicationId, comments: comment },
        });
        if (error) {
          toast.error(error.message || 'Approval failed');
          setProcessing(false);
          return;
        }
        if (data?.error) {
          toast.error(data.error);
          setProcessing(false);
          return;
        }
        // Show approval result with credentials
        setApprovalResult({
          license_number: data.license_number,
          web_user_email: data.web_user_email,
          web_user_password: data.web_user_password,
          web_user_created: data.web_user_created,
        });
        toast.success(`Application approved! License: ${data.license_number}`);
        setComment('');
        onStatusChange?.();
        setProcessing(false);
        return;
      }

      // For rejections at final level, also use edge function pattern but via normal mutation
      await performAction.mutateAsync({
        instance_id: activeInstance.id,
        step_id: currentStep.id,
        actor_id: user.id,
        action_type: actionType,
        comments: comment || undefined,
        application_id: applicationId,
      });
      setComment('');
      onStatusChange?.();
    } catch (err: any) {
      // error handled by mutation
    }
    setProcessing(false);
  };

  // Build available actions based on level
  const actions: { type: WorkflowActionType; label: string; icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' }[] = [];

  if (isLastLevel) {
    // Final level: Approve / Reject only
    actions.push(
      { type: 'approve', label: 'Approve', icon: <CheckCircle className="h-4 w-4 mr-1" />, variant: 'default' },
      { type: 'reject', label: 'Reject', icon: <XCircle className="h-4 w-4 mr-1" />, variant: 'destructive' },
    );
  } else {
    // Non-final levels: Forward / Send Back / Escalate
    actions.push(
      { type: 'approve', label: 'Forward to Next Level', icon: <ArrowRight className="h-4 w-4 mr-1" />, variant: 'default' },
    );
  }

  if (!isFirstLevel && !isLastLevel) {
    actions.push(
      { type: 'send_back', label: 'Send Back to Junior', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' },
    );
  }

  if (!isLastLevel) {
    actions.push(
      { type: 'escalate', label: 'Escalate to Senior', icon: <ArrowUp className="h-4 w-4 mr-1" />, variant: 'outline' },
    );
  }

  // Request Resubmission - available at any level
  actions.push(
    { type: 'request_resubmission', label: 'Request Resubmission', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' },
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Workflow Review — Level {currentStepIdx + 1} of {steps.length}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current step info */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{currentStep.name}</span>
          <Badge variant="outline" className="text-xs">
            {ROLE_LABELS[currentStep.approver_role as AppRole] || currentStep.approver_role}
          </Badge>
        </div>

        {currentStep.sla_hours && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            SLA: {currentStep.sla_hours}h
          </div>
        )}

        <Separator />

        {/* Mandatory remarks */}
        <div className="space-y-2">
          <Label className="text-sm">
            Remarks / Description
            {isLastLevel && <span className="text-destructive ml-1">*</span>}
          </Label>
          <Textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={isLastLevel ? 'Mandatory: Enter your remarks before approving or rejecting...' : 'Add remarks (optional)...'}
            rows={3}
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
      </CardContent>

      {/* Approval Result Dialog */}
      <Dialog open={!!approvalResult} onOpenChange={() => setApprovalResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Application Approved
            </DialogTitle>
            <DialogDescription>
              License and web user have been created successfully.
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

            {approvalResult?.web_user_created && approvalResult?.web_user_password && (
              <div className="space-y-3 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Web User Credentials</p>
                </div>
                <div className="space-y-2">
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
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Password</p>
                      <p className="text-sm font-mono font-medium">{approvalResult.web_user_password}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(approvalResult.web_user_password!);
                        toast.success('Copied!');
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-destructive font-medium">
                  ⚠ Save these credentials now. The password cannot be retrieved later.
                </p>
              </div>
            )}

            {approvalResult?.web_user_created && !approvalResult?.web_user_password && (
              <p className="text-sm text-muted-foreground">
                Web user already existed and has been linked to the licensee entity.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
