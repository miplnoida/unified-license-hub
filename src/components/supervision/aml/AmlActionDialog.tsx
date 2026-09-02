/**
 * Small governed-action dialog used by the AML/CFT screens.
 *
 * Each dialog collects the fields a governed supervisory operation requires
 * (always including the supervisory rationale) and reports the database's own
 * refusal message when authorisation, evidence or rationale discipline fails.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import { amlErrorMessage } from '@/hooks/useAmlLifecycle';

export type AmlFieldKind = 'text' | 'textarea' | 'date' | 'select' | 'number';

export interface AmlField {
  name: string;
  label: string;
  kind: AmlFieldKind;
  required?: boolean;
  placeholder?: string;
  helper?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string;
}

export interface AmlActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: AmlField[];
  submitLabel: string;
  pending?: boolean;
  onSubmit: (values: Record<string, string>) => Promise<unknown>;
  onDone?: () => void;
}

export function AmlActionDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  submitLabel,
  pending,
  onSubmit,
  onDone,
}: AmlActionDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string> = {};
    fields.forEach((f) => {
      seed[f.name] = f.defaultValue ?? '';
    });
    setValues(seed);
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (name: string, value: string) => setValues((v) => ({ ...v, [name]: value }));

  const submit = async () => {
    const missing = fields.find((f) => f.required && !String(values[f.name] ?? '').trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      setError(amlErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.name} className="space-y-1.5">
              <Label htmlFor={`aml-field-${f.name}`}>
                {f.label}
                {f.required ? <span className="ml-0.5 text-destructive">*</span> : null}
              </Label>
              {f.kind === 'textarea' ? (
                <Textarea
                  id={`aml-field-${f.name}`}
                  rows={3}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ''}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              ) : f.kind === 'select' ? (
                <Select value={values[f.name] ?? ''} onValueChange={(v) => set(f.name, v)}>
                  <SelectTrigger id={`aml-field-${f.name}`}>
                    <SelectValue placeholder={f.placeholder ?? 'Select…'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`aml-field-${f.name}`}
                  type={f.kind === 'date' ? 'date' : f.kind === 'number' ? 'number' : 'text'}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ''}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
              {f.helper ? <p className="text-xs text-muted-foreground">{f.helper}</p> : null}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy || pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || pending}>
            {busy || pending ? 'Working…' : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const RATING_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'medium_high', label: 'Medium-high' },
  { value: 'high', label: 'High' },
];

export const CONTROL_OPTIONS = [
  { value: 'strong', label: 'Strong' },
  { value: 'satisfactory', label: 'Satisfactory' },
  { value: 'needs_improvement', label: 'Needs improvement' },
  { value: 'weak', label: 'Weak' },
];

export const TREND_OPTIONS = [
  { value: 'IMPROVING', label: 'Improving' },
  { value: 'STABLE', label: 'Stable' },
  { value: 'DETERIORATING', label: 'Deteriorating' },
];

export const GRADE_OPTIONS = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];
