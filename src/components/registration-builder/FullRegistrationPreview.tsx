import { visibleRegSteps } from '@/lib/sectionVisibility';
import {
  effectiveDeclarations,
  effectiveDocumentTypes,
  isDeclarationsStepVisible,
  isDocumentsStepVisible,
} from '@/lib/registrationItemVisibility';
import { useState, useMemo } from 'react';
import {
  resolveEmailVerificationPlacement,
  shouldRenderEmailVerification,
} from '@/lib/registrationEmailVerification';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DynamicRegistrationStepper } from '@/components/registration/DynamicRegistrationStepper';
import { FormPreview } from './FormPreview';
import { Upload, CheckSquare, Shield, Mail, Bot } from 'lucide-react';
import type { RegFormSchema } from '@/types/registrationForm';

interface Declaration {
  label: string;
  required: boolean;
  linkUrl?: string;
  linkLabel?: string;
  visible?: boolean;
}

interface DocType {
  label: string;
  required: boolean;
  allowedTypes: string[];
  maxSizeMB: number;
  visible?: boolean;
}

interface Props {
  schema: RegFormSchema;
  documentTypes: DocType[];
  declarations: Declaration[];
  requireOtp: boolean;
  requireCaptcha: boolean;
  requireDocuments: boolean;
  /** Whether the OTP block is shown to the applicant (defaults to true). */
  otpVisible?: boolean;
  /** Whether the CAPTCHA block is shown to the applicant (defaults to true). */
  captchaVisible?: boolean;
  /** Whether the whole documents section is shown (defaults to true). */
  documentsSectionVisible?: boolean;
  /** Whether the whole declarations section is shown (defaults to true). */
  declarationsSectionVisible?: boolean;
  /** Configured email verification placement (step id or 'before_submission'). */
  emailVerificationStepId?: string | null;
}

/**
 * Full end-to-end preview that mirrors what the public applicant
 * experiences: dynamic form steps + (optional) documents step +
 * declarations / verification step.
 */
export function FullRegistrationPreview({
  schema: rawSchema,
  documentTypes,
  declarations,
  requireOtp,
  requireCaptcha,
  requireDocuments,
  otpVisible = true,
  captchaVisible = true,
  documentsSectionVisible = true,
  declarationsSectionVisible = true,
  emailVerificationStepId,
}: Props) {
  // Preview must mirror the applicant experience: hidden steps are excluded.
  const schema = useMemo(() => visibleRegSteps(rawSchema), [rawSchema]);

  // Preview mirrors the applicant view: hidden items and sections are dropped,
  // and steps that become empty disappear from the stepper entirely.
  const shownDocTypes = useMemo(
    () => effectiveDocumentTypes(documentTypes, documentsSectionVisible),
    [documentTypes, documentsSectionVisible],
  );
  const shownDeclarations = useMemo(
    () => effectiveDeclarations(declarations, declarationsSectionVisible),
    [declarations, declarationsSectionVisible],
  );
  const effectiveRequireOtp = requireOtp && otpVisible !== false;
  const effectiveRequireCaptcha = requireCaptcha && captchaVisible !== false;

  const showDocStep = isDocumentsStepVisible({
    requireDocuments,
    documentsSectionVisible,
    documentTypes: documentTypes ?? [],
  });
  const showDeclStep = isDeclarationsStepVisible({
    declarationsSectionVisible,
    declarations: declarations ?? [],
    captchaOnDeclarations: effectiveRequireCaptcha,
    otpOnDeclarations:
      effectiveRequireOtp
      && (!emailVerificationStepId
        || emailVerificationStepId === 'before_submission'
        || emailVerificationStepId === 'declarations'),
  });

  const stepLabels = useMemo(() => {
    const labels = schema.map(s => s.title || 'Step');
    if (showDocStep) labels.push('Supporting Documents');
    if (showDeclStep) labels.push('Declarations & Verification');
    return labels;
  }, [schema, showDocStep, showDeclStep]);

  const [current, setCurrent] = useState(0);
  const total = stepLabels.length;
  const isDocStep = showDocStep && current === schema.length;
  const isDeclStep = showDeclStep && current === stepLabels.length - 1;
  const isFormStep = !isDocStep && !isDeclStep;

  // Same resolver the applicant runtime uses, so the preview cannot drift.
  const placementSteps = useMemo(() => [
    ...schema.map(s => ({ id: s.id, type: 'dynamic' })),
    ...(showDocStep ? [{ id: 'documents', type: 'documents' }] : []),
    ...(showDeclStep ? [{ id: 'declarations', type: 'declarations' }] : []),
  ], [schema, showDocStep, showDeclStep]);
  const placement = resolveEmailVerificationPlacement(emailVerificationStepId, placementSteps);
  const currentStepId = isDeclStep ? 'declarations' : isDocStep ? 'documents' : schema[current]?.id || '';
  const currentStepType = isDeclStep ? 'declarations' : isDocStep ? 'documents' : 'dynamic';
  const showOtpHere = shouldRenderEmailVerification({
    stepId: currentStepId,
    stepType: currentStepType,
    placement,
    requireOtp: effectiveRequireOtp,
  });

  const otpPreviewBlock = (
    <div className="p-3 rounded border bg-muted/30 space-y-2">
      <Label className="text-sm">Email OTP Verification</Label>
      <div className="flex gap-2">
        <Input placeholder="Enter 6-digit code" disabled className="text-sm" />
        <Button data-rbac="form_management.edit" variant="outline" size="sm" disabled>Send Code</Button>
      </div>
    </div>
  );

  // Mirrors the applicant runtime: with no visible section the public page shows
  // the unavailable screen instead of any form (never a legacy fallback form).
  if (schema.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold">Public Registration Preview</h3>
          <p className="text-xs text-muted-foreground">This is what the applicant will see.</p>
        </div>
        <div className="rounded-lg border bg-muted/20 py-12 px-6 text-center">
          <h2 className="text-lg font-semibold text-foreground mb-2">Registration Form Not Available</h2>
          <p className="text-sm text-muted-foreground">
            The registration form is currently not available. Please try again later or contact the
            administrator for assistance.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Public Registration Preview</h3>
          <p className="text-xs text-muted-foreground">This is what the applicant will see.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {effectiveRequireOtp && <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" /> OTP</Badge>}
          {effectiveRequireCaptcha && <Badge variant="outline" className="gap-1"><Bot className="h-3 w-3" /> CAPTCHA</Badge>}
          {showDocStep && <Badge variant="outline" className="gap-1"><Upload className="h-3 w-3" /> Documents</Badge>}
          <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" /> {shownDeclarations.length} declarations</Badge>
        </div>
      </div>

      <DynamicRegistrationStepper
        steps={stepLabels}
        currentStep={current}
        completedSteps={new Set(Array.from({ length: current }, (_, i) => i))}
      />

      {isFormStep && (
        <div className="space-y-4">
          <FormPreview schema={[schema[current]]} showNavigation={false} showStepper={false} />
          {showOtpHere && otpPreviewBlock}
        </div>
      )}

      {isDocStep && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" /> Supporting Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {shownDocTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No document types configured.</p>
            ) : (
              shownDocTypes.map((d, i) => (
                <div key={i} className="p-3 rounded border bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">
                      {d.label || 'Untitled document'}
                      {d.required && <span className="text-destructive"> *</span>}
                    </Label>
                    <span className="text-[11px] text-muted-foreground">
                      {d.allowedTypes.join(', ')} · max {d.maxSizeMB}MB
                    </span>
                  </div>
                  <Input type="file" disabled className="text-sm" />
                </div>
              ))
            )}
            {showOtpHere && otpPreviewBlock}
          </CardContent>
        </Card>
      )}

      {isDeclStep && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckSquare className="h-4 w-4" /> Declarations & Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {shownDeclarations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No declarations configured.</p>
            ) : (
              shownDeclarations.map((decl, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Checkbox disabled className="mt-0.5" />
                  <div className="text-sm">
                    {decl.linkLabel && decl.linkUrl
                      ? renderWithLink(decl.label, decl.linkLabel, decl.linkUrl)
                      : decl.label || 'Untitled declaration'}
                    {decl.required && <span className="text-destructive"> *</span>}
                  </div>
                </div>
              ))
            )}

            {effectiveRequireCaptcha && (
              <div className="p-3 rounded border bg-muted/30 flex items-center gap-2">
                <Checkbox disabled />
                <span className="text-sm">I'm not a robot (CAPTCHA)</span>
              </div>
            )}

            {showOtpHere && otpPreviewBlock}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setCurrent(Math.max(0, current - 1))} disabled={current === 0}>
          Previous
        </Button>
        <span className="text-xs text-muted-foreground self-center">
          Step {current + 1} of {total}
        </span>
        <Button onClick={() => setCurrent(Math.min(total - 1, current + 1))} disabled={current === total - 1}>
          Next
        </Button>
      </div>
    </div>
  );
}

function renderWithLink(label: string, linkLabel: string, linkUrl: string) {
  const idx = label.indexOf(linkLabel);
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <a href={linkUrl} target="_blank" rel="noreferrer" className="text-primary underline">
        {linkLabel}
      </a>
      {label.slice(idx + linkLabel.length)}
    </>
  );
}
