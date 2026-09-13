/**
 * Master-data picker for policy component configuration fields.
 *
 * The option list is published by the server for the component type, domain and
 * regulator in scope (sectors, supervisory facts, measures, metrics, notification
 * events, recipient groups). Nothing is invented in the browser and a value that
 * the server does not publish cannot be chosen; the server refuses it as well.
 */
import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import type { PolicyComponentReferenceField } from '@/hooks/useSupervisoryPolicyComponents';

interface Props {
  field: PolicyComponentReferenceField;
  value: unknown;
  disabled?: boolean;
  ariaLabel: string;
  onChange: (next: string | string[] | null) => void;
}

export function ReferenceCodePicker({ field, value, disabled, ariaLabel, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const options = field.options ?? [];
  const byValue = useMemo(
    () => new Map(options.map((o) => [o.value.toUpperCase(), o.label])),
    [options],
  );

  const selected: string[] = field.multiple
    ? (Array.isArray(value) ? value.map((v) => String(v)) : [])
    : (typeof value === 'string' && value ? [value] : []);

  const labelFor = (code: string) => byValue.get(code.toUpperCase()) ?? code;

  const toggle = (code: string) => {
    if (field.multiple) {
      const next = selected.some((s) => s.toUpperCase() === code.toUpperCase())
        ? selected.filter((s) => s.toUpperCase() !== code.toUpperCase())
        : [...selected, code];
      onChange(next);
    } else {
      onChange(selected[0]?.toUpperCase() === code.toUpperCase() ? null : code);
      setOpen(false);
    }
  };

  const trigger = field.multiple
    ? (selected.length ? `${selected.length} selected` : 'Select')
    : (selected[0] ? labelFor(selected[0]) : 'Select');

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={(o) => (disabled ? null : setOpen(o))}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-label={ariaLabel}
            disabled={disabled}
            className="h-8 min-w-[13rem] justify-between font-normal"
          >
            <span className="truncate">{trigger}</span>
            <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[22rem] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search ${field.label.toLowerCase()}`} />
            <CommandList>
              <CommandEmpty>Nothing matches. Only codes held in master data can be used.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.value}`} onSelect={() => toggle(o.value)}>
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selected.some((s) => s.toUpperCase() === o.value.toUpperCase())
                          ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{o.label}</span>
                    <span className="ml-auto pl-2 font-mono text-[10px] text-muted-foreground">{o.value}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {field.multiple && selected.length ? (
        <div className="flex flex-wrap gap-1">
          {selected.map((s) => (
            <Badge key={s} variant="outline" className="gap-1 text-[10px]">
              {labelFor(s)}
              {!disabled ? (
                <button
                  type="button"
                  aria-label={`Remove ${labelFor(s)}`}
                  onClick={() => onChange(selected.filter((x) => x !== s))}
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </Badge>
          ))}
        </div>
      ) : null}

      {!field.multiple && selected[0] ? (
        <p className="font-mono text-[10px] text-muted-foreground">{selected[0]}</p>
      ) : null}
    </div>
  );
}

export default ReferenceCodePicker;
