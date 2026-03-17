import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAllRegulators, useRegulatorMutations } from '@/hooks/useRegulators';
import type { Regulator } from '@/contexts/RegulatorContext';

export default function RegulatorManagement() {
  const { toast } = useToast();
  const { data: regulators = [], isLoading } = useAllRegulators();
  const { upsert, remove } = useRegulatorMutations();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('active');

  const openAdd = () => {
    setEditId(null); setName(''); setCode(''); setDescription(''); setStatus('active');
    setDialogOpen(true);
  };

  const openEdit = (r: Regulator) => {
    setEditId(r.id); setName(r.name); setCode(r.code); setDescription(r.description || ''); setStatus(r.status);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) {
      toast({ title: 'Name and Code are required', variant: 'destructive' }); return;
    }
    try {
      await upsert.mutateAsync({ id: editId || undefined, name, code, description, status });
      toast({ title: editId ? 'Updated' : 'Created' });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast({ title: 'Deleted' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const columns: Column<Regulator>[] = [
    { key: 'name', label: 'Name', render: r => <span className="font-medium text-foreground">{r.name}</span> },
    { key: 'code', label: 'Code', render: r => <Badge variant="outline">{r.code}</Badge> },
    { key: 'description', label: 'Description', render: r => <span className="text-muted-foreground text-sm">{r.description || '—'}</span> },
    { key: 'status', label: 'Status', render: r => <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge> },
    {
      key: 'actions', label: '', render: r => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Regulator Management" description="Manage regulatory divisions and their configurations." />
        <DataTableShell
          columns={columns}
          data={regulators}
          searchPlaceholder="Search regulators..."
          actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Regulator</Button>}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Edit' : 'Add'} Regulator</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Securities Commission" />
            </div>
            <div className="space-y-2">
              <Label>Code *</Label>
              <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. SEC" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description..." />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
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
            <Button onClick={handleSave}>{editId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
