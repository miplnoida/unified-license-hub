import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CanonicalSupervisoryPlans } from '@/components/supervision/CanonicalSupervisoryPlans';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Target, ExternalLink, ShieldCheck, CalendarClock, UserCog, CheckCircle2 } from 'lucide-react';
import { logAction } from '@/hooks/useAuditLog';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { supervisoryPlanActionTransition, supervisoryPlanDecision } from '@/lib/prudentialGovernedOps';

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In progress', className: 'bg-indigo-100 text-indigo-800' },
  completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600' },
};

function isOverdue(a: any): boolean {
  if (a.status === 'completed' || a.status === 'cancelled') return false;
  if (!a.due_date) return false;
  return new Date(a.due_date) < new Date(new Date().toDateString());
}

type Bulk = 'reassign' | 'extend' | 'complete';

export default function SupervisoryPlansDashboard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [tab, setTab] = useState<'open' | 'overdue' | 'completed' | 'all'>('open');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [dueWindow, setDueWindow] = useState<'any' | '7' | '14' | '30'>('any');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState<Bulk | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [extendDate, setExtendDate] = useState('');
  const [extendReason, setExtendReason] = useState('');
  const [pending, setPending] = useState<null | { ruleKey: string; title: string; entityId: string; original: unknown; overridden: unknown; metadata: Record<string, unknown>; apply: () => Promise<void> }>(null);

  const { data: actions, isLoading } = useQuery({
    queryKey: ['supervisory_actions_dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supervisory_plan_actions')
        .select('*')
        .order('due_date', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const planIds = useMemo(() => Array.from(new Set((actions ?? []).map((a: any) => a.plan_id))), [actions]);
  const { data: plansMap } = useQuery({
    queryKey: ['supervisory_plans_map', planIds.join(',')],
    enabled: planIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('supervisory_plans')
        .select('id, entity_id, notes, approval_status, created_by, approved_by, submitted_for_review_at, approved_at')
        .in('id', planIds);
      const m = new Map<string, any>();
      (data ?? []).forEach((p: any) => m.set(p.id, p));
      return m;
    },
  });

  const entityIds = useMemo(() => {
    const s = new Set<string>();
    plansMap?.forEach((p) => s.add(p.entity_id));
    return Array.from(s);
  }, [plansMap]);

  const { data: licenseesMap } = useQuery({
    queryKey: ['supervisory_licensees_map', entityIds.join(',')],
    enabled: entityIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name, sector_id').in('id', entityIds);
      const m = new Map<string, any>();
      (data ?? []).forEach((l: any) => m.set(l.id, l));
      return m;
    },
  });

  const enriched = useMemo(() => {
    return (actions ?? []).map((a: any) => {
      const plan = plansMap?.get(a.plan_id);
      const licensee = plan ? licenseesMap?.get(plan.entity_id) : null;
      return { ...a, plan, licensee, licenseeName: licensee?.name };
    });
  }, [actions, plansMap, licenseesMap]);

  const owners = useMemo(() => {
    const s = new Set<string>();
    (actions ?? []).forEach((a: any) => { if (a.owner_role) s.add(a.owner_role); });
    return Array.from(s).sort();
  }, [actions]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (tab === 'open') list = list.filter((a: any) => (a.status === 'pending' || a.status === 'in_progress') && !isOverdue(a));
    else if (tab === 'overdue') list = list.filter(isOverdue);
    else if (tab === 'completed') list = list.filter((a: any) => a.status === 'completed');
    if (ownerFilter !== 'all') list = list.filter((a: any) => a.owner_role === ownerFilter);
    if (dueWindow !== 'any') {
      const win = parseInt(dueWindow, 10);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + win);
      list = list.filter((a: any) => a.due_date && new Date(a.due_date) <= cutoff);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((a: any) =>
        (a.title || '').toLowerCase().includes(q) ||
        (a.licenseeName || '').toLowerCase().includes(q) ||
        (a.owner_role || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [enriched, tab, ownerFilter, search, dueWindow]);

  const stats = useMemo(() => ({
    open: enriched.filter((a: any) => (a.status === 'pending' || a.status === 'in_progress') && !isOverdue(a)).length,
    overdue: enriched.filter(isOverdue).length,
    completed: enriched.filter((a: any) => a.status === 'completed').length,
    pendingReview: Array.from(plansMap?.values() ?? []).filter((p: any) => p.approval_status === 'pending_review').length,
  }), [enriched, plansMap]);

  const groupedByOwner = useMemo(() => {
    const g = new Map<string, any[]>();
    filtered.forEach((a: any) => {
      const k = a.owner_role || 'Unassigned';
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(a);
    });
    return Array.from(g.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggle = (id: string, on: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      if (on) n.add(id); else n.delete(id);
      return n;
    });
  };

  const clearBulk = () => {
    setBulkMode(null);
    setReassignTo(''); setReassignReason('');
    setExtendDate(''); setExtendReason('');
  };

  const runBulk = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (!ids.length) throw new Error('No actions selected');
      // All plan-action transitions go through the governed operation, which
      // re-checks authority, records reassignment/extension provenance and
      // writes the audit entry server-side.
      if (bulkMode === 'reassign') {
        if (!reassignTo.trim()) throw new Error('New owner role required');
        if (reassignReason.trim().length < 5) throw new Error('Reason required');
        for (const id of ids) {
          const cur = enriched.find((a: any) => a.id === id);
          await supervisoryPlanActionTransition({
            actionId: id,
            toStatus: cur?.status ?? 'open',
            reason: reassignReason.trim(),
            ownerRole: reassignTo.trim(),
          });
        }
      } else if (bulkMode === 'extend') {
        if (!extendDate) throw new Error('New due date required');
        if (extendReason.trim().length < 5) throw new Error('Reason required');
        for (const id of ids) {
          const cur = enriched.find((a: any) => a.id === id);
          await supervisoryPlanActionTransition({
            actionId: id,
            toStatus: cur?.status ?? 'open',
            reason: extendReason.trim(),
            dueDate: extendDate,
          });
        }
      } else if (bulkMode === 'complete') {
        for (const id of ids) {
          await supervisoryPlanActionTransition({
            actionId: id,
            toStatus: 'completed',
            reason: 'Bulk completion from supervisory plan execution queue',
          });
        }
      }
    },
    onSuccess: () => {
      toast.success('Bulk action applied');
      setSelected(new Set());
      clearBulk();
      qc.invalidateQueries({ queryKey: ['supervisory_actions_dashboard'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const submitForReview = useMutation({
    mutationFn: async (planId: string) => {
      await supervisoryPlanDecision(planId, 'submit_for_review', 'Submitted for supervisory review');
    },
    onSuccess: () => { toast.success('Plan submitted for review'); qc.invalidateQueries({ queryKey: ['supervisory_plans_map', planIds.join(',')] }); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const approvePlan = useMutation({
    mutationFn: async (planId: string) => {
      const plan = plansMap?.get(planId);
      if (!plan) throw new Error('Plan not found');
      // Server also enforces the 4-eyes rule; kept client-side for fast feedback.
      if (plan.created_by && plan.created_by === user?.id) {
        throw new Error('4-eyes rule: creator cannot approve their own plan');
      }
      await supervisoryPlanDecision(planId, 'approve', 'Approved from supervisory plan execution queue');
    },
    onSuccess: () => { toast.success('Plan approved'); qc.invalidateQueries({ queryKey: ['supervisory_plans_map', planIds.join(',')] }); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <DashboardLayout>
      <PageHeader title="Supervisory plan execution" description="Cross-entity workload for supervisory plan actions" />
      <CanonicalSupervisoryPlans />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Open</div><div className="text-2xl font-semibold">{stats.open}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Overdue</div><div className="text-2xl font-semibold text-red-600">{stats.overdue}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Completed</div><div className="text-2xl font-semibold text-emerald-600">{stats.completed}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Plans pending review</div><div className="text-2xl font-semibold">{stats.pendingReview}</div></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="overdue">Overdue</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]"><Label className="text-xs">Search</Label>
              <Input placeholder="Action, licensee or owner…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="w-48"><Label className="text-xs">Owner role</Label>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  {owners.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40"><Label className="text-xs">Due within</Label>
              <Select value={dueWindow} onValueChange={(v: any) => setDueWindow(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap gap-2 items-center rounded border bg-muted/40 p-2">
              <span className="text-sm">{selected.size} selected</span>
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setBulkMode('reassign')}><UserCog className="h-3 w-3 mr-1" />Reassign</Button>
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setBulkMode('extend')}><CalendarClock className="h-3 w-3 mr-1" />Extend due</Button>
              <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => setBulkMode('complete')}><CheckCircle2 className="h-3 w-3 mr-1" />Mark complete</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground flex flex-col items-center gap-2"><Target className="h-6 w-6" />No actions match.</div>
          ) : (
            <div className="space-y-6">
              {groupedByOwner.map(([owner, rows]) => (
                <div key={owner}>
                  <div className="text-sm font-medium mb-2">{owner} <span className="text-muted-foreground font-normal">· {rows.length}</span></div>
                  <div className="overflow-x-auto rounded border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b bg-muted/40">
                          <th className="p-2 w-8"></th>
                          <th className="p-2">Action</th>
                          <th className="p-2">Licensee</th>
                          <th className="p-2">Due</th>
                          <th className="p-2">Status</th>
                          <th className="p-2">Plan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((a: any) => {
                          const meta = STATUS_META[a.status] ?? STATUS_META.pending;
                          const overdue = isOverdue(a);
                          const plan = a.plan;
                          const canApprove = plan && plan.approval_status === 'pending_review' && plan.created_by !== user?.id;
                          const canSubmit = plan && plan.approval_status === 'draft';
                          return (
                            <tr key={a.id} className="border-b hover:bg-muted/40">
                              <td className="p-2">
                                <Checkbox checked={selected.has(a.id)} onCheckedChange={(v) => toggle(a.id, !!v)} />
                              </td>
                              <td className="p-2">
                                <div className="font-medium">{a.title}</div>
                                {a.extension_reason && <div className="text-xs text-muted-foreground">Extended: {a.extension_reason}</div>}
                                {a.reassigned_from && <div className="text-xs text-muted-foreground">Reassigned from {a.reassigned_from}</div>}
                              </td>
                              <td className="p-2">
                                {a.licensee ? (
                                  <Link to={`/entities/${a.licensee.id}`} className="hover:underline inline-flex items-center gap-1">
                                    {a.licenseeName} <ExternalLink className="h-3 w-3" />
                                  </Link>
                                ) : '—'}
                              </td>
                              <td className="p-2 text-xs">
                                {a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}
                                {overdue && <div className="text-red-600">Overdue</div>}
                              </td>
                              <td className="p-2"><Badge className={meta.className}>{meta.label}</Badge></td>
                              <td className="p-2 text-xs">
                                {plan && (
                                  <>
                                    <PlanBadge status={plan.approval_status} />
                                    <div className="mt-1 flex gap-1 items-center flex-wrap">
                                      <HistoryButton entityType="supervisory_plan" entityId={plan.id} title="Supervisory plan history" variant="ghost" />
                                      {canSubmit && (
                                        <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="h-6 px-2" onClick={() => submitForReview.mutate(plan.id)}>
                                          Submit
                                        </Button>
                                      )}
                                      {canApprove && (
                                        <Button data-rbac="prudential_supervision.initiate_supervisory_action" size="sm" variant="ghost" className="h-6 px-2 text-emerald-700" onClick={() => approvePlan.mutate(plan.id)}>
                                          <ShieldCheck className="h-3 w-3 mr-1" />Approve
                                        </Button>
                                      )}
                                    </div>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk operation dialogs */}
      <Dialog open={bulkMode === 'reassign'} onOpenChange={(o) => { if (!o) clearBulk(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reassign {selected.size} action(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>New owner role</Label><Input value={reassignTo} onChange={(e) => setReassignTo(e.target.value)} placeholder="e.g. supervisor" /></div>
            <div><Label>Reason</Label><Textarea rows={3} value={reassignReason} onChange={(e) => setReassignReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearBulk}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit" onClick={() => runBulk.mutate()} disabled={runBulk.isPending}>
              {runBulk.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMode === 'extend'} onOpenChange={(o) => { if (!o) clearBulk(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Extend due date for {selected.size} action(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>New due date</Label><Input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} /></div>
            <div><Label>Reason</Label><Textarea rows={3} value={extendReason} onChange={(e) => setExtendReason(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={clearBulk}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit" onClick={() => {
              const anyOverdue = Array.from(selected).some((id) => {
                const cur = enriched.find((a: any) => a.id === id);
                return cur && isOverdue(cur);
              });
              if (anyOverdue) {
                const firstId = Array.from(selected)[0];
                setPending({
                  ruleKey: 'supervisory_plan.due_date.override',
                  title: `Extend due date after SLA breach (${selected.size} action(s))`,
                  entityId: firstId,
                  original: { selection_ids: Array.from(selected) },
                  overridden: { new_due_date: extendDate, reason: extendReason.trim() },
                  metadata: {
                    source: 'phase1_override_framework',
                    screen: 'SupervisoryPlansDashboard',
                    supervisory_plan_action_ids: Array.from(selected),
                    new_due_date: extendDate,
                    contains_overdue: true,
                  },
                  apply: async () => { await runBulk.mutateAsync(); },
                });
              } else {
                runBulk.mutate();
              }
            }} disabled={runBulk.isPending}>
              {runBulk.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkMode === 'complete'} onOpenChange={(o) => { if (!o) clearBulk(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark {selected.size} action(s) complete?</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground">This stamps completion time + user for each selected action.</div>
          <DialogFooter>
            <Button variant="outline" onClick={clearBulk}>Cancel</Button>
            <Button data-rbac="prudential_supervision.edit" onClick={() => runBulk.mutate()} disabled={runBulk.isPending}>
              {runBulk.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Mark complete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pending && (
        <OverrideReasonDialog
          open={!!pending}
          onOpenChange={(o) => { if (!o) setPending(null); }}
          module="supervisory_plans"
          entityType="supervisory_plan_action"
          entityId={pending.entityId}
          ruleKey={pending.ruleKey}
          title={pending.title}
          originalValue={pending.original}
          overriddenValue={pending.overridden}
          metadata={pending.metadata}
          onOverridden={async () => { await pending.apply(); setPending(null); }}
        />
      )}
    </DashboardLayout>
  );
}

function PlanBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    pending_review: 'bg-amber-100 text-amber-800',
    approved: 'bg-emerald-100 text-emerald-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return <Badge className={map[status] ?? 'bg-slate-100 text-slate-700'}>{status.replace('_', ' ')}</Badge>;
}
