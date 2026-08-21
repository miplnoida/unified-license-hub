import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeft, RefreshCw, Plus, Trash2, AlertTriangle, Building2 } from 'lucide-react';
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
} from '@/hooks/useFinancialGroups';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const EXPOSURE_TYPES = ['loan', 'deposit', 'capital', 'guarantee', 'other'];

function useLicenseeOptions() {
  return useQuery({
    queryKey: ['licensee_options_for_group'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('licensees').select('id, name').order('name').limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });
}

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
  const { data: licensees = [] } = useLicenseeOptions();

  const saveMember = useSaveGroupMember(groupId);
  const removeMember = useRemoveGroupMember(groupId);
  const saveExposure = useSaveExposure(groupId);
  const deleteExposure = useDeleteExposure(groupId);
  const recompute = useRecomputeGroup(groupId);
  const acknowledge = useAcknowledgeGroupAlert(groupId);
  const saveMethod = useSaveMethodology(groupId);

  const [memberDialog, setMemberDialog] = useState<any | null>(null);
  const [exposureDialog, setExposureDialog] = useState<any | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);

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
            <Button
              variant="outline"
              onClick={() => activePeriod && recompute.mutate(activePeriod)}
              disabled={!activePeriod || recompute.isPending}
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', recompute.isPending && 'animate-spin')} />
              Recompute
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
                <Button size="sm" onClick={() => setMemberDialog({ member_role: 'subsidiary', consolidation_treatment: 'full' })}>
                  <Plus className="mr-2 h-4 w-4" />Add member
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <GroupStructureTree
                members={members}
                canEdit={canEdit}
                onSelectMember={(m) => navigate(`/prudential/entities/${m.licensee_id}`)}
                onEditMember={(m) => setMemberDialog({
                  id: m.member_id, licensee_id: m.licensee_id, parent_member_id: m.parent_member_id,
                  member_role: m.member_role, ownership_percentage: m.ownership_percentage,
                  consolidation_treatment: m.consolidation_treatment,
                  effective_date: m.effective_date, end_date: m.end_date,
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
                <Button size="sm" onClick={() => setExposureDialog({ exposure_type: 'loan', period_key: activePeriod, amount: 0 })}>
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
                              <Button size="sm" variant="ghost" onClick={() => setExposureDialog(e)}>Edit</Button>
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
        <DialogContent>
          <DialogHeader><DialogTitle>{memberDialog?.id ? 'Edit member' : 'Add group member'}</DialogTitle></DialogHeader>
          {memberDialog && (
            <div className="space-y-3">
              <div>
                <Label>Entity</Label>
                <Select
                  value={memberDialog.licensee_id ?? ''}
                  onValueChange={(v) => setMemberDialog({ ...memberDialog, licensee_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select entity" /></SelectTrigger>
                  <SelectContent>
                    {licensees.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Parent within group</Label>
                <Select
                  value={memberDialog.parent_member_id ?? 'none'}
                  onValueChange={(v) => setMemberDialog({ ...memberDialog, parent_member_id: v === 'none' ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent (top of group)</SelectItem>
                    {members
                      .filter((m) => m.member_id !== memberDialog.id)
                      .map((m) => <SelectItem key={m.member_id} value={m.member_id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Role</Label>
                  <Select
                    value={memberDialog.member_role ?? 'subsidiary'}
                    onValueChange={(v) => setMemberDialog({ ...memberDialog, member_role: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Consolidation treatment</Label>
                  <Select
                    value={memberDialog.consolidation_treatment ?? 'full'}
                    onValueChange={(v) => setMemberDialog({ ...memberDialog, consolidation_treatment: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TREATMENT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Ownership %</Label>
                  <Input
                    type="number" step="0.01"
                    value={memberDialog.ownership_percentage ?? ''}
                    onChange={(e) => setMemberDialog({ ...memberDialog, ownership_percentage: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Effective date</Label>
                  <Input
                    type="date" value={memberDialog.effective_date ?? ''}
                    onChange={(e) => setMemberDialog({ ...memberDialog, effective_date: e.target.value || null })}
                  />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input
                    type="date" value={memberDialog.end_date ?? ''}
                    onChange={(e) => setMemberDialog({ ...memberDialog, end_date: e.target.value || null })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="justify-between">
            {memberDialog?.id && (
              <Button
                variant="ghost"
                onClick={() => { removeMember.mutate(memberDialog.id); setMemberDialog(null); }}
              >
                <Trash2 className="mr-2 h-4 w-4 text-destructive" />Remove
              </Button>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMemberDialog(null)}>Cancel</Button>
              <Button
                disabled={!memberDialog?.licensee_id || saveMember.isPending}
                onClick={async () => { await saveMember.mutateAsync(memberDialog); setMemberDialog(null); }}
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
            <Button
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
  const [rules, setRules] = useState('');
  const [types, setTypes] = useState('');
  const [pct, setPct] = useState('10');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  if (open && !initialised) {
    setRules(JSON.stringify(method?.ratio_rules ?? [], null, 2));
    setTypes((method?.eliminate_exposure_types ?? ['loan', 'deposit', 'capital']).join(', '));
    setPct(String(method?.large_exposure_pct ?? 10));
    setNotes(method?.notes ?? '');
    setInitialised(true);
  }
  if (!open && initialised) setInitialised(false);

  const submit = async () => {
    let parsed: any[];
    try {
      parsed = JSON.parse(rules || '[]');
      if (!Array.isArray(parsed)) throw new Error('Ratio rules must be a JSON array');
    } catch (e: any) {
      setError(e.message || 'Invalid JSON');
      return;
    }
    setError(null);
    await onSave({
      ratio_rules: parsed,
      eliminate_exposure_types: types.split(',').map((t) => t.trim()).filter(Boolean),
      large_exposure_pct: Number(pct) || 0,
      total_assets_ratio_key: method?.total_assets_ratio_key ?? null,
      capital_ratio_key: method?.capital_ratio_key ?? null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Consolidation methodology {method?.version ? `(current v${method.version})` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Ratio rules (JSON array)</Label>
            <Textarea rows={10} className="font-mono text-xs" value={rules} onChange={(e) => setRules(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">
              Each rule: {'{ "ratio_key": "total_assets", "method": "sum" | "weighted_average" | "average" }'}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Eliminate exposure types</Label>
              <Input value={types} onChange={(e) => setTypes(e.target.value)} placeholder="loan, deposit, capital" />
            </div>
            <div>
              <Label>Large exposure threshold (%)</Label>
              <Input type="number" step="0.1" value={pct} onChange={(e) => setPct(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">Saving creates a new immutable methodology version.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save new version'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
