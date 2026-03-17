import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useWorkflowSteps, useWorkflowInstances, usePerformAction, ACTION_LABELS, type WorkflowActionType } from '@/hooks/useWorkflowEngine';
import { useAuth } from '@/contexts/AuthContext';
import { INTERNAL_ROLES, ROLE_LABELS, type AppRole } from '@/types/platform';
import {
  CheckCircle, XCircle, MessageSquare, ArrowRight, Shield, Loader2, Clock,
} from 'lucide-react';

const actionIcons: Record<string, React.ReactNode> = {
  approve: <CheckCircle className="h-4 w-4 mr-1" />,
  reject: <XCircle className="h-4 w-4 mr-1" />,
  send_back: <MessageSquare className="h-4 w-4 mr-1" />,
  request_info: <MessageSquare className="h-4 w-4 mr-1" />,
};

const actionVariants: Record<string, 'default' | 'destructive' | 'outline'> = {
  approve: 'default',
  reject: 'destructive',
  send_back: 'outline',
  request_info: 'outline',
};

interface Props {
  applicationId: string;
  workflowId: string | null;
  onStatusChange?: () => void;
}

export function WorkflowPanel({ applicationId, workflowId, onStatusChange }: Props) {
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [processing, setProcessing] = useState(false);

  const isInternal = user && INTERNAL_ROLES.includes(user.role);
  const { data: steps = [] } = useWorkflowSteps(workflowId);
  const { data: instances = [] } = useWorkflowInstances('application', applicationId);
  const performAction = usePerformAction();

  const activeInstance = instances.find(i => i.status === 'active');
  const currentStep = activeInstance ? steps.find(s => s.id === activeInstance.current_step_id) : null;
  const currentStepIdx = currentStep ? steps.findIndex(s => s.id === currentStep.id) : -1;

  if (!workflowId || !isInternal || !activeInstance || !currentStep) return null;

  const handleAction = async (actionType: WorkflowActionType) => {
    if (!user || !activeInstance || !currentStep) return;
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Workflow Review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step pipeline */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center">
              {i > 0 && <div className={`w-4 h-0.5 ${i <= currentStepIdx ? 'bg-primary' : 'bg-border'}`} />}
              <div className={`px-2 py-1 rounded-full text-[10px] font-medium whitespace-nowrap ${
                step.id === currentStep.id
                  ? 'bg-primary text-primary-foreground'
                  : i < currentStepIdx
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {step.name}
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Current step info */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Current: {currentStep.name}</span>
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
        </div>

        {/* Review form */}
        <div className="space-y-2">
          <Label className="text-sm">Review Comments</Label>
          <Textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Add review comments..."
            rows={3}
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {(currentStep.allowed_actions as WorkflowActionType[]).map(action => (
            <Button
              key={action}
              variant={actionVariants[action] || 'default'}
              size="sm"
              onClick={() => handleAction(action)}
              disabled={processing}
            >
              {processing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : actionIcons[action]}
              {ACTION_LABELS[action] || action}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
