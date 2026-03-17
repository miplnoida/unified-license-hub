import { useState, useEffect } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Edit, Trash2, Building2, Layers, FormInput, GitBranch, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAllRegulators, useRegulatorMutations } from '@/hooks/useRegulators';
import { useSectors, useMasterMutations } from '@/hooks/useMasterConfig';
import { useForms } from '@/hooks/useForms';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Regulator } from '@/contexts/RegulatorContext';

function useRegulatorStats(regulatorId: string | null) {
  const { data: sectors = [] } = useSectors(regulatorId);
  const { data: forms = [] } = useForms(undefined, regulatorId);

  const { data: workflows = [] } = useQuery({
    queryKey: ['workflows-count', regulatorId],
    queryFn: async () => {
      let q = supabase.from('approval_workflows').select('id');
      if (regulatorId) q = q.eq('regulator_id', regulatorId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!regulatorId,
  });

  const { data: fees = [] } = useQuery({
    queryKey: ['fees-count', regulatorId],
    queryFn: async () => {
      let q = supabase.from('fee_configurations' as any).select('id');
      if (regulatorId) q = q.eq('regulator_id', regulatorId);
      const { data } = await q;
      return (data || []) as any[];
    },
    enabled: !!regulatorId,
  });

  return { sectors: sectors.length, forms: forms.length, workflows: workflows.length, fees: fees.length };
}

function RegulatorDetail({ regulator }: { regulator: Regulator }) {
  const stats = useRegulatorStats(regulator.id);

  const statCards = [
    { label: 'Sectors', value: stats.sectors, icon: <Layers className="h-4 w-4" /> },
    { label: 'Forms', value: stats.forms, icon: <FormInput className="h-4 w-4" /> },
    { label: 'Workflows', value: stats.workflows, icon: <GitBranch className="h-4 w-4" /> },
    { label: 'Fee Configs', value: stats.fees, icon: <DollarSign className="h-4 w-4" /> },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {statCards.map(s => (
        <Card key={s.label}>
          <CardContent className="flex items-center gap-3 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{s.icon}</div>
            <div>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

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
  const [selectedRegulator, setSelectedRegulator] = useState<Regulator | null>(null);

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
      if (selectedRegulator?.id === id) setSelectedRegulator(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const columns: Column<Regulator>[] = [
    { key: 'name', label: 'Name', render: r => (
      <button onClick={() => setSelectedRegulator(r)} className="font-medium text-primary hover:underline text-left">{r.name}</button>
    )},
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
        <PageHeader
          title="Regulator Management"
          description="Manage regulatory divisions, view their mapped sectors, forms, workflows, and fee structures."
        />

        <DataTableShell
          columns={columns}
          data={regulators}
          searchPlaceholder="Search regulators..."
          actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Regulator</Button>}
        />

        {selectedRegulator && (
          <Card className="animate-slide-up">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{selectedRegulator.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">Configuration summary for <Badge variant="outline" className="ml-1">{selectedRegulator.code}</Badge></p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <RegulatorDetail regulator={selectedRegulator} />
              <p className="text-sm text-muted-foreground mt-4">
                Use the regulator switcher in the header to select this regulator, then navigate to Master Configuration, Form Builder, Workflows, or Fee Management to manage its resources.
              </p>
            </CardContent>
          </Card>
        )}
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
