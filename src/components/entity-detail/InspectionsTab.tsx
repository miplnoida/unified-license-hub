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
import { Plus, Pencil, Loader2, Search, ClipboardCheck } from 'lucide-react';

export default function InspectionsTab({ entityId }: { entityId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ inspection_type: 'on-site', date_conducted: '', inspector_name: '', findings_summary: '', compliance_rating: 'satisfactory', status: 'scheduled' });

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('inspections' as any).select('*').eq('entity_id', entityId).order('date_conducted', { ascending: false });
    setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [entityId]);

  const openCreate = () => { setEditing(null); setForm({ inspection_type: 'on-site', date_conducted: new Date().toISOString().slice(0, 10), inspector_name: '', findings_summary: '', compliance_rating: 'satisfactory', status: 'scheduled' }); setDialogOpen(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ inspection_type: r.inspection_type, date_conducted: r.date_conducted, inspector_name: r.inspector_name || '', findings_summary: r.findings_summary || '', compliance_rating: r.compliance_rating, status: r.status }); setDialogOpen(true); };

  const handleSave = async () => {
    setSaving(true);
    const payload = { entity_id: entityId, ...form, inspector_name: form.inspector_name || null, findings_summary: form.findings_summary || null };
    const { error } = editing ? await supabase.from('inspections' as any).update(payload).eq('id', editing.id) : await supabase.from('inspections' as any).insert(payload);
    if (error) toast.error(error.message); else { toast.success(editing ? 'Updated' : 'Created'); setDialogOpen(false); fetchData(); }
    setSaving(false);
  };

  const filtered = rows.filter(r => !search || r.inspector_name?.toLowerCase().includes(search.toLowerCase()) || r.inspection_type?.toLowerCase().includes(search.toLowerCase()));
  const ratingColor = (r: string) => r === 'satisfactory' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : r === 'unsatisfactory' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-warning/10 text-warning border-warning/20';

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" />Inspections</CardTitle>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 relative max-w-sm"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="Search..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} /></div>
        {rows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No inspections recorded.</div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Inspector</TableHead><TableHead>Findings</TableHead><TableHead>Rating</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.date_conducted).toLocaleDateString()}</TableCell>
                  <TableCell className="capitalize">{r.inspection_type}</TableCell>
                  <TableCell>{r.inspector_name || '—'}</TableCell>
                  <TableCell className="max-w-xs truncate">{r.findings_summary || '—'}</TableCell>
                  <TableCell><Badge variant="outline" className={`capitalize ${ratingColor(r.compliance_rating)}`}>{r.compliance_rating}</Badge></TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{r.status}</Badge></TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit' : 'Add'} Inspection</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Type</Label><Select value={form.inspection_type} onValueChange={v => setForm(f => ({ ...f, inspection_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="on-site">On-site</SelectItem><SelectItem value="off-site">Off-site</SelectItem><SelectItem value="desk-review">Desk Review</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date_conducted} onChange={e => setForm(f => ({ ...f, date_conducted: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Inspector Name</Label><Input value={form.inspector_name} onChange={e => setForm(f => ({ ...f, inspector_name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Compliance Rating</Label><Select value={form.compliance_rating} onValueChange={v => setForm(f => ({ ...f, compliance_rating: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="satisfactory">Satisfactory</SelectItem><SelectItem value="needs_improvement">Needs Improvement</SelectItem><SelectItem value="unsatisfactory">Unsatisfactory</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Status</Label><Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="scheduled">Scheduled</SelectItem><SelectItem value="in_progress">In Progress</SelectItem><SelectItem value="completed">Completed</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>Findings Summary</Label><Textarea value={form.findings_summary} onChange={e => setForm(f => ({ ...f, findings_summary: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
