/**
 * RDM-ENTITY-001 Wave C (external) — "My Organisation → Returns".
 *
 * Filer-first layout: "My Returns" (actual filings) is the default view, the
 * regulator-generated obligations calendar is a second tab, and a prominent
 * "+ New Return" opens the guided selector. All eligibility, obligation and
 * filing rules stay server-side (`returns_new_return_options`,
 * `returns_open_filing`).
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowRight, Eye, Plus } from 'lucide-react';
import { formatDateOnly } from '@/lib/datetime';
import { FREQUENCY_LABELS } from '@/hooks/useWaveC';
import {
  useMyApprovedMemberships, useEntityCapabilities, useEntityReturnsSummary,
  useEntityReturnsCalendar, useCalendarFormsProgress, useEntityReturnsMutations,
} from '@/hooks/useEntityReturns';
import { toast } from 'sonner';
import { ReturnsEntitlementNotice } from '@/components/returns/ReturnsEntitlementNotice';
import { NewReturnDialog } from '@/components/entity/returns-canonical/NewReturnDialog';
import { filingStatusLabel } from '@/lib/returns/filingStatusLabels';
import { usePpoc } from '@/contexts/PpocContext';
import { objectRoute } from '@/lib/routes/objectRoutes';


export default function EntityReturnsWorkspace() {
  const navigate = useNavigate();
  const { data: memberships = [], isLoading: loadingMemberships } = useMyApprovedMemberships();
  const { activeLicenseeId, loading: ppocLoading } = usePpoc();
  const [entityId, setEntityId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [newReturnOpen, setNewReturnOpen] = useState(false);
  const [tab, setTab] = useState('filings');

  useEffect(() => {
    if (memberships.length === 0) {
      if (entityId) setEntityId(null);
      return;
    }

    const activeMembership = activeLicenseeId
      ? memberships.find((m) => m.entity_id === activeLicenseeId)
      : undefined;
    if (activeMembership && entityId !== activeMembership.entity_id) {
      setEntityId(activeMembership.entity_id);
      return;
    }

    const currentIsValid = !!entityId && memberships.some((m) => m.entity_id === entityId);
    if (currentIsValid) return;

    setEntityId((activeMembership ?? memberships[0]).entity_id);
  }, [activeLicenseeId, memberships, entityId]);

  // Deep link from the Returns dashboard: /entity/returns?new=1
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setNewReturnOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const capabilities = useEntityCapabilities(entityId);
  const { data: summary, isLoading: loadingSummary } = useEntityReturnsSummary(entityId);
  const { data: calendar = [], isLoading: loadingCalendar } = useEntityReturnsCalendar(entityId);
  const { openFiling } = useEntityReturnsMutations();

  const versionIds = useMemo(() => calendar.map((r) => r.current_version_id).filter(Boolean) as string[], [calendar]);
  const { data: progress = {} } = useCalendarFormsProgress(versionIds);

  /** My Returns = periods that already have a filing (started or submitted). */
  const myFilings = useMemo(
    () => calendar.filter((r) => !!r.filing_id).sort((a, b) => (b.due_date ?? '').localeCompare(a.due_date ?? '')),
    [calendar],
  );

  const selectedMembership = memberships.find((m) => m.entity_id === entityId);


  const handleOpen = async (row: (typeof calendar)[number]) => {
    if (!capabilities.canOpenOrEdit) return;
    try {
      let filingId = row.filing_id;
      if (!filingId) {
        const res = await openFiling.mutateAsync(row.period_id);
        filingId = res.filing_id;
      }
      navigate(objectRoute.returnFiling(filingId, 'external'));
    } catch (e: any) {
      toast.error(e?.message || 'Could not open filing');
    }
  };

  if (loadingMemberships || ppocLoading) {
    return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  }


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Returns"
          description="Regulatory returns, filings and obligations for your organisation"
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              {memberships.length > 1 && (
                <Select value={entityId ?? undefined} onValueChange={setEntityId}>
                  <SelectTrigger className="w-[240px]"><SelectValue placeholder="Select entity" /></SelectTrigger>
                  <SelectContent>
                    {memberships.map((m) => (
                      <SelectItem key={m.entity_id} value={m.entity_id}>{m.entity_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button data-rbac="returns_management.create" onClick={() => setNewReturnOpen(true)}>
                <Plus className="mr-1 h-4 w-4" />New Return
              </Button>
            </div>
          )}

        />

        {/* Licence eligibility is explained in-page, never as Access Denied. */}
        {memberships.length > 0 && <ReturnsEntitlementNotice licenseeId={entityId} />}

        {selectedMembership && (
          <p className="text-sm text-muted-foreground">
            Acting as <Badge variant="outline">{selectedMembership.role_label}</Badge> for {selectedMembership.entity_name}
            {capabilities.isViewer && <span className="ml-2">— read-only access</span>}
          </p>
        )}

        {memberships.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">
            You have no approved entity membership yet. Request membership to an entity before returns can be prepared.
          </CardContent></Card>
        ) : (
          <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Active obligations" value={loadingSummary ? '…' : summary?.active_obligations ?? 0} />
          <SummaryCard
            label="Next due"
            value={loadingSummary ? '…' : summary?.next_due ? `${summary.next_due.definition_name ?? summary.next_due.definition_code} — ${formatDateOnly(summary.next_due.due_date)}` : 'None'}
          />
          <SummaryCard label="Overdue" value={loadingSummary ? '…' : summary?.overdue_count ?? 0} tone={summary?.overdue_count ? 'destructive' : undefined} />
          <SummaryCard label="Correction requested" value={loadingSummary ? '…' : summary?.correction_requested_count ?? 0} tone={summary?.correction_requested_count ? 'destructive' : undefined} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="filings">My Returns</TabsTrigger>
            <TabsTrigger value="calendar">Obligations Calendar</TabsTrigger>
          </TabsList>

          <TabsContent value="filings" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">My returns</CardTitle></CardHeader>
              <CardContent className="overflow-x-auto p-0">
                {loadingCalendar ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : myFilings.length === 0 ? (
                  <div className="space-y-3 py-12 text-center">
                    <p className="text-sm text-muted-foreground">You have not started any returns yet.</p>
                    <Button data-rbac="returns_management.create" onClick={() => setNewReturnOpen(true)} disabled={!entityId}>
                      <Plus className="mr-1 h-4 w-4" />New Return
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Return</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Due date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myFilings.map((row) => {
                        const prog = row.current_version_id ? progress[row.current_version_id] : undefined;
                        const isCorrection = row.filing_status === 'CORRECTION_REQUESTED';
                        return (
                          <TableRow key={row.period_id}>
                            <TableCell className="font-medium">
                              {row.definition_name}
                              <div className="text-xs text-muted-foreground">{FREQUENCY_LABELS[row.frequency] ?? row.frequency}</div>
                            </TableCell>
                            <TableCell>{row.period_label}</TableCell>
                            <TableCell>
                              {formatDateOnly(row.due_date)}
                              {row.is_overdue && <Badge variant="outline" className="ml-2 border-destructive/20 bg-destructive/10 text-destructive">Overdue</Badge>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={isCorrection ? 'border-destructive/20 bg-destructive/10 text-destructive' : undefined}>
                                {filingStatusLabel(row.filing_status)}
                              </Badge>
                            </TableCell>
                            <TableCell>{prog ? `${prog.completed}/${prog.required}` : '—'}</TableCell>
                            <TableCell className="font-mono text-xs">{row.filing_reference ?? '—'}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant="outline" onClick={() => navigate(objectRoute.returnFiling(row.filing_id, 'external'))}>
                                {capabilities.isViewer ? <><Eye className="mr-1 h-3.5 w-3.5" />View</> : <>Open<ArrowRight className="ml-1 h-3.5 w-3.5" /></>}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Obligations calendar</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">

            {loadingCalendar ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calendar.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">No obligations found</TableCell></TableRow>
                  ) : calendar.map((row) => {
                    const prog = row.current_version_id ? progress[row.current_version_id] : undefined;
                    const isCorrection = row.filing_status === 'CORRECTION_REQUESTED';
                    return (
                      <TableRow key={row.period_id}>
                        <TableCell className="font-medium">
                          {row.definition_code} — {row.definition_name}
                          <div className="text-xs text-muted-foreground">{FREQUENCY_LABELS[row.frequency] ?? row.frequency}</div>
                        </TableCell>
                        <TableCell>{row.period_label}</TableCell>
                        <TableCell>
                          {formatDateOnly(row.due_date)}
                          {row.is_overdue && <Badge variant="outline" className="ml-2 border-destructive/20 bg-destructive/10 text-destructive">Overdue</Badge>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.filing_status ?? 'NOT STARTED'}</Badge>
                          {isCorrection && <Badge variant="outline" className="ml-2 border-destructive/20 bg-destructive/10 text-destructive">Correction requested</Badge>}
                        </TableCell>
                        <TableCell>{prog ? `${prog.completed}/${prog.required}` : '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{row.filing_reference ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          {row.filing_id ? (
                            <Button size="sm" variant="outline" onClick={() => navigate(objectRoute.returnFiling(row.filing_id, 'external'))}>
                              {capabilities.isViewer ? <><Eye className="mr-1 h-3.5 w-3.5" />View</> : <>Continue<ArrowRight className="ml-1 h-3.5 w-3.5" /></>}
                            </Button>
                          ) : capabilities.canOpenOrEdit ? (
                            <Button size="sm" onClick={() => handleOpen(row)} disabled={openFiling.isPending}>Open</Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not started</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>

        <NewReturnDialog
          open={newReturnOpen}
          onOpenChange={setNewReturnOpen}
          entityId={entityId}
          onEntityChange={setEntityId}
          memberships={memberships}
          canPrepare={capabilities.canOpenOrEdit}
        />
          </>
        )}

        {memberships.length === 0 && (
          <NewReturnDialog
            open={newReturnOpen}
            onOpenChange={setNewReturnOpen}
            entityId={entityId}
            onEntityChange={setEntityId}
            memberships={memberships}
            canPrepare={false}
          />
        )}
      </div>

    </DashboardLayout>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'destructive' }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${tone === 'destructive' ? 'text-destructive' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
