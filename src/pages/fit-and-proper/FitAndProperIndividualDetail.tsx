import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Save, Plus, PlayCircle, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { FpAssessmentsPanel } from '@/components/fit-and-proper/FpAssessmentsPanel';
import { FpScreeningPanel } from '@/components/fit-and-proper/FpScreeningPanel';
import { FpDeterminationsPanel } from '@/components/fit-and-proper/FpDeterminationsPanel';
import { FpConditionsPanel } from '@/components/fit-and-proper/FpConditionsPanel';
import { FpAppealsPanel } from '@/components/fit-and-proper/FpAppealsPanel';
import { FpMonitoringPanel } from '@/components/fit-and-proper/FpMonitoringPanel';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { logFpAction } from '@/lib/fpAudit';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const ROLE_TYPES = [
  'director', 'chairperson', 'ceo', 'cfo', 'key_person', 'controller', 'shareholder', 'senior_manager', 'trustee', 'other',
];

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

const ROUTING_BADGE: Record<string, { label: string; className: string }> = {
  high: { label: 'SUPERVISOR QUEUE', className: 'bg-red-100 text-red-800' },
  medium: { label: 'ASSESSOR REVIEW', className: 'bg-amber-100 text-amber-800' },
  low: { label: 'ASSESSOR REVIEW', className: 'bg-slate-100 text-slate-700' },
};

export default function FitAndProperIndividualDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const { data: person, isLoading } = useQuery({
    queryKey: ['fp_individual', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_individuals').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!isLoading && !person && id && user?.id) {
      logFpAction('fp.individual.access_denied', 'fp_individual', id, {
        context: { individualId: id },
      }).catch(() => {});
    }
  }, [isLoading, person, id, user?.id]);

  const qc = useQueryClient();
  const [cycleEdits, setCycleEdits] = useState<Record<string, string>>({});
  const [addRoleOpen, setAddRoleOpen] = useState(false);
  const [roleForm, setRoleForm] = useState({
    role_type: 'director', role_title: '', licensee_id: 'none', effective_from: new Date().toISOString().slice(0, 10),
    reassessment_cycle_months: '',
  });
  const [runningCycle, setRunningCycle] = useState(false);
  const [findingsSeverity, setFindingsSeverity] = useState<string>('all');
  const [findingsStatus, setFindingsStatus] = useState<string>('all');

  const { data: licensees = [] } = useQuery({
    queryKey: ['licensees-lookup-fp'],
    queryFn: async () => (await supabase.from('licensees').select('id, name').order('name').limit(500)).data ?? [],
  });

  const { data: roles } = useQuery({
    queryKey: ['fp_individual_roles', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_individual_roles')
        .select('id, role_type, role_title, licensee_id, is_current, effective_from, effective_to, reassessment_cycle_months, next_reassessment_due, last_reassessment_at')
        .eq('individual_id', id!).order('is_current', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // C1a / C2 — all findings for this individual
  const { data: allFindings = [] } = useQuery({
    queryKey: ['fp_all_findings', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_findings')
        .select('id, assessment_id, check_type, severity, title, summary, source, created_at, is_false_positive, resolution_status, confidence_score')
        .eq('individual_id', id!)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // C2 — assessments with created_at for x-axis labels
  const { data: allAssessments = [] } = useQuery({
    queryKey: ['fp_assessments_for_chart', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_assessments')
        .select('id, assessment_type, created_at')
        .eq('individual_id', id!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // C2 — chart data: per-assessment finding counts by severity
  const chartData = useMemo(() => {
    return (allAssessments as any[]).map((a) => {
      const aFindings = (allFindings as any[]).filter((f) => f.assessment_id === a.id && !f.is_false_positive);
      return {
        name: `${a.assessment_type.replace(/_/g, ' ')} ${new Date(a.created_at).toLocaleDateString('en', { month: 'short', year: '2-digit' })}`,
        high: aFindings.filter((f) => f.severity === 'high').length,
        medium: aFindings.filter((f) => f.severity === 'medium').length,
        low: aFindings.filter((f) => f.severity === 'low').length,
      };
    });
  }, [allFindings, allAssessments]);

  // C1a — filtered findings
  const filteredFindings = useMemo(() => {
    return (allFindings as any[]).filter((f) => {
      if (findingsSeverity !== 'all' && f.severity !== findingsSeverity) return false;
      if (findingsStatus !== 'all' && f.resolution_status !== findingsStatus) return false;
      return true;
    });
  }, [allFindings, findingsSeverity, findingsStatus]);

  const addRole = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('No individual');
      if (!roleForm.role_type) throw new Error('Role type required');
      const months = roleForm.reassessment_cycle_months ? Number(roleForm.reassessment_cycle_months) : null;
      if (months != null && (!Number.isFinite(months) || months <= 0 || months > 120)) {
        throw new Error('Cycle must be 1-120 months');
      }
      const nextDue = months
        ? (() => { const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10); })()
        : null;
      const payload = {
        individual_id: id,
        role_type: roleForm.role_type,
        role_title: roleForm.role_title.trim() || null,
        licensee_id: roleForm.licensee_id === 'none' ? null : roleForm.licensee_id,
        effective_from: roleForm.effective_from || null,
        is_current: true,
        reassessment_cycle_months: months,
        next_reassessment_due: nextDue,
        created_by: user?.id,
      };
      const { data, error } = await supabase.from('fp_individual_roles').insert(payload).select('id').single();
      if (error) throw error;
      await logFpAction('fp.role.added', 'fp_individual_role', data.id, {
        after: payload,
        context: { individualId: id },
      });

      // A2b — notify individual if they have a linked user account
      if (person?.user_id) {
        try {
          await supabase.functions.invoke('dispatch-notification-event', {
            body: {
              event_key: 'fp_declaration_requested',
              entity_type: 'fp_individual_role',
              entity_id: data.id,
              payload: { individual_id: id, user_id: person.user_id, role_type: payload.role_type },
            },
          });
        } catch (e) {
          console.warn('dispatch-notification-event failed for declaration request', e);
        }
      } else {
        await logFpAction('fp.role.added.no_user_account', 'fp_individual_role', data.id, {
          context: {
            individualId: id,
            extra: { note: 'Individual has no linked user account — staff must send declaration invitation manually via Invitation Tracker' },
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(
        person?.user_id
          ? 'Role added — declaration request notification sent'
          : 'Role added — individual has no user account, send invitation manually'
      );
      setAddRoleOpen(false);
      setRoleForm({ role_type: 'director', role_title: '', licensee_id: 'none', effective_from: new Date().toISOString().slice(0, 10), reassessment_cycle_months: '' });
      qc.invalidateQueries({ queryKey: ['fp_individual_roles', id] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  async function runCycleNow() {
    setRunningCycle(true);
    try {
      const { data, error } = await supabase.functions.invoke('fp-cycle-scheduler', { body: {} });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Scheduler failed');
      toast.success(`Cycle scheduler ran — opened ${data.opened}, evaluated ${data.evaluated}, due ${data.due}`);
      qc.invalidateQueries({ queryKey: ['fp_assessments', id] });
      qc.invalidateQueries({ queryKey: ['fp_individual_roles', id] });
    } catch (e: any) { toast.error(e?.message || 'Failed'); }
    finally { setRunningCycle(false); }
  }

  async function saveCycle(roleId: string) {
    const raw = cycleEdits[roleId];
    const months = raw === '' || raw == null ? null : Number(raw);
    if (months != null && (!Number.isFinite(months) || months <= 0 || months > 120)) {
      toast.error('Cycle must be 1-120 months'); return;
    }
    const patch: Record<string, unknown> = { reassessment_cycle_months: months };
    if (months != null) {
      const next = new Date();
      next.setMonth(next.getMonth() + months);
      patch.next_reassessment_due = next.toISOString().slice(0, 10);
    } else {
      patch.next_reassessment_due = null;
    }
    const { error } = await supabase.from('fp_individual_roles').update(patch).eq('id', roleId);
    if (error) { toast.error(error.message); return; }
    toast.success('Reassessment cycle updated');
    setCycleEdits((s) => { const c = { ...s }; delete c[roleId]; return c; });
    qc.invalidateQueries({ queryKey: ['fp_individual_roles', id] });
  }

  // A3b — export audit history
  async function exportAuditHistory() {
    if (!id) return;
    try {
      await authorizedExport('fit_and_proper', 'export', { individual_id: id });
      const { data, error } = await supabase
        .from('compliance_audit_logs')
        .select('action, entity_type, entity_id, actor_id, created_at, old_value, new_value, justification')
        .or(`entity_id.eq.${id},entity_type.eq.fp_individual`)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      const rows = data ?? [];
      const headers = ['Action', 'Entity Type', 'Entity ID', 'Actor ID', 'Timestamp', 'Old Value', 'New Value', 'Justification'];
      const lines = rows.map((r: any) => [
        r.action,
        r.entity_type,
        r.entity_id,
        r.actor_id ?? '',
        r.created_at ? new Date(r.created_at).toLocaleString() : '',
        r.old_value ? JSON.stringify(r.old_value) : '',
        r.new_value ? JSON.stringify(r.new_value) : '',
        r.justification ?? '',
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const csv = [headers.join(','), ...lines].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `fp-audit-${id?.slice(0, 8)}.csv`;
      a.click();
      toast.success(`Exported ${rows.length} audit entries`);
    } catch (e: any) {
      toast.error(e?.message || 'Export failed');
    }
  }

  const { data: latestAssessment } = useQuery({
    queryKey: ['fp_latest_assessment', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_assessments')
        .select('id').eq('individual_id', id!).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const latestAssessmentId = latestAssessment?.id ?? null;

  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  if (!person) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Not found or access denied.</div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={person.full_name}
          description={`${person.nationality || 'Unknown nationality'}${person.national_id ? ` · ID ${person.national_id}` : ''}`}
          backHref="/fit-and-proper"
          backLabel="Register"
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="outline">{person.status}</Badge>
              <Button data-rbac="fit_and_proper.export" size="sm" variant="outline" onClick={exportAuditHistory}>
                <Download className="h-4 w-4 mr-2" /> Export history
              </Button>
              <HistoryButton entityType="fp_individual" entityId={person.id} title={`Individual history — ${person.full_name}`} />
            </div>
          }
        />

        <Card><CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className="text-xs text-muted-foreground">Date of birth</div><div>{person.date_of_birth || '—'}</div></div>
          <div><div className="text-xs text-muted-foreground">Email</div><div>{person.email || '—'}</div></div>
          <div><div className="text-xs text-muted-foreground">Phone</div><div>{person.phone || '—'}</div></div>
          <div><div className="text-xs text-muted-foreground">Address</div><div>{person.address || '—'}</div></div>
        </CardContent></Card>

        <Tabs defaultValue="roles">
          <TabsList>
            <TabsTrigger value="roles">Roles ({roles?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="assessments">Assessments</TabsTrigger>
            <TabsTrigger value="screening">Screening</TabsTrigger>
            <TabsTrigger value="determinations">Determinations</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="appeals">Appeals</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
            <TabsTrigger value="findings">Findings ({allFindings.length})</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <Card><CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Roles link this individual to regulated entities. Adding a role enables role-change / material-change initiation.
                </div>
                <div className="flex gap-2">
                  <Button data-rbac="fit_and_proper.edit" size="sm" variant="outline" onClick={runCycleNow} disabled={runningCycle}>
                    {runningCycle ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                    Run cycle scheduler
                  </Button>
                  <Dialog open={addRoleOpen} onOpenChange={setAddRoleOpen}>
                    <DialogTrigger asChild>
                      <Button data-rbac="fit_and_proper.create" size="sm"><Plus className="h-4 w-4 mr-2" /> Add role</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add role linkage</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div>
                          <Label>Role type *</Label>
                          <Select value={roleForm.role_type} onValueChange={(v) => setRoleForm({ ...roleForm, role_type: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{ROLE_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>
                            ))}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Role title (optional)</Label>
                          <Input value={roleForm.role_title} onChange={(e) => setRoleForm({ ...roleForm, role_title: e.target.value })} placeholder="e.g. Board Member" />
                        </div>
                        <div>
                          <Label>Licensee</Label>
                          <Select value={roleForm.licensee_id} onValueChange={(v) => setRoleForm({ ...roleForm, licensee_id: v })}>
                            <SelectTrigger><SelectValue placeholder="No licensee link" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No licensee link</SelectItem>
                              {(licensees as any[]).map((l) => (
                                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Effective from</Label>
                            <Input type="date" value={roleForm.effective_from} onChange={(e) => setRoleForm({ ...roleForm, effective_from: e.target.value })} />
                          </div>
                          <div>
                            <Label>Reassessment cycle (months)</Label>
                            <Input type="number" min={1} max={120} value={roleForm.reassessment_cycle_months} onChange={(e) => setRoleForm({ ...roleForm, reassessment_cycle_months: e.target.value })} placeholder="e.g. 24" />
                          </div>
                        </div>
                        {!person?.user_id && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                            This individual has no linked user account. After adding the role, send a declaration invitation manually via the <Link to="/fit-and-proper/invitations" className="underline">Invitation Tracker</Link>.
                          </p>
                        )}
                      </div>
                      <DialogFooter>
                        <Button variant="ghost" onClick={() => setAddRoleOpen(false)}>Cancel</Button>
                        <Button data-rbac="fit_and_proper.create" onClick={() => addRole.mutate()} disabled={addRole.isPending}>
                          {addRole.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save role
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              {(roles ?? []).length === 0 && <p className="text-sm text-muted-foreground">No roles linked yet.</p>}
              {(roles ?? []).map((r: any) => {
                const editVal = cycleEdits[r.id];
                const shown = editVal !== undefined ? editVal : (r.reassessment_cycle_months ?? '');
                return (
                  <div key={r.id} className="border rounded p-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{r.role_type.replace(/_/g, ' ')}{r.role_title ? ` — ${r.role_title}` : ''}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.licensee_id ? <Link to={`/admin/licensees/${r.licensee_id}`} className="underline">Licensee {String(r.licensee_id).slice(0, 8)}…</Link> : 'No licensee link'}
                          {' · '}{r.effective_from || '?'} → {r.effective_to || 'present'}
                        </div>
                      </div>
                      {r.is_current && <Badge variant="outline" className="bg-green-100 text-green-800">current</Badge>}
                    </div>
                    {r.is_current && (
                      <div className="flex items-end gap-2 pt-2 border-t">
                        <div className="flex-1">
                          <label className="text-xs text-muted-foreground">Reassessment cycle (months)</label>
                          <Input
                            type="number" min={1} max={120} placeholder="e.g. 24"
                            value={shown}
                            onChange={(e) => setCycleEdits((s) => ({ ...s, [r.id]: e.target.value }))}
                            className="h-8"
                          />
                        </div>
                        <div className="text-xs text-muted-foreground pb-1">
                          Next due: {r.next_reassessment_due || '—'}
                          {r.last_reassessment_at && <> · Last: {new Date(r.last_reassessment_at).toLocaleDateString()}</>}
                        </div>
                        <Button data-rbac="fit_and_proper.edit" size="sm" variant="outline" onClick={() => saveCycle(r.id)} disabled={editVal === undefined}>
                          <Save className="h-4 w-4 mr-1" /> Save
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="assessments">
            {id && <FpAssessmentsPanel individualId={id} />}
          </TabsContent>

          <TabsContent value="screening">
            {id && <FpScreeningPanel individualId={id} assessmentId={latestAssessmentId} />}
          </TabsContent>

          <TabsContent value="determinations">
            {id && <FpDeterminationsPanel individualId={id} assessmentId={latestAssessmentId} />}
          </TabsContent>

          <TabsContent value="conditions">
            {id && <FpConditionsPanel individualId={id} />}
          </TabsContent>

          <TabsContent value="appeals">
            {id && <FpAppealsPanel individualId={id} />}
          </TabsContent>

          <TabsContent value="monitoring">
            {id && <FpMonitoringPanel individualId={id} />}
          </TabsContent>

          {/* C1a — Findings severity log across all assessments */}
          <TabsContent value="findings">
            <Card><CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="text-sm font-medium">Findings across all assessments</div>
                <div className="flex gap-2 ml-auto">
                  <Select value={findingsSeverity} onValueChange={setFindingsSeverity}>
                    <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Severity" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All severities</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={findingsStatus} onValueChange={setFindingsStatus}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="true_positive">True positive</SelectItem>
                      <SelectItem value="false_positive">False positive</SelectItem>
                      <SelectItem value="needs_review">Needs review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {filteredFindings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No findings match the current filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Route</TableHead>
                        <TableHead>Check type</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Assessment</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredFindings.map((f: any) => {
                        const routing = ROUTING_BADGE[f.severity] || ROUTING_BADGE.low;
                        return (
                          <TableRow key={f.id} className={f.is_false_positive ? 'opacity-60' : ''}>
                            <TableCell className="text-sm font-medium max-w-xs truncate">{f.title}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={SEVERITY_CLASS[f.severity] || SEVERITY_CLASS.low}>
                                {f.severity}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={routing.className}>{routing.label}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{f.check_type}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{f.source || '—'}</TableCell>
                            <TableCell className="text-xs">
                              {f.resolution_status ? String(f.resolution_status).replace(/_/g, ' ') : 'pending'}
                            </TableCell>
                            <TableCell className="text-xs">
                              {f.assessment_id && (
                                <Link to={`/fit-and-proper/assessments/${f.assessment_id}`} className="text-blue-700 underline inline-flex items-center gap-1">
                                  <ExternalLink className="h-3 w-3" /> Open
                                </Link>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">{f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent></Card>
          </TabsContent>

          {/* C2 — Risk history chart */}
          <TabsContent value="risk">
            <Card><CardContent className="p-4 space-y-4">
              <div className="text-sm font-medium">Finding severity by assessment</div>
              {chartData.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No assessment data to chart yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="high" name="High" fill="#ef4444" />
                    <Bar dataKey="medium" name="Medium" fill="#f59e0b" />
                    <Bar dataKey="low" name="Low" fill="#94a3b8" />
                  </BarChart>
                </ResponsiveContainer>
              )}

              {/* Summary stats */}
              <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-red-600">
                    {(allFindings as any[]).filter((f) => f.severity === 'high' && !f.is_false_positive).length}
                  </div>
                  <div className="text-xs text-muted-foreground">High severity</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-amber-600">
                    {(allFindings as any[]).filter((f) => f.severity === 'medium' && !f.is_false_positive).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Medium severity</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold text-slate-600">
                    {(allFindings as any[]).filter((f) => !f.is_false_positive).length}
                  </div>
                  <div className="text-xs text-muted-foreground">Total active</div>
                </div>
              </div>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
