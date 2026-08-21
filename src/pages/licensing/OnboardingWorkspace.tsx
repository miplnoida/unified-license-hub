/**
 * Registration & Entity Onboarding Convergence — administrator workspace.
 *
 * Surfaces the durable onboarding audit ledger: who searched for which
 * organisation, what the register answered, and what the user did next.
 * All data is read through governed RPCs that enforce the onboarding audit
 * permission server-side.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { EnterpriseDataGrid, type GridColumn } from '@/components/data-grid';
import {
  useIdentificationActivity,
  useIdentificationCounts,
  useJourneyRegister,
  useOnboardingOverview,
  type IdentificationActivityRow,
  type IdentificationFilters,
  type JourneyRegisterRow,
} from '@/hooks/useOnboardingAudit';

const OUTCOMES = ['EXACT_MATCH', 'POSSIBLE_MATCH', 'NO_MATCH', 'VALIDATION_FAILURE', 'SYSTEM_ERROR'];
const STAGES = ['USER_ACCOUNT', 'ENTITY_IDENTIFICATION', 'AUTHORITY_PENDING', 'AUTHORITY_GRANTED', 'APPLICATION', 'COMPLETE'];

function Metric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-2xl font-semibold tabular-nums">{value ?? '—'}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export default function OnboardingWorkspace() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<IdentificationFilters>({});
  const [userText, setUserText] = useState('');
  const [orgText, setOrgText] = useState('');
  const [journeyFilters, setJourneyFilters] = useState<{ user?: string; stage?: string; journey_type?: string }>({});

  const overview = useOnboardingOverview();
  const activity = useIdentificationActivity(filters, 0, 200);
  const counts = useIdentificationCounts(filters);
  const journeys = useJourneyRegister(journeyFilters);

  const applySearch = () =>
    setFilters((f) => ({ ...f, user: userText.trim() || undefined, organisation: orgText.trim() || undefined }));

  const activityColumns = useMemo<GridColumn<IdentificationActivityRow>[]>(
    () => [
      { id: 'occurred_at', header: 'When', accessor: (r) => r.occurred_at, cell: (r) => formatDateTime(r.occurred_at), sortable: true },
      { id: 'user_email', header: 'User', accessor: (r) => r.user_email ?? '', sortable: true },
      { id: 'searched_legal_name', header: 'Organisation searched', accessor: (r) => r.searched_legal_name ?? '', sortable: true },
      {
        id: 'identifier', header: 'Identifier',
        accessor: (r) => r.identifier_value_masked ?? '',
        cell: (r) => (
          <span className="font-mono text-xs">
            {r.identifier_type ? `${r.identifier_type}: ` : ''}{r.identifier_value_masked || '—'}
          </span>
        ),
      },
      {
        id: 'resolution_outcome', header: 'Outcome', accessor: (r) => r.resolution_outcome, sortable: true,
        cell: (r) => <Badge variant={r.resolution_outcome === 'EXACT_MATCH' ? 'default' : 'outline'} className="text-[10px]">{r.resolution_outcome}</Badge>,
      },
      {
        id: 'matched_entity_name', header: 'Matched organisation',
        accessor: (r) => r.matched_entity_name ?? '',
        cell: (r) =>
          r.matched_entity_id ? (
            <button className="text-primary underline-offset-2 hover:underline" onClick={() => navigate(`/entities/${r.matched_entity_id}`)}>
              {r.matched_entity_name || 'View organisation'}
            </button>
          ) : <span className="text-muted-foreground">—</span>,
      },
      { id: 'candidate_count', header: 'Candidates', accessor: (r) => r.candidate_count ?? 0, sortable: true, align: 'right' },
      { id: 'follow_up_action', header: 'Follow-up', accessor: (r) => r.follow_up_action ?? '' },
      { id: 'resolution_case_number', header: 'Case', accessor: (r) => r.resolution_case_number ?? '' },
      { id: 'journey_type', header: 'Journey', accessor: (r) => r.journey_type ?? '', sortable: true },
      { id: 'event_reference', header: 'Audit reference', accessor: (r) => r.event_reference, cell: (r) => <span className="font-mono text-[11px]">{r.event_reference}</span> },
    ],
    [navigate],
  );

  const journeyColumns = useMemo<GridColumn<JourneyRegisterRow>[]>(
    () => [
      { id: 'user_email', header: 'User', accessor: (r) => r.user_email ?? '', sortable: true },
      { id: 'journey_type', header: 'Journey', accessor: (r) => r.journey_type ?? '', sortable: true },
      { id: 'stage', header: 'Stage', accessor: (r) => r.stage, sortable: true, cell: (r) => <Badge variant="outline" className="text-[10px]">{r.stage}</Badge> },
      {
        id: 'entity_name', header: 'Organisation', accessor: (r) => r.entity_name ?? '',
        cell: (r) => r.entity_id
          ? <button className="text-primary underline-offset-2 hover:underline" onClick={() => navigate(`/entities/${r.entity_id}`)}>{r.entity_name || 'View'}</button>
          : <span className="text-muted-foreground">—</span>,
      },
      { id: 'membership_status', header: 'Authority', accessor: (r) => r.membership_status ?? '' },
      { id: 'event_count', header: 'Events', accessor: (r) => Number(r.event_count ?? 0), align: 'right', sortable: true },
      { id: 'last_event_at', header: 'Last activity', accessor: (r) => r.last_event_at, cell: (r) => formatDateTime(r.last_event_at), sortable: true },
    ],
    [navigate],
  );

  const restricted = (activity.error || journeys.error) as Error | null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Registration &amp; onboarding oversight</h1>
          <p className="text-sm text-muted-foreground">
            Durable record of every organisation identification attempt across both registration journeys.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { activity.refetch(); counts.refetch(); journeys.refetch(); overview.refetch(); }}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Active journeys" value={overview.data?.journeys_active} />
        <Metric label="Identifications (7 days)" value={overview.data?.identification_events_7d} />
        <Metric label="Open resolution cases" value={overview.data?.resolution_cases_open} />
        <Metric label="Pending access requests" value={overview.data?.access_requests_pending} />
        <Metric label="Open risk signals" value={overview.data?.open_signals} />
      </div>

      {restricted && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">
          You do not have permission to view onboarding audit activity.
        </CardContent></Card>
      )}

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Identification activity</TabsTrigger>
          <TabsTrigger value="journeys">Registration journeys</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="space-y-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Search the audit ledger</CardTitle>
              <CardDescription>Find who searched for an organisation, and what the register answered.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label className="text-xs">User (email)</Label>
                <Input value={userText} onChange={(e) => setUserText(e.target.value)} placeholder="user@example.com" />
              </div>
              <div>
                <Label className="text-xs">Organisation searched</Label>
                <Input value={orgText} onChange={(e) => setOrgText(e.target.value)} placeholder="Legal name" />
              </div>
              <div>
                <Label className="text-xs">Outcome</Label>
                <Select value={filters.outcome ?? 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, outcome: v === 'all' ? undefined : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All outcomes</SelectItem>
                    {OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Journey</Label>
                <Select value={filters.journey_type ?? 'all'} onValueChange={(v) => setFilters((f) => ({ ...f, journey_type: v === 'all' ? undefined : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Both journeys</SelectItem>
                    <SelectItem value="FORM_FIRST">FORM_FIRST</SelectItem>
                    <SelectItem value="ENTITY_FIRST">ENTITY_FIRST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={applySearch} className="w-full">
                  <Search className="mr-1.5 h-3.5 w-3.5" /> Search
                </Button>
              </div>
            </CardContent>
          </Card>

          {counts.data && (
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Total {counts.data.total}</Badge>
              <Badge variant="outline">Exact {counts.data.exact_match}</Badge>
              <Badge variant="outline">Possible {counts.data.possible_match}</Badge>
              <Badge variant="outline">No match {counts.data.no_match}</Badge>
              <Badge variant="outline">Failures {counts.data.failures}</Badge>
            </div>
          )}

          {activity.isLoading ? (
            <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : (
            <EnterpriseDataGrid
              gridId="onboarding-identification-activity"
              rows={activity.data ?? []}
              columns={activityColumns}
              getRowId={(r) => r.id}
              emptyTitle="No identification activity"
              emptyDescription="No organisation identification attempts match these filters."
              enableExport
              exportFileName="onboarding-identification-activity"
              onRefresh={() => activity.refetch()}
            />
          )}
        </TabsContent>

        <TabsContent value="journeys" className="space-y-3">
          <Card>
            <CardContent className="grid gap-3 py-4 sm:grid-cols-3">
              <div>
                <Label className="text-xs">User (email)</Label>
                <Input
                  defaultValue=""
                  onChange={(e) => setJourneyFilters((f) => ({ ...f, user: e.target.value.trim() || undefined }))}
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <Label className="text-xs">Stage</Label>
                <Select value={journeyFilters.stage ?? 'all'} onValueChange={(v) => setJourneyFilters((f) => ({ ...f, stage: v === 'all' ? undefined : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stages</SelectItem>
                    {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Journey</Label>
                <Select value={journeyFilters.journey_type ?? 'all'} onValueChange={(v) => setJourneyFilters((f) => ({ ...f, journey_type: v === 'all' ? undefined : v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Both journeys</SelectItem>
                    <SelectItem value="FORM_FIRST">FORM_FIRST</SelectItem>
                    <SelectItem value="ENTITY_FIRST">ENTITY_FIRST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {journeys.isLoading ? (
            <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div>
          ) : (
            <EnterpriseDataGrid
              gridId="registration-journeys"
              rows={journeys.data ?? []}
              columns={journeyColumns}
              getRowId={(r) => r.user_id}
              emptyTitle="No registration journeys"
              emptyDescription="No onboarding journeys match these filters."
              enableExport
              exportFileName="registration-journeys"
              onRefresh={() => journeys.refetch()}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
