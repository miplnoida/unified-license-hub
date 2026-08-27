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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { toast } from 'sonner';
import { PlusCircle, Pencil } from 'lucide-react';

interface Product { id: string; code: string; name: string; description: string | null; sector_id: string | null; sub_sector_id: string | null; active: boolean; }
interface Channel { id: string; code: string; name: string; kind: string; description: string | null; active: boolean; }

const CHANNEL_KINDS = ['digital', 'branch', 'agent', 'call_center', 'broker', 'other'] as const;

export default function ProductsChannels() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Products & Channels" description="Reference catalogs used to classify complaints and conduct alerts." />
        <Tabs defaultValue="products">
          <TabsList><TabsTrigger value="products">Products</TabsTrigger><TabsTrigger value="channels">Channels</TabsTrigger></TabsList>
          <TabsContent value="products"><ProductsPanel /></TabsContent>
          <TabsContent value="channels"><ChannelsPanel /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function ProductsPanel() {
  const [rows, setRows] = useState<Product[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [subs, setSubs] = useState<{ id: string; name: string; sector_id: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ code: '', name: '', description: '', sector_id: 'none', sub_sector_id: 'none', active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [{ data: p }, { data: s }, { data: ss }] = await Promise.all([
      supabase.from('conduct_products').select('*').order('code'),
      supabase.from('sectors').select('id,name').order('name'),
      supabase.from('sub_sectors').select('id,name,sector_id').order('name'),
    ]);
    setRows((p || []) as Product[]);
    setSectors((s || []) as any);
    setSubs((ss || []) as any);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm({ code: '', name: '', description: '', sector_id: 'none', sub_sector_id: 'none', active: true }); setEditing(null); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ code: p.code, name: p.name, description: p.description || '', sector_id: p.sector_id || 'none', sub_sector_id: p.sub_sector_id || 'none', active: p.active });
    setOpen(true);
  };
  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error('Code and name required'); return; }
    setSaving(true);
    const payload: any = {
      code: form.code.trim().toUpperCase(), name: form.name.trim(),
      description: form.description.trim() || null,
      sector_id: form.sector_id === 'none' ? null : form.sector_id,
      sub_sector_id: form.sub_sector_id === 'none' ? null : form.sub_sector_id,
      active: form.active,
    };
    const { data, error } = editing
      ? await supabase.from('conduct_products').update(payload).eq('id', editing.id).select('id').maybeSingle()
      : await supabase.from('conduct_products').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: editing ? 'conduct_product_updated' : 'conduct_product_created', entityType: 'conduct_product', entityId: (editing?.id || data?.id) as string });
    toast.success('Saved'); setOpen(false); reset(); load();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-end"><Button data-rbac="market_conduct.edit" size="sm" onClick={() => { reset(); setOpen(true); }}><PlusCircle className="h-4 w-4 mr-2" />Add Product</Button></div>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Sector</TableHead><TableHead>Sub-Sector</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell className="text-sm">{sectors.find(s => s.id === r.sector_id)?.name || '—'}</TableCell>
                <TableCell className="text-sm">{subs.find(s => s.id === r.sub_sector_id)?.name || '—'}</TableCell>
                <TableCell><Badge variant={r.active ? 'default' : 'secondary'}>{r.active ? 'Active' : 'Inactive'}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <HistoryButton entityType="conduct_product" entityId={r.id} title={`History — ${r.code}`} />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={open} onOpenChange={o => { if (!o) { setOpen(false); reset(); } else setOpen(true); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Product' : 'Add Product'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="MOTOR_INS" /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div>
              <Label>Sector</Label>
              <Select value={form.sector_id} onValueChange={v => setForm({ ...form, sector_id: v, sub_sector_id: 'none' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">(none)</SelectItem>
                  {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.sector_id !== 'none' && (
              <div>
                <Label>Sub-Sector</Label>
                <Select value={form.sub_sector_id} onValueChange={v => setForm({ ...form, sub_sector_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(none)</SelectItem>
                    {subs.filter(s => s.sector_id === form.sector_id).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ChannelsPanel() {
  const [rows, setRows] = useState<Channel[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Channel | null>(null);
  const [form, setForm] = useState({ code: '', name: '', kind: 'digital', description: '', active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('conduct_channels').select('*').order('code');
    setRows((data || []) as Channel[]);
  };
  useEffect(() => { load(); }, []);

  const reset = () => { setForm({ code: '', name: '', kind: 'digital', description: '', active: true }); setEditing(null); };
  const openEdit = (c: Channel) => { setEditing(c); setForm({ code: c.code, name: c.name, kind: c.kind, description: c.description || '', active: c.active }); setOpen(true); };
  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) { toast.error('Code and name required'); return; }
    setSaving(true);
    const payload: any = { code: form.code.trim().toUpperCase(), name: form.name.trim(), kind: form.kind, description: form.description.trim() || null, active: form.active };
    const { data, error } = editing
      ? await supabase.from('conduct_channels').update(payload).eq('id', editing.id).select('id').maybeSingle()
      : await supabase.from('conduct_channels').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: editing ? 'conduct_channel_updated' : 'conduct_channel_created', entityType: 'conduct_channel', entityId: (editing?.id || data?.id) as string });
    toast.success('Saved'); setOpen(false); reset(); load();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-end"><Button data-rbac="market_conduct.edit" size="sm" onClick={() => { reset(); setOpen(true); }}><PlusCircle className="h-4 w-4 mr-2" />Add Channel</Button></div>
        <Table>
          <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Kind</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="font-medium">{r.name}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize">{r.kind.replace('_', ' ')}</Badge></TableCell>
                <TableCell><Badge variant={r.active ? 'default' : 'secondary'}>{r.active ? 'Active' : 'Inactive'}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-1">
                    <HistoryButton entityType="conduct_channel" entityId={r.id} title={`History — ${r.code}`} />
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={open} onOpenChange={o => { if (!o) { setOpen(false); reset(); } else setOpen(true); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit Channel' : 'Add Channel'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Code *</Label><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="MOBILE_APP" /></div>
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div>
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={v => setForm({ ...form, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CHANNEL_KINDS.map(k => <SelectItem key={k} value={k} className="capitalize">{k.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
            <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={form.active} onCheckedChange={v => setForm({ ...form, active: v })} /></div>
            <Button onClick={save} disabled={saving} className="w-full">{saving ? 'Saving…' : editing ? 'Update' : 'Create'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
