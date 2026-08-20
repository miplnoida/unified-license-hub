/**
 * RDM-ENTITY-001 Wave A — Regulated Entity Directory (`/entities`).
 *
 * The single canonical view of regulated entities. Every read goes through the
 * governed Entity Registry Gateway (`entity_registry_search` /
 * `entity_registry_entity_dto`) — this page never queries `licensees` or the
 * `entity_*` tables directly, so authorization and provenance stay server-side.
 *
 * The listing uses the shared EnterpriseDataGrid, so search, per-column
 * filtering, sorting, column choice and export behave the same here as in
 * every other operational queue.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, Search, Building2, Eye } from 'lucide-react';
import { EnterpriseDataGrid, type GridColumn } from '@/components/data-grid';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { humanize, presentStatus } from '@/lib/presentation/statusLabels';
import { formatCount } from '@/lib/presentation/format';
import { useEntitySearch, useEntityDto } from '@/hooks/useEntityRegistry';
import type { EntityDto } from '@/services/entityRegistry';
import { formatDateTime } from '@/lib/datetime';


const LIFECYCLE_TONE = (key: string | null) => {
  const k = (key || '').toLowerCase();
  if (k.includes('active') || k === 'authorised') return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
  if (k.includes('suspend') || k.includes('restrict')) return 'bg-amber-500/10 text-amber-700 border-amber-200';
  if (k.includes('revok') || k.includes('reject')) return 'bg-destructive/10 text-destructive border-destructive/30';
  return 'bg-muted text-muted-foreground border-border';
};

const IDENTITY_TONE = (key: string | null) => {
  const k = (key || '').toLowerCase();
  if (k === 'verified') return 'bg-emerald-500/10 text-emerald-700 border-emerald-200';
  if (k === 'disputed') return 'bg-destructive/10 text-destructive border-destructive/30';
  if (k === 'merged') return 'bg-blue-500/10 text-blue-700 border-blue-200';
  return 'bg-muted text-muted-foreground border-border';
};

function EntityDetailSheet({ entityId, onClose }: { entityId: string | null; onClose: () => void }) {
  const { data, isLoading } = useEntityDto(entityId);
  return (
    <Sheet open={!!entityId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{data?.display_name || 'Entity'}</SheetTitle>
          <SheetDescription>Canonical registry record — identifiers, licences and provenance.</SheetDescription>
        </SheetHeader>
        {isLoading && <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>}
        {data && (
          <div className="mt-4 space-y-5 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-muted-foreground text-xs">Legal name</p><p className="font-medium">{data.legal_name}</p></div>
              <div><p className="text-muted-foreground text-xs">Source</p><p className="font-medium">{data.source}</p></div>
              <div><p className="text-muted-foreground text-xs">Lifecycle</p><p className="font-medium">{data.lifecycle_label || data.lifecycle || '—'}</p></div>
              <div><p className="text-muted-foreground text-xs">Identity status</p><p className="font-medium">{data.identity_status_label || data.identity_status || '—'}</p></div>
              <div className="col-span-2"><p className="text-muted-foreground text-xs">Entity number</p><p className="font-mono text-xs">{data.entity_id}</p></div>
            </div>

            <div>
              <p className="font-semibold mb-2">Identifiers</p>
              {data.identifiers.length === 0 && <p className="text-muted-foreground">No registered identifiers.</p>}
              <div className="space-y-1">
                {data.identifiers.map((i) => (
                  <div key={`${i.type}-${i.value}`} className="flex items-center justify-between rounded border p-2">
                    <span>{i.label}</span>
                    <span className="font-mono text-xs">{i.value}</span>
                    <Badge variant="outline" className="text-xs">{i.verification_status || 'unverified'}</Badge>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-semibold mb-2">Licences</p>
              {data.licences.length === 0 && <p className="text-muted-foreground">No licences attached.</p>}
              <div className="space-y-1">
                {data.licences.map((l) => (
                  <div key={l.license_id} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs">{l.license_number || l.license_id}</span>
                      <Badge variant="outline" className="text-xs">{l.status || '—'}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {l.license_type || 'Licence'} · attached {formatDateTime(l.effective_from)}
                      {l.is_primary ? ' · primary' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {!!data.external_references?.length && (
              <div>
                <p className="font-semibold mb-2">External registry references</p>
                {data.external_references.map((x) => (
                  <div key={x.external_entity_id} className="rounded border p-2 text-xs">
                    <span className="font-mono">{x.external_entity_id}</span>
                    {' · '}{x.verification_status || 'unverified'}
                    {x.is_authoritative ? ' · authoritative' : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function EntityDirectory() {
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const { data = [], isLoading, error, refetch } = useEntitySearch(query);

  const rows = data as EntityDto[];

  const lifecycleOptions = useMemo(
    () => [...new Set(rows.map((e) => e.lifecycle).filter(Boolean) as string[])].sort()
      .map((value) => ({ value, label: presentStatus(value)?.label ?? value })),
    [rows],
  );
  const identityOptions = useMemo(
    () => [...new Set(rows.map((e) => e.identity_status).filter(Boolean) as string[])].sort()
      .map((value) => ({ value, label: presentStatus(value)?.label ?? value })),
    [rows],
  );

  const columns = useMemo<Array<GridColumn<EntityDto>>>(() => [
    {
      id: 'display_name',
      header: 'Entity',
      accessor: (e) => e.display_name,
      cell: (e) => (
        <div className="min-w-0">
          <Link to={`/entities/${e.entity_id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {e.display_name}
          </Link>
          {e.merged_into_entity_id && (
            <StatusBadge code="merged" tone="muted" className="ml-2" description="This record has been merged into another entity." />
          )}
          {e.legal_name && e.legal_name !== e.display_name && (
            <p className="truncate text-xs text-muted-foreground">Legal name: {e.legal_name}</p>
          )}
        </div>
      ),
      sortable: true,
      filterable: true,
      filterType: 'text',
      sticky: 'left',
      minWidth: '20rem',
      mandatory: true,
      priority: 1,
    },
    {
      id: 'lifecycle',
      header: 'Authorisation status',
      accessor: (e) => e.lifecycle,
      cell: (e) => <StatusBadge code={e.lifecycle} label={e.lifecycle_label} />,
      sortable: true,
      filterable: true,
      filterType: 'multiEnum',
      filterOptions: lifecycleOptions,
      priority: 1,
    },
    {
      id: 'identity_status',
      header: 'Identity verification',
      accessor: (e) => e.identity_status,
      cell: (e) => <StatusBadge code={e.identity_status} label={e.identity_status_label} />,
      sortable: true,
      filterable: true,
      filterType: 'multiEnum',
      filterOptions: identityOptions,
      priority: 2,
    },
    {
      id: 'licences',
      header: 'Licences held',
      accessor: (e) => e.licences.length,
      cell: (e) => (
        <span className={e.licences.length === 0 ? 'text-muted-foreground' : undefined}>
          {formatCount(e.licences.length)}
        </span>
      ),
      align: 'right',
      sortable: true,
      priority: 1,
    },
    {
      id: 'identifiers',
      header: 'Registered identifiers',
      accessor: (e) => e.identifiers.length,
      cell: (e) => formatCount(e.identifiers.length),
      align: 'right',
      sortable: true,
      priority: 2,
    },
    {
      id: 'source',
      header: 'Record source',
      accessor: (e) => e.source,
      cell: (e) => (e.source ? humanize(String(e.source)) : '—'),
      sortable: true,
      filterable: true,
      filterType: 'enum',
      filterOptions: [...new Set(rows.map((e) => e.source).filter(Boolean) as string[])]
        .map((value) => ({ value, label: humanize(value) })),
      priority: 3,
      defaultVisible: false,
    },
  ], [lifecycleOptions, identityOptions, rows]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Regulated Entity Directory"
          description="Canonical registry of regulated entities — identity, identifiers and attached licences."
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" /> Search the registry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => { e.preventDefault(); setQuery(term.trim()); }}
            >
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Legal name, registered identifier or licence number"
                className="sm:max-w-md"
                aria-label="Search the registry"
              />
              <Button type="submit" size="sm" className="gap-1.5">
                <Search className="h-4 w-4" /> Search registry
              </Button>
              {query && (
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={() => { setTerm(''); setQuery(''); }}
                >
                  Clear
                </Button>
              )}
            </form>

            <EnterpriseDataGrid<EntityDto>
              gridId="entity-directory"
              columns={columns}
              rows={rows}
              getRowId={(e) => e.entity_id}
              isLoading={isLoading}
              error={error ? ((error as Error).message || 'Registry search failed.') : null}
              onRefresh={() => refetch()}
              searchPlaceholder="Filter loaded results"
              emptyTitle="No entities match this search"
              emptyDescription="Refine the search term or clear the filters to see the full registry."
              exportFileName="regulated-entity-directory"
              primaryRowAction={(e) => ({ label: 'Open profile', to: `/entities/${e.entity_id}` })}
              rowActions={(e) => [
                { label: 'Quick registry record', icon: Eye, onClick: () => setSelected(e.entity_id) },
                { label: 'Structure workspace', icon: Building2, href: `/entities/${e.entity_id}/structure` },
              ]}
            />
          </CardContent>
        </Card>
      </div>
      <EntityDetailSheet entityId={selected} onClose={() => setSelected(null)} />
    </DashboardLayout>
  );
}

