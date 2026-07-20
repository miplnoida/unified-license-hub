import { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface EmployeeOption {
  id: string;
  label: string;
  sublabel?: string | null;
  inactive?: boolean;
}

interface EmployeeComboboxProps {
  value: string | null | undefined;
  options: EmployeeOption[];
  disabledIds?: Set<string>;
  placeholder?: string;
  onChange: (id: string | null) => void;
  /** aria-label / data-testid friendly identifier */
  testId?: string;
}

export function EmployeeCombobox({
  value,
  options,
  disabledIds,
  placeholder = 'Not assigned',
  onChange,
  testId,
}: EmployeeComboboxProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === value) || null;

  return (
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
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <div className="flex items-center gap-1">
            {selected && (
              <span
                role="button"
                aria-label="Clear selection"
                onClick={(e) => { e.stopPropagation(); onChange(null); }}
                className="rounded p-0.5 hover:bg-accent"
              >
                <X className="h-3.5 w-3.5 opacity-60" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, search) => {
            // val is the CommandItem `value` (we set it to `${label} ${sublabel} ${id}`).
            return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search employees..." />
          <CommandList>
            <CommandEmpty>No employees found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none__ not assigned"
                onSelect={() => { onChange(null); setOpen(false); }}
              >
                <Check className={cn('mr-2 h-4 w-4', !value ? 'opacity-100' : 'opacity-0')} />
                <span className="text-muted-foreground">Not assigned</span>
              </CommandItem>
              {options.map(opt => {
                const isDisabled = disabledIds?.has(opt.id) && opt.id !== value;
                return (
                  <CommandItem
                    key={opt.id}
                    value={`${opt.label} ${opt.sublabel || ''} ${opt.id}`}
                    disabled={isDisabled}
                    onSelect={() => {
                      if (isDisabled) return;
                      onChange(opt.id);
                      setOpen(false);
                    }}
                    className={cn(isDisabled && 'opacity-50 cursor-not-allowed')}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === opt.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      {opt.sublabel && (
                        <span className="text-xs text-muted-foreground">{opt.sublabel}</span>
                      )}
                    </div>
                    {opt.inactive && (
                      <span className="ml-auto text-[10px] uppercase text-muted-foreground">Inactive</span>
                    )}
                    {isDisabled && !opt.inactive && (
                      <span className="ml-auto text-[10px] uppercase text-muted-foreground">Assigned</span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
