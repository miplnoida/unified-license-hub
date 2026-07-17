import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AlertCircle, Check, ChevronsUpDown, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { classifyLicenseeSearchError } from '@/lib/licenseeSearchErrors';

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

interface Page {
  rows: LicenseeOption[];
  total: number;
  nextOffset: number | null;
}

/**
 * Paginated, searchable, regulator-scoped licensee lookup.
 *
 * Pagination is real: successive pages are fetched via useInfiniteQuery,
 * results are deduped by id, pagination resets on every query change,
 * and the total count comes from the backend (via search_licensees, which
 * enforces regulator scope server-side).
 *
 * Errors are classified into a small taxonomy (see licenseeSearchErrors)
 * so users see actionable copy instead of raw Postgres messages.
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
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);

  const query = useInfiniteQuery<Page, unknown>({
    queryKey: ['search_licensees', debounced, pageSize],
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    queryFn: async ({ pageParam }): Promise<Page> => {
      const offset = (pageParam as number) ?? 0;
      const { data, error } = await sb.rpc('search_licensees', {
        _q: debounced || null,
        _limit: pageSize,
        _offset: offset,
      });
      if (error) throw error;
      if (!Array.isArray(data)) {
        throw Object.assign(new Error('unexpected response'), { name: 'ShapeError' });
      }
      const rows = data.map((r: any) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        sector_id: r.sector_id ?? null,
        sector_name: r.sector_name ?? null,
      })) as LicenseeOption[];
      const total = Number(data[0]?.total_count ?? 0);
      const loaded = offset + rows.length;
      return { rows, total, nextOffset: loaded < total ? loaded : null };
    },
    enabled: open,
    staleTime: 15_000,
  });

  // Flatten + dedupe pages by id (defensive against overlapping offsets).
  const { rows, total } = useMemo(() => {
    const seen = new Set<string>();
    const out: LicenseeOption[] = [];
    let t = 0;
    for (const p of query.data?.pages ?? []) {
      t = p.total;
      for (const r of p.rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
      }
    }
    return { rows: out, total: t };
  }, [query.data]);

  const errorInfo = query.error ? classifyLicenseeSearchError(query.error) : null;

  // Selected label lookup — separate from paginated search so trigger label
  // renders even before the popover opens.
  const selected = useQuery({
    queryKey: ['licensee_by_id', value],
    queryFn: async (): Promise<LicenseeOption | null> => {
      if (!value) return null;
      const { data, error } = await supabase
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

  // Scroll listener → auto-load next page when near bottom.
  const onListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 40 &&
      query.hasNextPage &&
      !query.isFetchingNextPage
    ) {
      query.fetchNextPage();
    }
  };

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
          <CommandInput
            placeholder="Search by name…"
            value={term}
            onValueChange={setTerm}
            data-testid="licensee-search-input"
          />
          <CommandList ref={listRef} onScroll={onListScroll}>
            {query.isLoading && (
              <div
                className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"
                data-testid="licensee-loading"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading entities…
              </div>
            )}
            {errorInfo && (
              <div
                className="px-3 py-4 text-sm"
                data-testid={`licensee-error-${errorInfo.category}`}
              >
                <div className="flex items-start gap-2 text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">Unable to load entities</div>
                    <div className="text-xs opacity-80">{errorInfo.userMessage}</div>
                  </div>
                </div>
                {errorInfo.retryable && (
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
                )}
              </div>
            )}
            {!query.isLoading && !errorInfo && (
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
                {rows.length === 0 && (
                  <CommandEmpty data-testid="licensee-empty">No entities found.</CommandEmpty>
                )}
                <CommandGroup>
                  {rows.map((l) => (
                    <CommandItem
                      key={l.id}
                      value={l.id}
                      onSelect={() => {
                        onChange(l.id, l);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          value === l.id ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{l.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {l.sector_name ?? 'No sector'} · {l.status}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {query.isFetchingNextPage && (
                  <div
                    className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
                    data-testid="licensee-loading-more"
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading more…
                  </div>
                )}
                {rows.length > 0 && (
                  <div className="border-t px-3 py-2 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span data-testid="licensee-count">
                      Showing {rows.length} of {total}
                    </span>
                    {query.hasNextPage ? (
                      <button
                        type="button"
                        className="text-primary hover:underline disabled:opacity-50"
                        disabled={query.isFetchingNextPage}
                        onClick={() => query.fetchNextPage()}
                        data-testid="licensee-load-more"
                      >
                        Load more
                      </button>
                    ) : (
                      <span data-testid="licensee-end">End of results</span>
                    )}
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
