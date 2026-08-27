import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Building2, ShieldCheck, Users } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import {
  useEntityAccessOverview,
  useEntityDirectory,
  useInternalProfile,
  useProviderAccessOverview,
  useProviderDirectory,
  useStaffDirectory,
} from '@/hooks/usePeopleAccess';

/**
 * Administration → People & Access (Checkpoint F).
 *
 * A read-only aggregation surface over existing truth: canonical RBAC roles and
 * responsibilities, operating-structure teams/coverage/ownership, entity
 * memberships and external provider engagements. Nothing is edited here — the
 * owning module remains the place where authority is granted or withdrawn.
 */
const Empty = ({ label }: { label: string }) => (
  <p className="py-4 text-sm text-muted-foreground">{label}</p>
);

const Section = ({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
        {title}
        {typeof count === 'number' && <Badge variant="secondary">{count}</Badge>}
      </CardTitle>
    </CardHeader>
    <CardContent className="pt-0">{children}</CardContent>
  </Card>
);

const rows = (data: any[] | undefined, cols: { key: string; label: string; render?: (r: any) => any }[], empty: string) => {
  if (!data || data.length === 0) return <Empty label={empty} />;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {cols.map((c) => (
              <TableHead key={c.key} className="whitespace-nowrap">{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((r, i) => (
            <TableRow key={r.id || i}>
              {cols.map((c) => (
                <TableCell key={c.key} className="whitespace-nowrap text-sm">
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

const expiredBadge = (r: any) =>
  r.expired ? <Badge variant="destructive">Expired</Badge> : <Badge variant="secondary">Current</Badge>;

function Picker({
  items,
  value,
  onChange,
  label,
  render,
}: {
  items: any[];
  value?: string;
  onChange: (id: string) => void;
  label: string;
  render: (r: any) => { primary: string; secondary?: string };
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items.slice(0, 200);
    return items
      .filter((r) => JSON.stringify(r).toLowerCase().includes(needle))
      .slice(0, 200);
  }, [items, q]);

  return (
    <Card className="lg:w-72 lg:shrink-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ScrollArea className="h-[420px] pr-2">
          <div className="space-y-1">
            {filtered.map((r) => {
              const t = render(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onChange(r.id)}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                    value === r.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
                  }`}
                >
                  <span className="block truncate font-medium">{t.primary}</span>
                  {t.secondary && <span className="block truncate text-xs opacity-80">{t.secondary}</span>}
                </button>
              );
            })}
            {filtered.length === 0 && <Empty label="Nothing matches that search." />}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function InternalPeople() {
  const staff = useStaffDirectory();
  const [userId, setUserId] = useState<string | undefined>();
  const profile = useInternalProfile(userId);
  const d = profile.data;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Picker
        label="Internal people"
        items={staff.data || []}
        value={userId}
        onChange={setUserId}
        render={(r) => ({ primary: r.full_name || r.email, secondary: r.department || r.email })}
      />
      <div className="min-w-0 flex-1 space-y-4">
        {!userId && <Empty label="Select a person to see their responsibilities and access." />}
        {userId && profile.isLoading && <Skeleton className="h-64 w-full" />}
        {userId && profile.error && (
          <Card>
            <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {String((profile.error as Error).message)}
            </CardContent>
          </Card>
        )}
        {d && (
          <>
            <Card>
              <CardContent className="flex flex-wrap items-center gap-3 py-4">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{d.user?.full_name}</p>
                  <p className="truncate text-sm text-muted-foreground">{d.user?.email}</p>
                </div>
                {d.user?.department && <Badge variant="outline">{d.user.department}</Badge>}
                <Badge variant={d.user?.status === 'active' ? 'secondary' : 'destructive'}>
                  {d.user?.status || 'unknown'}
                </Badge>
                {d.is_provider_identity && <Badge variant="destructive">Also an external provider identity</Badge>}
              </CardContent>
            </Card>

            <Section title="Roles" count={d.roles?.length}>
              {rows(d.roles, [
                { key: 'name', label: 'Role' },
                { key: 'role_type', label: 'Type' },
                { key: 'status', label: 'Status' },
              ], 'No active roles.')}
            </Section>

            <Section title="Responsibilities (effective permissions)" count={d.permissions?.length}>
              {(d.permissions || []).length === 0 ? (
                <Empty label="No permissions resolved from active roles." />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(d.permissions || []).map((p, i) => (
                    <Badge key={`${p.module}-${p.action}-${i}`} variant="outline" className="font-mono text-xs">
                      {p.module}.{p.action}
                    </Badge>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Teams" count={d.teams?.length}>
              {rows(d.teams, [
                { key: 'name', label: 'Team' },
                { key: 'function', label: 'Function' },
                { key: 'member_role', label: 'Team role' },
                { key: 'state', label: 'State', render: expiredBadge },
              ], 'Not a member of any team.')}
            </Section>

            <Section title="Coverage" count={d.portfolios?.length}>
              {rows(d.portfolios, [
                { key: 'function', label: 'Function' },
                { key: 'regulator', label: 'Regulator' },
                { key: 'effective_from', label: 'From', render: (r) => formatDateTime(r.effective_from) },
              ], 'No portfolio coverage recorded.')}
            </Section>

            <Section title="Work assignments (allocation policy)" count={d.work_coverage?.length}>
              {rows(d.work_coverage, [
                { key: 'allocation_mode', label: 'Allocation' },
                { key: 'routing_mode', label: 'Routing' },
                { key: 'named_relationship_policy', label: 'Named relationship' },
                {
                  key: 'can_take',
                  label: 'Can take work',
                  render: (r) =>
                    r.can_take ? <Badge variant="secondary">Yes</Badge> : <Badge variant="destructive">No</Badge>,
                },
              ], 'No active work-allocation policy applies.')}
            </Section>

            <Section title="Entity ownership" count={d.entity_assignments?.length}>
              {rows(d.entity_assignments, [
                { key: 'entity_name', label: 'Entity' },
                { key: 'function', label: 'Function' },
                { key: 'role', label: 'Role' },
                { key: 'state', label: 'State', render: expiredBadge },
              ], 'No named entity supervision.')}
            </Section>

            <Section title="Decision bodies" count={(d.appeal_panels?.length || 0) + (d.committees?.length || 0)}>
              <div className="space-y-4">
                {rows(d.appeal_panels, [
                  { key: 'name', label: 'Appeal panel' },
                  { key: 'scope', label: 'Scope' },
                  { key: 'member_role', label: 'Role' },
                  { key: 'is_chair', label: 'Chair', render: (r) => (r.is_chair ? 'Yes' : 'No') },
                ], 'Not on an appeal panel.')}
                {rows(d.committees, [
                  { key: 'name', label: 'Committee' },
                  { key: 'member_role', label: 'Role' },
                  { key: 'vote_weight', label: 'Vote weight' },
                ], 'Not on a committee.')}
              </div>
            </Section>

            <Section title="Delegations" count={d.delegations?.length}>
              {rows(d.delegations, [
                { key: 'name', label: 'Rule' },
                { key: 'direction', label: 'Direction' },
                { key: 'effective_from', label: 'From', render: (r) => formatDateTime(r.effective_from) },
                { key: 'state', label: 'State', render: expiredBadge },
              ], 'No delegations in or out.')}
            </Section>

            <Section title="History" count={d.access_history?.length}>
              {rows(d.access_history, [
                { key: 'action', label: 'Action' },
                { key: 'entity_type', label: 'Record' },
                { key: 'created_at', label: 'When', render: (r) => formatDateTime(r.created_at) },
              ], 'No recorded access changes.')}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function EntityAccess() {
  const entities = useEntityDirectory();
  const [entityId, setEntityId] = useState<string | undefined>();
  const overview = useEntityAccessOverview(entityId);
  const d = overview.data;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Picker
        label="Entities"
        items={entities.data || []}
        value={entityId}
        onChange={setEntityId}
        render={(r) => ({ primary: r.name, secondary: r.status })}
      />
      <div className="min-w-0 flex-1 space-y-4">
        {!entityId && <Empty label="Select an entity to see who can act on its behalf." />}
        {entityId && overview.isLoading && <Skeleton className="h-64 w-full" />}
        {entityId && overview.error && (
          <Card>
            <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {String((overview.error as Error).message)}
            </CardContent>
          </Card>
        )}
        {d && (
          <>
            <Section title="Memberships" count={d.memberships?.length}>
              {rows(d.memberships, [
                { key: 'user_name', label: 'Person' },
                { key: 'email', label: 'Email' },
                { key: 'membership_role', label: 'Membership role' },
                {
                  key: 'is_primary_representative',
                  label: 'PPOC',
                  render: (r) => (r.is_primary_representative ? 'Yes' : 'No'),
                },
                { key: 'status', label: 'Status' },
                { key: 'state', label: 'Validity', render: expiredBadge },
              ], 'No memberships recorded.')}
            </Section>

            <Section title="Capabilities">
              {(d.memberships || []).length === 0 ? (
                <Empty label="No capabilities to show." />
              ) : (
                <div className="space-y-3">
                  {(d.memberships || []).map((m: any) => (
                    <div key={m.id}>
                      <p className="text-sm font-medium">{m.user_name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {(m.capabilities || []).length === 0 ? (
                          <span className="text-xs text-muted-foreground">No capabilities granted by this role.</span>
                        ) : (
                          (m.capabilities || []).map((c: string) => (
                            <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Entity scope (portal access & supervisory ownership)">
              <div className="space-y-4">
                {rows(d.portal_access, [
                  { key: 'user_name', label: 'Person' },
                  { key: 'access_type', label: 'Access type' },
                  { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? 'Yes' : 'No') },
                ], 'No portal access records.')}
                {rows(d.supervision_ownership, [
                  { key: 'regulatory_function_id', label: 'Function' },
                  { key: 'is_primary', label: 'Primary', render: (r) => (r.is_primary ? 'Yes' : 'No') },
                  { key: 'status', label: 'Status' },
                ], 'No supervisory ownership recorded.')}
              </div>
            </Section>

            <Section title="Access history" count={d.access_history?.length}>
              {rows(d.access_history, [
                { key: 'action', label: 'Action' },
                { key: 'entity_type', label: 'Record' },
                { key: 'created_at', label: 'When', render: (r) => formatDateTime(r.created_at) },
              ], 'No recorded access changes.')}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function ServiceProviders() {
  const providers = useProviderDirectory();
  const [providerId, setProviderId] = useState<string | undefined>();
  const overview = useProviderAccessOverview(providerId);
  const d = overview.data;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Picker
        label="Service providers"
        items={providers.data || []}
        value={providerId}
        onChange={setProviderId}
        render={(r) => ({ primary: r.name, secondary: `${r.provider_type || 'provider'} · ${r.status}` })}
      />
      <div className="min-w-0 flex-1 space-y-4">
        {!providerId && <Empty label="Select a provider to see its engagement, users and assigned work." />}
        {providerId && overview.isLoading && <Skeleton className="h-64 w-full" />}
        {providerId && overview.error && (
          <Card>
            <CardContent className="flex items-center gap-2 py-4 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {String((overview.error as Error).message)}
            </CardContent>
          </Card>
        )}
        {d && (
          <>
            <Section title="Provider">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-base font-semibold">{d.provider?.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{d.provider?.code}</p>
                </div>
                <Badge variant="outline">{d.provider?.provider_type}</Badge>
                <Badge variant={d.provider?.status === 'active' ? 'secondary' : 'destructive'}>
                  {d.provider?.status}
                </Badge>
                <Badge variant={d.provider?.security_clearance_confirmed ? 'secondary' : 'destructive'}>
                  {d.provider?.security_clearance_confirmed ? 'Clearance confirmed' : 'Clearance not confirmed'}
                </Badge>
              </div>
            </Section>

            <Section title="Engagement · NDA / expiry" count={d.engagements?.length}>
              {rows(d.engagements, [
                { key: 'reference', label: 'Reference' },
                { key: 'nda_confirmed', label: 'NDA', render: (r) => (r.nda_confirmed ? 'Confirmed' : 'Missing') },
                { key: 'effective_to', label: 'Expires', render: (r) => formatDateTime(r.effective_to) },
                { key: 'status', label: 'Status' },
                { key: 'state', label: 'Validity', render: expiredBadge },
              ], 'No engagements recorded.')}
            </Section>

            <Section title="Users" count={d.users?.length}>
              {rows(d.users, [
                { key: 'user_name', label: 'Person' },
                { key: 'member_role', label: 'Role' },
                { key: 'nda_accepted_at', label: 'NDA accepted', render: (r) => formatDateTime(r.nda_accepted_at) },
                { key: 'status', label: 'Status' },
                { key: 'state', label: 'Validity', render: expiredBadge },
              ], 'No provider users.')}
            </Section>

            <Section title="Capabilities">
              {(d.engagements || []).length === 0 ? (
                <Empty label="No capabilities granted." />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(d.engagements || []).flatMap((e: any) =>
                    (e.capabilities || []).map((c: string) => (
                      <Badge key={`${e.id}-${c}`} variant="outline" className="font-mono text-xs">{c}</Badge>
                    )),
                  )}
                </div>
              )}
            </Section>

            <Section title="Assigned packages" count={d.assigned_packages?.length}>
              {rows(d.assigned_packages, [
                { key: 'reference', label: 'Reference' },
                { key: 'subject_module', label: 'Module' },
                { key: 'state', label: 'State' },
                { key: 'due_at', label: 'Due', render: (r) => formatDateTime(r.due_at) },
              ], 'No work packages assigned.')}
            </Section>

            <Section title="Access history" count={d.access_history?.length}>
              {rows(d.access_history, [
                { key: 'from_state', label: 'From' },
                { key: 'to_state', label: 'To' },
                { key: 'actor_context', label: 'Actor context' },
                { key: 'created_at', label: 'When', render: (r) => formatDateTime(r.created_at) },
              ], 'No access events recorded.')}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

export default function PeopleAccess() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">People &amp; Access</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          One place to see who holds what access — internal staff, entity users and external service
          providers. This is a read-only view of existing records; roles, memberships and engagements are
          still changed in the module that owns them.
        </p>
      </div>

      <Tabs defaultValue="internal">
        <TabsList>
          <TabsTrigger value="internal" className="gap-1.5">
            <Users className="h-4 w-4" /> Internal people
          </TabsTrigger>
          <TabsTrigger value="entity" className="gap-1.5">
            <Building2 className="h-4 w-4" /> Entity access
          </TabsTrigger>
          <TabsTrigger value="provider" className="gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Service providers
          </TabsTrigger>
        </TabsList>
        <TabsContent value="internal" className="mt-4">
          <InternalPeople />
        </TabsContent>
        <TabsContent value="entity" className="mt-4">
          <EntityAccess />
        </TabsContent>
        <TabsContent value="provider" className="mt-4">
          <ServiceProviders />
        </TabsContent>
      </Tabs>
    </div>
  );
}
