import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import { thematicReviewCreate } from '@/lib/supervisoryGovernedOps';

export default function NewThematicReview() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    hypothesis: '',
    risk_category_id: '',
    scope_start: '',
    scope_end: '',
    lead_officer_id: '',
  });
  const [entityQ, setEntityQ] = useState('');
  const [entityOpts, setEntityOpts] = useState<any[]>([]);
  const [selEntities, setSelEntities] = useState<Record<string, any>>({});
  const [productOpts, setProductOpts] = useState<any[]>([]);
  const [selProducts, setSelProducts] = useState<Set<string>>(new Set());
  const [riskCats, setRiskCats] = useState<any[]>([]);
  const { data: employees = [] } = useEmployeeApprovers();

  useEffect(() => {
    (async () => {
      const [rc, p] = await Promise.all([
        supabase.from('conduct_risk_categories' as any).select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_products' as any).select('id,name,active').eq('active', true).order('name'),
      ]);
      setRiskCats((rc.data as any[]) || []);
      setProductOpts((p.data as any[]) || []);
    })();
  }, []);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (entityQ.trim().length < 2) { setEntityOpts([]); return; }
      const { data } = await supabase.from('licensees').select('id,name,status')
        .ilike('name', `%${entityQ}%`).limit(15);
      setEntityOpts((data as any[]) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [entityQ]);

  const canNext = () => {
    if (step === 0) return form.title.trim().length > 3;
    if (step === 1) return Object.keys(selEntities).length > 0 || selProducts.size > 0;
    return true;
  };

  const commit = async () => {
    setSaving(true);
    try {
      const { authorizedAction } = await import('@/lib/rbac/authorizedAction');
      await authorizedAction('market_conduct', 'create', { review_title: form.title });
      const { data: user } = await supabase.auth.getUser();

      const tr = await thematicReviewCreate({
        title: form.title.trim(),
        description: form.description || null,
        hypothesis: form.hypothesis || null,
        risk_category_id: form.risk_category_id || null,
        scope_start: form.scope_start || null,
        scope_end: form.scope_end || null,
        lead_officer_id: form.lead_officer_id || user.user?.id || null,
      });
      const trAny = tr as any;

      if (Object.keys(selEntities).length > 0) {
        await supabase.from('thematic_review_entities' as any).insert(
          Object.values(selEntities).map((e: any) => ({
            review_id: trAny.id,
            licensee_id: e.id,
            added_by: user.user?.id,
          })),
        );
      }
      if (selProducts.size > 0) {
        await supabase.from('thematic_review_products' as any).insert(
          Array.from(selProducts).map(pid => ({ review_id: trAny.id, product_id: pid })),
        );
      }
      await logAction('thematic_review.created', 'thematic_review', trAny.id, {
        meta: { title: form.title, entities: Object.keys(selEntities).length, products: selProducts.size },
      });
      toast.success(`Thematic review ${trAny.code || ''} created`);
      nav(`/supervision/thematic-reviews/${trAny.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl mx-auto">
        <PageHeader title="New Thematic Review" description="Create a cross-sector conduct thematic review." backHref="/supervision/thematic-reviews" backLabel="Back to list" />
        <Stepper step={step} steps={['Basics', 'Scope', 'Team & Dates', 'Review']} />

        <Card><CardContent className="pt-6 space-y-4">
          {step === 0 && (
            <>
              <Field label="Title *"><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mis-selling of investment-linked products 2026" /></Field>
              <Field label="Hypothesis"><Textarea rows={3} value={form.hypothesis} onChange={e => setForm({ ...form, hypothesis: e.target.value })} placeholder="What are you trying to test?" /></Field>
              <Field label="Description / methodology"><Textarea rows={4} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
              <Field label="Primary risk category">
                <select className="w-full h-10 rounded-md border bg-background px-3" value={form.risk_category_id} onChange={e => setForm({ ...form, risk_category_id: e.target.value })}>
                  <option value="">— None —</option>
                  {riskCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <div>
                <Label>Licensees in scope</Label>
                <Input placeholder="Search licensees…" value={entityQ} onChange={e => setEntityQ(e.target.value)} className="mt-1" />
                {entityOpts.length > 0 && (
                  <div className="mt-2 border rounded-md max-h-52 overflow-auto">
                    {entityOpts.map(o => (
                      <button key={o.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0"
                        onClick={() => { setSelEntities(prev => ({ ...prev, [o.id]: o })); setEntityQ(''); setEntityOpts([]); }}>
                        <div className="font-medium">{o.name}</div>
                        <div className="text-xs text-muted-foreground">{o.status}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1 mt-2">
                  {Object.values(selEntities).map((e: any) => (
                    <Badge key={e.id} variant="secondary" className="cursor-pointer"
                      onClick={() => { const c = { ...selEntities }; delete c[e.id]; setSelEntities(c); }}>
                      {e.name} ✕
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <Label>Products in scope</Label>
                <div className="mt-1 grid md:grid-cols-2 gap-2 border rounded-md p-3 max-h-64 overflow-auto">
                  {productOpts.map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={selProducts.has(p.id)} onCheckedChange={v => {
                        const s = new Set(selProducts);
                        if (v) s.add(p.id); else s.delete(p.id);
                        setSelProducts(s);
                      }} />
                      {p.name}
                    </label>
                  ))}
                  {productOpts.length === 0 && <p className="text-xs text-muted-foreground">No conduct products defined.</p>}
                </div>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Scope start"><Input type="date" value={form.scope_start} onChange={e => setForm({ ...form, scope_start: e.target.value })} /></Field>
                <Field label="Scope end"><Input type="date" value={form.scope_end} onChange={e => setForm({ ...form, scope_end: e.target.value })} /></Field>
              </div>
              <Field label="Lead officer">
                <select className="w-full h-10 rounded-md border bg-background px-3" value={form.lead_officer_id} onChange={e => setForm({ ...form, lead_officer_id: e.target.value })}>
                  <option value="">— Assign later —</option>
                  {employees.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email}{u.email ? ` (${u.email})` : ''}</option>)}
                </select>
              </Field>
            </>
          )}
          {step === 3 && (
            <div className="space-y-2 text-sm">
              <p><strong>Title:</strong> {form.title}</p>
              <p><strong>Hypothesis:</strong> {form.hypothesis || '—'}</p>
              <p><strong>Licensees:</strong> {Object.keys(selEntities).length}</p>
              <p><strong>Products:</strong> {selProducts.size}</p>
              <p><strong>Scope:</strong> {form.scope_start || '—'} → {form.scope_end || '—'}</p>
              <p className="text-xs text-muted-foreground pt-2">Review will be created in <strong>Draft</strong>. Move it forward via the lifecycle controls on the detail page.</p>
            </div>
          )}
        </CardContent></Card>

        <div className="flex justify-between">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(s => s - 1)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
          {step < 3 ? (
            <Button disabled={!canNext()} onClick={() => setStep(s => s + 1)}>Next <ChevronRight className="h-4 w-4 ml-1" /></Button>
          ) : (
            <Button data-rbac="prudential_supervision.create" onClick={commit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create Review</Button>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label><div className="mt-1">{children}</div></div>;
}
function Stepper({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2 flex-1">
          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm ${i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{i + 1}</div>
          <div className={`text-sm ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>{s}</div>
          {i < steps.length - 1 && <div className={`h-px flex-1 ${i < step ? 'bg-primary' : 'bg-muted'}`} />}
        </div>
      ))}
    </div>
  );
}
