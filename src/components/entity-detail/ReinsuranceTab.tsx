import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Umbrella } from 'lucide-react';
import Swal from 'sweetalert2';

export default function ReinsuranceTab({ entityId }: { entityId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ reinsurer_name: '', contract_number: '', coverage_type: 'proportional', coverage_amount: '', premium_amount: '', effective_from: '', effective_to: '', status: 'active' });

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('reinsurance_contracts' as any).select('*').eq('entity_id', entityId).order('created_at', { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [entityId]);

  const openCreate = () => { setEditing(null); setForm({ reinsurer_name: '', contract_number: '', coverage_type: 'proportional', coverage_amount: '', premium_amount: '', effective_from: '', effective_to: '', status: 'active' }); setDialogOpen(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ reinsurer_name: r.reinsurer_name, contract_number: r.contract_number || '', coverage_type: r.coverage_type, coverage_amount: r.coverage_amount?.toString() || '', premium_amount: r.premium_amount?.toString() || '', effective_from: r.effective_from || '', effective_to: r.effective_to || '', status: r.status }); setDialogOpen(true); };

  const handleSave = async () => {
    if (!form.reinsurer_name.trim()) { toast.error('Reinsurer name is required'); return; }
    setSaving(true);
    const payload = { entity_id: entityId, reinsurer_name: form.reinsurer_name, contract_number: form.contract_number || null, coverage_type: form.coverage_type, coverage_amount: form.coverage_amount ? parseFloat(form.coverage_amount) : 0, premium_amount: form.premium_amount ? parseFloat(form.premium_amount) : 0, effective_from: form.effective_from || null, effective_to: form.effective_to || null, status: form.status };
    const { error } = editing ? await supabase.from('reinsurance_contracts' as any).update(payload).eq('id', editing.id) : await supabase.from('reinsurance_contracts' as any).insert(payload);
    if (error) toast.error(error.message); else { toast.success(editing ? 'Updated' : 'Created'); setDialogOpen(false); fetchData(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const r = await Swal.fire({ title: 'Delete contract?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, delete' });
    if (!r.isConfirmed) return;
    await supabase.from('reinsurance_contracts' as any).delete().eq('id', id);
    toast.success('Deleted'); fetchData();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg"><Umbrella className="h-5 w-5 text-primary" />Reinsurance Contracts</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground"><Umbrella className="h-10 w-10 mx-auto mb-3 opacity-30" /><p>No reinsurance contracts.</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Reinsurer</TableHead><TableHead>Contract #</TableHead><TableHead>Type</TableHead><TableHead>Coverage</TableHead><TableHead>Premium</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.reinsurer_name}</TableCell>
                  <TableCell className="font-mono">{r.contract_number || '—'}</TableCell>
                  <TableCell className="capitalize">{r.coverage_type}</TableCell>
                  <TableCell>${Number(r.coverage_amount || 0).toLocaleString()}</TableCell>
                  <TableCell>${Number(r.premium_amount || 0).toLocaleString()}</TableCell>
                  <TableCell>{r.effective_from ? `${new Date(r.effective_from).toLocaleDateString()} – ${r.effective_to ? new Date(r.effective_to).toLocaleDateString() : 'Open'}` : '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={`capitalize ${r.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : ''}`}>{r.status}</Badge></TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Reinsurance Contract</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Reinsurer Name *</Label><Input value={form.reinsurer_name} onChange={e => setForm(f => ({ ...f, reinsurer_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Contract Number</Label><Input value={form.contract_number} onChange={e => setForm(f => ({ ...f, contract_number: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Coverage Type</Label><Select value={form.coverage_type} onValueChange={v => setForm(f => ({ ...f, coverage_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="proportional">Proportional</SelectItem><SelectItem value="non-proportional">Non-Proportional</SelectItem><SelectItem value="facultative">Facultative</SelectItem><SelectItem value="treaty">Treaty</SelectItem></SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Coverage Amount</Label><Input type="number" value={form.coverage_amount} onChange={e => setForm(f => ({ ...f, coverage_amount: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Premium Amount</Label><Input type="number" value={form.premium_amount} onChange={e => setForm(f => ({ ...f, premium_amount: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Effective From</Label><Input type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} /></div>
              <div className="space-y-2"><Label>Effective To</Label><Input type="date" value={form.effective_to} onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
