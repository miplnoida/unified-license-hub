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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useLateFeeStructures, useMutateLateFee, usePenaltyTiers, useMutatePenaltyTier, useReturnTypes } from '@/hooks/useReturnsManagement';
import { useSectors } from '@/hooks/useMasterConfig';
import { useRegulator } from '@/contexts/RegulatorContext';
import { PlusCircle, Pencil, Trash2, Loader2, ChevronRight, Layers } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';

export default function LateFeesPage() {
  const { activeRegulatorId } = useRegulator();
  const { data: structures = [], isLoading } = useLateFeeStructures();
  const { data: returnTypes = [] } = useReturnTypes();
  const { data: sectors = [] } = useSectors(activeRegulatorId);
  const { create, update, remove } = useMutateLateFee();

  const [open, setOpen] = useState(false);
  const [tiersOpen, setTiersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [feeName, setFeeName] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [returnTypeId, setReturnTypeId] = useState('');
  const [baseAmount, setBaseAmount] = useState('0');
  const [currency, setCurrency] = useState('USD');
  const [status, setStatus] = useState(true);

  const reset = () => { setFeeName(''); setSectorId(''); setReturnTypeId(''); setBaseAmount('0'); setCurrency('USD'); setStatus(true); setEditing(null); };
  const openEdit = (s: any) => { setEditing(s); setFeeName(s.fee_name); setSectorId(s.sector_id || ''); setReturnTypeId(s.return_type_id || ''); setBaseAmount(String(s.base_amount)); setCurrency(s.currency); setStatus(s.status === 'active'); setOpen(true); };

  const handleSave = () => {
    if (!feeName.trim()) return;
    const payload = { fee_name: feeName.trim(), sector_id: sectorId || null, return_type_id: returnTypeId || null, base_amount: parseFloat(baseAmount) || 0, currency, status: status ? 'active' : 'inactive' };
    if (editing) {
      update.mutate({ id: editing.id, ...payload }, { onSuccess: () => { setOpen(false); reset(); } });
    } else {
      create.mutate(payload, { onSuccess: () => { setOpen(false); reset(); } });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Late Fees Configuration" description="Manage penalty structures for late return submissions"
          actions={
            <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
              <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4 mr-2" />Add Fee Structure</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Late Fee Structure</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Fee Name *</Label><Input value={feeName} onChange={e => setFeeName(e.target.value)} placeholder="e.g. Late Filing Penalty" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Sector</Label>
                      <Select value={sectorId} onValueChange={setSectorId}>
                        <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>{sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Return Type</Label>
                      <Select value={returnTypeId} onValueChange={setReturnTypeId}>
                        <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>{returnTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Base Amount</Label><Input type="number" value={baseAmount} onChange={e => setBaseAmount(e.target.value)} /></div>
                    <div className="space-y-2"><Label>Currency</Label><Input value={currency} onChange={e => setCurrency(e.target.value)} /></div>
                  </div>
                  <div className="flex items-center gap-2"><Switch checked={status} onCheckedChange={setStatus} /><Label>Active</Label></div>
                  <Button onClick={handleSave} disabled={create.isPending || update.isPending} className="w-full">
                    {(create.isPending || update.isPending) ? 'Saving...' : editing ? 'Update' : 'Create'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />

        {selectedId && <PenaltyTiersDialog structureId={selectedId} open={tiersOpen} onOpenChange={v => { setTiersOpen(v); if (!v) setSelectedId(null); }} />}

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader><TableRow><TableHead>Fee Name</TableHead><TableHead>Sector</TableHead><TableHead>Return Type</TableHead><TableHead>Base Amount</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>
                  {structures.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No fee structures</TableCell></TableRow>
                  ) : structures.map(s => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.fee_name}</TableCell>
                      <TableCell>{s.sectors?.name || 'All'}</TableCell>
                      <TableCell>{s.return_types?.name || 'All'}</TableCell>
                      <TableCell>{s.currency} {s.base_amount}</TableCell>
                      <TableCell><Badge variant={s.status === 'active' ? 'default' : 'secondary'}>{s.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <RowActionsMenu actions={[
                          { label: 'Manage tiers', icon: Layers, onClick: () => { setSelectedId(s.id); setTiersOpen(true); } },
                          { label: 'Edit', icon: Pencil, onClick: () => openEdit(s) },
                          { label: 'Delete', icon: Trash2, onClick: () => remove.mutate(s.id), destructive: true, separator: true },
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

function PenaltyTiersDialog({ structureId, open, onOpenChange }: { structureId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: tiers = [], isLoading } = usePenaltyTiers(structureId);
  const { create, update, remove } = useMutatePenaltyTier();
  const [tierLabel, setTierLabel] = useState('');
  const [daysFrom, setDaysFrom] = useState('');
  const [daysTo, setDaysTo] = useState('');
  const [penalty, setPenalty] = useState('');

  const handleAdd = () => {
    if (!tierLabel || !daysFrom || !daysTo || !penalty) return;
    create.mutate({ late_fee_structure_id: structureId, tier_label: tierLabel, days_from: parseInt(daysFrom), days_to: parseInt(daysTo), penalty_percentage: parseFloat(penalty) }, {
      onSuccess: () => { setTierLabel(''); setDaysFrom(''); setDaysTo(''); setPenalty(''); },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Penalty Tiers</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <Table>
            <TableHeader><TableRow><TableHead>Tier</TableHead><TableHead>Days From</TableHead><TableHead>Days To</TableHead><TableHead>Penalty %</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {tiers.map(t => (
                <TableRow key={t.id}>
                  <TableCell>{t.tier_label}</TableCell><TableCell>{t.days_from}</TableCell><TableCell>{t.days_to}</TableCell>
                  <TableCell>{t.penalty_percentage}%</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="grid grid-cols-5 gap-2 items-end">
            <div className="space-y-1"><Label className="text-xs">Tier Label</Label><Input value={tierLabel} onChange={e => setTierLabel(e.target.value)} placeholder="0-30 days" /></div>
            <div className="space-y-1"><Label className="text-xs">From</Label><Input type="number" value={daysFrom} onChange={e => setDaysFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">To</Label><Input type="number" value={daysTo} onChange={e => setDaysTo(e.target.value)} /></div>
            <div className="space-y-1"><Label className="text-xs">Penalty %</Label><Input type="number" value={penalty} onChange={e => setPenalty(e.target.value)} /></div>
            <Button onClick={handleAdd} disabled={create.isPending} size="sm"><PlusCircle className="h-4 w-4 mr-1" />Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
