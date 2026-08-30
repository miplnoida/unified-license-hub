/**
 * F8A-B4 — Relationship intelligence (`/intelligence/network`).
 *
 * Evidence-based discovery across canonical entities, canonical persons and
 * canonical addresses, served by the governed `relationship_intelligence_search`
 * RPC, plus visibility of the projection exception queue
 * (`address_projection_queue`) including UNRESOLVED_PERSON_IDENTITY.
 *
 * The screen contains no matching, scoring or identity-resolution logic. It
 * offers no shortcut that would fabricate a party linkage to clear the queue —
 * unresolved Fit & Proper identities are resolved only in the governed identity
 * resolution queue, with evidence and audit.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, MapPin, Search, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  B4Empty, B4ErrorNotice, B4Loading, B4Unresolved, B4_INTELLIGENCE_CAVEAT,
} from '@/components/addresses/B4StateNotice';
import {
  useRelationshipIntelligenceSearch, useAddressProjectionQueue, useProjectAddressSources,
  type IntelligenceHit,
} from '@/hooks/useAddressIntelligence';

const KINDS: Array<{ key: string; label: string; icon: typeof Users }> = [
  { key: 'ENTITY', label: 'Entities', icon: Building2 },
  { key: 'PERSON', label: 'Persons', icon: Users },
  { key: 'ADDRESS', label: 'Addresses', icon: MapPin },
];

function hitHref(hit: IntelligenceHit): string | null {
  if (hit.result_kind === 'ENTITY') return `/entities/${hit.result_id}`;
  if (hit.result_kind === 'PERSON') return `/persons/${hit.result_id}`;
  return `/intelligence/addresses/${hit.result_id}`;
}

export default function RelationshipIntelligenceSearch() {
  const [term, setTerm] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [kinds, setKinds] = useState<string[]>(['ENTITY', 'PERSON', 'ADDRESS']);

  const search = useRelationshipIntelligenceSearch(submitted, kinds);
  const queue = useAddressProjectionQueue();
  const project = useProjectAddressSources();

  const toggleKind = (key: string) =>
    setKinds((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const runProjection = async () => {
    try {
      const result = await project.mutateAsync();
      toast.success(
        `Projection complete — ${result.addresses_touched} address record(s), `
        + `${result.usages_touched} usage(s), ${result.unresolved} unresolved.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Projection refused');
    }
  };

  const unresolvedIdentity = (queue.data ?? []).filter((r) => r.reason === 'UNRESOLVED_PERSON_IDENTITY');

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Relationship Intelligence"
        description="Deterministic common-address evidence across canonical entities, persons and addresses"
      />

      <Alert>
        <AlertTitle>Intelligence lead, not a finding</AlertTitle>
        <AlertDescription>{B4_INTELLIGENCE_CAVEAT}</AlertDescription>
      </Alert>

      <Tabs defaultValue="search">
        <TabsList>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="queue">
            Projection exceptions{queue.data ? ` (${queue.data.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="search" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Evidence search</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => { e.preventDefault(); setSubmitted(term); }}
              >
                <div className="min-w-64 flex-1 space-y-1">
                  <Label htmlFor="intel-q">Entity name, person name, street, locality or postal code</Label>
                  <Input
                    id="intel-q"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="At least 3 characters"
                  />
                </div>
                <Button type="submit" disabled={term.trim().length < 3 || kinds.length === 0}>
                  <Search className="mr-2 h-4 w-4" /> Search
                </Button>
              </form>

              <div className="flex flex-wrap gap-2">
                {KINDS.map(({ key, label, icon: Icon }) => (
                  <Button
                    key={key}
                    type="button"
                    size="sm"
                    variant={kinds.includes(key) ? 'default' : 'outline'}
                    onClick={() => toggleKind(key)}
                    aria-pressed={kinds.includes(key)}
                  >
                    <Icon className="mr-2 h-3.5 w-3.5" aria-hidden /> {label}
                  </Button>
                ))}
              </div>

              {!submitted ? (
                <B4Empty
                  title="No search performed yet"
                  body="Enter at least three characters. Address matching is deterministic (exact canonical row or shared normalized key)."
                />
              ) : search.isLoading ? (
                <B4Loading label="Searching canonical records…" />
              ) : search.error ? (
                <B4ErrorNotice error={search.error} />
              ) : (search.data ?? []).length === 0 ? (
                <B4Empty
                  title="No matching canonical records"
                  body="Nothing inside your regulatory scope matches this term. Records outside your scope are never returned."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kind</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Context</TableHead>
                      <TableHead>Deterministic key</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(search.data ?? []).map((hit) => (
                      <TableRow key={`${hit.result_kind}-${hit.result_id}`}>
                        <TableCell><Badge variant="outline">{hit.result_kind}</Badge></TableCell>
                        <TableCell>
                          <Link className="text-primary underline" to={hitHref(hit) ?? '#'}>
                            {hit.title ?? 'Unnamed record'}
                          </Link>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{hit.subtitle ?? '—'}</TableCell>
                        <TableCell className="break-all font-mono text-xs">{hit.detail ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Projection exceptions</CardTitle>
              <GuardedButton
                module="entity_structure"
                action="apply"
                data-rbac="entity_structure.apply"
                size="sm"
                variant="outline"
                disabled={project.isPending}
                onClick={runProjection}
              >
                Run projection sweep
              </GuardedButton>
            </CardHeader>
            <CardContent className="space-y-3">
              {queue.isLoading ? (
                <B4Loading label="Loading projection exceptions…" />
              ) : queue.error ? (
                <B4ErrorNotice error={queue.error} />
              ) : (queue.data ?? []).length === 0 ? (
                <B4Empty
                  title="No projection exceptions"
                  body="Every source address record can be attributed deterministically to a canonical subject, or carries no address text."
                />
              ) : (
                <>
                  {unresolvedIdentity.length > 0 && (
                    <B4Unresolved
                      body={`${unresolvedIdentity.length} Fit & Proper source record(s) carry an address but no canonical `
                        + 'person identity has been established. Projection deliberately refuses to create or guess a '
                        + 'party. Resolve identity first in the identity resolution queue.'}
                    />
                  )}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Source</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Address evidence</TableHead>
                        <TableHead className="text-right">Next step</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(queue.data ?? []).map((r) => (
                        <TableRow key={`${r.source_kind}-${r.source_id}`}>
                          <TableCell>{r.source_kind}</TableCell>
                          <TableCell>{r.subject_label ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant={r.reason === 'UNRESOLVED_PERSON_IDENTITY' ? 'destructive' : 'secondary'}>
                              {r.reason}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.address_preview ?? '—'}</TableCell>
                          <TableCell className="text-right">
                            {r.reason === 'UNRESOLVED_PERSON_IDENTITY' ? (
                              <Link className="text-sm text-primary underline" to="/persons/identity-queue">
                                Resolve identity
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Bind the registration to an entity
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
