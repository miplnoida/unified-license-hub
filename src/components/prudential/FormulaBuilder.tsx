import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, ChevronsUpDown, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConfigForm } from '@/hooks/useConfigFormFields';

// ---------------------------------------------------------------- model

export type Op = '+' | '-' | '*' | '/';

export type Term =
  | { kind: 'field'; formId: string; field: string }
  | { kind: 'number'; value: string }
  | { kind: 'ratio'; key: string }
  | { kind: 'group'; expr: Expr };

export interface Expr {
  terms: Term[];
  /** ops[i] joins terms[i] and terms[i + 1] */
  ops: Op[];
}

export const emptyExpr = (): Expr => ({ terms: [{ kind: 'field', formId: '', field: '' }], ops: [] });

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

export function serializeExpr(expr: Expr): string {
  return expr.terms
    .map((t, i) => {
      const head = serializeTerm(t);
      const op = i < expr.ops.length ? ` ${expr.ops[i]} ` : '';
      return head + op;
    })
    .join('')
    .trim();
}

function serializeTerm(t: Term): string {
  switch (t.kind) {
    case 'field':
      return t.formId && t.field ? `${t.formId}.${t.field}` : '';
    case 'number':
      return t.value.trim();
    case 'ratio':
      return t.key ? `$${t.key}` : '';
    case 'group': {
      const inner = serializeExpr(t.expr);
      return inner ? `(${inner})` : '';
    }
  }
}

export function isExprComplete(expr: Expr): boolean {
  if (expr.terms.length === 0) return false;
  return expr.terms.every((t) => {
    if (t.kind === 'field') return !!t.formId && !!t.field;
    if (t.kind === 'number') return /^-?\d+(\.\d+)?$/.test(t.value.trim());
    if (t.kind === 'ratio') return !!t.key;
    return isExprComplete(t.expr);
  });
}

/** Round-trips a stored formula into the builder model. Returns null when it cannot be represented. */
export function parseFormula(input?: string | null): Expr | null {
  if (!input || !input.trim()) return null;
  const tokenRe = new RegExp(`\\s+|(${UUID}\\.[A-Za-z0-9_-]+)|(\\$[A-Za-z0-9_-]+)|(-?\\d+(?:\\.\\d+)?)|([()+\\-*/])`, 'g');
  const tokens: string[] = [];
  let last = 0;
  for (const m of input.matchAll(tokenRe)) {
    const idx = m.index ?? 0;
    if (idx > last) return null; // unrecognised characters
    last = idx + m[0].length;
    const tok = m[0].trim();
    if (tok) tokens.push(tok);
  }
  if (last < input.length) return null;
  if (tokens.length === 0) return null;

  let pos = 0;
  const fieldRe = new RegExp(`^${UUID}\\.[A-Za-z0-9_-]+$`);

  const parseExpr = (): Expr | null => {
    const terms: Term[] = [];
    const ops: Op[] = [];
    for (;;) {
      const term = parseTerm();
      if (!term) return null;
      terms.push(term);
      const next = tokens[pos];
      if (next && '+-*/'.includes(next) && next.length === 1) {
        ops.push(next as Op);
        pos += 1;
        continue;
      }
      break;
    }
    return { terms, ops };
  };

  const parseTerm = (): Term | null => {
    const tok = tokens[pos];
    if (!tok) return null;
    if (tok === '(') {
      pos += 1;
      const inner = parseExpr();
      if (!inner) return null;
      if (tokens[pos] !== ')') return null;
      pos += 1;
      return { kind: 'group', expr: inner };
    }
    if (fieldRe.test(tok)) {
      pos += 1;
      const [formId, ...rest] = tok.split('.');
      return { kind: 'field', formId, field: rest.join('.') };
    }
    if (/^\$[A-Za-z0-9_-]+$/.test(tok)) {
      pos += 1;
      return { kind: 'ratio', key: tok.slice(1) };
    }
    if (/^-?\d+(\.\d+)?$/.test(tok)) {
      pos += 1;
      return { kind: 'number', value: tok };
    }
    return null;
  };

  const expr = parseExpr();
  if (!expr || pos !== tokens.length) return null;
  return expr;
}

// ---------------------------------------------------------------- pickers

function Combobox({
  value,
  onChange,
  options,
  placeholder,
  emptyText,
  disabled,
}: {
  value?: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
  placeholder: string;
  emptyText: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn('truncate', !current && 'text-muted-foreground')}>{current?.label ?? placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ''}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === o.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && <span className="block text-[11px] text-muted-foreground">{o.hint}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const OP_LABEL: Record<Op, string> = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'divided by' };

interface BuilderContext {
  forms: ConfigForm[];
  ratios: { key: string; label: string }[];
  configChosen: boolean;
}

function TermRow({
  term,
  onChange,
  onRemove,
  canRemove,
  ctx,
}: {
  term: Term;
  onChange: (t: Term) => void;
  onRemove: () => void;
  canRemove: boolean;
  ctx: BuilderContext;
}) {
  const formOptions = ctx.forms.map((f) => ({ value: f.id, label: f.name }));
  let fields = term.kind === 'field' ? (ctx.forms.find((f) => f.id === term.formId)?.fields ?? []) : [];
  // Never silently drop an existing pick that is no longer in the latest published version.
  if (term.kind === 'field' && term.field && !fields.some((f) => f.name === term.field)) {
    fields = [...fields, { name: term.field, label: term.field }];
  }
  if (term.kind === 'field' && term.formId && !formOptions.some((o) => o.value === term.formId)) {
    formOptions.push({ value: term.formId, label: 'Form no longer attached' });
  }


  return (
    <div className="rounded-md border bg-background p-2 space-y-2">
      <div className="flex items-center gap-2">
        <Select
          value={term.kind}
          onValueChange={(k) => {
            if (k === term.kind) return;
            if (k === 'field') onChange({ kind: 'field', formId: '', field: '' });
            else if (k === 'number') onChange({ kind: 'number', value: '' });
            else if (k === 'ratio') onChange({ kind: 'ratio', key: '' });
            else onChange({ kind: 'group', expr: emptyExpr() });
          }}
        >
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="field">Form line item</SelectItem>
            <SelectItem value="number">Fixed number</SelectItem>
            <SelectItem value="ratio">Another ratio</SelectItem>
            <SelectItem value="group">Bracketed group</SelectItem>
          </SelectContent>
        </Select>
        {term.kind === 'field' && (
          <>
            <div className="flex-1 min-w-0">
              <Combobox
                value={term.formId || undefined}
                onChange={(v) => onChange({ kind: 'field', formId: v, field: '' })}
                options={formOptions}
                placeholder={ctx.configChosen ? 'Select form…' : 'Choose a configuration first'}
                emptyText="No forms attached to this configuration."
                disabled={!ctx.configChosen}
              />
            </div>
            <div className="flex-1 min-w-0">
              <Combobox
                value={term.field || undefined}
                onChange={(v) => onChange({ ...term, field: v })}
                options={fields.map((f) => ({ value: f.name, label: f.label, hint: f.name }))}
                placeholder={term.formId ? 'Select line item…' : 'Select form first'}
                emptyText="No line items published for this form."
                disabled={!term.formId}
              />
            </div>
          </>
        )}
        {term.kind === 'number' && (
          <Input
            className="flex-1"
            inputMode="decimal"
            placeholder="e.g. 100"
            value={term.value}
            onChange={(e) => onChange({ kind: 'number', value: e.target.value })}
          />
        )}
        {term.kind === 'ratio' && (
          <div className="flex-1 min-w-0">
            <Combobox
              value={term.key || undefined}
              onChange={(v) => onChange({ kind: 'ratio', key: v })}
              options={ctx.ratios.map((r) => ({ value: r.key, label: r.label }))}
              placeholder="Select ratio…"
              emptyText="No other ratios available."
            />
          </div>
        )}
        {term.kind === 'group' && <span className="flex-1 text-xs text-muted-foreground">Everything inside is calculated first.</span>}
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onRemove} title="Remove">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {term.kind === 'group' && (
        <div className="pl-3 border-l-2">
          <ExprEditor expr={term.expr} onChange={(e) => onChange({ kind: 'group', expr: e })} ctx={ctx} depth={1} />
        </div>
      )}
    </div>
  );
}

function ExprEditor({
  expr,
  onChange,
  ctx,
  depth = 0,
}: {
  expr: Expr;
  onChange: (e: Expr) => void;
  ctx: BuilderContext;
  depth?: number;
}) {
  const setTerm = (i: number, t: Term) => {
    const terms = expr.terms.slice();
    terms[i] = t;
    onChange({ ...expr, terms });
  };
  const removeTerm = (i: number) => {
    const terms = expr.terms.slice();
    const ops = expr.ops.slice();
    terms.splice(i, 1);
    ops.splice(Math.max(0, i - 1), 1);
    onChange({ terms, ops });
  };
  const addTerm = () => {
    onChange({
      terms: [...expr.terms, { kind: 'field', formId: '', field: '' }],
      ops: [...expr.ops, '/'],
    });
  };
  const setOp = (i: number, op: Op) => {
    const ops = expr.ops.slice();
    ops[i] = op;
    onChange({ ...expr, ops });
  };

  return (
    <div className="space-y-2">
      {expr.terms.map((t, i) => (
        <div key={i} className="space-y-2">
          <TermRow
            term={t}
            onChange={(nt) => setTerm(i, nt)}
            onRemove={() => removeTerm(i)}
            canRemove={expr.terms.length > 1}
            ctx={ctx}
          />
          {i < expr.ops.length && (
            <div className="flex items-center gap-2 pl-1">
              <Select value={expr.ops[i]} onValueChange={(v: any) => setOp(i, v)}>
                <SelectTrigger className="w-[170px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['+', '-', '*', '/'] as Op[]).map((op) => (
                    <SelectItem key={op} value={op}>{`${op}  ${OP_LABEL[op]}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addTerm}>
        <Plus className="h-4 w-4 mr-2" />Add {depth > 0 ? 'value in group' : 'value'}
      </Button>
    </div>
  );
}

export function FormulaBuilder({
  expr,
  onChange,
  forms,
  ratios,
  configChosen,
}: {
  expr: Expr;
  onChange: (e: Expr) => void;
  forms: ConfigForm[];
  ratios: { key: string; label: string }[];
  configChosen: boolean;
}) {
  const ctx = useMemo<BuilderContext>(() => ({ forms, ratios, configChosen }), [forms, ratios, configChosen]);
  return <ExprEditor expr={expr} onChange={onChange} ctx={ctx} />;
}
