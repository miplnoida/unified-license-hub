import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Loader2, Search, Gavel } from 'lucide-react';
import Swal from 'sweetalert2';

const ENFORCEMENT_TYPES = ['Warning', 'Fine', 'Suspension', 'Revocation', 'Cease and Desist', 'Investigation', 'Other'];

export default function EnforcementTab({ entityId }: { entityId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ case_number: '', enforcement_type: 'Warning', date_opened: '', status: 'open', penalty_amount: '', description: '' });

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('enforcement_actions' as any).select('*').eq('entity_id', entityId).order('created_at', { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [entityId]);

  const openCreate = () => { setEditing(null); setForm({ case_number: '', enforcement_type: 'Warning', date_opened: new Date().toISOString().slice(0, 10), status: 'open', penalty_amount: '', description: '' }); setDialogOpen(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ case_number: r.case_number, enforcement_type: r.enforcement_type, date_opened: r.date_opened, status: r.status, penalty_amount: r.penalty_amount?.toString() || '', description: r.description || '' }); setDialogOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    const payload = { entity_id: entityId, case_number: form.case_number, enforcement_type: form.enforcement_type, date_opened: form.date_opened, status: form.status, penalty_amount: form.penalty_amount ? parseFloat(form.penalty_amount) : 0, description: form.description || null };
    const { error } = editing ? await supabase.from('enforcement_actions' as any).update(payload).eq('id', editing.id) : await supabase.from('enforcement_actions' as any).insert(payload);
    if (error) toast.error(error.message); else { toast.success(editing ? 'Updated' : 'Created'); setDialogOpen(false); fetchData(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const r = await Swal.fire({ title: 'Delete enforcement action?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, delete' });
    if (!r.isConfirmed) return;
    await supabase.from('enforcement_actions' as any).delete().eq('id', id);
    toast.success('Deleted'); fetchData();
  };

  const filtered = rows.filter(r => !search || r.case_number?.toLowerCase().includes(search.toLowerCase()) || r.enforcement_type?.toLowerCase().includes(search.toLowerCase()));
  const statusColor = (s: string) => s === 'open' ? 'bg-warning/10 text-warning border-warning/20' : s === 'closed' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : '';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg"><Gavel className="h-5 w-5 text-primary" />Enforcement Actions</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Case #</TableHead><TableHead>Type</TableHead><TableHead>Date Opened</TableHead><TableHead>Penalty</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No enforcement actions.</TableCell></TableRow> : filtered.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-mono">{r.case_number || '—'}</TableCell>
                  <TableCell><Badge variant="outline">{r.enforcement_type}</Badge></TableCell>
                  <TableCell>{r.date_opened ? new Date(r.date_opened).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>{r.penalty_amount ? `$${Number(r.penalty_amount).toLocaleString()}` : '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={`capitalize ${statusColor(r.status)}`}>{r.status}</Badge></TableCell>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Enforcement Action</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Case Number</Label><Input value={form.case_number} onChange={e => setForm(f => ({ ...f, case_number: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Type</Label><Select value={form.enforcement_type} onValueChange={v => setForm(f => ({ ...f, enforcement_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ENFORCEMENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-2"><Label>Date Opened</Label><Input type="date" value={form.date_opened} onChange={e => setForm(f => ({ ...f, date_opened: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="under_review">Under Review</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Penalty Amount</Label><Input type="number" value={form.penalty_amount} onChange={e => setForm(f => ({ ...f, penalty_amount: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
