import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useCutoffConfigs, useMutateCutoffConfig, useReturnTypes } from '@/hooks/useReturnsManagement';
import { useSectors } from '@/hooks/useMasterConfig';
import { useRegulator } from '@/contexts/RegulatorContext';
import { PlusCircle, Pencil, Trash2, Loader2 } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';

export default function CutoffConfigPage() {
  const { activeRegulatorId } = useRegulator();
  const { data: configs = [], isLoading } = useCutoffConfigs();
  const { data: returnTypes = [] } = useReturnTypes();
  const { data: sectors = [] } = useSectors(activeRegulatorId);
  const { create, update, remove } = useMutateCutoffConfig();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [sectorId, setSectorId] = useState('');
  const [returnTypeId, setReturnTypeId] = useState('');
  const [cutoffDays, setCutoffDays] = useState('30');
  const [cutoffUnit, setCutoffUnit] = useState('days');

  const reset = () => { setSectorId(''); setReturnTypeId(''); setCutoffDays('30'); setCutoffUnit('days'); setEditing(null); };
  const openEdit = (c: any) => { setEditing(c); setSectorId(c.sector_id || ''); setReturnTypeId(c.return_type_id); setCutoffDays(String(c.cutoff_days)); setCutoffUnit(c.cutoff_unit); setOpen(true); };

  const handleSave = () => {
    if (!returnTypeId) return;
    const payload = { sector_id: sectorId || null, return_type_id: returnTypeId, cutoff_days: parseInt(cutoffDays), cutoff_unit: cutoffUnit };
    if (editing) {
      update.mutate({ id: editing.id, ...payload }, { onSuccess: () => { setOpen(false); reset(); } });
    } else {
      create.mutate(payload, { onSuccess: () => { setOpen(false); reset(); } });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Cutoff Configuration" description="Configure how many days after period end a return is due"
          actions={
            <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
              <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4 mr-2" />Add Cutoff</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Cutoff Configuration</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Sector</Label>
                    <Select value={sectorId} onValueChange={setSectorId}>
                      <SelectTrigger><SelectValue placeholder="All sectors" /></SelectTrigger>
                      <SelectContent>{sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Return Type *</Label>
                    <Select value={returnTypeId} onValueChange={setReturnTypeId}>
                      <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                      <SelectContent>{returnTypes.filter(t => t.status === 'active').map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Cutoff Value</Label><Input type="number" value={cutoffDays} onChange={e => setCutoffDays(e.target.value)} /></div>
                    <div className="space-y-2">
                      <Label>Unit</Label>
                      <Select value={cutoffUnit} onValueChange={setCutoffUnit}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="days">Days</SelectItem>
                          <SelectItem value="weeks">Weeks</SelectItem>
                          <SelectItem value="months">Months</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button onClick={handleSave} disabled={create.isPending || update.isPending} className="w-full">
                    {(create.isPending || update.isPending) ? 'Saving...' : editing ? 'Update' : 'Create'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Sector</TableHead><TableHead>Return Type</TableHead><TableHead>Cutoff</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {configs.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No cutoff configurations</TableCell></TableRow>
                  ) : configs.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>{c.sectors?.name || 'All'}</TableCell>
                      <TableCell>{c.return_types?.name || '—'}</TableCell>
                      <TableCell className="font-medium">{c.cutoff_days}</TableCell>
                      <TableCell className="capitalize">{c.cutoff_unit}</TableCell>
                      <TableCell className="text-right">
                        <RowActionsMenu actions={[
                          { label: 'Edit', icon: Pencil, onClick: () => openEdit(c) },
                          { label: 'Delete', icon: Trash2, onClick: () => remove.mutate(c.id), destructive: true, separator: true },
                        ]} />
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
