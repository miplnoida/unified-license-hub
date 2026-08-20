import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Plus, Gavel, ExternalLink, Pencil } from 'lucide-react';
import { logAction } from '@/hooks/useAuditLog';

const SEVERITY_META: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-700' },
  medium: { label: 'Medium', className: 'bg-amber-100 text-amber-800' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-800' },
  critical: { label: 'Critical', className: 'bg-red-100 text-red-800' },
};

const FINDING_STATUS: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-blue-100 text-blue-800' },
  in_progress: { label: 'In progress', className: 'bg-indigo-100 text-indigo-800' },
  closed: { label: 'Closed', className: 'bg-emerald-100 text-emerald-800' },
};

type FindingForm = {
  id?: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommended_action: string;
  follow_up_owner: string;
  follow_up_due: string;
  status: 'open' | 'in_progress' | 'closed';
};

const EMPTY: FindingForm = {
  category: '',
  severity: 'medium',
  description: '',
  recommended_action: '',
  follow_up_owner: '',
  follow_up_due: '',
  status: 'open',
};

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [findingOpen, setFindingOpen] = useState(false);
  const [findingForm, setFindingForm] = useState<FindingForm>(EMPTY);
  const [inspectionEditOpen, setInspectionEditOpen] = useState(false);
  const [inspEdit, setInspEdit] = useState<any>({});

  const { data: inspection, isLoading } = useQuery({
    queryKey: ['inspection', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('inspections').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: licensee } = useQuery({
    queryKey: ['inspection_licensee', inspection?.entity_id],
    enabled: !!inspection?.entity_id,
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name').eq('id', inspection!.entity_id).maybeSingle();
      return data;
    },
  });

  const { data: findings } = useQuery({
    queryKey: ['inspection_findings', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('inspection_findings').select('*').eq('inspection_id', id!).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openNewFinding = () => { setFindingForm({ ...EMPTY }); setFindingOpen(true); };
  const openEditFinding = (f: any) => {
    setFindingForm({
      id: f.id,
      category: f.category ?? '',
      severity: f.severity,
      description: f.description ?? '',
      recommended_action: f.recommended_action ?? '',
      follow_up_owner: f.follow_up_owner ?? '',
      follow_up_due: f.follow_up_due ?? '',
      status: f.status,
    });
    setFindingOpen(true);
  };

  const openEditInspection = () => {
    setInspEdit({
      status: inspection?.status ?? 'scheduled',
      scheduled_date: inspection?.scheduled_date ?? inspection?.date_conducted ?? '',
      location: inspection?.location ?? '',
      scope: inspection?.scope ?? '',
      inspector_name: inspection?.inspector_name ?? '',
      findings_summary: inspection?.findings_summary ?? '',
      compliance_rating: inspection?.compliance_rating ?? 'satisfactory',
    });
    setInspectionEditOpen(true);
  };

  const saveInspection = useMutation({
    mutationFn: async () => {
      const patch: any = { ...inspEdit };
      if (!patch.scheduled_date) patch.scheduled_date = null;
      const { error } = await supabase.from('inspections').update(patch).eq('id', id!);
      if (error) throw error;
      await logAction('inspection.updated', 'inspections', id!, { after: patch });
    },
    onSuccess: () => {
      toast.success('Inspection updated');
      setInspectionEditOpen(false);
      qc.invalidateQueries({ queryKey: ['inspection', id] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const saveFinding = useMutation({
    mutationFn: async () => {
      if (findingForm.category.trim().length < 2) throw new Error('Category required');
      if (findingForm.description.trim().length < 10) throw new Error('Description required (min 10 chars)');
      const payload: any = {
        inspection_id: id,
        category: findingForm.category.trim(),
        severity: findingForm.severity,
        description: findingForm.description.trim(),
        recommended_action: findingForm.recommended_action.trim() || null,
        follow_up_owner: findingForm.follow_up_owner.trim() || null,
        follow_up_due: findingForm.follow_up_due || null,
        status: findingForm.status,
      };
      const { error } = await (supabase as any).rpc('inspection_finding_save', {
        _inspection_id: id,
        _category: payload.category,
        _severity: payload.severity,
        _description: payload.description,
        _finding_id: findingForm.id || null,
        _recommended_action: payload.recommended_action,
        _follow_up_owner: payload.follow_up_owner,
        _follow_up_due: payload.follow_up_due,
        _status: payload.status,
      });
      if (error) throw error;
      // Authoritative audit event is written by the governed operation.
    },
    onSuccess: () => {
      toast.success('Finding saved');
      setFindingOpen(false);
      qc.invalidateQueries({ queryKey: ['inspection_findings', id] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const escalate = useMutation({
    mutationFn: async (finding: any) => {
      if (!inspection?.entity_id) throw new Error('Missing licensee');
      const desc = `Inspection finding: ${finding.category} (${finding.severity})\n\n${finding.description}` +
        (finding.recommended_action ? `\n\nRecommended action: ${finding.recommended_action}` : '');
      const { data, error } = await (supabase as any).rpc('inspection_finding_escalate', {
        _finding_id: finding.id,
        _entity_id: inspection.entity_id,
        _enforcement_type: 'inspection_finding',
        _rationale: desc,
      });
      if (error) throw error;
      // Authoritative audit event + case event are written by the governed operation.
      return (data as any)?.enforcement_case_id as string;
    },
    onSuccess: (newId) => {
      toast.success('Escalated to enforcement');
      qc.invalidateQueries({ queryKey: ['inspection_findings', id] });
      navigate(`/enforcement/${newId}`);
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  if (isLoading) return (
    <DashboardLayout>
      <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading inspection…</div>
    </DashboardLayout>
  );

  if (!inspection) return (
    <DashboardLayout>
      <PageHeader title="Inspection not found" />
      <Button variant="outline" asChild><Link to="/inspections">← Back to queue</Link></Button>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <PageHeader
        title={`Inspection · ${licensee?.name ?? '—'}`}
        description={`${inspection.inspection_type} · scheduled ${inspection.scheduled_date ?? inspection.date_conducted ?? '—'}`}
        actions={<Button variant="outline" asChild><Link to="/inspections">← Queue</Link></Button>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Summary</CardTitle>
            <Button data-rbac="market_conduct.edit" size="sm" variant="outline" onClick={openEditInspection}><Pencil className="h-3 w-3 mr-1" />Edit</Button>
          </CardHeader>
          <CardContent className="text-sm grid grid-cols-2 gap-3">
            <Field label="Status" value={<Badge className="capitalize">{inspection.status.replace('_', ' ')}</Badge>} />
            <Field label="Type" value={<span className="capitalize">{inspection.inspection_type}</span>} />
            <Field label="Scheduled" value={inspection.scheduled_date ? new Date(inspection.scheduled_date).toLocaleDateString() : '—'} />
            <Field label="Conducted" value={inspection.date_conducted ? new Date(inspection.date_conducted).toLocaleDateString() : '—'} />
            <Field label="Inspector" value={inspection.inspector_name || '—'} />
            <Field label="Compliance rating" value={<span className="capitalize">{inspection.compliance_rating || '—'}</span>} />
            <Field label="Location" value={inspection.location || '—'} />
            <Field label="Scope" value={inspection.scope || '—'} />
            <div className="col-span-2">
              <div className="text-xs text-muted-foreground mb-1">Summary</div>
              <div className="whitespace-pre-wrap">{inspection.findings_summary || '—'}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Licensee</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="font-medium">{licensee?.name ?? '—'}</div>
            {inspection.entity_id && (
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link to={`/admin/licensees/${inspection.entity_id}`}>Open licensee <ExternalLink className="h-3 w-3 ml-1" /></Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Findings ({findings?.length ?? 0})</CardTitle>
          <Button data-rbac="market_conduct.edit" size="sm" onClick={openNewFinding}><Plus className="h-3 w-3 mr-1" />Add finding</Button>
        </CardHeader>
        <CardContent>
          {!findings || findings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No findings recorded.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Category</th>
                    <th className="p-2">Severity</th>
                    <th className="p-2">Description</th>
                    <th className="p-2">Owner</th>
                    <th className="p-2">Due</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f: any) => {
                    const sev = SEVERITY_META[f.severity] ?? SEVERITY_META.medium;
                    const st = FINDING_STATUS[f.status] ?? FINDING_STATUS.open;
                    const canEscalate = (f.severity === 'high' || f.severity === 'critical') && !f.escalated_enforcement_id;
                    return (
                      <tr key={f.id} className="border-b hover:bg-muted/40 align-top">
                        <td className="p-2 font-medium">{f.category}</td>
                        <td className="p-2"><Badge className={sev.className}>{sev.label}</Badge></td>
                        <td className="p-2 max-w-md">
                          <div className="line-clamp-2">{f.description}</div>
                          {f.recommended_action && <div className="text-xs text-muted-foreground mt-1">→ {f.recommended_action}</div>}
                        </td>
                        <td className="p-2">{f.follow_up_owner || '—'}</td>
                        <td className="p-2 text-xs">{f.follow_up_due ? new Date(f.follow_up_due).toLocaleDateString() : '—'}</td>
                        <td className="p-2">
                          <Badge className={st.className}>{st.label}</Badge>
                          {f.escalated_enforcement_id && (
                            <Link to={`/enforcement/${f.escalated_enforcement_id}`} className="block text-xs text-red-700 hover:underline mt-1 inline-flex items-center gap-1">
                              Enforcement <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </td>
                        <td className="p-2 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEditFinding(f)}><Pencil className="h-3 w-3" /></Button>
                            {canEscalate && (
                              <Button data-rbac="inspection_management.edit" size="sm" variant="destructive" onClick={() => escalate.mutate(f)} disabled={escalate.isPending}>
                                <Gavel className="h-3 w-3 mr-1" />Escalate
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Finding dialog */}
      <Dialog open={findingOpen} onOpenChange={setFindingOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{findingForm.id ? 'Edit finding' : 'New finding'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2 md:col-span-1"><Label>Category</Label><Input value={findingForm.category} onChange={(e) => setFindingForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Governance, AML, Capital" /></div>
            <div><Label>Severity</Label>
              <Select value={findingForm.severity} onValueChange={(v: any) => setFindingForm(f => ({ ...f, severity: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(SEVERITY_META).map(k => <SelectItem key={k} value={k}>{SEVERITY_META[k].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Description</Label><Textarea rows={3} value={findingForm.description} onChange={(e) => setFindingForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Recommended action</Label><Textarea rows={2} value={findingForm.recommended_action} onChange={(e) => setFindingForm(f => ({ ...f, recommended_action: e.target.value }))} /></div>
            <div><Label>Follow-up owner</Label><Input value={findingForm.follow_up_owner} onChange={(e) => setFindingForm(f => ({ ...f, follow_up_owner: e.target.value }))} /></div>
            <div><Label>Follow-up due</Label><Input type="date" value={findingForm.follow_up_due} onChange={(e) => setFindingForm(f => ({ ...f, follow_up_due: e.target.value }))} /></div>
            <div><Label>Status</Label>
              <Select value={findingForm.status} onValueChange={(v: any) => setFindingForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(FINDING_STATUS).map(k => <SelectItem key={k} value={k}>{FINDING_STATUS[k].label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFindingOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.edit" onClick={() => saveFinding.mutate()} disabled={saveFinding.isPending}>
              {saveFinding.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit inspection dialog */}
      <Dialog open={inspectionEditOpen} onOpenChange={setInspectionEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Edit inspection</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><Label>Status</Label>
              <Select value={inspEdit.status} onValueChange={(v) => setInspEdit((x: any) => ({ ...x, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Scheduled date</Label><Input type="date" value={inspEdit.scheduled_date ?? ''} onChange={(e) => setInspEdit((x: any) => ({ ...x, scheduled_date: e.target.value }))} /></div>
            <div><Label>Inspector</Label><Input value={inspEdit.inspector_name ?? ''} onChange={(e) => setInspEdit((x: any) => ({ ...x, inspector_name: e.target.value }))} /></div>
            <div><Label>Compliance rating</Label>
              <Select value={inspEdit.compliance_rating} onValueChange={(v) => setInspEdit((x: any) => ({ ...x, compliance_rating: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="satisfactory">Satisfactory</SelectItem>
                  <SelectItem value="needs_improvement">Needs improvement</SelectItem>
                  <SelectItem value="unsatisfactory">Unsatisfactory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Location</Label><Input value={inspEdit.location ?? ''} onChange={(e) => setInspEdit((x: any) => ({ ...x, location: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Scope</Label><Input value={inspEdit.scope ?? ''} onChange={(e) => setInspEdit((x: any) => ({ ...x, scope: e.target.value }))} /></div>
            <div className="col-span-2"><Label>Summary</Label><Textarea rows={3} value={inspEdit.findings_summary ?? ''} onChange={(e) => setInspEdit((x: any) => ({ ...x, findings_summary: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectionEditOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.edit" onClick={() => saveInspection.mutate()} disabled={saveInspection.isPending}>
              {saveInspection.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
}
