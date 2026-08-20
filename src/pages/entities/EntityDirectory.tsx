import { Link } from 'react-router-dom';
/**
 * RDM-ENTITY-001 Wave A — Regulated Entity Directory (`/entities`).
 *
 * The single canonical view of regulated entities. Every read goes through the
 * governed Entity Registry Gateway (`entity_registry_search` /
 * `entity_registry_entity_dto`) — this page never queries `licensees` or the
 * `entity_*` tables directly, so authorization and provenance stay server-side.
 */
import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Loader2, Search, Building2, Eye } from 'lucide-react';
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
  const [lifecycle, setLifecycle] = useState('all');
  const [identity, setIdentity] = useState('all');
  const [selected, setSelected] = useState<string | null>(null);
  const { data = [], isLoading, error } = useEntitySearch(query);

  const rows = useMemo(() => {
    return (data as EntityDto[]).filter((e) => {
      if (lifecycle !== 'all' && (e.lifecycle || '') !== lifecycle) return false;
      if (identity !== 'all' && (e.identity_status || '') !== identity) return false;
      return true;
    });
  }, [data, lifecycle, identity]);

  const lifecycleOptions = useMemo(
    () => [...new Set((data as EntityDto[]).map((e) => e.lifecycle).filter(Boolean) as string[])].sort(),
    [data],
  );
  const identityOptions = useMemo(
    () => [...new Set((data as EntityDto[]).map((e) => e.identity_status).filter(Boolean) as string[])].sort(),
    [data],
  );

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Regulated Entity Directory"
          description="Canonical registry of regulated entities — identity, identifiers and attached licences."
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Search the registry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              className="flex flex-col sm:flex-row gap-2"
              onSubmit={(e) => { e.preventDefault(); setQuery(term.trim()); }}
            >
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Legal name, registered identifier or licence number"
                className="sm:max-w-md"
              />
              <Button type="submit" size="sm" className="gap-1.5">
                <Search className="h-4 w-4" /> Search
              </Button>
              <Select value={lifecycle} onValueChange={setLifecycle}>
                <SelectTrigger className="sm:w-48"><SelectValue placeholder="Lifecycle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All lifecycles</SelectItem>
                  {lifecycleOptions.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={identity} onValueChange={setIdentity}>
                <SelectTrigger className="sm:w-48"><SelectValue placeholder="Identity status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All identity statuses</SelectItem>
                  {identityOptions.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </form>

            {error && (
              <p className="text-sm text-destructive">
                {(error as Error).message || 'Registry search failed.'}
              </p>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Entity number</TableHead>
                    <TableHead>Legal name</TableHead>
                    <TableHead>Lifecycle</TableHead>
                    <TableHead>Identity status</TableHead>
                    <TableHead>Identifiers</TableHead>
                    <TableHead>Licences</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin inline" />
                    </TableCell></TableRow>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No entities match the current search.
                    </TableCell></TableRow>
                  )}
                  {rows.map((e) => (
                    <TableRow key={e.entity_id}>
                      <TableCell className="font-mono text-xs">{e.entity_id.slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">
                        {e.display_name}
                        {e.merged_into_entity_id && (
                          <Badge variant="outline" className="ml-2 text-xs">merged</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={LIFECYCLE_TONE(e.lifecycle)}>
                          {e.lifecycle_label || e.lifecycle || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={IDENTITY_TONE(e.identity_status)}>
                          {e.identity_status_label || e.identity_status || '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>{e.identifiers.length}</TableCell>
                      <TableCell>{e.licences.length}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(e.entity_id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/entities/${e.entity_id}`}>Structure</Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/entities/${e.entity_id}/360`}>Entity 360</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
      <EntityDetailSheet entityId={selected} onClose={() => setSelected(null)} />
    </DashboardLayout>
  );
}
