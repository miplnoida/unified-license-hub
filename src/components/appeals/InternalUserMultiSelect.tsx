import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface InternalUserOption {
  id: string;
  name: string;
  email: string | null;
}

interface Props {
  options: InternalUserOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  testId?: string;
}

/**
 * Multi-select over the internal staff directory, showing `Name — email`.
 * Used to constitute an appeal panel straight from the panel form.
 */
export function InternalUserMultiSelect({
  options, value, onChange, placeholder = 'Select internal users…', testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.id));
  const missing = value.filter((id) => !options.some((o) => o.id === id));

  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const labelFor = (o: InternalUserOption) =>
    o.email ? `${o.name} — ${o.email}` : o.name;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            data-testid={testId}
            className="w-full justify-between font-normal"
          >
            <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
              {selected.length === 0
                ? placeholder
                : `${selected.length + missing.length} selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        {/* Rendered in place (no portal) so it stays clickable inside a dialog. */}
        <PopoverContent disablePortal className="z-[60] w-[--radix-popover-trigger-width] p-0" align="start">

          <Command
            filter={(val, search) => (val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
          >
            <CommandInput placeholder="Search by name or email…" />
            <CommandList>
              <CommandEmpty>No internal users found.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.name} ${o.email || ''} ${o.id}`}
                    onSelect={() => toggle(o.id)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value.includes(o.id) ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="truncate">{labelFor(o)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {(selected.length > 0 || missing.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((o) => (
            <Badge key={o.id} variant="secondary" className="gap-1 font-normal">
              <span>{labelFor(o)}</span>
              <button
                type="button"
                aria-label={`Remove ${o.name}`}
                onClick={() => toggle(o.id)}
                className="rounded hover:bg-background/60"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {missing.map((id) => (
            <Badge key={id} variant="outline" className="gap-1 font-normal">
              <span>Inactive staff member</span>
              <button
                type="button"
                aria-label="Remove member"
                onClick={() => toggle(id)}
                className="rounded hover:bg-background/60"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
