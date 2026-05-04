import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { DynamicRegistrationStepper } from '@/components/registration/DynamicRegistrationStepper';
import type { RegFormSchema, RegField } from '@/types/registrationForm';

interface Props {
  schema: RegFormSchema;
  showNavigation?: boolean;
  showStepper?: boolean;
}

export function FormPreview({ schema, showNavigation = true, showStepper = true }: Props) {
  const [currentStep, setCurrentStep] = useState(0);

  if (schema.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground text-sm">
          No steps to preview. Add steps and fields to see the preview.
        </CardContent>
      </Card>
    );
  }

  const step = schema[currentStep];
  const stepNames = schema.map(s => s.title);

  return (
    <div className="space-y-6">
      {showStepper && (
        <DynamicRegistrationStepper
          steps={stepNames}
          currentStep={currentStep}
          completedSteps={new Set(Array.from({ length: currentStep }, (_, i) => i))}
        />
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          {step.description && (
            <p className="text-sm text-muted-foreground">{step.description}</p>
          )}

          {step.rows.map(row => (
            <div
              key={row.id}
              className="grid gap-4"
              style={{ gridTemplateColumns: row.columns.map(c => `${c.span}fr`).join(' ') }}
            >
              {row.columns.map((col, colIdx) => (
                <div key={colIdx}>
                  {col.field ? (
                    <FieldPreview field={col.field} />
                  ) : (
                    <div className="h-10 rounded border-2 border-dashed border-muted-foreground/10 flex items-center justify-center text-xs text-muted-foreground">
                      Empty
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}

          {step.rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No fields in this step.</p>
          )}
        </CardContent>
      </Card>

      {showNavigation && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0}>
            Previous
          </Button>
          <Button onClick={() => setCurrentStep(Math.min(schema.length - 1, currentStep + 1))} disabled={currentStep === schema.length - 1}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function FieldPreview({ field }: { field: RegField }) {
  switch (field.type) {
    case 'textarea':
      return (
        <div className="space-y-1">
          <Label className="text-sm">{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
          <Textarea placeholder={field.placeholder} rows={3} disabled className="text-sm" />
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case 'select':
    case 'multi_select':
      return (
        <div className="space-y-1">
          <Label className="text-sm">
            {field.label}{field.required && <span className="text-destructive"> *</span>}
            {field.dataSource && (
              <Badge variant="outline" className="ml-2 text-[10px] py-0">
                {field.dataSource.replace('_', '-')}
              </Badge>
            )}
          </Label>
          <Select disabled>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder={field.dataSource ? `Dynamic: ${field.dataSource.replace('_', '-')}` : (field.placeholder || 'Select...')} />
            </SelectTrigger>
            <SelectContent>
              {(field.options || []).map((o, i) => <SelectItem key={i} value={o}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
          {field.dependsOn && <p className="text-[10px] text-muted-foreground">Depends on: {field.dependsOn}</p>}
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case 'checkbox':
      return (
        <div className="space-y-2">
          <Label className="text-sm">{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
          {(field.options || ['Option']).map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox disabled />
              <span className="text-sm">{o}</span>
            </div>
          ))}
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          <Label className="text-sm">{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
          {(field.options || ['Option']).map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" disabled className="h-4 w-4" />
              <span className="text-sm">{o}</span>
            </div>
          ))}
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case 'file':
      return (
        <div className="space-y-1">
          <Label className="text-sm">{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
          <Input type="file" disabled className="text-sm" />
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case 'paragraph':
      return (
        <div className="p-3 rounded bg-muted/30 text-sm text-muted-foreground">
          {field.defaultValue || 'Static text block'}
        </div>
      );

    default:
      return (
        <div className="space-y-1">
          <Label className="text-sm">{field.label}{field.required && <span className="text-destructive"> *</span>}</Label>
          <Input
            type={field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'phone' ? 'tel' : field.type === 'password' ? 'password' : 'text'}
            placeholder={field.placeholder}
            disabled
            className="text-sm"
          />
          {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
        </div>
      );
  }
}
