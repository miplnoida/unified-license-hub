import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { Loader2, Plus, ArrowRight, ArrowLeft, ShieldAlert } from 'lucide-react';
import { THEMATIC_STATUSES } from './ThematicReviews';
import { ThematicClosurePanel } from '@/components/supervision/ThematicClosurePanel';
import { ThematicFollowUpRegister } from '@/components/supervision/ThematicFollowUpRegister';
import { thematicReviewSetStatus, thematicReviewFindingSave, thematicReviewFindingIssue, thematicReviewActionSave, thematicReviewActionComplete, thematicReviewActionWaive } from '@/lib/supervisoryGovernedOps';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', scoped: 'Scoped', evidence_collection: 'Evidence Collection',
  analysis: 'Analysis', findings_issued: 'Findings Issued',
  actions_required: 'Actions Required', monitoring: 'Monitoring', closed: 'Closed',
};
const CLOSURE_LABEL: Record<string, string> = {
  not_requested: 'Not requested', pending_approval: 'Pending approval',
  approved: 'Approved', rejected: 'Rejected',
};

export default function ThematicReviewDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [review, setReview] = useState<any | null>(null);
  const [entities, setEntities] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [monResults, setMonResults] = useState<any[]>([]);
  const [leadOfficer, setLeadOfficer] = useState<{ full_name: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const [transition, setTransition] = useState<{ to: string; needsOverride: boolean } | null>(null);
  const [transitionReason, setTransitionReason] = useState('');
  const [overrideOpen, setOverrideOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [rv, ent, prod, fnd, evd, act, hist, mr] = await Promise.all([
      supabase.from('thematic_reviews' as any).select('*').eq('id', id).maybeSingle(),
      supabase.from('thematic_review_entities' as any).select('*, licensees(id,name,status)').eq('review_id', id),
      supabase.from('thematic_review_products' as any).select('*, conduct_products(id,name)').eq('review_id', id),
      supabase.from('thematic_review_findings' as any).select('*, licensees(id,name)').eq('review_id', id).order('created_at', { ascending: false }),
      supabase.from('thematic_review_evidence' as any).select('*').eq('review_id', id).order('collected_at', { ascending: false }).limit(100),
      supabase.from('thematic_review_actions' as any).select('*, licensees(id,name)').eq('review_id', id).order('created_at', { ascending: false }),
      supabase.from('thematic_review_status_history' as any).select('*').eq('review_id', id).order('changed_at', { ascending: false }),
      supabase.from('conduct_monitoring_results' as any).select('*, conduct_monitoring_rules(name)').eq('thematic_review_id', id).order('evaluated_at', { ascending: false }).limit(50),
    ]);
    setReview(rv.data);
    setEntities((ent.data as any[]) || []);
    setProducts((prod.data as any[]) || []);
    setFindings((fnd.data as any[]) || []);
    setEvidence((evd.data as any[]) || []);
    setActions((act.data as any[]) || []);
    setHistory((hist.data as any[]) || []);
    setMonResults((mr.data as any[]) || []);
    const leadId = (rv.data as any)?.lead_officer_id;
    if (leadId) {
      const { data: lo } = await supabase.from('profiles').select('full_name,email').eq('id', leadId).maybeSingle();
      setLeadOfficer((lo as any) || null);
    } else {
      setLeadOfficer(null);
    }
    setLoading(false);
  };

  useEffect(() => { load();   }, [id]);

  const currentIdx = useMemo(() => THEMATIC_STATUSES.indexOf(review?.status || 'draft'), [review]);

  const runTransition = async (targetStatus: string, override_id?: string, reason?: string) => {
    try {
      const { authorizedAction } = await import('@/lib/rbac/authorizedAction');
      await authorizedAction('market_conduct', 'edit', { review_id: id, target_status: targetStatus });
      await thematicReviewSetStatus(id!, targetStatus, reason || null, override_id || null);
      await logAction('thematic_review.status_changed', 'thematic_review', id, {
        before: { status: review.status }, after: { status: targetStatus },
        meta: { reason: reason || null, override_id: override_id || null },
      });
      toast.success(`Status changed → ${STATUS_LABEL[targetStatus]}`);
      setTransition(null); setTransitionReason('');
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading || !review) {
    return <DashboardLayout><div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div></DashboardLayout>;
  }

  const forwardStatus = THEMATIC_STATUSES[currentIdx + 1];
  const backwardStatus = THEMATIC_STATUSES[currentIdx - 1];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={review.title}
          description={`${review.code || ''} · ${STATUS_LABEL[review.status]}`}
          backHref="/supervision/thematic-reviews"
          backLabel="Back to list"
          actions={
            <div className="flex gap-2">
              {backwardStatus && review.status !== 'closed' && (
                <Button data-rbac="prudential_supervision.edit" variant="outline" size="sm" onClick={() => setTransition({ to: backwardStatus, needsOverride: true })}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Move back
                </Button>
              )}
              {forwardStatus && forwardStatus !== 'closed' && (
                <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => setTransition({ to: forwardStatus, needsOverride: false })}>
                  Advance → {STATUS_LABEL[forwardStatus]} <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              )}
              {forwardStatus === 'closed' && (
                <Badge variant="outline" className="self-center">Closure requires report publication & approval</Badge>
              )}
            </div>
          }
        />

        {/* Lifecycle bar */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {THEMATIC_STATUSES.map((s, i) => (
            <div key={s} className="flex items-center gap-1 whitespace-nowrap">
              <Badge variant={i <= currentIdx ? 'default' : 'outline'} className="text-xs">{STATUS_LABEL[s]}</Badge>
              {i < THEMATIC_STATUSES.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
            </div>
          ))}
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="scope">Scope ({entities.length + products.length})</TabsTrigger>
            <TabsTrigger value="evidence">Evidence ({evidence.length})</TabsTrigger>
            <TabsTrigger value="findings">Findings ({findings.length})</TabsTrigger>
            <TabsTrigger value="actions">Actions ({actions.length})</TabsTrigger>
            <TabsTrigger value="monitoring">Monitoring ({monResults.length})</TabsTrigger>
            <TabsTrigger value="followup">Follow-up register</TabsTrigger>
            <TabsTrigger value="closure">Report & Closure</TabsTrigger>
            <TabsTrigger value="history">History ({history.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <Card><CardContent className="pt-6 grid md:grid-cols-2 gap-4 text-sm">
              <Info label="Code" value={review.code || '—'} />
              <Info label="Status" value={STATUS_LABEL[review.status]} />
              <Info label="Scope" value={`${review.scope_start || '—'} → ${review.scope_end || '—'}`} />
              <Info label="Opened" value={review.opened_at ? new Date(review.opened_at).toLocaleString() : '—'} />
              <Info label="Closed" value={review.closed_at ? new Date(review.closed_at).toLocaleString() : '—'} />
              <Info label="Lead officer" value={leadOfficer?.full_name || leadOfficer?.email || '—'} />
              <Info label="Closure state" value={CLOSURE_LABEL[review.closure_state] || review.closure_state || '—'} />
              <Info label="Closure requested" value={review.closure_requested_at ? new Date(review.closure_requested_at).toLocaleString() : '—'} />
              <div className="md:col-span-2"><Info label="Hypothesis" value={review.hypothesis || '—'} /></div>
              <div className="md:col-span-2"><Info label="Description" value={review.description || '—'} /></div>
              {review.closure_summary && <div className="md:col-span-2"><Info label="Closure summary" value={review.closure_summary} /></div>}
              {review.closure_rejection_reason && review.closure_state === 'rejected' && (
                <div className="md:col-span-2"><Info label="Closure rejection reason" value={review.closure_rejection_reason} /></div>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="followup" className="mt-4">
            <ThematicFollowUpRegister reviewId={id} rows={actions} onChange={load} />
          </TabsContent>
          <TabsContent value="closure" className="mt-4">
            <ThematicClosurePanel reviewId={id} review={review} findings={findings} actions={actions} onChange={load} />
          </TabsContent>


          <TabsContent value="scope" className="mt-4"><ScopeTab reviewId={id} entities={entities} products={products} onChange={load} /></TabsContent>
          <TabsContent value="evidence" className="mt-4"><EvidenceTab reviewId={id} rows={evidence} findings={findings} onChange={load} /></TabsContent>
          <TabsContent value="findings" className="mt-4"><FindingsTab reviewId={id} rows={findings} entities={entities} onChange={load} /></TabsContent>
          <TabsContent value="actions" className="mt-4"><ActionsTab reviewId={id} rows={actions} findings={findings} entities={entities} onChange={load} /></TabsContent>
          <TabsContent value="monitoring" className="mt-4">
            <Card><CardContent className="p-0">
              {monResults.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">No monitoring results linked to this review yet.</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Rule</TableHead><TableHead>Matched</TableHead><TableHead>Risk Δ</TableHead>
                    <TableHead>Evaluated</TableHead><TableHead>Notes</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>{monResults.map(m => (
                    <TableRow key={m.id}>
                      <TableCell>{m.conduct_monitoring_rules?.name || m.rule_id}</TableCell>
                      <TableCell>{m.matched ? <Badge variant="destructive">Matched</Badge> : <Badge variant="outline">No</Badge>}</TableCell>
                      <TableCell>{m.risk_delta_applied}</TableCell>
                      <TableCell className="text-xs">{new Date(m.evaluated_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{m.notes || '—'}</TableCell>
                    </TableRow>))}</TableBody>
                </Table>
              )}
            </CardContent></Card>
          </TabsContent>
          <TabsContent value="history" className="mt-4"><HistoryTab rows={history} /></TabsContent>
        </Tabs>
      </div>

      {/* Forward transition dialog */}
      <Dialog open={!!transition && !transition.needsOverride} onOpenChange={o => !o && setTransition(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Advance to {transition ? STATUS_LABEL[transition.to] : ''}</DialogTitle></DialogHeader>
          <Label>Reason / note (optional)</Label>
          <Textarea rows={3} value={transitionReason} onChange={e => setTransitionReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransition(null)}>Cancel</Button>
            <Button onClick={() => transition && runTransition(transition.to, undefined, transitionReason || undefined)}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backward → override required */}
      {transition?.needsOverride && (
        <OverrideReasonDialog
          open
          onOpenChange={o => !o && setTransition(null)}
          module="supervisory_plans"
          entityType="thematic_review"
          entityId={id}
          ruleKey="thematic_review.lifecycle.backward_transition"
          originalValue={{ status: review.status }}
          overriddenValue={{ status: transition.to }}
          title="Move review backward"
          description={`Regress lifecycle from ${STATUS_LABEL[review.status]} to ${STATUS_LABEL[transition.to]}. This requires a justification for the override framework.`}
          confirmLabel="Override & regress"
          onOverridden={async (overrideId) => { await runTransition(transition.to, overrideId, 'Backward lifecycle transition'); }}
        />
      )}
    </DashboardLayout>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return <div><p className="text-xs uppercase text-muted-foreground">{label}</p><p className="text-sm mt-0.5 whitespace-pre-wrap">{String(value ?? '—')}</p></div>;
}

/* ---------------- Scope tab ---------------- */
function ScopeTab({ reviewId, entities, products, onChange }: any) {
  const [entQ, setEntQ] = useState('');
  const [entOpts, setEntOpts] = useState<any[]>([]);
  const [prodList, setProdList] = useState<any[]>([]);
  const [addingProd, setAddingProd] = useState('');

  useEffect(() => {
    const t = setTimeout(async () => {
      if (entQ.trim().length < 2) { setEntOpts([]); return; }
      const { data } = await supabase.from('licensees').select('id,name,status').ilike('name', `%${entQ}%`).limit(10);
      setEntOpts((data as any[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [entQ]);

  useEffect(() => {
    supabase.from('conduct_products' as any).select('id,name').eq('active', true).order('name')
      .then(r => setProdList((r.data as any[]) || []));
  }, []);

  const addEntity = async (lic: any) => {
    const { error } = await supabase.from('thematic_review_entities' as any)
      .insert({ review_id: reviewId, licensee_id: lic.id });
    if (error) toast.error(error.message);
    else { toast.success('Added'); setEntQ(''); setEntOpts([]); onChange(); }
    await logAction('thematic_review.entity_added', 'thematic_review', reviewId, { meta: { licensee_id: lic.id } });
  };
  const removeEntity = async (id: string) => {
    if (!confirm('Remove this licensee from scope?')) return;
    await supabase.from('thematic_review_entities' as any).delete().eq('id', id);
    await logAction('thematic_review.entity_removed', 'thematic_review', reviewId, { meta: { entity_row_id: id } });
    onChange();
  };
  const addProduct = async () => {
    if (!addingProd) return;
    const { error } = await supabase.from('thematic_review_products' as any)
      .insert({ review_id: reviewId, product_id: addingProd });
    if (error) toast.error(error.message);
    else { setAddingProd(''); onChange(); }
    await logAction('thematic_review.product_added', 'thematic_review', reviewId, { meta: { product_id: addingProd } });
  };
  const removeProduct = async (id: string) => {
    await supabase.from('thematic_review_products' as any).delete().eq('id', id);
    await logAction('thematic_review.product_removed', 'thematic_review', reviewId, { meta: { row_id: id } });
    onChange();
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Licensees ({entities.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="Search to add…" value={entQ} onChange={e => setEntQ(e.target.value)} />
          {entOpts.length > 0 && (
            <div className="border rounded-md max-h-40 overflow-auto">
              {entOpts.map(o => (
                <button key={o.id} className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0" onClick={() => addEntity(o)}>
                  {o.name}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1 pt-2">
            {entities.map((e: any) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b pb-1">
                <span>{e.licensees?.name || e.licensee_id}</span>
                <Button data-rbac="prudential_supervision.edit" variant="ghost" size="sm" onClick={() => removeEntity(e.id)}>Remove</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Products ({products.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <select className="flex-1 h-10 rounded-md border bg-background px-3" value={addingProd} onChange={e => setAddingProd(e.target.value)}>
              <option value="">— Select product —</option>
              {prodList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <Button onClick={addProduct} disabled={!addingProd}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1 pt-2">
            {products.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b pb-1">
                <span>{p.conduct_products?.name || p.product_id}</span>
                <Button data-rbac="prudential_supervision.edit" variant="ghost" size="sm" onClick={() => removeProduct(p.id)}>Remove</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Evidence tab ---------------- */
function EvidenceTab({ reviewId, rows, findings, onChange }: any) {
  const [form, setForm] = useState({ source_type: 'document', source_ref: '', notes: '', finding_id: '' });
  const [saving, setSaving] = useState(false);
  const add = async () => {
    setSaving(true);
    const { error } = await supabase.from('thematic_review_evidence' as any).insert({
      review_id: reviewId,
      source_type: form.source_type,
      source_ref: form.source_ref || null,
      notes: form.notes || null,
      finding_id: form.finding_id || null,
    });
    if (error) toast.error(error.message);
    else { setForm({ source_type: 'document', source_ref: '', notes: '', finding_id: '' }); onChange(); toast.success('Evidence recorded'); }
    await logAction('thematic_review.evidence_added', 'thematic_review', reviewId, { meta: form });
    setSaving(false);
  };
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <CardHeader><CardTitle className="text-base">Record evidence</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Label>Source type</Label>
          <select className="w-full h-10 rounded-md border bg-background px-3" value={form.source_type} onChange={e => setForm({ ...form, source_type: e.target.value })}>
            <option value="document">Document</option>
            <option value="interview">Interview</option>
            <option value="return">Return / filing</option>
            <option value="mystery_shop">Mystery shopping</option>
            <option value="complaint">Complaint</option>
            <option value="onsite">On-site</option>
            <option value="other">Other</option>
          </select>
          <Label>Reference</Label>
          <Input value={form.source_ref} onChange={e => setForm({ ...form, source_ref: e.target.value })} placeholder="URL, doc id, complaint code…" />
          <Label>Notes</Label>
          <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <Label>Linked finding (optional)</Label>
          <select className="w-full h-10 rounded-md border bg-background px-3" value={form.finding_id} onChange={e => setForm({ ...form, finding_id: e.target.value })}>
            <option value="">— None —</option>
            {findings.map((f: any) => <option key={f.id} value={f.id}>{f.title}</option>)}
          </select>
          <Button data-rbac="prudential_supervision.create" onClick={add} disabled={saving} className="w-full">{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Add evidence</Button>
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No evidence yet.</div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Notes</TableHead><TableHead>Collected</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell><Badge variant="outline">{r.source_type}</Badge></TableCell>
                  <TableCell className="text-xs">{r.source_ref || '—'}</TableCell>
                  <TableCell className="text-xs max-w-xs truncate">{r.notes || '—'}</TableCell>
                  <TableCell className="text-xs">{new Date(r.collected_at).toLocaleDateString()}</TableCell>
                </TableRow>))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Findings tab ---------------- */
function FindingsTab({ reviewId, rows, entities, onChange }: any) {
  const [form, setForm] = useState({ title: '', severity: 'medium', detail: '', root_cause: '', licensee_id: '' });
  const [saving, setSaving] = useState(false);
  const add = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const { authorizedAction } = await import('@/lib/rbac/authorizedAction');
    try { await authorizedAction('market_conduct', 'initiate_thematic_review', { review_id: reviewId, finding_title: form.title }); }
    catch (e: any) { toast.error(e?.message || 'Not authorized'); setSaving(false); return; }
    let data: any = null; let error: any = null;
    try {
      data = await thematicReviewFindingSave({
        review_id: reviewId, title: form.title.trim(), severity: form.severity,
        detail: form.detail || null, root_cause: form.root_cause || null,
        licensee_id: form.licensee_id || null,
      });
    } catch (e: any) { error = e; }
    if (error) toast.error(error.message);
    else {
      await logAction('thematic_review.finding_created', 'thematic_review_finding', (data as any).id, { after: form, meta: { review_id: reviewId } });
      setForm({ title: '', severity: 'medium', detail: '', root_cause: '', licensee_id: '' });
      onChange(); toast.success('Finding added');
    }
    setSaving(false);
  };
  const issue = async (f: any) => {
    const { authorizedAction } = await import('@/lib/rbac/authorizedAction');
    try { await authorizedAction('market_conduct', 'edit', { finding_id: f.id, action: 'issue' }); }
    catch (e: any) { toast.error(e?.message || 'Not authorized'); return; }
    let error: any = null;
    try { await thematicReviewFindingIssue(f.id); } catch (e: any) { error = e; }
    if (error) toast.error(error.message);
    else {
      await logAction('thematic_review.finding_issued', 'thematic_review_finding', f.id, { before: { status: f.status }, after: { status: 'issued' } });
      onChange();
    }
  };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Add finding</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div>
            <Label>Severity</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </select>
          </div>
          <div>
            <Label>Licensee (if entity-specific)</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3" value={form.licensee_id} onChange={e => setForm({ ...form, licensee_id: e.target.value })}>
              <option value="">— Thematic (all) —</option>
              {entities.map((e: any) => <option key={e.id} value={e.licensee_id}>{e.licensees?.name || e.licensee_id}</option>)}
            </select>
          </div>
          <div className="md:col-span-2"><Label>Detail</Label><Textarea rows={3} value={form.detail} onChange={e => setForm({ ...form, detail: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Root cause</Label><Textarea rows={2} value={form.root_cause} onChange={e => setForm({ ...form, root_cause: e.target.value })} /></div>
          <div className="md:col-span-2"><Button data-rbac="prudential_supervision.create" onClick={add} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Add finding</Button></div>
        </CardContent>
      </Card>
      <Card><CardContent className="p-0">
        {rows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No findings yet.</div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Title</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead>
              <TableHead>Licensee</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((f: any) => (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="font-medium">{f.title}</div>
                  {f.detail && <div className="text-xs text-muted-foreground line-clamp-1">{f.detail}</div>}
                </TableCell>
                <TableCell><SeverityBadge s={f.severity} /></TableCell>
                <TableCell><Badge variant={f.status === 'issued' ? 'default' : 'outline'}>{f.status}</Badge></TableCell>
                <TableCell className="text-xs">{f.licensees?.name || 'Thematic'}</TableCell>
                <TableCell className="text-right">
                  {f.status === 'draft' && <Button data-rbac="prudential_supervision.edit" size="sm" onClick={() => issue(f)}>Issue</Button>}
                </TableCell>
              </TableRow>))}</TableBody>
          </Table>
        )}
      </CardContent></Card>
    </div>
  );
}
function SeverityBadge({ s }: { s: string }) {
  const map: any = { critical: 'destructive', high: 'destructive', medium: 'default', low: 'outline' };
  return <Badge variant={map[s] || 'outline'}>{s}</Badge>;
}

/* ---------------- Actions tab ---------------- */
function ActionsTab({ reviewId, rows, findings, entities, onChange }: any) {
  const [form, setForm] = useState({ title: '', description: '', action_type: 'remediation', finding_id: '', licensee_id: '', due_date: '' });
  const [saving, setSaving] = useState(false);
  const [waiveTarget, setWaiveTarget] = useState<any | null>(null);

  const add = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    let data: any = null; let error: any = null;
    try {
      data = await thematicReviewActionSave({
        review_id: reviewId,
        title: form.title.trim(),
        description: form.description || null,
        action_type: form.action_type,
        finding_id: form.finding_id || null,
        licensee_id: form.licensee_id || null,
        due_date: form.due_date || null,
      });
    } catch (e: any) { error = e; }
    if (error) toast.error(error.message);
    else {
      await logAction('thematic_review.action_created', 'thematic_review_action', (data as any).id, { after: form, meta: { review_id: reviewId } });
      setForm({ title: '', description: '', action_type: 'remediation', finding_id: '', licensee_id: '', due_date: '' });
      onChange();
    }
    setSaving(false);
  };
  const complete = async (a: any) => {
    const evidence = prompt('Evidence of completion (URL, doc id or note):') || '';
    try { await thematicReviewActionComplete(a.id, evidence || null); }
    catch (e: any) { return toast.error(e.message); }
    await logAction('thematic_review.action_completed', 'thematic_review_action', a.id, { before: { status: a.status }, after: { status: 'completed' }, meta: { evidence } });
    onChange();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Add required action</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div><Label>Action type</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3" value={form.action_type} onChange={e => setForm({ ...form, action_type: e.target.value })}>
              <option value="remediation">Remediation</option>
              <option value="restitution">Restitution</option>
              <option value="policy_change">Policy change</option>
              <option value="training">Training</option>
              <option value="enforcement_referral">Enforcement referral</option>
              <option value="monitoring">Monitoring</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div><Label>Linked finding</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3" value={form.finding_id} onChange={e => setForm({ ...form, finding_id: e.target.value })}>
              <option value="">— None —</option>
              {findings.map((f: any) => <option key={f.id} value={f.id}>{f.title}</option>)}
            </select>
          </div>
          <div><Label>Assigned licensee</Label>
            <select className="w-full h-10 rounded-md border bg-background px-3" value={form.licensee_id} onChange={e => setForm({ ...form, licensee_id: e.target.value })}>
              <option value="">— All / N/A —</option>
              {entities.map((e: any) => <option key={e.id} value={e.licensee_id}>{e.licensees?.name || e.licensee_id}</option>)}
            </select>
          </div>
          <div><Label>Due date</Label><Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
          <div className="md:col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          <div className="md:col-span-2"><Button data-rbac="prudential_supervision.create" onClick={add} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Add action</Button></div>
        </CardContent>
      </Card>
      <Card><CardContent className="p-0">
        {rows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No actions yet.</div> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Title</TableHead><TableHead>Type</TableHead><TableHead>Licensee</TableHead>
              <TableHead>Due</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>{rows.map((a: any) => {
              const overdue = a.due_date && a.status !== 'completed' && a.status !== 'waived' && new Date(a.due_date) < new Date();
              return (
                <TableRow key={a.id}>
                  <TableCell><div className="font-medium">{a.title}</div>{a.description && <div className="text-xs text-muted-foreground line-clamp-1">{a.description}</div>}</TableCell>
                  <TableCell><Badge variant="outline">{a.action_type}</Badge></TableCell>
                  <TableCell className="text-xs">{a.licensees?.name || '—'}</TableCell>
                  <TableCell className="text-xs">{a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'} {overdue && <Badge variant="destructive" className="ml-1">Overdue</Badge>}</TableCell>
                  <TableCell><Badge variant={a.status === 'completed' ? 'default' : a.status === 'waived' ? 'secondary' : 'outline'}>{a.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    {a.status !== 'completed' && a.status !== 'waived' && (
                      <>
                        <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => complete(a)}>Complete</Button>
                        <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => setWaiveTarget(a)}><ShieldAlert className="h-3 w-3 mr-1" />Waive</Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}</TableBody>
          </Table>
        )}
      </CardContent></Card>

      {waiveTarget && (
        <OverrideReasonDialog
          open
          onOpenChange={o => !o && setWaiveTarget(null)}
          module="supervisory_plans"
          entityType="thematic_review_action"
          entityId={waiveTarget.id}
          ruleKey="thematic_review.action.waive"
          originalValue={{ status: waiveTarget.status, due_date: waiveTarget.due_date }}
          overriddenValue={{ status: 'waived' }}
          title={`Waive action: ${waiveTarget.title}`}
          description="Waiving this required action bypasses the standard remediation requirement. This will be recorded in the override register."
          confirmLabel="Waive with reason"
          onOverridden={async (overrideId) => {
            await thematicReviewActionWaive(waiveTarget.id, overrideId);
            await logAction('thematic_review.action_waived', 'thematic_review_action', waiveTarget.id, {
              before: { status: waiveTarget.status }, after: { status: 'waived' }, meta: { override_id: overrideId },
            });
            setWaiveTarget(null); onChange();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- History tab ---------------- */
function HistoryTab({ rows }: any) {
  return (
    <Card><CardContent className="p-0">
      {rows.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">No status changes recorded.</div> : (
        <Table>
          <TableHeader><TableRow>
            <TableHead>When</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
            <TableHead>Reason</TableHead><TableHead>Override</TableHead>
          </TableRow></TableHeader>
          <TableBody>{rows.map((h: any) => (
            <TableRow key={h.id}>
              <TableCell className="text-xs">{new Date(h.changed_at).toLocaleString()}</TableCell>
              <TableCell><Badge variant="outline">{h.from_status || '—'}</Badge></TableCell>
              <TableCell><Badge>{h.to_status}</Badge></TableCell>
              <TableCell className="text-xs">{h.reason || '—'}</TableCell>
              <TableCell className="text-xs font-mono">{h.override_id ? h.override_id.slice(0, 8) : '—'}</TableCell>
            </TableRow>))}</TableBody>
        </Table>
      )}
    </CardContent></Card>
  );
}
