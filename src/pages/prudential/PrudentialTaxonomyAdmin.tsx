import { useState } from 'react';
import { useRiskTaxonomy, useUpsertTaxonomy, useDeleteTaxonomy } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

const emptyForm = { is_active: true, sort_order: 100 } as any;

export default function PrudentialTaxonomyAdmin() {
  const { data = [], isLoading } = useRiskTaxonomy();
  const upsert = useUpsertTaxonomy();
  const del = useDeleteTaxonomy();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyForm);

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (row: any) => {
    setForm({
      id: row.id,
      code: row.code,
      label: row.label,
      description: row.description || '',
      sort_order: row.sort_order ?? 100,
      parent_id: row.parent_id ?? 'none',
      is_active: !!row.is_active,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (upsert.isPending) return;
    try {
      const payload = { ...form, parent_id: form.parent_id && form.parent_id !== 'none' ? form.parent_id : null };
      await upsert.mutateAsync(payload);
      setOpen(false);
      setForm(emptyForm);
    } catch { /* toast from hook */ }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Prudential Risk Taxonomy</h1>
            <p className="text-sm text-muted-foreground">Configurable risk categories linked to ratios, thresholds, indicators.</p>
          </div>
          <Button data-rbac="prudential_supervision.edit" size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />New category</Button>
        </div>

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setForm(emptyForm); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{form.id ? 'Edit taxonomy category' : 'New taxonomy category'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Label</Label><Input value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div>
                <Label>Parent category</Label>
                <Select
                  value={form.parent_id || 'none'}
                  onValueChange={(v) => setForm({ ...form, parent_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="No parent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No parent (top level)</SelectItem>
                    {data
                      .filter((t: any) => t.id !== form.id)
                      .map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Sort order</Label><Input type="number" value={form.sort_order ?? 100} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })} /></div>
              <div className="flex items-center justify-between">
                <Label htmlFor="taxonomy-active">Active</Label>
                <Switch id="taxonomy-active" checked={!!form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" disabled={upsert.isPending} onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!form.code || !form.label || upsert.isPending} onClick={handleSave}>
                {upsert.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card><CardContent className="pt-4">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Parent</TableHead><TableHead>Description</TableHead><TableHead className="w-24">Sort order</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell><code>{t.code}</code></TableCell>
                  <TableCell>{t.label}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {data.find((p: any) => p.id === t.parent_id)?.label || '—'}
                  </TableCell>
                  <TableCell className="max-w-md truncate">{t.description || '—'}</TableCell>
                  <TableCell>{t.sort_order ?? '—'}</TableCell>
                  <TableCell>{t.is_active ? 'Yes' : 'No'}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => openEdit(t)}>
                      <Pencil className="h-4 w-4 mr-1" />Edit
                    </Button>
                    {t.is_active ? (
                      <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => del.mutate(t.id)}>Deactivate</Button>
                    ) : (
                      <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => upsert.mutate({ id: t.id, is_active: true })}>Reactivate</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin inline" />Loading taxonomy…
                </TableCell></TableRow>
              )}
              {!isLoading && data.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">
                  No risk categories configured yet.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
