import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Props { entityId: string }

type Row = { id: string; ref_id: string; active_from: string | null; active_to: string | null; notes: string | null };

export default function ProductsChannelsTab({ entityId }: Props) {
  const { user } = useAuth();
  const [products, setProducts] = useState<Row[]>([]);
  const [channels, setChannels] = useState<Row[]>([]);
  const [productCatalog, setProductCatalog] = useState<{ id: string; code: string; name: string }[]>([]);
  const [channelCatalog, setChannelCatalog] = useState<{ id: string; code: string; name: string; kind: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [addKind, setAddKind] = useState<'product' | 'channel' | null>(null);
  const [form, setForm] = useState({ refId: '', active_from: '', active_to: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: c }, { data: pc }, { data: cc }] = await Promise.all([
      supabase.from('licensee_products' as any).select('id,product_id,active_from,active_to,notes').eq('licensee_id', entityId).order('created_at', { ascending: false }),
      supabase.from('licensee_channels' as any).select('id,channel_id,active_from,active_to,notes').eq('licensee_id', entityId).order('created_at', { ascending: false }),
      supabase.from('conduct_products').select('id,code,name').eq('active', true).order('name'),
      supabase.from('conduct_channels').select('id,code,name,kind').eq('active', true).order('name'),
    ]);
    setProducts(((p as any[]) || []).map((r) => ({ id: r.id, ref_id: r.product_id, active_from: r.active_from, active_to: r.active_to, notes: r.notes })));
    setChannels(((c as any[]) || []).map((r) => ({ id: r.id, ref_id: r.channel_id, active_from: r.active_from, active_to: r.active_to, notes: r.notes })));
    setProductCatalog((pc as any[]) || []);
    setChannelCatalog((cc as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [entityId]);

  const startAdd = (kind: 'product' | 'channel') => {
    setAddKind(kind);
    setForm({ refId: '', active_from: '', active_to: '', notes: '' });
  };

  const submit = async () => {
    if (!addKind || !form.refId) { toast.error('Select a value'); return; }
    setSaving(true);
    const table = addKind === 'product' ? 'licensee_products' : 'licensee_channels';
    const idCol = addKind === 'product' ? 'product_id' : 'channel_id';
    const payload: Record<string, unknown> = {
      licensee_id: entityId,
      [idCol]: form.refId,
      active_from: form.active_from || null,
      active_to: form.active_to || null,
      notes: form.notes || null,
      created_by: user?.id ?? null,
    };
    const { error } = await supabase.from(table as any).insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Added');
    setAddKind(null);
    load();
  };

  const remove = async (kind: 'product' | 'channel', id: string) => {
    const table = kind === 'product' ? 'licensee_products' : 'licensee_channels';
    const { error } = await supabase.from(table as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Removed');
    load();
  };

  if (loading) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 inline animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Products offered</CardTitle>
          <Button size="sm" onClick={() => startAdd('product')}><Plus className="h-4 w-4 mr-2" /> Add product</Button>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products mapped yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Product</TableHead><TableHead>Active from</TableHead><TableHead>Active to</TableHead><TableHead>Notes</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {products.map((r) => {
                  const cat = productCatalog.find((p) => p.id === r.ref_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell><div className="font-medium">{cat?.name || r.ref_id.slice(0, 8)}</div>{cat && <Badge variant="outline" className="font-mono text-xs">{cat.code}</Badge>}</TableCell>
                      <TableCell>{r.active_from || '—'}</TableCell>
                      <TableCell>{r.active_to || '—'}</TableCell>
                      <TableCell className="text-xs">{r.notes || '—'}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => remove('product', r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Distribution channels</CardTitle>
          <Button size="sm" onClick={() => startAdd('channel')}><Plus className="h-4 w-4 mr-2" /> Add channel</Button>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <p className="text-sm text-muted-foreground">No channels mapped yet.</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead>Kind</TableHead><TableHead>Active from</TableHead><TableHead>Active to</TableHead><TableHead>Notes</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {channels.map((r) => {
                  const cat = channelCatalog.find((c) => c.id === r.ref_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell><div className="font-medium">{cat?.name || r.ref_id.slice(0, 8)}</div>{cat && <Badge variant="outline" className="font-mono text-xs">{cat.code}</Badge>}</TableCell>
                      <TableCell><Badge variant="outline" className="capitalize">{cat?.kind || '—'}</Badge></TableCell>
                      <TableCell>{r.active_from || '—'}</TableCell>
                      <TableCell>{r.active_to || '—'}</TableCell>
                      <TableCell className="text-xs">{r.notes || '—'}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => remove('channel', r.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!addKind} onOpenChange={(o) => { if (!o) setAddKind(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add {addKind}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{addKind === 'product' ? 'Product' : 'Channel'} *</Label>
              <Select value={form.refId} onValueChange={(v) => setForm({ ...form, refId: v })}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {(addKind === 'product' ? productCatalog : channelCatalog).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name} ({o.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Active from</Label><Input type="date" value={form.active_from} onChange={(e) => setForm({ ...form, active_from: e.target.value })} /></div>
              <div><Label>Active to</Label><Input type="date" value={form.active_to} onChange={(e) => setForm({ ...form, active_to: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddKind(null)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
