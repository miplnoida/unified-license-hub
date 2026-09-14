/**
 * Guided editor for one policy area's entries.
 *
 * Every field on show comes from the server's published content contract for
 * this component type; this component only presents those fields in regulator
 * language, with the right control for each kind of answer. Validity is still
 * decided only by the server on the saved draft.
 */
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { humanize } from '@/components/admin/supervisory-policy-profile/labels';
import { ReferenceCodePicker } from '@/components/admin/supervisory-policy-profile/ReferenceCodePicker';
import { fieldCopy } from '@/components/admin/supervisory-policy-profile/policyComponentVocabulary';
import type { PolicyComponentReferenceField } from '@/hooks/useSupervisoryPolicyComponents';

export type EntryFieldKind = 'enum' | 'array' | 'enum_array' | 'number' | 'boolean' | 'text';

export interface EntryFieldSpec {
  name: string;
  kind: EntryFieldKind;
  required: boolean;
  options: string[];
}

interface Props {
  componentType: string;
  itemLabel: string;
  specs: EntryFieldSpec[];
  items: Record<string, unknown>[];
  refFields: Record<string, PolicyComponentReferenceField>;
  editable: boolean;
  onChange: (next: Record<string, unknown>[]) => void;
}

const asArray = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);

export function PolicyComponentEntryEditor({
  componentType, itemLabel, specs, items, refFields, editable, onChange,
}: Props) {
  const set = (index: number, field: string, value: unknown) =>
    onChange(items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));

  const remove = (index: number) => onChange(items.filter((_, i) => i !== index));

  const toggleInArray = (index: number, field: string, code: string, on: boolean) => {
    const current = asArray(items[index]?.[field]);
    set(index, field, on ? [...current, code] : current.filter((c) => c !== code));
  };

  const summary = (item: Record<string, unknown>) => {
    const filled = (s: EntryFieldSpec) => typeof item[s.name] === 'string' && String(item[s.name]).trim();
    const chosen = specs.find((s) => s.kind === 'enum' && filled(s))
      ?? specs.find((s) => refFields[s.name] && filled(s))
      ?? specs.find(filled);
    if (!chosen) return 'Not yet completed';
    const raw = String(item[chosen.name]);
    return chosen.kind === 'enum' ? humanize(raw) : raw;
  };

  if (!items.length) {
    return (
      <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No {itemLabel}s recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="policy-component-entry-editor">
      {items.map((item, index) => (
        <div key={index} className="rounded-md border p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-medium">
              {humanize(itemLabel)} {index + 1}
              <span className="ml-2 font-normal text-muted-foreground">{summary(item)}</span>
            </p>
            {editable ? (
              <Button size="sm" variant="ghost" aria-label={`Remove entry ${index + 1}`}
                onClick={() => remove(index)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {specs.map((s) => {
              const copy = fieldCopy(componentType, s.name);
              const label = refFields[s.name]?.label ?? copy?.label ?? humanize(s.name);
              const help = copy?.help;
              const id = `pc-${index}-${s.name}`;
              const value = item[s.name];

              const control = refFields[s.name] ? (
                <ReferenceCodePicker
                  field={refFields[s.name]}
                  value={value}
                  disabled={!editable}
                  ariaLabel={`${label} ${index + 1}`}
                  onChange={(next) => set(index, s.name, next)}
                />
              ) : s.kind === 'enum' ? (
                <Select
                  value={typeof value === 'string' ? String(value).toUpperCase() : ''}
                  onValueChange={(v) => set(index, s.name, v)}
                  disabled={!editable}
                >
                  <SelectTrigger id={id} aria-label={`${label} ${index + 1}`}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {s.options.map((o) => <SelectItem key={o} value={o}>{humanize(o)}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : s.kind === 'enum_array' ? (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {s.options.map((o) => {
                    const oid = `${id}-${o}`;
                    return (
                      <label key={o} htmlFor={oid} className="flex items-start gap-2 text-sm">
                        <Checkbox id={oid} disabled={!editable}
                          checked={asArray(value).includes(o)}
                          onCheckedChange={(v) => toggleInArray(index, s.name, o, v === true)} />
                        <span>{humanize(o)}</span>
                      </label>
                    );
                  })}
                </div>
              ) : s.kind === 'boolean' ? (
                <div className="flex items-center gap-2">
                  <Switch id={id} disabled={!editable} checked={value === true}
                    aria-label={`${label} ${index + 1}`}
                    onCheckedChange={(v) => set(index, s.name, v)} />
                  <span className="text-sm text-muted-foreground">{value === true ? 'Yes' : 'No'}</span>
                </div>
              ) : s.kind === 'array' ? (
                <Input id={id} disabled={!editable} placeholder="Separate entries with commas"
                  aria-label={`${label} ${index + 1}`}
                  value={asArray(value).join(', ')}
                  onChange={(e) => set(index, s.name,
                    e.target.value.split(',').map((p) => p.trim()).filter(Boolean))} />
              ) : (
                <Input id={id} disabled={!editable}
                  type={s.kind === 'number' ? 'number' : 'text'}
                  aria-label={`${label} ${index + 1}`}
                  value={value === null || value === undefined ? '' : String(value)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    set(index, s.name, s.kind === 'number'
                      ? (raw.trim() === '' ? null : Number(raw))
                      : (raw === '' ? null : raw));
                  }} />
              );

              return (
                <div key={s.name} className="space-y-1.5">
                  <Label htmlFor={id}>{label}{s.required ? ' *' : ''}</Label>
                  {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
                  {control}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
