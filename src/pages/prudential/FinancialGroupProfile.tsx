import { useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeft, RefreshCw, Plus, Trash2, AlertTriangle, Building2, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { bandTone, formatAmount, ROLE_LABEL, TREATMENT_LABEL, type GroupMember } from '@/lib/groupConsolidation';
import { GroupStructureTree } from '@/components/prudential/GroupStructureTree';
import { GroupMemberMetricsPanel } from '@/components/prudential/GroupMemberMetricsPanel';
import { ConsolidatedRatiosPanel } from '@/components/prudential/ConsolidatedRatiosPanel';
import { IntragroupExposureMatrix } from '@/components/prudential/IntragroupExposureMatrix';
import { SubsidiaryRiskHeatmap } from '@/components/prudential/SubsidiaryRiskHeatmap';
import { GroupEwiPanel, GroupBreachesPanel } from '@/components/prudential/GroupEwiPanel';
import { GroupContagionPanel } from '@/components/prudential/GroupContagionPanel';
import { useCan } from '@/hooks/useCan';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  useGroupConsolidated, useGroupPeriods, useGroupExposures, useGroupSnapshots,
  useSaveGroupMember, useRemoveGroupMember, useSaveExposure, useDeleteExposure,
  useRecomputeGroup, useAcknowledgeGroupAlert, useSaveMethodology,
  useUpdateFinancialGroup, useGroupEntityOptions,
} from '@/hooks/useFinancialGroups';
import { GroupMemberFields, type MemberFormValue } from '@/components/prudential/GroupMemberFields';
import {
  MethodologyRulesEditor, methodologyIssue, EXPOSURE_TYPES,
  type MethodologyValue,
} from '@/components/prudential/MethodologyRulesEditor';
import { useSectors, useStaffDirectory } from '@/hooks/useOperatingStructure';
import { baseCurrency } from '@/lib/money';

/** PRU-GRP-001 — Financial Group consolidated risk profile. */
export default function FinancialGroupProfile() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<string>('');

  const canEdit = useCan('prudential_supervision', 'edit');
  const { data: periods = [] } = useGroupPeriods(groupId);
  const { data, isLoading, refetch } = useGroupConsolidated(groupId, period || null);
  const activePeriod: string = period || data?.period_key || '';
  const { data: exposures = [] } = useGroupExposures(groupId, activePeriod || null);
  const { data: snapshots = [] } = useGroupSnapshots(groupId);
  const { data: licensees = [] } = useGroupEntityOptions();
  const { data: sectors = [] } = useSectors();
  const { data: staff = [] } = useStaffDirectory();

  const saveMember = useSaveGroupMember(groupId);
  const removeMember = useRemoveGroupMember(groupId);
  const saveExposure = useSaveExposure(groupId);
  const deleteExposure = useDeleteExposure(groupId);
  const recompute = useRecomputeGroup(groupId);
  const acknowledge = useAcknowledgeGroupAlert(groupId);
  const saveMethod = useSaveMethodology(groupId);
  const updateGroup = useUpdateFinancialGroup(groupId);

  const [memberDialog, setMemberDialog] = useState<MemberFormValue | null>(null);
  const [memberIssue, setMemberIssue] = useState<string | null>(null);
  const [exposureDialog, setExposureDialog] = useState<any | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<any | null>(null);

  const group = data?.group ?? {};
  const members: GroupMember[] = data?.members ?? [];
  const matrix = data?.matrix ?? { entities: [], cells: [], total: 0, circular_chains: [], large_exposures: [] };
  const score = data?.score;
  const snapshot = data?.snapshot;
  const method = data?.methodology;

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    (matrix.entities ?? []).forEach((e: any) => m.set(e.entity_id, e.name));
    return m;
  }, [matrix]);

  const matrixEntities = useMemo(
    () => (matrix.entities ?? []).map((e: any) => ({ licensee_id: e.entity_id, name: e.name })),
    [matrix],
  );

  const heatmapRows = useMemo(() => {
    const breachCount = new Map<string, number>();
    (data?.breaches ?? []).forEach((b: any) => {
      if (b.licensee_id) breachCount.set(b.licensee_id, (breachCount.get(b.licensee_id) ?? 0) + 1);
    });
    const scoreByMember = new Map<string, GroupMember>();
    members.forEach((m) => scoreByMember.set(m.licensee_id, m));
    return (data?.heatmap ?? []).map((h: any) => ({
      licensee_id: h.licensee_id,
      name: h.name,
      ratings: h.ratings ?? null,
      risk_score: scoreByMember.get(h.licensee_id)?.risk_score ?? null,
      risk_band: scoreByMember.get(h.licensee_id)?.risk_band ?? h.overall_rating ?? null,
      open_breaches: breachCount.get(h.licensee_id) ?? 0,
    }));
  }, [data, members]);

  const memberOptions = useMemo(
    () => members.map((m) => ({ id: m.licensee_id, name: m.name })),
    [members],
  );

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading consolidated profile…</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Group not found or not accessible.</div>;

  return (
    <DashboardLayout>
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" onClick={() => navigate('/prudential/groups')} className="-ml-2">
            <ArrowLeft className="mr-1 h-4 w-4" />All groups
          </Button>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Building2 className="h-6 w-6 text-primary" />{group.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{group.group_code}</span>
            {group.holding_entity_name ? ` · Holding: ${group.holding_entity_name}` : ''}
            {` · ${members.length} member${members.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Label className="text-xs">Period</Label>
            <Select value={activePeriod || 'none'} onValueChange={(v) => setPeriod(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Select period" /></SelectTrigger>
              <SelectContent>
                {!periods.length && <SelectItem value="none">No periods</SelectItem>}
                {periods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {canEdit && (
            <Button data-rbac="prudential_supervision.edit"
              variant="outline"
              onClick={() => activePeriod && recompute.mutate(activePeriod)}
              disabled={!activePeriod || recompute.isPending}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', recompute.isPending && 'animate-spin')} />
              Recompute
            </Button>
          )}
          {canEdit && (
            <Button data-rbac="prudential_supervision.edit" variant="outline"
              onClick={() => setEditGroup({
                name: group.name ?? '', group_code: group.group_code ?? '',
                holding_entity_id: group.holding_entity_id ?? '', sector_id: group.sector_id ?? '',
                supervisory_lead_id: group.supervisory_lead_id ?? '',
                status: group.status ?? 'active', notes: group.notes ?? '',
              })}>
              <Pencil className="mr-2 h-4 w-4" />Edit group
            </Button>
          )}
          <Button variant="ghost" onClick={() => refetch()}>Refresh</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Consolidated group score</CardTitle></CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold">{score?.score ?? '—'}</p>
            {score?.band && <Badge variant="outline" className={cn('mt-1 text-[11px]', bandTone(score.band))}>{score.band}</Badge>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Intra-group exposure</CardTitle></CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold">{formatAmount(matrix.total)}</p>
            <p className="text-xs text-muted-foreground">{(matrix.large_exposures ?? []).length} large exposure(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Open group alerts</CardTitle></CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold">
              {(data.alerts ?? []).filter((a: any) => a.status === 'open').length}
            </p>
            <p className="text-xs text-muted-foreground">{(data.breaches ?? []).length} member breach(es)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Methodology</CardTitle></CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-semibold">v{method?.version ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              {snapshot?.computed_at ? `Computed ${new Date(snapshot.computed_at).toLocaleString()}` : 'Not yet computed'}
            </p>
          </CardContent>
        </Card>
      </div>

      {(matrix.circular_chains ?? []).length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />Circular intra-group exposure chains detected
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {(matrix.circular_chains ?? []).map((c: any, i: number) => (
              <p key={i} className="font-mono text-xs">
                {(c.chain ?? []).map((id: string) => nameById.get(id) ?? id).join(' → ')} ({c.length} hops)
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="structure">
        <TabsList className="flex-wrap">
          <TabsTrigger value="structure">Group structure</TabsTrigger>
          <TabsTrigger value="consolidated">Consolidated position</TabsTrigger>
          <TabsTrigger value="exposures">Intra-group exposures</TabsTrigger>
          <TabsTrigger value="risk">Risk heatmap</TabsTrigger>
          <TabsTrigger value="alerts">Alerts &amp; breaches</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="structure" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Parent / subsidiary structure</CardTitle>
              {canEdit && (
                <Button data-rbac="prudential_supervision.create" size="sm" onClick={() => setMemberDialog({ member_role: 'subsidiary', consolidation_treatment: 'full' })}>
                  <Plus className="mr-2 h-4 w-4" />Add member
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <GroupStructureTree
                members={members}
                canEdit={canEdit}
                onSelectMember={(m) => navigate(`/entities/${m.licensee_id}?view=prudential`)}
                onEditMember={(m) => setMemberDialog({
                  id: m.member_id, licensee_id: m.licensee_id, parent_member_id: m.parent_member_id,
                  member_role: m.member_role, ownership_percentage: m.ownership_percentage,
                  consolidation_treatment: m.consolidation_treatment,
                  effective_date: m.effective_date, end_date: m.end_date,
                  exclusion_rationale: (m as any).exclusion_rationale ?? null,
                  ownership_variance_reason: (m as any).ownership_variance_reason ?? null,
                  ownership_variance_note: (m as any).ownership_variance_note ?? null,
                  notes: (m as any).notes ?? null,
                })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="consolidated" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Consolidated ratio roll-up</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Period {activePeriod || '—'} · {snapshot?.member_count ?? 0} contributing member(s)
                </p>
              </div>
              {canEdit && <Button size="sm" variant="outline" onClick={() => setMethodOpen(true)}>Methodology</Button>}
            </CardHeader>
            <CardContent>
              <ConsolidatedRatiosPanel ratios={snapshot?.ratios ?? []} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Member reported facts — {activePeriod || 'latest period'}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Canonical metric values from each member's accepted return filing. Consolidated
                figures above are derived from these facts only.
              </p>
            </CardHeader>
            <CardContent>
              <GroupMemberMetricsPanel metrics={data?.member_metrics ?? []} period={activePeriod} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Contagion transmission channels</CardTitle></CardHeader>
            <CardContent>
              <GroupContagionPanel cells={matrix.cells ?? []} total={Number(matrix.total) || 0} nameById={nameById} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exposures" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Exposure matrix</CardTitle>
              {canEdit && (
                <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => setExposureDialog({ exposure_type: 'loan', period_key: activePeriod, amount: 0 })}>
                  <Plus className="mr-2 h-4 w-4" />Record exposure
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <IntragroupExposureMatrix
                entities={matrixEntities}
                cells={matrix.cells ?? []}
                total={Number(matrix.total) || 0}
                largeThresholdPct={matrix.large_exposure_pct}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Recorded exposures — {activePeriod || 'all periods'}</CardTitle></CardHeader>
            <CardContent>
              {!exposures.length ? (
                <p className="text-sm text-muted-foreground">No exposures recorded for this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>From</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Source</TableHead>
                        {canEdit && <TableHead />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exposures.map((e: any) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm">{nameById.get(e.from_entity_id) ?? '—'}</TableCell>
                          <TableCell className="text-sm">{nameById.get(e.to_entity_id) ?? '—'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[11px]">{e.exposure_type}</Badge></TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatAmount(e.amount)}</TableCell>
                          <TableCell className="font-mono text-xs">{e.period_key}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{e.source}</TableCell>
                          {canEdit && (
                            <TableCell className="text-right">
                              <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => setExposureDialog(e)}>Edit</Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteExposure.mutate(e.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="risk">
          <Card>
            <CardHeader><CardTitle className="text-base">Subsidiary risk heatmap</CardTitle></CardHeader>
            <CardContent><SubsidiaryRiskHeatmap rows={heatmapRows} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Group early-warning alerts</CardTitle></CardHeader>
            <CardContent>
              <GroupEwiPanel
                alerts={data.alerts ?? []}
                canAct={canEdit}
                onAcknowledge={(id) => acknowledge.mutate(id)}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Threshold breaches across the group</CardTitle></CardHeader>
            <CardContent>
              <GroupBreachesPanel breaches={(data.breaches ?? []).map((b: any) => ({ ...b, scope: 'member' }))} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader><CardTitle className="text-base">Consolidation history</CardTitle></CardHeader>
            <CardContent>
              {!snapshots.length ? (
                <p className="text-sm text-muted-foreground">No consolidation runs recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Members</TableHead>
                      <TableHead className="text-right">Metrics</TableHead>
                      <TableHead>Methodology</TableHead>
                      <TableHead>Computed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshots.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs">{s.period_key}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{s.member_count}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{(s.ratios ?? []).length}</TableCell>
                        <TableCell className="font-mono text-xs">v{s.methodology_version ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{new Date(s.computed_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Member dialog */}
      <Dialog open={!!memberDialog} onOpenChange={(o) => !o && setMemberDialog(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{memberDialog?.id ? 'Edit member' : 'Add group member'}</DialogTitle></DialogHeader>
          {memberDialog && (
            <GroupMemberFields
              groupId={groupId}
              value={memberDialog}
              onChange={setMemberDialog}
              onIssueChange={setMemberIssue}
              entities={licensees}
              parentField="parent_member_id"
              parentOptions={members
                .filter((m) => m.member_id !== memberDialog.id)
                .map((m) => ({ value: m.member_id, label: m.name, licensee_id: m.licensee_id }))}
            />
          )}
          {memberIssue && <p className="text-xs text-destructive">{memberIssue}</p>}
          <DialogFooter className="justify-between">
            {memberDialog?.id && (
              <GuardedButton module="prudential_supervision" action="edit" data-rbac="prudential_supervision.edit"
                variant="ghost"
                onClick={() => { removeMember.mutate(memberDialog.id as string); setMemberDialog(null); }}
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />Remove
              </GuardedButton>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMemberDialog(null)}>Cancel</Button>
              <Button data-rbac="prudential_supervision.edit"
                disabled={!!memberIssue || saveMember.isPending}
                onClick={async () => { await saveMember.mutateAsync(memberDialog as any); setMemberDialog(null); }}
              >Save</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exposure dialog */}
      <Dialog open={!!exposureDialog} onOpenChange={(o) => !o && setExposureDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{exposureDialog?.id ? 'Edit exposure' : 'Record intra-group exposure'}</DialogTitle></DialogHeader>
          {exposureDialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>From (obligor)</Label>
                  <Select
                    value={exposureDialog.from_entity_id ?? ''}
                    onValueChange={(v) => setExposureDialog({ ...exposureDialog, from_entity_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {memberOptions.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>To (counterparty)</Label>
                  <Select
                    value={exposureDialog.to_entity_id ?? ''}
                    onValueChange={(v) => setExposureDialog({ ...exposureDialog, to_entity_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {memberOptions.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Type</Label>
                  <Select
                    value={exposureDialog.exposure_type ?? 'loan'}
                    onValueChange={(v) => setExposureDialog({ ...exposureDialog, exposure_type: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EXPOSURE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number" step="0.01" value={exposureDialog.amount ?? 0}
                    onChange={(e) => setExposureDialog({ ...exposureDialog, amount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Period</Label>
                  <Input
                    value={exposureDialog.period_key ?? ''}
                    onChange={(e) => setExposureDialog({ ...exposureDialog, period_key: e.target.value })}
                    placeholder="2025-Q4"
                  />
                </div>
              </div>
              <div className="w-40">
                <Label>Currency</Label>
                <Input
                  className="font-mono"
                  value={exposureDialog.currency ?? baseCurrency() ?? ''}
                  onChange={(e) => setExposureDialog({ ...exposureDialog, currency: e.target.value.toUpperCase().slice(0, 3) })}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  rows={2} value={exposureDialog.notes ?? ''}
                  onChange={(e) => setExposureDialog({ ...exposureDialog, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExposureDialog(null)}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit"
              disabled={
                !exposureDialog?.from_entity_id || !exposureDialog?.to_entity_id ||
                exposureDialog?.from_entity_id === exposureDialog?.to_entity_id ||
                !exposureDialog?.period_key || saveExposure.isPending
              }
              onClick={async () => { await saveExposure.mutateAsync(exposureDialog); setExposureDialog(null); }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Group master dialog */}
      <Dialog open={!!editGroup} onOpenChange={(o) => !o && setEditGroup(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Edit group details</DialogTitle></DialogHeader>
          {editGroup && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Group code</Label>
                  <Input value={editGroup.group_code}
                    onChange={(e) => setEditGroup({ ...editGroup, group_code: e.target.value })} />
                </div>
                <div>
                  <Label>Group name</Label>
                  <Input value={editGroup.name}
                    onChange={(e) => setEditGroup({ ...editGroup, name: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Ultimate holding entity</Label>
                <Select value={editGroup.holding_entity_id || 'none'}
                  onValueChange={(v) => setEditGroup({ ...editGroup, holding_entity_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Select holding entity" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not identified</SelectItem>
                    {licensees.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Sector</Label>
                  <Select value={editGroup.sector_id || 'none'}
                    onValueChange={(v) => setEditGroup({ ...editGroup, sector_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Sector" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not assigned</SelectItem>
                      {(sectors as any[]).map((sec) => <SelectItem key={sec.id} value={sec.id}>{sec.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Supervisory lead</Label>
                  <Select value={editGroup.supervisory_lead_id || 'none'}
                    onValueChange={(v) => setEditGroup({ ...editGroup, supervisory_lead_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Supervisor" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not assigned</SelectItem>
                      {staff.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editGroup.status}
                    onValueChange={(v) => setEditGroup({ ...editGroup, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="dissolved">Dissolved</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={3} value={editGroup.notes}
                  onChange={(e) => setEditGroup({ ...editGroup, notes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGroup(null)}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit"
              disabled={updateGroup.isPending || !editGroup?.name?.trim() || !editGroup?.group_code?.trim()}
              onClick={async () => {
                await updateGroup.mutateAsync({
                  group_code: editGroup.group_code.trim(),
                  name: editGroup.name.trim(),
                  holding_entity_id: editGroup.holding_entity_id || null,
                  sector_id: editGroup.sector_id || null,
                  supervisory_lead_id: editGroup.supervisory_lead_id || null,
                  status: editGroup.status,
                  notes: editGroup.notes?.trim() || null,
                });
                setEditGroup(null);
                refetch();
              }}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Methodology dialog */}
      <MethodologyDialog
        open={methodOpen}
        onOpenChange={setMethodOpen}
        method={method}
        onSave={async (payload) => { await saveMethod.mutateAsync(payload); setMethodOpen(false); }}
        saving={saveMethod.isPending}
      />
    </div>
    </DashboardLayout>
  );
}

function MethodologyDialog({ open, onOpenChange, method, onSave, saving }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  method: any;
  onSave: (payload: any) => Promise<void>;
  saving: boolean;
}) {
  const [value, setValue] = useState<MethodologyValue>({
    ratio_rules: [], eliminate_exposure_types: [], large_exposure_pct: 10, notes: null,
  });
  const [initialised, setInitialised] = useState(false);

  if (open && !initialised) {
    setValue({
      ratio_rules: (method?.ratio_rules ?? []).map((r: any) => ({
        ratio_key: String(r.ratio_key ?? ''),
        method: r.method === 'sum' || r.method === 'weighted_avg' ? r.method : 'sum',
        eliminate: !!r.eliminate,
      })),
      eliminate_exposure_types: method?.eliminate_exposure_types ?? ['loan', 'deposit', 'capital'],
      large_exposure_pct: Number(method?.large_exposure_pct ?? 10),
      notes: method?.notes ?? null,
    });
    setInitialised(true);
  }
  if (!open && initialised) setInitialised(false);

  const issue = methodologyIssue(value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Consolidation methodology {method?.version ? `(current v${method.version})` : ''}</DialogTitle>
        </DialogHeader>
        <MethodologyRulesEditor value={value} onChange={setValue} />
        {issue && <p className="text-sm text-destructive">{issue}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-rbac="prudential_supervision.edit"
            disabled={saving || !!issue}
            onClick={() => onSave({
              ratio_rules: value.ratio_rules,
              eliminate_exposure_types: value.eliminate_exposure_types,
              large_exposure_pct: value.large_exposure_pct,
              total_assets_ratio_key: method?.total_assets_ratio_key ?? null,
              capital_ratio_key: method?.capital_ratio_key ?? null,
              notes: value.notes || null,
            })}
          >{saving ? 'Saving…' : 'Save new version'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
