import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Plus, Trash2, GripVertical, ChevronUp, ChevronDown, Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import Swal from 'sweetalert2';
import type { RegFormSchema, RegStep } from '@/types/registrationForm';
import { StepEditor } from './StepEditor';
import { buildRegistrationPreviewUrl, storeRegistrationPreview } from '@/lib/registrationPreview';

interface Props {
  schema: RegFormSchema;
  onChange: (schema: RegFormSchema) => void;
  /** Step id currently configured for email verification (null when OTP is off). */
  emailVerificationStepId?: string | null;
  /** Called when the configured verification step is deleted and placement resets. */
  onEmailVerificationStepReset?: () => void;
}

export function RegistrationFormBuilderEditor({
  schema,
  onChange,
  emailVerificationStepId,
  onEmailVerificationStepReset,
}: Props) {
  const [activeStepId, setActiveStepId] = useState<string | null>(schema[0]?.id || null);

  const addStep = () => {
    const newStep: RegStep = {
      id: crypto.randomUUID(),
      title: `Step ${schema.length + 1}`,
      rows: [],
    };
    const updated = [...schema, newStep];
    onChange(updated);
    setActiveStepId(newStep.id);
  };

  const applyDeleteStep = (id: string) => {
    const updated = schema.filter(s => s.id !== id);
    onChange(updated);
    if (activeStepId === id) setActiveStepId(updated[0]?.id || null);
  };

  const deleteStep = async (id: string) => {
    if (emailVerificationStepId && emailVerificationStepId === id) {
      const result = await Swal.fire({
        title: 'Step used for Email Verification',
        text: 'This step is currently used for Email Verification. Deleting it will move email verification to "Before Final Submission". You can pick another step afterwards.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete and reset placement',
        cancelButtonText: 'Keep step',
      });
      if (!result.isConfirmed) return;
      onEmailVerificationStepReset?.();
      toast.info('Email verification moved to "Before Final Submission"');
    }
    applyDeleteStep(id);
  };

  const updateStep = (id: string, step: RegStep) => {
    onChange(schema.map(s => s.id === id ? step : s));
  };

  const moveStep = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= schema.length) return;
    const updated = [...schema];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    onChange(updated);
  };

  const activeStep = schema.find(s => s.id === activeStepId);

  const openPreviewInNewTab = () => {
    try {
      storeRegistrationPreview({
        name: 'Form Preview',
        schema,
        documentTypes: [],
        declarations: [],
        requireOtp: false,
        requireCaptcha: false,
        requireDocuments: false,
      });
      window.open(buildRegistrationPreviewUrl(), '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Unable to open preview');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Form Steps</h3>
          <Badge variant="secondary" className="text-xs">
            {schema.length} steps · {schema.reduce((a, s) => a + s.rows.reduce((b, r) => b + r.columns.filter(c => c.field).length, 0), 0)} fields
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button data-rbac="form_management.view" variant="outline" size="sm" onClick={openPreviewInNewTab}>
            <Eye className="h-3.5 w-3.5 mr-1" /> Preview
          </Button>
          <Button data-rbac="form_management.edit" size="sm" onClick={addStep}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Step
          </Button>
        </div>
      </div>

      {schema.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground mb-3">No steps yet. Add a step to start building.</p>
            <Button data-rbac="form_management.edit" variant="outline" onClick={addStep}>
              <Plus className="h-4 w-4 mr-2" /> Add First Step
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-4">
          {/* Step list sidebar */}
          <div className="w-56 shrink-0 space-y-1">
            {schema.map((step, idx) => (
              <div
                key={step.id}
                className={`flex items-center gap-1 p-2 rounded-lg border cursor-pointer transition-all text-sm ${
                  activeStepId === step.id
                    ? 'border-primary bg-primary/5 shadow-sm'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setActiveStepId(step.id)}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate font-medium">{step.title}</span>
                {emailVerificationStepId === step.id && (
                  <Badge variant="outline" className="text-[10px] shrink-0">OTP</Badge>
                )}
                <Badge variant="secondary" className="text-[10px] shrink-0">
                  {step.rows.reduce((a, r) => a + r.columns.filter(c => c.field).length, 0)}
                </Badge>
                <div className="flex flex-col shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); moveStep(idx, -1); }}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={idx === 0}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); moveStep(idx, 1); }}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={idx === schema.length - 1}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); void deleteStep(step.id); }}
                  className="text-destructive hover:text-destructive/80 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <Button data-rbac="form_management.edit" variant="outline" size="sm" className="w-full mt-2" onClick={addStep}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Step
            </Button>
          </div>

          {/* Step editor */}
          <div className="flex-1 min-w-0">
            {activeStep ? (
              <StepEditor
                step={activeStep}
                onChange={updated => updateStep(activeStep.id, updated)}
                allSteps={schema}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Select a step to edit
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
