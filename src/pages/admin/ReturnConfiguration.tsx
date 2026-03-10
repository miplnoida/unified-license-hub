import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useSectors, useSubSectors } from '@/hooks/useMasterConfig';
import { toast } from 'sonner';
import { PlusCircle, Pencil, Trash2, Loader2 } from 'lucide-react';

interface ReturnConfig {
  id: string;
  name: string;
  form_id: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  frequency: string;
  due_day: number;
  is_active: boolean;
  created_at: string;
}

export default function ReturnConfiguration() {
  const [configs, setConfigs] = useState<ReturnConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReturnConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [dueDay, setDueDay] = useState('15');
  const [sectorId, setSectorId] = useState('');
  const [subSectorId, setSubSectorId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const { data: sectors = [] } = useSectors();
  const { data: subSectors = [] } = useSubSectors();

  const loadConfigs = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('return_configurations' as any).select('*').order('created_at', { ascending: false });
    if (!error) setConfigs((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { loadConfigs(); }, []);

  const resetForm = () => { setName(''); setFrequency('monthly'); setDueDay('15'); setSectorId(''); setSubSectorId(''); setIsActive(true); setEditing(null); };

  const openEdit = (c: ReturnConfig) => {
    setEditing(c); setName(c.name); setFrequency(c.frequency); setDueDay(String(c.due_day));
    setSectorId(c.sector_id || ''); setSubSectorId(c.sub_sector_id || ''); setIsActive(c.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    const payload: any = {
      name: name.trim(), frequency, due_day: parseInt(dueDay),
      sector_id: sectorId || null, sub_sector_id: subSectorId || null, is_active: isActive,
    };
    if (editing) {
      const { error } = await supabase.from('return_configurations' as any).update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Configuration updated');
    } else {
      const { error } = await supabase.from('return_configurations' as any).insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Configuration created');
    }
    setSaving(false); setDialogOpen(false); resetForm(); loadConfigs();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('return_configurations' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted'); loadConfigs();
  };

  const getSectorName = (id: string | null) => sectors.find(s => s.id === id)?.name || '—';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Return Configuration"
          description="Configure compliance return schedules and forms"
          actions={
            <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4 mr-2" />Add Configuration</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Return Configuration</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monthly Financial Return" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select value={frequency} onValueChange={setFrequency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Due Day</Label><Input type="number" min="1" max="28" value={dueDay} onChange={e => setDueDay(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Sector</Label>
                      <Select value={sectorId} onValueChange={v => { setSectorId(v); setSubSectorId(''); }}>
                        <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>{sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Sub-Sector</Label>
                      <Select value={subSectorId} onValueChange={setSubSectorId} disabled={!sectorId}>
                        <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>{subSectors.filter(s => s.sector_id === sectorId).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} /><Label>Active</Label></div>
                  <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Due Day</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No configurations</TableCell></TableRow>
                  ) : configs.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="capitalize">{c.frequency}</TableCell>
                      <TableCell>Day {c.due_day}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{getSectorName(c.sector_id)}</TableCell>
                      <TableCell><Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
