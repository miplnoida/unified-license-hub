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
import { Plus, Pencil, Trash2, Loader2, Search, Users } from 'lucide-react';
import Swal from 'sweetalert2';

interface RelationshipsTabProps {
  entityId: string;
}

const RELATIONSHIP_TYPES = ['Parent', 'Subsidiary', 'Associate', 'Affiliate', 'Joint Venture', 'Branch', 'Other'];

export default function RelationshipsTab({ entityId }: RelationshipsTabProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    related_entity_name: '',
    relationship_type: 'Associate',
    ownership_percentage: '',
    effective_date: '',
    status: 'active',
    notes: '',
  });

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('entity_relationships' as any)
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [entityId]);

  const openCreate = () => {
    setEditing(null);
    setForm({ related_entity_name: '', relationship_type: 'Associate', ownership_percentage: '', effective_date: '', status: 'active', notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (row: any) => {
    setEditing(row);
    setForm({
      related_entity_name: row.related_entity_name,
      relationship_type: row.relationship_type,
      ownership_percentage: row.ownership_percentage?.toString() || '',
      effective_date: row.effective_date || '',
      status: row.status,
      notes: row.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.related_entity_name.trim()) { toast.error('Related entity name is required'); return; }
    setSaving(true);
    const payload = {
      entity_id: entityId,
      related_entity_name: form.related_entity_name,
      relationship_type: form.relationship_type,
      ownership_percentage: form.ownership_percentage ? parseFloat(form.ownership_percentage) : null,
      effective_date: form.effective_date || null,
      status: form.status,
      notes: form.notes || null,
    };

    const { error } = editing
      ? await supabase.from('entity_relationships' as any).update(payload).eq('id', editing.id)
      : await supabase.from('entity_relationships' as any).insert(payload);

    if (error) toast.error(error.message);
    else { toast.success(editing ? 'Updated' : 'Created'); setDialogOpen(false); fetchData(); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({ title: 'Delete relationship?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Yes, delete' });
    if (!result.isConfirmed) return;
    const { error } = await supabase.from('entity_relationships' as any).delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const filtered = rows.filter(r => !search || r.related_entity_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" />Relationships</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Related Entity</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Ownership %</TableHead>
                <TableHead>Effective Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No relationships found.</TableCell></TableRow>
              ) : filtered.map((r, i) => (
                <TableRow key={r.id}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-medium">{r.related_entity_name}</TableCell>
                  <TableCell><Badge variant="outline">{r.relationship_type}</Badge></TableCell>
                  <TableCell>{r.ownership_percentage != null ? `${r.ownership_percentage}%` : '—'}</TableCell>
                  <TableCell>{r.effective_date ? new Date(r.effective_date).toLocaleDateString() : '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : ''}>{r.status}</Badge>
                  </TableCell>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Relationship</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Related Entity Name *</Label><Input value={form.related_entity_name} onChange={e => setForm(f => ({ ...f, related_entity_name: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Relationship Type</Label>
              <Select value={form.relationship_type} onValueChange={v => setForm(f => ({ ...f, relationship_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RELATIONSHIP_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Ownership %</Label><Input type="number" min="0" max="100" value={form.ownership_percentage} onChange={e => setForm(f => ({ ...f, ownership_percentage: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Effective Date</Label><Input type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
