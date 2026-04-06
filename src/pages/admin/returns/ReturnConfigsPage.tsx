import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useReturnConfigs, useMutateReturnConfig, useReturnTypes, useReturnConfigForms, useMutateReturnConfigForms } from '@/hooks/useReturnsManagement';
import { useSectors, useSubSectors } from '@/hooks/useMasterConfig';
import { useRegulator } from '@/contexts/RegulatorContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { PlusCircle, Pencil, Trash2, Loader2, Settings2, X } from 'lucide-react';

export default function ReturnConfigsPage() {
  const { activeRegulatorId } = useRegulator();
  const { data: configs = [], isLoading } = useReturnConfigs();
  const { data: returnTypes = [] } = useReturnTypes();
  const { data: sectors = [] } = useSectors(activeRegulatorId);
  const { data: subSectors = [] } = useSubSectors(activeRegulatorId);
  const { create, update, remove } = useMutateReturnConfig();

  const [open, setOpen] = useState(false);
  const [formAssignOpen, setFormAssignOpen] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [subsectorId, setSubsectorId] = useState('');
  const [returnTypeId, setReturnTypeId] = useState('');
  const [version, setVersion] = useState('1.0');
  const [status, setStatus] = useState(true);

  const reset = () => { setName(''); setSectorId(''); setSubsectorId(''); setReturnTypeId(''); setVersion('1.0'); setStatus(true); setEditing(null); };

  const openEdit = (c: any) => {
    setEditing(c); setName(c.name); setSectorId(c.sector_id || ''); setSubsectorId(c.subsector_id || '');
    setReturnTypeId(c.return_type_id); setVersion(c.version); setStatus(c.status === 'active'); setOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !returnTypeId) return;
    const payload = { name: name.trim(), sector_id: sectorId || null, subsector_id: subsectorId || null, return_type_id: returnTypeId, version, status: status ? 'active' : 'inactive' };
    if (editing) {
      update.mutate({ id: editing.id, ...payload }, { onSuccess: () => { setOpen(false); reset(); } });
    } else {
      create.mutate(payload, { onSuccess: () => { setOpen(false); reset(); } });
    }
  };

  const getTypeName = (id: string) => returnTypes.find(t => t.id === id)?.name || '—';
  const getSectorName = (id: string | null) => sectors.find(s => s.id === id)?.name || '—';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Return Configurations" description="Link existing forms to return schedules"
          actions={
            <Button onClick={() => { reset(); setOpen(true); }}><PlusCircle className="h-4 w-4 mr-2" />Add Configuration</Button>
          }
        />

        {/* Main Config Dialog */}
        <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Return Configuration</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Configuration Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Insurance Annual Return 2026" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Sector</Label>
                  <Select value={sectorId} onValueChange={v => { setSectorId(v); setSubsectorId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                    <SelectContent>{sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sub-Sector</Label>
                  <Select value={subsectorId} onValueChange={setSubsectorId} disabled={!sectorId}>
                    <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>{subSectors.filter(s => s.sector_id === sectorId).map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Return Type *</Label>
                  <Select value={returnTypeId} onValueChange={setReturnTypeId}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>{returnTypes.filter(t => t.status === 'active').map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Version</Label><Input value={version} onChange={e => setVersion(e.target.value)} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={status} onCheckedChange={setStatus} /><Label>Active</Label></div>
              <Button onClick={handleSave} disabled={create.isPending || update.isPending} className="w-full">
                {(create.isPending || update.isPending) ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Form Assignment Dialog */}
        {selectedConfigId && (
          <FormAssignmentDialog configId={selectedConfigId} open={formAssignOpen} onOpenChange={v => { setFormAssignOpen(v); if (!v) setSelectedConfigId(null); }} />
        )}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead><TableHead>Sector</TableHead><TableHead>Return Type</TableHead><TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No configurations</TableCell></TableRow>
                  ) : configs.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.sectors?.name || '—'}</TableCell>
                      <TableCell>{c.return_types?.name || '—'}</TableCell>
                      <TableCell><Badge variant="outline">{c.version}</Badge></TableCell>
                      <TableCell><Badge variant={c.status === 'active' ? 'default' : 'secondary'}>{c.status}</Badge></TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => { setSelectedConfigId(c.id); setFormAssignOpen(true); }} title="Assign Forms"><Settings2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
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

function FormAssignmentDialog({ configId, open, onOpenChange }: { configId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: assignedForms = [], isLoading: loadingAssigned } = useReturnConfigForms(configId);
  const { upsert } = useMutateReturnConfigForms();
  const { data: allForms = [] } = useQuery({
    queryKey: ['all_form_templates_for_return'],
    queryFn: async () => {
      const { data, error } = await supabase.from('form_templates').select('id, name, description, status, form_type').eq('status', 'published').order('name');
      if (error) throw error;
      return data;
    },
  });

  const [localForms, setLocalForms] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Initialize from DB
  if (!initialized && !loadingAssigned && assignedForms.length >= 0) {
    setLocalForms(assignedForms.map(f => ({ form_id: f.form_id, form_name: f.form_templates?.name || '', tab_name: f.tab_name, display_order: f.display_order })));
    setInitialized(true);
  }

  const addForm = (form: any) => {
    if (localForms.find(f => f.form_id === form.id)) return;
    setLocalForms([...localForms, { form_id: form.id, form_name: form.name, tab_name: 'General', display_order: localForms.length }]);
  };

  const removeForm = (formId: string) => setLocalForms(localForms.filter(f => f.form_id !== formId));
  const updateForm = (formId: string, field: string, value: any) => setLocalForms(localForms.map(f => f.form_id === formId ? { ...f, [field]: value } : f));

  const handleSave = () => {
    upsert.mutate({ configId, forms: localForms }, { onSuccess: () => onOpenChange(false) });
  };

  const filtered = allForms.filter(f => !localForms.find(lf => lf.form_id === f.id) && f.name.toLowerCase().includes(search.toLowerCase()));
  const tabs = [...new Set(localForms.map(f => f.tab_name))];

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setInitialized(false); }}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Assign Forms to Return Configuration</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-6">
          {/* Left: Available Forms */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Available Forms</Label>
            <Input placeholder="Search forms..." value={search} onChange={e => setSearch(e.target.value)} />
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {filtered.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 border rounded-md hover:bg-muted/50 cursor-pointer" onClick={() => addForm(f)}>
                  <div>
                    <p className="text-sm font-medium">{f.name}</p>
                    <p className="text-xs text-muted-foreground">{f.form_type}</p>
                  </div>
                  <PlusCircle className="h-4 w-4 text-primary" />
                </div>
              ))}
              {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No forms available</p>}
            </div>
          </div>

          {/* Right: Assigned Forms */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Assigned Forms ({localForms.length})</Label>
            {tabs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No forms assigned yet. Click forms on the left to add them.</p>
            ) : tabs.map(tab => (
              <div key={tab} className="space-y-2">
                <Badge variant="outline" className="text-xs">{tab}</Badge>
                {localForms.filter(f => f.tab_name === tab).sort((a, b) => a.display_order - b.display_order).map(f => (
                  <div key={f.form_id} className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.form_name}</p>
                    </div>
                    <Input className="w-24 h-8 text-xs" placeholder="Tab" value={f.tab_name} onChange={e => updateForm(f.form_id, 'tab_name', e.target.value)} />
                    <Input className="w-16 h-8 text-xs" type="number" value={f.display_order} onChange={e => updateForm(f.form_id, 'display_order', parseInt(e.target.value) || 0)} />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeForm(f.form_id)}><X className="h-3 w-3" /></Button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>{upsert.isPending ? 'Saving...' : 'Save Assignments'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
