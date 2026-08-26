/** Shared label/input/error scaffolding for the public complaint wizard. */
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ id, label, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={className} data-field={id}>
      <Label htmlFor={id} className="text-sm">
        {label}
        {required ? <span aria-hidden="true" className="text-destructive"> *</span> : null}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-destructive" data-field={id}>
      {error}
    </p>
  );
}

export function StepIntro({ title, description }: { title: string; description?: string }) {
  return (
    <header className="space-y-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}
