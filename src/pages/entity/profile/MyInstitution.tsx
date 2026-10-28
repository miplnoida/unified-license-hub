/**
 * External "My Institution" profile — the regulated entity's own read-only
 * view of its registered identity, licences, key persons on record and the
 * portal users authorised to act for it. Data comes only from the
 * membership-gated `entity_self_profile` RPC; supervisory ratings, notes and
 * plans are never included.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Building2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useMyApprovedMemberships } from '@/hooks/useEntityReturns';
import { usePpoc } from '@/contexts/PpocContext';
import { formatDateOnly } from '@/lib/datetime';
import { useAuth } from '@/contexts/AuthContext';
import { AccessRequestsPanel } from '@/components/entity/AccessRequestsPanel';

interface SelfProfile {
  entity: { id: string; name: string; status: string | null; created_at: string; sector: string | null; sub_sector: string | null; lead_regulator: string | null } | null;
  licences: Array<{ id: string; license_number: string | null; license_type: string | null; status: string; issued_at: string | null; valid_from: string | null; valid_until: string | null }>;
  appointments: Array<{ id: string; person: string; role: string | null; is_executive: boolean | null; status: string | null; approval_status: string | null; effective_from: string | null }>;
  members: Array<{ id: string; full_name: string | null; email: string | null; role: string | null; is_primary: boolean | null; status: string; approved_at: string | null }>;
}

const label = (s?: string | null) => (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

function Field({ name, value }: { name: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{name}</p>
      <p className="text-sm font-medium text-foreground">{value || '—'}</p>
    </div>
  );
}

export default function MyInstitution() {
  const { data: memberships = [], isLoading: loadingMemberships } = useMyApprovedMemberships();
  const { activeLicenseeId } = usePpoc();
  const { user } = useAuth();
  const [entityId, setEntityId] = useState<string | null>(null);

  useEffect(() => {
    if (!memberships.length) return;
    if (entityId && memberships.some((m) => m.entity_id === entityId)) return;
    const preferred = memberships.find((m) => m.entity_id === activeLicenseeId) ?? memberships[0];
    setEntityId(preferred.entity_id);
  }, [memberships, activeLicenseeId, entityId]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['entity-self-profile', entityId],
    enabled: !!entityId,
    queryFn: async (): Promise<SelfProfile> => {
      const { data, error } = await (supabase as any).rpc('entity_self_profile', { _entity_id: entityId });
      if (error) throw new Error(error.message);
      return data as SelfProfile;
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="My Institution" description="Your institution's details as recorded by the regulator" />

        {loadingMemberships ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : memberships.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            Your account is not yet linked to an approved institution. Contact the regulator to request access.
          </CardContent></Card>
        ) : (
          <>
            {memberships.length > 1 && (
              <Select value={entityId ?? undefined} onValueChange={setEntityId}>
                <SelectTrigger className="w-full max-w-md"><SelectValue placeholder="Select institution" /></SelectTrigger>
                <SelectContent>
                  {memberships.map((m) => <SelectItem key={m.entity_id} value={m.entity_id}>{m.entity_name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}

            {isLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : error || !data?.entity ? (
              <Card><CardContent className="py-8 text-center text-sm text-destructive">
                Institution details could not be loaded{error ? `: ${(error as Error).message}` : '.'}
              </CardContent></Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                    <Building2 className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{data.entity.name}</CardTitle>
                    {data.entity.status && <Badge variant="outline">{label(data.entity.status)}</Badge>}
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Field name="Sector" value={data.entity.sector} />
                    <Field name="Sub-sector" value={data.entity.sub_sector} />
                    <Field name="Lead regulator" value={data.entity.lead_regulator} />
                    <Field name="On register since" value={formatDateOnly(data.entity.created_at)} />
                  </CardContent>
                </Card>

                <Tabs defaultValue="licences">
                  <TabsList>
                    <TabsTrigger value="licences">Licences ({data.licences.length})</TabsTrigger>
                    <TabsTrigger value="persons">Key persons ({data.appointments.length})</TabsTrigger>
                    <TabsTrigger value="users">Authorised users ({data.members.length})</TabsTrigger>
                  </TabsList>

                  <TabsContent value="licences" className="mt-4">
                    <Card><CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Licence</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
                          <TableHead>Issued</TableHead><TableHead>Valid until</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {data.licences.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No licences on record</TableCell></TableRow>
                          ) : data.licences.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell className="font-mono"><Link className="text-primary hover:underline" to={`/licenses/${l.id}`}>{l.license_number || l.id.slice(0, 8)}</Link></TableCell>
                              <TableCell>{l.license_type || '—'}</TableCell>
                              <TableCell><Badge variant={l.status === 'active' ? 'approved' : 'outline'}>{label(l.status)}</Badge></TableCell>
                              <TableCell>{formatDateOnly(l.issued_at)}</TableCell>
                              <TableCell>{formatDateOnly(l.valid_until)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent></Card>
                  </TabsContent>

                  <TabsContent value="persons" className="mt-4">
                    <Card><CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Name</TableHead><TableHead>Position</TableHead><TableHead>Approval</TableHead><TableHead>Since</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {data.appointments.length === 0 ? (
                            <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No key persons on record</TableCell></TableRow>
                          ) : data.appointments.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell className="font-medium">{a.person}</TableCell>
                              <TableCell>{a.role || '—'}{a.is_executive ? ' · Executive' : ''}</TableCell>
                              <TableCell><Badge variant="outline">{label(a.approval_status || a.status)}</Badge></TableCell>
                              <TableCell>{formatDateOnly(a.effective_from)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent></Card>
                  </TabsContent>

                  <TabsContent value="users" className="mt-4 space-y-3">
                    <Card><CardContent className="overflow-x-auto p-0">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Approved</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {data.members.length === 0 ? (
                            <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No authorised users</TableCell></TableRow>
                          ) : data.members.map((m) => (
                            <TableRow key={m.id}>
                              <TableCell className="font-medium">{m.full_name || '—'}</TableCell>
                              <TableCell>{m.email || '—'}</TableCell>
                              <TableCell>{m.role || '—'}{m.is_primary ? <Badge variant="outline" className="ml-2">Primary</Badge> : null}</TableCell>
                              <TableCell><Badge variant={m.status === 'APPROVED' ? 'approved' : 'outline'}>{label(m.status)}</Badge></TableCell>
                              <TableCell>{formatDateOnly(m.approved_at)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent></Card>
                    {entityId && <AccessRequestsPanel entityId={entityId} members={data.members} currentUserEmail={user?.email} />}
                  </TabsContent>
                </Tabs>
              </>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
