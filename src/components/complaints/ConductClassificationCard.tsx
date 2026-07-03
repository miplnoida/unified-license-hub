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

interface Props { complaint: any; onChanged?: () => void }

const CUSTOMER_TYPES = ['retail', 'sme', 'corporate', 'vulnerable', 'other'] as const;
const PRIORITIES = ['p1', 'p2', 'p3', 'p4'] as const;

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
    assigned_team: complaint.assigned_team || '',
  });
  const [saving, setSaving] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [overrideCtx, setOverrideCtx] = useState<null | { from: any; to: any }>(null);

  useEffect(() => {
    (async () => {
      const [p, c, k] = await Promise.all([
        supabase.from('conduct_products').select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_channels').select('id,name').eq('active', true).order('name'),
        supabase.from('conduct_risk_categories').select('id,name,code').eq('active', true).order('name'),
      ]);
      setProducts(p.data || []); setChannels(c.data || []); setCats(k.data || []);
    })();
  }, []);

  const persist = async (payload: any) => {
    const { error } = await supabase.from('complaints').update(payload).eq('id', complaint.id);
    if (error) throw error;
    await logAudit({ action: 'complaint.conduct_classification_updated', entityType: 'complaint', entityId: complaint.id, meta: payload });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: any = {
        conduct_risk_category_id: form.conduct_risk_category_id || null,
        product_id: form.product_id || null,
        channel_id: form.channel_id || null,
        customer_type: form.customer_type || null,
        vulnerability_indicator: form.vulnerability_indicator,
        vulnerability_notes: form.vulnerability_notes || null,
        priority: form.priority || null,
        assigned_team: form.assigned_team || null,
      };

      // If the complaint was auto-triaged and human is overriding key outputs, require justification.
      const auto = complaint.triage_source === 'auto';
      const changedOutputs = auto && (
        (complaint.priority && form.priority && complaint.priority !== form.priority) ||
        (complaint.assigned_team && form.assigned_team && complaint.assigned_team !== form.assigned_team)
      );
      if (changedOutputs) {
        setOverrideCtx({
          from: { priority: complaint.priority, assigned_team: complaint.assigned_team },
          to: { priority: form.priority, assigned_team: form.assigned_team },
        });
        setSaving(false);
        return;
      }

      await persist(payload);
      payload.triage_source = payload.triage_source ?? complaint.triage_source ?? 'manual';
      toast.success('Classification saved');
      qc.invalidateQueries({ queryKey: ['complaint', complaint.id] });
      onChanged?.();
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const runAutoTriage = async () => {
    setAutoRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-complaint-triage', {
        body: { complaint_id: complaint.id },
      });
      if (error) throw error;
      toast.success(`Triage applied${data?.matched_rule ? ` (rule: ${data.matched_rule.name})` : ' (no rule matched)'}`);
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
          <Button variant="outline" size="sm" onClick={runAutoTriage} disabled={autoRunning}>
            {autoRunning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}Auto-triage
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label className="text-xs">Product</Label>
            <Select value={form.product_id || 'none'} onValueChange={v => setForm({ ...form, product_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Channel</Label>
            <Select value={form.channel_id || 'none'} onValueChange={v => setForm({ ...form, channel_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{channels.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Conduct Risk Category</Label>
            <Select value={form.conduct_risk_category_id || 'none'} onValueChange={v => setForm({ ...form, conduct_risk_category_id: v === 'none' ? '' : v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{cats.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
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
              <SelectContent><SelectItem value="none">(unset)</SelectItem>{PRIORITIES.map(x => <SelectItem key={x} value={x} className="uppercase">{x}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Assigned Team</Label>
            <input className="mt-1 w-full h-10 rounded-md border bg-transparent px-3 text-sm" value={form.assigned_team} onChange={e => setForm({ ...form, assigned_team: e.target.value })} placeholder="e.g. Conduct-Retail" />
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
            await persist({
              conduct_risk_category_id: form.conduct_risk_category_id || null,
              product_id: form.product_id || null,
              channel_id: form.channel_id || null,
              customer_type: form.customer_type || null,
              vulnerability_indicator: form.vulnerability_indicator,
              vulnerability_notes: form.vulnerability_notes || null,
              priority: form.priority || null,
              assigned_team: form.assigned_team || null,
              triage_source: 'override',
            });
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
