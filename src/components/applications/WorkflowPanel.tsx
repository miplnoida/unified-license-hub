import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useWorkflowSteps, useWorkflowInstances, usePerformAction, type WorkflowActionType } from '@/hooks/useWorkflowEngine';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { INTERNAL_ROLES, ROLE_LABELS, type AppRole } from '@/types/platform';
import {
  CheckCircle, XCircle, ArrowUp, ArrowDown, ArrowRight, Shield, Loader2, Clock, Copy, KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  applicationId: string;
  workflowId: string | null;
  onStatusChange?: () => void;
}

export function WorkflowPanel({ applicationId, workflowId, onStatusChange }: Props) {
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);
  const [approvalResult, setApprovalResult] = useState<{
    license_number?: string;
    web_user_email?: string;
    web_user_password?: string;
    web_user_created?: boolean;
  } | null>(null);

  const isInternal = user && INTERNAL_ROLES.includes(user.role);
  const { data: steps = [] } = useWorkflowSteps(workflowId);
  const { data: instances = [] } = useWorkflowInstances('application', applicationId);
  const performAction = usePerformAction();

  const activeInstance = instances.find(i => i.status === 'active');
  const currentStep = activeInstance ? steps.find(s => s.id === activeInstance.current_step_id) : null;
  const currentStepIdx = currentStep ? steps.findIndex(s => s.id === currentStep.id) : -1;
  const isFirstLevel = currentStepIdx === 0;
  const isLastLevel = currentStepIdx === steps.length - 1;

  // Check if user's role matches the current step's approver role
  // super_admin can act on any step; other roles must match exactly
  const userRoleMatchesStep = user && currentStep && (
    user.role === 'super_admin' || user.role === currentStep.approver_role
  );

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
    </Card>
  );
}
