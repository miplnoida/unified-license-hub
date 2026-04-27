import { useState, useMemo } from 'react';
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
}

interface DocType {
  label: string;
  required: boolean;
  allowedTypes: string[];
  maxSizeMB: number;
}

interface Props {
  schema: RegFormSchema;
  documentTypes: DocType[];
  declarations: Declaration[];
  requireOtp: boolean;
  requireCaptcha: boolean;
  requireDocuments: boolean;
}

/**
 * Full end-to-end preview that mirrors what the public applicant
 * experiences: dynamic form steps + (optional) documents step +
 * declarations / verification step.
 */
export function FullRegistrationPreview({
  schema,
  documentTypes,
  declarations,
  requireOtp,
  requireCaptcha,
  requireDocuments,
}: Props) {
  const stepLabels = useMemo(() => {
    const labels = schema.map(s => s.title || 'Step');
    if (requireDocuments) labels.push('Supporting Documents');
    labels.push('Declarations & Verification');
    return labels;
  }, [schema, requireDocuments]);

  const [current, setCurrent] = useState(0);
  const total = stepLabels.length;
  const isDocStep = requireDocuments && current === schema.length;
  const isDeclStep = current === stepLabels.length - 1;
  const isFormStep = !isDocStep && !isDeclStep;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Public Registration Preview</h3>
          <p className="text-xs text-muted-foreground">This is what the applicant will see.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {requireOtp && <Badge variant="outline" className="gap-1"><Mail className="h-3 w-3" /> OTP</Badge>}
          {requireCaptcha && <Badge variant="outline" className="gap-1"><Bot className="h-3 w-3" /> CAPTCHA</Badge>}
          {requireDocuments && <Badge variant="outline" className="gap-1"><Upload className="h-3 w-3" /> Documents</Badge>}
          <Badge variant="outline" className="gap-1"><Shield className="h-3 w-3" /> {declarations.length} declarations</Badge>
        </div>
      </div>

      <DynamicRegistrationStepper
        steps={stepLabels}
        currentStep={current}
        completedSteps={new Set(Array.from({ length: current }, (_, i) => i))}
      />

      {isFormStep && (
        <FormPreview schema={[schema[current]]} />
      )}

      {isDocStep && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" /> Supporting Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {documentTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No document types configured.</p>
            ) : (
              documentTypes.map((d, i) => (
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
            {declarations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No declarations configured.</p>
            ) : (
              declarations.map((decl, i) => (
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

            {requireCaptcha && (
              <div className="p-3 rounded border bg-muted/30 flex items-center gap-2">
                <Checkbox disabled />
                <span className="text-sm">I'm not a robot (CAPTCHA)</span>
              </div>
            )}

            {requireOtp && (
              <div className="p-3 rounded border bg-muted/30 space-y-2">
                <Label className="text-sm">Email OTP Verification</Label>
                <div className="flex gap-2">
                  <Input placeholder="Enter 6-digit code" disabled className="text-sm" />
                  <Button variant="outline" size="sm" disabled>Send Code</Button>
                </div>
              </div>
            )}
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
