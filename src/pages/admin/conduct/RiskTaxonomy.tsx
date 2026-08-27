import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { toast } from 'sonner';
import { PlusCircle, Pencil, Loader2 } from 'lucide-react';

interface Cat {
  id: string; code: string; name: string; description: string | null;
  parent_id: string | null; severity_hint: string | null; active: boolean;
}

const SEVS = ['low', 'medium', 'high', 'critical'] as const;

export default function ConductRiskTaxonomy() {
  const [rows, setRows] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', parent_id: 'none', severity_hint: 'medium', active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('conduct_risk_categories').select('*').order('code');
    setRows((data || []) as Cat[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm({ code: '', name: '', description: '', parent_id: 'none', severity_hint: 'medium', active: true }); setEditing(null); };

  const openEdit = (c: Cat) => {
    setEditing(c);
    setForm({
      code: c.code, name: c.name, description: c.description || '',
      parent_id: c.parent_id || 'none', severity_hint: c.severity_hint || 'medium', active: c.active,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error('Code and name required'); return; }
    setSaving(true);
    const payload: any = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      parent_id: form.parent_id === 'none' ? null : form.parent_id,
      severity_hint: form.severity_hint,
      active: form.active,
    };
    const { error, data } = editing
      ? await supabase.from('conduct_risk_categories').update(payload).eq('id', editing.id).select('id').maybeSingle()
      : await supabase.from('conduct_risk_categories').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({
      action: editing ? 'conduct_risk_category_updated' : 'conduct_risk_category_created',
      entityType: 'conduct_risk_category',
      entityId: (editing?.id || data?.id) as string,
    });
    toast.success(editing ? 'Category updated' : 'Category created');
    setOpen(false); reset(); load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Conduct Risk Taxonomy"
          description="Categorise conduct risks used across complaints, alerts, and thematic monitoring."
          actions={<Button data-rbac="market_conduct.edit" onClick={() => { reset(); setOpen(true); }}><PlusCircle className="h-4 w-4 mr-2" />Add Category</Button>}
        />
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Parent</TableHead>
                    <TableHead>Severity Hint</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {rows.find(p => p.id === r.parent_id)?.name || '—'}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{r.severity_hint || '—'}</Badge></TableCell>
                      <TableCell><Badge variant={r.active ? 'default' : 'secondary'}>{r.active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <HistoryButton entityType="conduct_risk_category" entityId={r.id} title={`History — ${r.code}`} />
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={o => { if (!o) { setOpen(false); reset(); } else setOpen(true); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="MIS_SELLING" /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div>
              <Label>Parent</Label>
              <Select value={form.parent_id} onValueChange={v => setForm({ ...form, parent_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(top level)</SelectItem>
                  {rows.filter(r => !editing || r.id !== editing.id).map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.code} — {r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity Hint</Label>
              <Select value={form.severity_hint} onValueChange={v => setForm({ ...form, severity_hint: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SEVS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
