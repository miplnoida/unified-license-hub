import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Pencil, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  LicenseAppealPanel as PanelRow, useLicenseAppealMutations, useLicenseAppealPanels,
} from '@/hooks/useLicenseAppeals';

export default function LicenseAppealPanels() {
  const { data: panels, isLoading } = useLicenseAppealPanels();
  const { savePanel } = useLicenseAppealMutations();
  const [editing, setEditing] = useState<PanelRow | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);

  const startCreate = () => {
    setEditing(null); setName(''); setDescription(''); setIsActive(true); setOpen(true);
  };
  const startEdit = (p: PanelRow) => {
    setEditing(p); setName(p.name); setDescription(p.description || ''); setIsActive(p.is_active); setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Panel name is required'); return; }
    try {
      await savePanel.mutateAsync({ id: editing?.id, name: name.trim(), description, is_active: isActive });
      toast.success(editing ? 'Panel updated' : 'Panel created');
      setOpen(false);
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Failed to save panel');
    }
  };

  const columns: Column<PanelRow>[] = [
    { key: 'name', label: 'Panel', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'description', label: 'Description', render: (r) => r.description || '—' },
    {
      key: 'is_active', label: 'Status',
      render: (r) => <Badge variant={r.is_active ? 'approved' as never : 'secondary'}>{r.is_active ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions', label: '',
      render: (r) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(r)}>
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Appeal Panels"
          description="Configure the panels that hear licensing appeals."
        />
        <DataTableShell
          columns={columns}
          data={panels || []}
          searchPlaceholder="Search panels..."
          actions={
            <Button size="sm" onClick={startCreate} disabled={isLoading}>
              <PlusCircle className="h-4 w-4 mr-2" /> New panel
            </Button>
          }
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit panel' : 'New appeal panel'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="panel-name">Panel name *</Label>
              <Input id="panel-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Licensing Appeals Panel A" />
            </div>
            <div>
              <Label htmlFor="panel-desc">Description</Label>
              <Textarea id="panel-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="panel-active" checked={isActive} onCheckedChange={setIsActive} />
              <Label htmlFor="panel-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={savePanel.isPending}>
              {savePanel.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
