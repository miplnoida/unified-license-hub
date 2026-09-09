/**
 * Shared authoring primitives for the Supervisory Methodology Studio.
 *
 * Two rules hold for everything built on this kit:
 *  - authority comes only from `supervisory_methodology_studio_capabilities`;
 *    a refusal is shown as the server's own sentence, never re-worded or guessed;
 *  - governed vocabulary comes only from `supervisory_methodology_vocabulary`;
 *    no supervisory classification list is hard-coded in the browser.
 */
import { memo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { humanize } from '../labels';
import type { MethodologyCapability } from '@/hooks/useSupervisoryMethodologyAdmin';

export const NONE = 'none';

/** Renders the authoring control when the server allows it, otherwise its refusal. */
export function AuthorityGate({
  capability, children, fallbackNote,
}: { capability?: MethodologyCapability | null; children: ReactNode; fallbackNote?: string }) {
  if (capability?.allowed) return <>{children}</>;
  const reason = capability?.reason ?? fallbackNote ?? 'This version is read only.';
  return <p className="text-sm text-muted-foreground">{reason}</p>;
}

export function AuthoringHeader({
  capability, label, onAdd, note,
}: { capability?: MethodologyCapability | null; label: string; onAdd: () => void; note?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {capability?.allowed
          ? note ?? 'This draft version may be authored. Every change is recorded in the version history.'
          : capability?.reason ?? 'This version is read only.'}
      </p>
      {capability?.allowed ? (
        <Button size="sm" onClick={onAdd} data-rbac="aml_supervision.manage_config">{label}</Button>
      ) : null}
    </div>
  );
}

function TextFieldBase({
  id, label, value, onChange, mono, disabled, placeholder, hint, type,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  mono?: boolean; disabled?: boolean; placeholder?: string; hint?: string; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} disabled={disabled} placeholder={placeholder}
             className={mono ? 'font-mono' : undefined}
             onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function AreaFieldBase({
  id, label, value, onChange, rows = 2, hint,
}: { id: string; label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string }) {
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function PickFieldBase({
  id, label, value, onChange, options, allowNone, noneLabel,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: string[] | Array<{ value: string; label: string }>;
  allowNone?: boolean; noneLabel?: string;
}) {
  const items = (options as Array<string | { value: string; label: string }>).map((o) =>
    typeof o === 'string' ? { value: o, label: humanize(o) } : o);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || (allowNone ? NONE : '')} onValueChange={onChange}>
        <SelectTrigger id={id} aria-label={label}><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          {allowNone ? <SelectItem value={NONE}>{noneLabel ?? 'Not set'}</SelectItem> : null}
          {items.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function CheckFieldBase({
  id, label, checked, onChange, hint,
}: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-start gap-2 pt-1">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="font-normal">{label}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

function MultiCheckFieldBase({
  label, options, selected, onToggle, hint,
}: {
  label: string; options: string[]; selected: string[];
  onToggle: (value: string, on: boolean) => void; hint?: string;
}) {
  return (
    <div className="space-y-1.5 sm:col-span-2">
      <Label>{label}</Label>
      <div className="grid gap-1.5 rounded-md border p-3 sm:grid-cols-2">
        {options.length === 0 ? <p className="text-xs text-muted-foreground">No governed option is available.</p> : null}
        {options.map((o) => (
          <div key={o} className="flex items-center gap-2">
            <Checkbox id={`${label}-${o}`} checked={selected.includes(o)}
                      onCheckedChange={(v) => onToggle(o, v === true)} />
            <Label htmlFor={`${label}-${o}`} className="text-xs font-normal">{humanize(o)}</Label>
          </div>
        ))}
      </div>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}


/**
 * The authoring dialogs hold one form object in state, so a single keystroke
 * re-renders every field. Each field's `onChange` is a fresh closure that only
 * calls the functional state setter, so it carries no state of its own and can
 * safely be excluded from the comparison: a field re-renders when its own value,
 * options or labels change, and not when a sibling field is edited.
 */
function sameProps(a: Record<string, any>, b: Record<string, any>) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (typeof x === 'function' && typeof y === 'function') continue;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
      continue;
    }
    if (x !== y) return false;
  }
  return true;
}

export const TextField = memo(TextFieldBase, sameProps);
export const AreaField = memo(AreaFieldBase, sameProps);
export const PickField = memo(PickFieldBase, sameProps);
export const CheckField = memo(CheckFieldBase, sameProps);
export const MultiCheckField = memo(MultiCheckFieldBase, sameProps);

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="sm:col-span-2 border-t pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </p>
  );
}

/** A trimmed value, or null — never an empty string, which the server would store. */
export const orNull = (v: string) => (v.trim() === '' ? null : v.trim());
export const pickValue = (v: string) => (v === NONE || v === '' ? null : v);
export const asList = (v: string) =>
  v.split(',').map((s) => s.trim()).filter(Boolean);
