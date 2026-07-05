import { useState } from 'react';
import { useRiskTaxonomy, useUpsertTaxonomy, useDeleteTaxonomy } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';

export default function PrudentialTaxonomyAdmin() {
  const { data = [] } = useRiskTaxonomy();
  const upsert = useUpsertTaxonomy();
  const del = useDeleteTaxonomy();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ is_active: true, sort_order: 100 });

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Prudential Risk Taxonomy</h1>
          <p className="text-sm text-muted-foreground">Configurable risk categories linked to ratios, thresholds, indicators.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />New category</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New taxonomy category</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Code</Label><Input value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><Label>Label</Label><Input value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><Label>Sort order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) })} /></div>
            </div>
            <DialogFooter><Button disabled={!form.code || !form.label} onClick={async () => { await upsert.mutateAsync(form); setOpen(false); setForm({ is_active: true, sort_order: 100 }); }}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card><CardContent className="pt-4">
        <Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Label</TableHead><TableHead>Description</TableHead><TableHead>Active</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {data.map((t) => (
              <TableRow key={t.id}>
                <TableCell><code>{t.code}</code></TableCell>
                <TableCell>{t.label}</TableCell>
                <TableCell className="max-w-md truncate">{t.description}</TableCell>
                <TableCell>{t.is_active ? 'Yes' : 'No'}</TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)}>Deactivate</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
