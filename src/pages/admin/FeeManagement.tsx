import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useSectors, useSubSectors, useCategories, useServices } from '@/hooks/useMasterConfig';
import { toast } from 'sonner';
import { FEE_TYPE_LABELS, FeeType } from '@/types/platform';
import { PlusCircle, Pencil, Trash2, Loader2, DollarSign } from 'lucide-react';

interface FeeConfig {
  id: string;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  service_id: string | null;
  fee_type: FeeType;
  name: string;
  amount: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export default function FeeManagement() {
  const [fees, setFees] = useState<FeeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeeConfig | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [feeType, setFeeType] = useState<FeeType>('application');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [sectorId, setSectorId] = useState('');
  const [subSectorId, setSubSectorId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [isActive, setIsActive] = useState(true);

  const { data: sectors = [] } = useSectors();
  const { data: subSectors = [] } = useSubSectors();
  const { data: categories = [] } = useCategories();
  const { data: services = [] } = useServices();

  const loadFees = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('fee_configurations' as any).select('*').order('created_at', { ascending: false });
    if (!error) setFees((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { loadFees(); }, []);

  const resetForm = () => {
    setName(''); setFeeType('application'); setAmount(''); setCurrency('USD');
    setSectorId(''); setSubSectorId(''); setCategoryId(''); setServiceId('');
    setIsActive(true); setEditing(null);
  };

  const openEdit = (fee: FeeConfig) => {
    setEditing(fee);
    setName(fee.name); setFeeType(fee.fee_type); setAmount(String(fee.amount));
    setCurrency(fee.currency); setSectorId(fee.sector_id || '');
    setSubSectorId(fee.sub_sector_id || ''); setCategoryId(fee.category_id || '');
    setServiceId(fee.service_id || ''); setIsActive(fee.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !amount) { toast.error('Name and amount are required'); return; }
    setSaving(true);
    const payload: any = {
      name: name.trim(), fee_type: feeType, amount: parseFloat(amount), currency,
      sector_id: sectorId || null, sub_sector_id: subSectorId || null,
      category_id: categoryId || null, service_id: serviceId || null, is_active: isActive,
    };

    if (editing) {
      const { error } = await supabase.from('fee_configurations' as any).update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Fee updated');
    } else {
      const { error } = await supabase.from('fee_configurations' as any).insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Fee created');
    }
    setSaving(false); setDialogOpen(false); resetForm(); loadFees();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('fee_configurations' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Fee deleted'); loadFees();
  };

  const getSectorName = (id: string | null) => sectors.find(s => s.id === id)?.name || '—';

  const filteredSubSectors = subSectors.filter(s => s.sector_id === sectorId);
  const filteredCategories = categories.filter(c => c.sub_sector_id === subSectorId);
  const filteredServices = services.filter(s => s.sub_sector_id === subSectorId);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Fee Management"
          description="Configure application, processing, license and renewal fees"
          actions={
            <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><PlusCircle className="h-4 w-4 mr-2" />Add Fee</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>{editing ? 'Edit Fee' : 'New Fee Configuration'}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Fee Name *</Label>
                      <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Application Fee" />
                    </div>
                    <div className="space-y-2">
                      <Label>Fee Type</Label>
                      <Select value={feeType} onValueChange={v => setFeeType(v as FeeType)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(FEE_TYPE_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>{v}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Amount *</Label>
                      <Input type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                    </div>
                    <div className="space-y-2">
                      <Label>Currency</Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="GBP">GBP</SelectItem>
                          <SelectItem value="LSL">LSL</SelectItem>
                          <SelectItem value="ZAR">ZAR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Sector</Label>
                      <Select value={sectorId} onValueChange={v => { setSectorId(v); setSubSectorId(''); setCategoryId(''); setServiceId(''); }}>
                        <SelectTrigger><SelectValue placeholder="All sectors" /></SelectTrigger>
                        <SelectContent>
                          {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Sub-Sector</Label>
                      <Select value={subSectorId} onValueChange={v => { setSubSectorId(v); setCategoryId(''); setServiceId(''); }} disabled={!sectorId}>
                        <SelectTrigger><SelectValue placeholder="All sub-sectors" /></SelectTrigger>
                        <SelectContent>
                          {filteredSubSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                    <Label>Active</Label>
                  </div>
                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving ? 'Saving...' : editing ? 'Update Fee' : 'Create Fee'}
                  </Button>
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
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fees.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No fees configured</TableCell></TableRow>
                  ) : fees.map(fee => (
                    <TableRow key={fee.id}>
                      <TableCell className="font-medium">{fee.name}</TableCell>
                      <TableCell><Badge variant="outline">{FEE_TYPE_LABELS[fee.fee_type]}</Badge></TableCell>
                      <TableCell className="font-mono">{fee.currency} {Number(fee.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{getSectorName(fee.sector_id)}</TableCell>
                      <TableCell><Badge variant={fee.is_active ? 'default' : 'secondary'}>{fee.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(fee)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(fee.id)}><Trash2 className="h-4 w-4" /></Button>
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
