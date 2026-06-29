import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PlusCircle, Pencil, Trash2, Loader2, DollarSign } from 'lucide-react';
import { resolveApplicationFeeBreakdownMeta, ApplicationFeeLine } from '@/lib/applicationFeeBreakdown';

interface FeeType {
  id: string;
  name: string;
  code: string | null;
  status: string;
}

interface FeeComponent {
  id: string;
  application_id: string;
  fee_type_id: string;
  amount: number;
  description: string | null;
  fee_type_name?: string;
}

interface Props {
  applicationId: string;
  editable?: boolean;
}

export function FeeComponentsPanel({ applicationId, editable = false }: Props) {
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [components, setComponents] = useState<FeeComponent[]>([]);
  const [resolvedFallback, setResolvedFallback] = useState<ApplicationFeeLine[]>([]);
  const [isRenewal, setIsRenewal] = useState(false);
  const [renewalFeeMissing, setRenewalFeeMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state for adding/editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feeTypeIds, setFeeTypeIds] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const activeFeeTypes = useMemo(() => feeTypes.filter(ft => ft.status === 'active'), [feeTypes]);

  const total = useMemo(() => components.reduce((sum, c) => sum + Number(c.amount), 0), [components]);
  const fallbackTotal = useMemo(() => resolvedFallback.reduce((sum, c) => sum + Number(c.amount), 0), [resolvedFallback]);

  const loadData = async () => {
    setLoading(true);
    const [ftRes, fcRes, meta] = await Promise.all([
      supabase.from('fee_types' as any).select('*').order('name'),
      supabase.from('fee_components' as any).select('*').eq('application_id', applicationId).order('created_at'),
      resolveApplicationFeeBreakdownMeta(applicationId).catch(() => ({ lines: [] as ApplicationFeeLine[], isRenewal: false, hasRenewalFeeConfig: false })),
    ]);
    if (ftRes.data) setFeeTypes(ftRes.data as any);
    if (fcRes.data) {
      const comps = (fcRes.data as any[]).map(c => ({
        ...c,
        fee_type_name: (ftRes.data as any[])?.find(ft => ft.id === c.fee_type_id)?.name || 'Unknown',
      }));
      setComponents(comps);
    }
    setResolvedFallback(meta.lines || []);
    setIsRenewal(meta.isRenewal);
    setRenewalFeeMissing(meta.isRenewal && !meta.hasRenewalFeeConfig && (fcRes.data?.length || 0) === 0);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [applicationId]);

  const resetForm = () => {
    setFeeTypeIds([]); setAmount(''); setDescription(''); setEditingId(null); setShowForm(false);
  };

  const openEdit = (comp: FeeComponent) => {
    setEditingId(comp.id);
    setFeeTypeIds([comp.fee_type_id]);
    setAmount(String(comp.amount));
    setDescription(comp.description || '');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (feeTypeIds.length === 0) { toast.error('Fee type is required'); return; }
    // Prevent duplicate selection of types already added
    const existingTypeIds = components.filter(c => c.id !== editingId).map(c => c.fee_type_id);
    const duplicates = feeTypeIds.filter(id => existingTypeIds.includes(id));
    if (duplicates.length > 0) {
      const dupNames = duplicates.map(id => feeTypes.find(ft => ft.id === id)?.name || id).join(', ');
      toast.error(`Duplicate fee type(s): ${dupNames}`);
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) { toast.error('Amount must be greater than 0'); return; }

    setSaving(true);

    if (editingId) {
      const payload: any = {
        application_id: applicationId,
        fee_type_id: feeTypeIds[0],
        amount: numAmount,
        description: description.trim() || null,
      };
      const { error } = await supabase.from('fee_components' as any).update(payload).eq('id', editingId);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Fee component updated');
    } else {
      const rows = feeTypeIds.map(ftId => ({
        application_id: applicationId,
        fee_type_id: ftId,
        amount: numAmount,
        description: description.trim() || null,
      }));
      const { error } = await supabase.from('fee_components' as any).insert(rows);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success(`${rows.length} fee component(s) added`);
    }
    setSaving(false); resetForm(); loadData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('fee_components' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Fee component removed'); loadData();
  };

  if (loading) return <Card><CardContent className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Fee Breakdown
          </CardTitle>
          {editable && !showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <PlusCircle className="h-4 w-4 mr-2" /> Add Fee
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add/Edit form */}
        {editable && showForm && (
          <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
            <p className="text-sm font-medium">{editingId ? 'Edit Fee' : 'Add Fee Component'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fee Type(s) *</Label>
                <MultiSelect
                  options={activeFeeTypes.map(ft => ({
                    value: ft.id,
                    label: ft.name + (ft.code ? ` (${ft.code})` : ''),
                  }))}
                  selected={feeTypeIds}
                  onChange={setFeeTypeIds}
                  placeholder="Select types..."
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount *</Label>
                <Input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional note" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
              </Button>
              <Button size="sm" variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Components table */}
        {components.length === 0 ? (
          resolvedFallback.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground">
                Auto-resolved from fee configuration (no manual fee components added).
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fee Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedFallback.map(line => (
                    <TableRow key={line.id}>
                      <TableCell className="font-medium">{line.name}</TableCell>
                      <TableCell className="text-right font-mono">{Number(line.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-end border-t pt-3">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-lg font-bold font-mono">{fallbackTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No fee components added yet.</p>
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {editable && <TableHead className="text-right w-[80px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {components.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.fee_type_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.description || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{Number(c.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
                    {editable && (
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end border-t pt-3">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total</p>
                <p className="text-lg font-bold font-mono">{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
