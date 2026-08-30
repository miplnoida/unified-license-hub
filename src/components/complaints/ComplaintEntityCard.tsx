/**
 * One truthful "Entity" section for the complaint workspace.
 *
 * Entity context comes from `resolve_complaint_entity_context`, which reports
 * whether the complaint belongs to a licensed entity, an applicant
 * (pre-license) entity, or nothing at all. Manual licensee mapping is a
 * fallback only — it is never the default state when the system already knows
 * the entity.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Building2, Check, ChevronsUpDown, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';

interface Props {
  complaintId: string;
  regulatorId?: string | null;
  /** Enforcement link — when present, mapping is locked. */
  enforcementActionId?: string | null;
}

interface EntityContext {
  kind: 'licensed' | 'applicant' | 'none';
  source?: string | null;
  licensee_id?: string | null;
  entity_name?: string | null;
  license_number?: string | null;
  application_number?: string | null;
  application_status?: string | null;
}

function humaniseAppStatus(status?: string | null): string {
  if (!status) return 'Licensing application in progress';
  const s = status.toLowerCase();
  if (s === 'approved') return 'Application approved';
  if (s === 'rejected') return 'Application rejected';
  if (s === 'draft') return 'Application not yet submitted';
  return `Licensing application: ${status.replace(/_/g, ' ')}`;
}

export function ComplaintEntityCard({ complaintId, regulatorId, enforcementActionId }: Props) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [staged, setStaged] = useState<{ id: string; name: string; license_number?: string | null } | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const contextQ = useQuery({
    queryKey: ['complaint_entity_context', complaintId],
    enabled: !!complaintId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('resolve_complaint_entity_context', {
        _complaint_id: complaintId,
      });
      if (error) throw error;
      return (data || { kind: 'none' }) as EntityContext;
    },
  });

  const searchQ = useQuery({
    queryKey: ['licensee_search_for_complaint', search, regulatorId],
    enabled: pickerOpen,
    queryFn: async () => {
      const term = search.trim();
      const pageSize = 50;

      // Scope by the canonical regulator BODY (regulators.id, reached through
      // the entity's sector). `lead_regulator_id` and friends are officer/user
      // assignments, never institutional identity, so they must never be
      // compared with a regulator context id.
      const bodyScoped = (q: any) =>
        regulatorId ? q.eq('sectors.regulator_id', regulatorId) : q;

      const nameQ = bodyScoped(
        (supabase as any)
          .from('licensees')
          .select('id, name, license_id, sector_id, sectors:sector_id!inner(regulator_id), licenses:license_id(license_number)')
          .order('name')
          .limit(pageSize),
      );
      if (term) nameQ.ilike('name', `%${term}%`);

      const numberQ = term
        ? bodyScoped(
            (supabase as any)
              .from('licensees')
              .select('id, name, license_id, sector_id, sectors:sector_id!inner(regulator_id), licenses:license_id!inner(license_number)')
              .ilike('licenses.license_number', `%${term}%`)
              .limit(pageSize),
          )
        : null;

      const [nameRes, numberRes] = await Promise.all([
        nameQ,
        numberQ ?? Promise.resolve({ data: [], error: null } as any),
      ]);
      if (nameRes.error) throw nameRes.error;
      if (numberRes.error) throw numberRes.error;
      const seen = new Set<string>();
      return [...(nameRes.data ?? []), ...((numberRes.data as any[]) ?? [])]
        .filter((l: any) => (seen.has(l.id) ? false : (seen.add(l.id), true)))
        .map((l: any) => ({ id: l.id, name: l.name, license_number: l.licenses?.license_number ?? null }));
    },
  });

  const linkLicensee = useMutation({
    mutationFn: async () => {
      if (!staged) throw new Error('Select a licensed entity first');
      const { error } = await (supabase as any).rpc('link_complaint_licensee', {
        _complaint_id: complaintId,
        _licensee_id: staged.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Entity linked');
      setStaged(null);
      setManualOpen(false);
      qc.invalidateQueries({ queryKey: ['complaint', complaintId] });
      qc.invalidateQueries({ queryKey: ['complaint_entity_context', complaintId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to link entity'),
  });

  const ctx = contextQ.data;
  const locked = !!enforcementActionId;

  const picker = (
    <div className="space-y-2">
      <Label className="text-xs">Search a licensed entity by name or license number</Label>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" role="combobox" aria-expanded={pickerOpen} className="w-full justify-between font-normal">
            <span className="truncate">{staged ? staged.name : 'Search licensed entities…'}</span>
            <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="Search licensed entities…" value={search} onValueChange={setSearch} />
            <CommandList>
              {searchQ.isError ? (
                <div className="p-2">
                  <QueryErrorState
                    title="Licensee search could not be loaded"
                    message="This is a temporary problem — please try again."
                    onRetry={() => searchQ.refetch()}
                    compact
                  />
                </div>
              ) : searchQ.isLoading ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-1" />Searching…
                </div>
              ) : (searchQ.data ?? []).length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No matching licensed entity found.
                </div>
              ) : (
                <CommandGroup>
                  {(searchQ.data ?? []).map((l) => (
                    <CommandItem
                      key={l.id}
                      value={l.id}
                      onSelect={() => {
                        setStaged({ id: l.id, name: l.name, license_number: l.license_number });
                        setPickerOpen(false);
                      }}
                    >
                      <Check className={cn('h-4 w-4 mr-2', staged?.id === l.id ? 'opacity-100' : 'opacity-0')} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{l.name}</div>
                        {l.license_number && (
                          <div className="text-[10px] text-muted-foreground font-mono">{l.license_number}</div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="flex justify-end">
        <Button
          data-rbac="complaint_management.edit"
          size="sm"
          variant="secondary"
          disabled={!staged || linkLicensee.isPending}
          onClick={() => linkLicensee.mutate()}
        >
          {linkLicensee.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Building2 className="h-4 w-4 mr-2" />}
          {ctx?.kind === 'licensed' ? 'Save linked entity' : 'Link entity'}
        </Button>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4" /> Entity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contextQ.isError ? (
          <QueryErrorState
            title="Entity details could not be loaded"
            message="We could not work out which entity this complaint relates to. Please try again."
            onRetry={() => contextQ.refetch()}
            compact
          />
        ) : contextQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking entity details…
          </div>
        ) : ctx?.kind === 'licensed' ? (
          <>
            <div>
              <p className="text-sm font-medium">{ctx.entity_name || 'Linked entity'}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="secondary">Licensed entity</Badge>
                {ctx.license_number && (
                  <span className="text-xs font-mono text-muted-foreground">License {ctx.license_number}</span>
                )}
              </div>
            </div>
            {!locked && (
              manualOpen ? picker : (
                <Button data-rbac="complaint_management.edit" size="sm" variant="outline" onClick={() => setManualOpen(true)}>
                  Change linked entity
                </Button>
              )
            )}
          </>
        ) : ctx?.kind === 'applicant' ? (
          <>
            <div>
              <p className="text-sm font-medium">{ctx.entity_name}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="outline">Applicant entity</Badge>
                <span className="text-xs text-muted-foreground">{humaniseAppStatus(ctx.application_status)}</span>
                {ctx.application_number && (
                  <span className="text-xs font-mono text-muted-foreground">{ctx.application_number}</span>
                )}
              </div>
            </div>
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span>
                This complaint is linked to an applicant entity. Enforcement escalation requires a licensed entity
                record, so it stays unavailable until this entity is licensed.
              </span>
            </div>
            {!locked && (
              manualOpen ? picker : (
                <Button data-rbac="complaint_management.edit" size="sm" variant="outline" onClick={() => setManualOpen(true)}>
                  Link a licensed entity instead
                </Button>
              )
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No entity has been identified for this complaint.</p>
            {locked ? null : picker}
            {!locked && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>A licensed entity must be linked before this complaint can be escalated to enforcement.</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ComplaintEntityCard;
