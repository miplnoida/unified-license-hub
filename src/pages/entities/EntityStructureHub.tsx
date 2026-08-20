/**
 * RDM-ENTITY-001 Wave B — Entity Structure Workspace (`/entities/:entityId`).
 *
 * The entity-centred operational view: identity, licences held, ownership and
 * control, governance appointments, party relationships, regulatory requests,
 * controlled structural change sets and publication policy.
 *
 * All reads go through governed RPCs / RLS-protected tables; all structural
 * mutations happen through change-set and regulatory-request RPCs.
 */
import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Building2, Loader2, Eye, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';
import { useEntityDto } from '@/hooks/useEntityRegistry';
import {
  useAvailableRequestTypes, useChangeSetItems, useChangeSetMutations, useEntityAppointments,
  useEntityChangeSets, useEntityOwnership, useEntityPartyRelationships, useEntityStructureOverview,
  usePublicationPolicies, useRegulatoryRequestMutations, useRegulatoryRequests, useSetPublicationPolicy,
} from '@/hooks/useWaveB';

const pct = (v: unknown) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(2)}%`);

function Empty({ colSpan, text }: { colSpan: number; text: string }) {
  return <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">{text}</TableCell></TableRow>;
}

function ChangeSetSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: items = [], isLoading } = useChangeSetItems(id);
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Change set items</SheetTitle>
          <SheetDescription>Field-level before/after for this structural change.</SheetDescription>
        </SheetHeader>
        {isLoading && <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>}
        <div className="mt-4 space-y-3 text-sm">
          {!isLoading && items.length === 0 && <p className="text-muted-foreground">No items recorded on this change set.</p>}
          {items.map((i) => (
            <div key={i.id} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{i.change_type} · {i.operation}</span>
                <Badge variant="outline" className="text-xs">{i.apply_status || 'pending'}</Badge>
              </div>
              {i.data_concepts?.code && <p className="mt-1 font-mono text-xs text-muted-foreground">{i.data_concepts.code}</p>}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Current</p>
                  <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{JSON.stringify(i.current_value ?? null, null, 1)}</pre>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Proposed</p>
                  <pre className="whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">{JSON.stringify(i.proposed_value ?? null, null, 1)}</pre>
                </div>
              </div>
              {i.apply_error && <p className="mt-2 text-xs text-destructive">{i.apply_error}</p>}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function EntityStructureHub() {
  const { entityId } = useParams<{ entityId: string }>();
  const canReview = useCan('licensee_management', 'approve');
  const canEdit = useCan('licensee_management', 'edit');

  const { data: dto, isLoading: dtoLoading } = useEntityDto(entityId);
  const { data: overview } = useEntityStructureOverview(entityId);
  const { data: ownership = [] } = useEntityOwnership(entityId);
  const { data: appointments = [] } = useEntityAppointments(entityId);
  const { data: relationships = [] } = useEntityPartyRelationships(entityId);
  const { data: changeSets = [] } = useEntityChangeSets(entityId);
  const { data: requests = [] } = useRegulatoryRequests(entityId);
  const { data: requestTypes = [] } = useAvailableRequestTypes(entityId);
  const { data: policies = [] } = usePublicationPolicies();

  const { transition } = useChangeSetMutations();
  const { start } = useRegulatoryRequestMutations();
  const setPolicy = useSetPublicationPolicy();

  const [openChangeSet, setOpenChangeSet] = useState<string | null>(null);
  const [newRequestType, setNewRequestType] = useState<string>('');
  const [requestSummary, setRequestSummary] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');

  const controllers = useMemo(() => ownership.filter((o) => o.is_controller), [ownership]);
  const ubos = useMemo(() => ownership.filter((o) => o.is_ubo), [ownership]);
  const currentPolicy = (overview as any)?.publication_policy as string | undefined;

  if (dtoLoading) {
    return <div className="py-16 text-center"><Loader2 className="inline h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={dto?.display_name || 'Regulated entity'}
        description="Canonical entity record — identity, licences, ownership and control, governance, relationships and controlled change."
        backHref={`/entities/${entityId}`}
        backLabel="Entity 360"
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to={`/entities/${entityId}`}>
              <Eye className="mr-2 h-4 w-4" />Entity 360
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Licences held', value: dto?.licences?.length ?? 0 },
          { label: 'Ownership records', value: ownership.length },
          { label: 'Controllers / UBOs', value: `${controllers.length} / ${ubos.length}` },
          { label: 'Open change sets', value: changeSets.filter((c) => !['APPLIED', 'REJECTED', 'WITHDRAWN'].includes(String(c.status).toUpperCase())).length },
        ].map((m) => (
          <Card key={m.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="font-mono text-xl">{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="identity">
        <TabsList className="flex w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="licences">Licences</TabsTrigger>
          <TabsTrigger value="ownership">Ownership &amp; Control</TabsTrigger>
          <TabsTrigger value="governance">Governance</TabsTrigger>
          <TabsTrigger value="relationships">Relationships</TabsTrigger>
          <TabsTrigger value="requests">Regulatory Requests</TabsTrigger>
          <TabsTrigger value="changes">Change Sets</TabsTrigger>
          <TabsTrigger value="publication">Publication</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Building2 className="h-4 w-4" /> Canonical identity</CardTitle>
              <CardDescription>Names, identifiers and identity assurance — the entity is never identified by a licence number.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Legal name</p><p className="font-medium">{dto?.legal_name || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Lifecycle</p><p className="font-medium">{dto?.lifecycle_label || dto?.lifecycle || '—'}</p></div>
                <div><p className="text-xs text-muted-foreground">Identity status</p><p className="font-medium">{dto?.identity_status_label || dto?.identity_status || '—'}</p></div>
                <div className="sm:col-span-3"><p className="text-xs text-muted-foreground">Entity reference</p><p className="font-mono text-xs">{entityId}</p></div>
              </div>
              <div>
                <p className="mb-2 font-semibold">Registered identifiers</p>
                <Table>
                  <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Value</TableHead><TableHead>Verification</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {(dto?.identifiers?.length ?? 0) === 0 && <Empty colSpan={3} text="No registered identifiers." />}
                    {(dto?.identifiers || []).map((i) => (
                      <TableRow key={`${i.type}-${i.value}`}>
                        <TableCell>{i.label}</TableCell>
                        <TableCell className="font-mono text-xs">{i.value}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{i.verification_status || 'unverified'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="licences" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Licences held</CardTitle>
              <CardDescription>One entity may hold many licences; each licence is an authorisation held by this entity.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Licence</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
                  <TableHead>Held since</TableHead><TableHead>Primary</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(dto?.licences?.length ?? 0) === 0 && <Empty colSpan={5} text="No licences attached to this entity." />}
                  {(dto?.licences || []).map((l) => (
                    <TableRow key={l.license_id}>
                      <TableCell className="font-mono text-xs">{l.license_number || l.license_id}</TableCell>
                      <TableCell className="text-sm">{l.license_type || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{l.status || '—'}</Badge></TableCell>
                      <TableCell className="text-xs">{formatDateTime(l.effective_from)}</TableCell>
                      <TableCell className="text-xs">{l.is_primary ? 'Yes' : 'No'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ownership" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ownership, control and beneficial ownership</CardTitle>
              <CardDescription>Economic interest, voting rights and control determination, with provenance from the submission that produced them.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Owner</TableHead><TableHead>Economic</TableHead><TableHead>Voting</TableHead>
                  <TableHead>Beneficial</TableHead><TableHead>Flags</TableHead><TableHead>Approval</TableHead><TableHead>Effective from</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ownership.length === 0 && <Empty colSpan={7} text="No ownership records captured for this entity." />}
                  {ownership.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.parties?.display_name || o.owner_party_id?.slice(0, 8)}</TableCell>
                      <TableCell className="font-mono text-xs">{pct(o.economic_interest_percentage)}</TableCell>
                      <TableCell className="font-mono text-xs">{pct(o.voting_rights_percentage)}</TableCell>
                      <TableCell className="font-mono text-xs">{pct(o.beneficial_interest_percentage)}</TableCell>
                      <TableCell className="space-x-1">
                        {o.is_direct && <Badge variant="outline" className="text-xs">direct</Badge>}
                        {o.is_controller && <Badge variant="outline" className="text-xs">controller</Badge>}
                        {o.is_ubo && <Badge variant="outline" className="text-xs">UBO</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{o.approval_status || '—'}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(o.effective_from)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="governance" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Governance appointments</CardTitle>
              <CardDescription>Board, senior management and key function holders, linked to fit-and-proper assessment where applicable.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Person</TableHead><TableHead>Role</TableHead><TableHead>Appointed</TableHead>
                  <TableHead>Executive</TableHead><TableHead>Status</TableHead><TableHead>Regulatory approval</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {appointments.length === 0 && <Empty colSpan={6} text="No appointments recorded." />}
                  {appointments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.parties?.display_name || a.person_party_id?.slice(0, 8)}</TableCell>
                      <TableCell className="text-sm">{a.role_types?.label || '—'}</TableCell>
                      <TableCell className="text-xs">{a.appointment_date || '—'}</TableCell>
                      <TableCell className="text-xs">{a.is_executive ? 'Yes' : 'No'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{a.status || '—'}</Badge></TableCell>
                      <TableCell className="text-xs">{a.regulatory_approval_status || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="relationships" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Party relationships</CardTitle>
              <CardDescription>Group, parent, subsidiary and other regulated relationships recorded against this entity.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Relationship</TableHead><TableHead>Status</TableHead>
                  <TableHead>Effective from</TableHead><TableHead>Notes</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {relationships.length === 0 && <Empty colSpan={4} text="No relationships recorded." />}
                  {relationships.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.relationship_types?.label || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.status || '—'}</Badge></TableCell>
                      <TableCell className="text-xs">{formatDateTime(r.effective_from)}</TableCell>
                      <TableCell className="text-xs">{r.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="mt-4 space-y-4">
          {requestTypes.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Start a regulatory request</CardTitle>
                <CardDescription>Post-authorisation events (changes of control, appointments, licence variation) are raised as governed requests.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Request type</Label>
                    <Select value={newRequestType} onValueChange={setNewRequestType}>
                      <SelectTrigger><SelectValue placeholder="Select a request type" /></SelectTrigger>
                      <SelectContent>
                        {requestTypes.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Summary</Label>
                    <Textarea rows={2} value={requestSummary} onChange={(e) => setRequestSummary(e.target.value)} />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!newRequestType || start.isPending}
                  onClick={() => start.mutate(
                    { entityId: entityId!, requestTypeKey: newRequestType, summary: requestSummary || undefined },
                    { onSuccess: () => { toast.success('Regulatory request started'); setRequestSummary(''); setNewRequestType(''); }, onError: (e: any) => toast.error(e.message) },
                  )}
                >
                  {start.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Start request
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Regulatory requests</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Request</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
                  <TableHead>Effective</TableHead><TableHead>Created</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {requests.length === 0 && <Empty colSpan={5} text="No regulatory requests for this entity." />}
                  {requests.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.request_number}</TableCell>
                      <TableCell className="text-sm">{r.regulatory_request_types?.label || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{r.effective_date || '—'}</TableCell>
                      <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="changes" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Controlled structural change</CardTitle>
              <CardDescription>
                Structure only changes through an approved change set. Nothing is applied to the entity record until approval.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canReview && (
                <div>
                  <Label className="text-xs">Review notes (applied to the next decision)</Label>
                  <Textarea rows={2} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} />
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Change set</TableHead><TableHead>Origin</TableHead><TableHead>Status</TableHead>
                    <TableHead>Effective</TableHead><TableHead>Summary</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {changeSets.length === 0 && <Empty colSpan={6} text="No change sets raised for this entity." />}
                    {changeSets.map((c) => {
                      const status = String(c.status || '').toUpperCase();
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.change_set_number}</TableCell>
                          <TableCell className="text-xs">{c.origin_type}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{c.status}</Badge></TableCell>
                          <TableCell className="text-xs">{c.effective_date || '—'}</TableCell>
                          <TableCell className="max-w-[240px] truncate text-xs">{c.summary || '—'}</TableCell>
                          <TableCell className="space-x-1 text-right">
                            <Button size="sm" variant="ghost" onClick={() => setOpenChangeSet(c.id)}><Eye className="h-4 w-4" /></Button>
                            {canReview && ['SUBMITTED', 'UNDER_REVIEW'].includes(status) && (
                              <>
                                <Button
                                  size="sm" variant="outline"
                                  onClick={() => transition.mutate({ id: c.id, action: 'APPROVE', notes: reviewNotes || undefined }, {
                                    onSuccess: () => toast.success('Change set approved'), onError: (e: any) => toast.error(e.message),
                                  })}
                                >Approve</Button>
                                <Button
                                  size="sm" variant="ghost"
                                  onClick={() => transition.mutate({ id: c.id, action: 'REJECT', notes: reviewNotes || 'Rejected on review' }, {
                                    onSuccess: () => toast.success('Change set rejected'), onError: (e: any) => toast.error(e.message),
                                  })}
                                >Reject</Button>
                              </>
                            )}
                            {canReview && status === 'APPROVED' && (
                              <Button
                                size="sm" variant="outline"
                                onClick={() => transition.mutate({ id: c.id, action: 'APPLY', notes: reviewNotes || undefined }, {
                                  onSuccess: () => toast.success('Change set applied to the entity record'), onError: (e: any) => toast.error(e.message),
                                })}
                              >Apply</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="publication" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Public register policy</CardTitle>
              <CardDescription>Controls whether — and in how much detail — this entity appears on the public register.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Publication policy</Label>
                  <Select
                    value={currentPolicy || ''}
                    disabled={!canEdit}
                    onValueChange={(v) => setPolicy.mutate({ entityId: entityId!, policyKey: v }, {
                      onSuccess: () => toast.success('Publication policy updated'), onError: (e: any) => toast.error(e.message),
                    })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select a policy" /></SelectTrigger>
                    <SelectContent>
                      {policies.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Public register entry</p>
                  <Link className="text-primary underline" to="/registry/entities">Open the public entity register</Link>
                </div>
              </div>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {policies.map((p) => (
                  <li key={p.id}>
                    <strong>{p.label}</strong> — {p.description}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ChangeSetSheet id={openChangeSet} onClose={() => setOpenChangeSet(null)} />
    </div>
  );
}
