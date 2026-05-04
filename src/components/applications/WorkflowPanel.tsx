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
  CheckCircle, XCircle, ArrowUp, ArrowDown, ArrowRight, Shield, Loader2, Clock, Copy, Mail, CircleDot, Circle,
} from 'lucide-react';
import { toast } from 'sonner';
import { resolveAvailableActions, isRemarksRequired } from '@/lib/workflowActionFilter';

/**
 * Resolve the effective system roles a user has access to (primary + dynamic role mappings).
 */
function useEffectiveSystemRoles(userId: string | undefined, primaryRole: AppRole | undefined) {
  return useQuery({
    queryKey: ['effective-system-roles', userId],
    enabled: !!userId,
    queryFn: async () => {
      const set = new Set<string>();
      if (primaryRole) set.add(primaryRole);
      const { data: udr } = await supabase
        .from('user_dynamic_roles' as any)
        .select('role_id')
        .eq('user_id', userId!);
      const roleIds = Array.from(new Set(((udr as any[]) || []).map(r => r.role_id).filter(Boolean)));
      if (roleIds.length > 0) {
        const { data: roles } = await supabase
          .from('roles' as any)
          .select('system_role')
          .in('id', roleIds);
        ((roles as any[]) || []).forEach(r => { if (r.system_role) set.add(r.system_role); });
      }
      return Array.from(set);
    },
    staleTime: 60_000,
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

  const { data: effectiveRoles = [] } = useEffectiveSystemRoles(user?.id, user?.role as AppRole | undefined);

  const userRoleMatchesStep = !!user && !!currentStep && (
    user.role === 'super_admin' || effectiveRoles.includes(currentStep.approver_role)
  );

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
                {ROLE_LABELS[s.approver_role as AppRole] || s.approver_role}
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
              Pending: {ROLE_LABELS[currentStep.approver_role as AppRole] || currentStep.approver_role}
            </Badge>
          </div>
          {currentStep.sla_hours && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              SLA: {currentStep.sla_hours}h
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            This step is assigned to <strong>{ROLE_LABELS[currentStep.approver_role as AppRole] || currentStep.approver_role}</strong>. You can view details and history but cannot take action on this step.
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

  // Build available actions strictly from the step's allowed_actions list.
  // No synthetic bypass: if the step doesn't allow it, it does not appear.
  const stepAllowed = new Set<string>(
    Array.isArray((currentStep as any).allowed_actions)
      ? ((currentStep as any).allowed_actions as string[])
      : ['approve', 'reject', 'send_back'],
  );

  const candidate: { type: WorkflowActionType; label: string; icon: React.ReactNode; variant: 'default' | 'destructive' | 'outline' }[] = [];
  if (isLastLevel) {
    candidate.push(
      { type: 'approve', label: 'Approve', icon: <CheckCircle className="h-4 w-4 mr-1" />, variant: 'default' },
      { type: 'reject', label: 'Reject', icon: <XCircle className="h-4 w-4 mr-1" />, variant: 'destructive' },
    );
  } else {
    candidate.push(
      { type: 'approve', label: 'Forward to Next Level', icon: <ArrowRight className="h-4 w-4 mr-1" />, variant: 'default' },
    );
  }
  if (!isFirstLevel && !isLastLevel) {
    candidate.push({ type: 'send_back', label: 'Send Back to Junior', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' });
  }
  if (!isLastLevel) {
    candidate.push({ type: 'escalate', label: 'Escalate to Senior', icon: <ArrowUp className="h-4 w-4 mr-1" />, variant: 'outline' });
  }
  candidate.push({ type: 'request_resubmission', label: 'Request Resubmission', icon: <ArrowDown className="h-4 w-4 mr-1" />, variant: 'outline' });

  const actions = candidate.filter(a => stepAllowed.has(a.type));

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
            {ROLE_LABELS[currentStep.approver_role as AppRole] || currentStep.approver_role}
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

        <div className="space-y-2">
          <Label className="text-sm">
            Remarks / Description
            <span className="text-destructive ml-1">*</span>
          </Label>
          <Textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Mandatory: Enter your remarks before approving, rejecting, or requesting resubmission..."
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
