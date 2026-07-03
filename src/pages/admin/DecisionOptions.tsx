import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { Badge } from '@/components/ui/badge';

const OUTCOMES = ['approve','reject','return','defer','conditional_approve','withdraw','escalate','info_request'];

type Option = {
  id: string; code: string; label: string; outcome: string; color: string; icon: string | null;
  requires_conditions: boolean; requires_reason: boolean; min_reason_length: number;
  rationale_template_id: string | null; applies_to: Record<string, any>; sort_order: number; is_active: boolean;
};

type Template = {
  id: string; code: string; name: string; outcome: string | null; body: string; variables: any; is_active: boolean;
};

const emptyOpt: Partial<Option> = { code: '', label: '', outcome: 'approve', color: 'default', requires_conditions: false, requires_reason: true, min_reason_length: 10, applies_to: {}, sort_order: 100, is_active: true };
const emptyTpl: Partial<Template> = { code: '', name: '', body: '', outcome: null, is_active: true };

export default function DecisionOptions() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('options');
  const [optOpen, setOptOpen] = useState(false); const [opt, setOpt] = useState<Partial<Option>>(emptyOpt);
  const [tplOpen, setTplOpen] = useState(false); const [tpl, setTpl] = useState<Partial<Template>>(emptyTpl);
  const [appliesText, setAppliesText] = useState('{}');

  const { data: options = [] } = useQuery({
    queryKey: ['decision_options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('decision_options' as any).select('*').order('sort_order');
      if (error) throw error;
      return data as unknown as Option[];
    },
  });
  const { data: templates = [] } = useQuery({
    queryKey: ['decision_rationale_templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('decision_rationale_templates' as any).select('*').order('name');
      if (error) throw error;
      return data as unknown as Template[];
    },
  });

  const saveOpt = async () => {
    try {
      const payload = { ...opt, applies_to: JSON.parse(appliesText || '{}') };
      if ((opt as any).id) {
        await supabase.from('decision_options' as any).update(payload).eq('id', (opt as any).id);
        await logAction('decision_option.updated', 'decision_option', (opt as any).id, { after: payload });
      } else {
        const { data, error } = await supabase.from('decision_options' as any).insert(payload).select().single();
        if (error) throw error;
        await logAction('decision_option.created', 'decision_option', (data as any).id, { after: payload });
      }
      toast.success('Saved'); setOptOpen(false); qc.invalidateQueries({ queryKey: ['decision_options'] });
    } catch (e) { toast.error((e as Error).message); }
  };
  const delOpt = async (o: Option) => {
    if (!confirm(`Delete "${o.label}"?`)) return;
    await supabase.from('decision_options' as any).delete().eq('id', o.id);
    await logAction('decision_option.deleted', 'decision_option', o.id, { before: o });
    qc.invalidateQueries({ queryKey: ['decision_options'] });
  };
  const saveTpl = async () => {
    try {
      if ((tpl as any).id) {
        await supabase.from('decision_rationale_templates' as any).update(tpl).eq('id', (tpl as any).id);
        await logAction('decision_rationale_template.updated', 'decision_rationale_template', (tpl as any).id, { after: tpl });
      } else {
        const { data, error } = await supabase.from('decision_rationale_templates' as any).insert(tpl).select().single();
        if (error) throw error;
        await logAction('decision_rationale_template.created', 'decision_rationale_template', (data as any).id, { after: tpl });
      }
      toast.success('Saved'); setTplOpen(false); qc.invalidateQueries({ queryKey: ['decision_rationale_templates'] });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Decision Options" description="Configure decision buttons and rationale templates used on Application decisions." />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList><TabsTrigger value="options">Decision Options</TabsTrigger><TabsTrigger value="templates">Rationale Templates</TabsTrigger></TabsList>

          <TabsContent value="options" className="space-y-3">
            <div className="flex justify-end"><Button onClick={() => { setOpt(emptyOpt); setAppliesText('{}'); setOptOpen(true); }}><Plus className="h-4 w-4 mr-2" />New Option</Button></div>
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Outcome</TableHead><TableHead>Requires Reason</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {options.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>{o.sort_order}</TableCell>
                      <TableCell className="font-mono text-xs">{o.code}</TableCell>
                      <TableCell>{o.label}</TableCell>
                      <TableCell><Badge>{o.outcome}</Badge></TableCell>
                      <TableCell>{o.requires_reason ? `Yes (≥${o.min_reason_length})` : 'No'}</TableCell>
                      <TableCell>{o.is_active ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setOpt(o); setAppliesText(JSON.stringify(o.applies_to || {}, null, 2)); setOptOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => delOpt(o)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {options.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No decision options configured. Default buttons will render.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-3">
            <div className="flex justify-end"><Button onClick={() => { setTpl(emptyTpl); setTplOpen(true); }}><Plus className="h-4 w-4 mr-2" />New Template</Button></div>
            <Card><CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Outcome</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono text-xs">{t.code}</TableCell>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.outcome || '—'}</TableCell>
                      <TableCell>{t.is_active ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => { setTpl(t); setTplOpen(true); }}><Pencil className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  ))}
                  {templates.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No templates yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>

        <Dialog open={optOpen} onOpenChange={setOptOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{(opt as any).id ? 'Edit' : 'New'} Decision Option</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Code</Label><Input value={opt.code || ''} onChange={(e) => setOpt({ ...opt, code: e.target.value })} /></div>
                <div><Label>Label</Label><Input value={opt.label || ''} onChange={(e) => setOpt({ ...opt, label: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Outcome</Label>
                  <Select value={opt.outcome} onValueChange={(v) => setOpt({ ...opt, outcome: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Rationale Template</Label>
                  <Select value={opt.rationale_template_id || 'none'} onValueChange={(v) => setOpt({ ...opt, rationale_template_id: v === 'none' ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Sort Order</Label><Input type="number" value={opt.sort_order} onChange={(e) => setOpt({ ...opt, sort_order: Number(e.target.value) })} /></div>
                <div><Label>Min Reason Length</Label><Input type="number" value={opt.min_reason_length} onChange={(e) => setOpt({ ...opt, min_reason_length: Number(e.target.value) })} /></div>
                <div><Label>Color</Label><Input value={opt.color || 'default'} onChange={(e) => setOpt({ ...opt, color: e.target.value })} /></div>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2"><Checkbox checked={opt.requires_reason} onCheckedChange={(v) => setOpt({ ...opt, requires_reason: !!v })} /><Label>Requires reason</Label></div>
                <div className="flex items-center gap-2"><Checkbox checked={opt.requires_conditions} onCheckedChange={(v) => setOpt({ ...opt, requires_conditions: !!v })} /><Label>Requires conditions</Label></div>
                <div className="flex items-center gap-2"><Checkbox checked={opt.is_active} onCheckedChange={(v) => setOpt({ ...opt, is_active: !!v })} /><Label>Active</Label></div>
              </div>
              <div>
                <Label>Applies To (scope JSON)</Label>
                <Textarea rows={3} className="font-mono text-xs" value={appliesText} onChange={(e) => setAppliesText(e.target.value)} placeholder='{"application_type":"new_license"}' />
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOptOpen(false)}>Cancel</Button><Button onClick={saveOpt}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={tplOpen} onOpenChange={setTplOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{(tpl as any).id ? 'Edit' : 'New'} Rationale Template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Code</Label><Input value={tpl.code || ''} onChange={(e) => setTpl({ ...tpl, code: e.target.value })} /></div>
                <div><Label>Name</Label><Input value={tpl.name || ''} onChange={(e) => setTpl({ ...tpl, name: e.target.value })} /></div>
              </div>
              <div>
                <Label>Outcome (optional)</Label>
                <Select value={tpl.outcome || 'any'} onValueChange={(v) => setTpl({ ...tpl, outcome: v === 'any' ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    {OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Body (supports {'{{application_number}}'}, {'{{applicant_name}}'})</Label><Textarea rows={8} value={tpl.body || ''} onChange={(e) => setTpl({ ...tpl, body: e.target.value })} /></div>
              <div className="flex items-center gap-2"><Checkbox checked={tpl.is_active} onCheckedChange={(v) => setTpl({ ...tpl, is_active: !!v })} /><Label>Active</Label></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setTplOpen(false)}>Cancel</Button><Button onClick={saveTpl}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
