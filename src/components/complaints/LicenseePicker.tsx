import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check, ChevronsUpDown, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const sb = supabase as any;

export interface LicenseeOption {
  id: string;
  name: string;
  status: string;
  sector_id: string | null;
  sector_name: string | null;
}

interface LicenseePickerProps {
  value: string | null;
  onChange: (id: string | null, licensee?: LicenseeOption) => void;
  placeholder?: string;
  disabled?: boolean;
  ariaInvalid?: boolean;
  pageSize?: number;
}

/**
 * Paginated, searchable licensee lookup backed by the `search_licensees` RPC.
 * Surfaces explicit loading and error states so intake surfaces never
 * silently render an empty dropdown when the lookup fails — a class of bug
 * we hit before Phase 2 shipped a dedicated RPC.
 */
export function LicenseePicker({
  value,
  onChange,
  placeholder = 'Select regulated entity',
  disabled,
  ariaInvalid,
  pageSize = 25,
}: LicenseePickerProps) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const query = useQuery({
    queryKey: ['search_licensees', debounced, pageSize],
    queryFn: async (): Promise<{ rows: LicenseeOption[]; total: number }> => {
      const { data, error } = await sb.rpc('search_licensees', {
        _q: debounced || null,
        _limit: pageSize,
        _offset: 0,
      });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      return {
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          status: r.status,
          sector_id: r.sector_id ?? null,
          sector_name: r.sector_name ?? null,
        })),
        total: rows[0]?.total_count ?? 0,
      };
    },
    enabled: open,
    staleTime: 15_000,
  });

  // Fetch the selected label separately so the trigger renders correctly even
  // before the popover opens (search RPC not yet run).
  const selected = useQuery({
    queryKey: ['licensee_by_id', value],
    queryFn: async (): Promise<LicenseeOption | null> => {
      if (!value) return null;
      const { data, error } = await sb
        .from('licensees')
        .select('id, name, status, sector_id, sectors(name)')
        .eq('id', value)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        name: data.name,
        status: data.status,
        sector_id: data.sector_id ?? null,
        sector_name: (data as any).sectors?.name ?? null,
      };
    },
    enabled: !!value,
    staleTime: 60_000,
  });

  const triggerLabel = useMemo(() => {
    if (!value) return placeholder;
    if (selected.isLoading) return 'Loading…';
    if (selected.error) return 'Error loading entity';
    return selected.data?.name ?? placeholder;
  }, [value, selected.isLoading, selected.error, selected.data, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name…" value={term} onValueChange={setTerm} />
          <CommandList>
            {query.isLoading && (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading entities…
              </div>
            )}
            {query.isError && (
              <div className="px-3 py-4 text-sm">
                <div className="flex items-start gap-2 text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Failed to load entities</div>
                    <div className="text-xs opacity-80">
                      {(query.error as Error)?.message ?? 'Unknown error'}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => query.refetch()}
                >
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}
            {!query.isLoading && !query.isError && (
              <>
                {value && (
                  <CommandGroup>
                    <CommandItem
                      value="__clear__"
                      onSelect={() => {
                        onChange(null);
                        setOpen(false);
                      }}
                      className="text-muted-foreground"
                    >
                      Clear selection
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandEmpty>No entities found.</CommandEmpty>
                <CommandGroup>
                  {(query.data?.rows ?? []).map((l) => (
                    <CommandItem
                      key={l.id}
                      value={l.id}
                      onSelect={() => {
                        onChange(l.id, l);
                        setOpen(false);
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === l.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{l.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {l.sector_name ?? 'No sector'} · {l.status}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {query.data && query.data.total > (query.data.rows.length ?? 0) && (
                  <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                    Showing {query.data.rows.length} of {query.data.total}. Refine your search to narrow results.
                  </div>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
