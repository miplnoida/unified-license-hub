import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { toast } from 'sonner';
import { Sparkles, Save, Loader2 } from 'lucide-react';
import { COMPLAINT_PRIORITIES, complaintPriorityLabel } from '@/lib/complaintStatus';

interface Props { complaint: any; onChanged?: () => void }

const CUSTOMER_TYPES = ['retail', 'sme', 'corporate', 'vulnerable', 'other'] as const;

const EMPTY_HINT = (label: string) =>
  `No ${label} available. Add them under Admin Hub → Conduct, or contact an administrator.`;


export function ConductClassificationCard({ complaint, onChanged }: Props) {
  const qc = useQueryClient();
  const [products, setProducts] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [form, setForm] = useState({
    conduct_risk_category_id: complaint.conduct_risk_category_id || '',
    product_id: complaint.product_id || '',
    channel_id: complaint.channel_id || '',
    customer_type: complaint.customer_type || '',
    vulnerability_indicator: !!complaint.vulnerability_indicator,
    vulnerability_notes: complaint.vulnerability_notes || '',
    priority: complaint.priority || '',
    sla_days: complaint.sla_days ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [overrideCtx, setOverrideCtx] = useState<null | { from: any; to: any }>(null);
  const [refsLoaded, setRefsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [p, c, k] = await Promise.all([
        supabase.from('conduct_products').select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_channels').select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_risk_categories').select('id,name,code').eq('active', true).order('name'),
      ]);
      if (p.error) toast.error(`Products failed: ${p.error.message}`);
      if (c.error) toast.error(`Channels failed: ${c.error.message}`);
      if (k.error) toast.error(`Categories failed: ${k.error.message}`);
      setProducts(p.data ?? []); setChannels(c.data ?? []); setCats(k.data ?? []);
      setRefsLoaded(true);
    })();
  }, []);

  // Keep the editable form in sync with the loaded complaint record. The record
  // may arrive (or be refetched after a save) after this card first renders.
  useEffect(() => {
    setForm({
      conduct_risk_category_id: complaint.conduct_risk_category_id || '',
      product_id: complaint.product_id || '',
      channel_id: complaint.channel_id || '',
      customer_type: complaint.customer_type || '',
      vulnerability_indicator: !!complaint.vulnerability_indicator,
      vulnerability_notes: complaint.vulnerability_notes || '',
      priority: complaint.priority || '',
      sla_days: complaint.sla_days ?? '',
    });
  }, [
    complaint.id,
    complaint.conduct_risk_category_id,
    complaint.product_id,
    complaint.channel_id,
    complaint.customer_type,
    complaint.vulnerability_indicator,
    complaint.vulnerability_notes,
    complaint.priority,
    complaint.sla_days,
  ]);

  const nameOf = (list: any[], id?: string | null) =>
    (id && list.find((x) => x.id === id)?.name) || null;

  const recorded = [
    { label: 'Product', value: nameOf(products, complaint.product_id) },
    { label: 'Channel', value: nameOf(channels, complaint.channel_id) },
    { label: 'Conduct Risk Category', value: nameOf(cats, complaint.conduct_risk_category_id) },
    { label: 'Customer Type', value: complaint.customer_type || null },
  ];




  const persist = async (payload: any) => {
    const { error } = await (supabase as any).rpc('classify_complaint', { _id: complaint.id, _payload: payload });
    if (error) throw error;
    await logAudit({ action: 'complaint.conduct_classification_updated', entityType: 'complaint', entityId: complaint.id, metadata: payload });
  };

  const buildPayload = () => ({
    conduct_risk_category_id: form.conduct_risk_category_id || null,
    product_id: form.product_id || null,
    channel_id: form.channel_id || null,
    customer_type: form.customer_type || null,
    vulnerability_indicator: form.vulnerability_indicator,
    vulnerability_notes: form.vulnerability_notes || null,
    priority: form.priority || null,
    sla_days: form.sla_days === '' ? null : Number(form.sla_days),
  });

  const detectOverridden = (payload: any): Record<string, { from: any; to: any }> => {
    // Prefer the immutable originals captured on first auto-triage; fall back
    // to the latest snapshot outputs if not yet backfilled.
    const orig = (complaint as any).triage_original_values?.values || null;
    const snap = complaint.triage_result_snapshot?.outputs || null;
    const base = orig || snap;
    if (!base || complaint.triage_source !== 'auto') return {};
    const out: Record<string, { from: any; to: any }> = {};
    const cmp = (key: string, currVal: any) => {
      if (base[key] !== undefined && base[key] !== null && currVal !== base[key]) {
        out[key] = { from: base[key], to: currVal };
      }
    };
    cmp('priority', payload.priority);
    cmp('sla_days', payload.sla_days);
    if (orig?.conduct_risk_category_id !== undefined) {
      if (orig.conduct_risk_category_id !== payload.conduct_risk_category_id) {
        out.conduct_risk_category_id = { from: orig.conduct_risk_category_id, to: payload.conduct_risk_category_id };
      }
    } else if (snap?.conduct_risk_category_code) {
      const currentCode = cats.find((c) => c.id === payload.conduct_risk_category_id)?.code || null;
      if (currentCode !== snap.conduct_risk_category_code) {
        out.conduct_risk_category_code = { from: snap.conduct_risk_category_code, to: currentCode };
      }
    }
    return out;
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = buildPayload();
      const overridden = detectOverridden(payload);
      if (Object.keys(overridden).length > 0) {
        setOverrideCtx({ from: Object.fromEntries(Object.entries(overridden).map(([k, v]) => [k, v.from])),
                        to:   Object.fromEntries(Object.entries(overridden).map(([k, v]) => [k, v.to])) });
        setSaving(false);
        return;
      }
      await persist(payload);
      toast.success('Classification saved');
      qc.invalidateQueries({ queryKey: ['complaint', complaint.id] });
      onChanged?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const runAutoTriage = async () => {
    setAutoRunning(true);
    try {
      // Permission-checked, audited server-side. The RPC queues reprocessing;
      // the edge scheduler picks it up.
      const { error } = await (supabase as any).rpc('retry_complaint_triage', { _id: complaint.id });
      if (error) throw error;
      toast.success('Triage requested');
      qc.invalidateQueries({ queryKey: ['complaint', complaint.id] });
      onChanged?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setAutoRunning(false); }
  };


  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Conduct Classification</CardTitle>
        <div className="flex gap-2">
          {complaint.triage_source && (
            <Badge variant="outline" className="capitalize">Triage: {complaint.triage_source}</Badge>
          )}
          <Button data-rbac="complaint_management.edit" variant="outline" size="sm" onClick={runAutoTriage} disabled={autoRunning}>
            {autoRunning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}Auto-triage
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/40 p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Recorded classification</p>
          <div className="grid gap-2 md:grid-cols-4">
            {recorded.map((r) => (
              <div key={r.label}>
                <p className="text-[11px] text-muted-foreground">{r.label}</p>
                <p className="text-sm capitalize">{r.value ?? <span className="text-muted-foreground">Not recorded</span>}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">

          <div>
            <Label className="text-xs">Product</Label>
            <Select value={form.product_id || 'none'} onValueChange={v => setForm({ ...form, product_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {refsLoaded && products.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{EMPTY_HINT('products')}</p>}
          </div>
          <div>
            <Label className="text-xs">Channel</Label>
            <Select value={form.channel_id || 'none'} onValueChange={v => setForm({ ...form, channel_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{channels.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {refsLoaded && channels.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{EMPTY_HINT('channels')}</p>}
          </div>
          <div>
            <Label className="text-xs">Conduct Risk Category</Label>
            <Select value={form.conduct_risk_category_id || 'none'} onValueChange={v => setForm({ ...form, conduct_risk_category_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{cats.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
            {refsLoaded && cats.length === 0 && <p className="mt-1 text-xs text-muted-foreground">{EMPTY_HINT('conduct categories')}</p>}
          </div>

          <div>
            <Label className="text-xs">Customer Type</Label>
            <Select value={form.customer_type || 'none'} onValueChange={v => setForm({ ...form, customer_type: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{CUSTOMER_TYPES.map(x => <SelectItem key={x} value={x} className="capitalize">{x}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={form.priority || 'none'} onValueChange={v => setForm({ ...form, priority: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{COMPLAINT_PRIORITIES.map(x => <SelectItem key={x} value={x}>{complaintPriorityLabel(x)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Severity (automatic)</Label>
            <div className="mt-1 flex flex-col gap-1">
              <Badge variant="outline" className="w-fit capitalize">{complaint.severity || 'Pending triage'}</Badge>
              <span className="text-[11px] text-muted-foreground">
                {complaint.triage_result_snapshot?.matched_rule?.name
                  ? `From triage rule: ${complaint.triage_result_snapshot.matched_rule.name}`
                  : 'Configured default — no triage rule matched'}
              </span>
            </div>
          </div>
          <div>
            <Label className="text-xs">SLA (days)</Label>
            <input type="number" min={0} className="mt-1 w-full h-10 rounded-md border bg-transparent px-3 text-sm" value={form.sla_days} onChange={e => setForm({ ...form, sla_days: e.target.value === '' ? '' : Number(e.target.value) })} />
          </div>
        </div>

        <div className="flex items-center justify-between rounded border p-2">
          <Label className="text-sm">Vulnerable customer</Label>
          <Switch checked={form.vulnerability_indicator} onCheckedChange={v => setForm({ ...form, vulnerability_indicator: v })} />
        </div>
        {form.vulnerability_indicator && (
          <Textarea rows={2} placeholder="Vulnerability notes…" value={form.vulnerability_notes} onChange={e => setForm({ ...form, vulnerability_notes: e.target.value })} />
        )}

        <div className="grid gap-2 md:grid-cols-2 text-xs text-muted-foreground">
          <div>Repeat complaints (12m): <span className="font-medium text-foreground">{complaint.repeat_complaint_count ?? 0}</span></div>
          <div>SLA due: <span className="font-medium text-foreground">{complaint.sla_due_at ? new Date(complaint.sla_due_at).toLocaleString() : '—'}</span></div>
          {complaint.triage_evaluated_at && <div>Triage evaluated: <span className="font-medium text-foreground">{new Date(complaint.triage_evaluated_at).toLocaleString()}</span></div>}
          {complaint.triage_override_status && complaint.triage_override_status !== 'none' && <div>Override: <Badge variant="outline" className="capitalize">{complaint.triage_override_status}</Badge></div>}
          {complaint.triage_last_error && <div className="col-span-2 text-destructive">Last triage error: {complaint.triage_last_error}</div>}
        </div>

        <Button onClick={save} disabled={saving} className="w-full"><Save className="h-4 w-4 mr-2" />{saving ? 'Saving…' : 'Save classification'}</Button>
      </CardContent>

      {overrideCtx && (
        <OverrideReasonDialog
          open
          onOpenChange={(o) => { if (!o) setOverrideCtx(null); }}
          module="complaints"
          entityType="complaint"
          entityId={complaint.id}
          ruleKey="complaints.triage.rule_output_override"
          originalValue={overrideCtx.from}
          overriddenValue={overrideCtx.to}
          metadata={{ source: 'ConductClassificationCard', triage_rule_id: complaint.triage_rule_id }}
          title="Override auto-triage outputs"
          description="You are changing outputs that were set automatically by a triage rule. Provide a written justification."
          onOverridden={async () => {
            await persist({ ...buildPayload(), triage_source: 'override', triage_override_status: 'overridden' });
            toast.success('Overridden and saved');
            qc.invalidateQueries({ queryKey: ['complaint', complaint.id] });
            setOverrideCtx(null);
            onChanged?.();
          }}
        />
      )}
    </Card>
  );
}

export default ConductClassificationCard;
