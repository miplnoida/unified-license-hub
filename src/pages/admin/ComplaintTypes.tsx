import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { PlusCircle, Pencil, Loader2, Tags } from 'lucide-react';

interface ComplaintType {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export default function ComplaintTypes() {
  const [types, setTypes] = useState<ComplaintType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ComplaintType | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('complaint_types')
      .select('*')
      .order('name');
    setTypes((data || []) as ComplaintType[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setName('');
    setDescription('');
    setIsActive(true);
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (t: ComplaintType) => {
    setEditing(t);
    setName(t.name);
    setDescription(t.description || '');
    setIsActive(t.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);

    if (editing) {
      const { error } = await supabase
        .from('complaint_types')
        .update({ name: name.trim(), description: description.trim() || null, is_active: isActive, updated_at: new Date().toISOString() } as any)
        .eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      await logAudit({ action: 'complaint_type_updated', entityType: 'complaint_type', entityId: editing.id });
      toast.success('Complaint type updated');
    } else {
      const { error } = await supabase
        .from('complaint_types')
        .insert({ name: name.trim(), description: description.trim() || null, is_active: isActive } as any);
      if (error) { toast.error(error.message); setSaving(false); return; }
      await logAudit({ action: 'complaint_type_created', entityType: 'complaint_type' });
      toast.success('Complaint type created');
    }

    setSaving(false);
    setDialogOpen(false);
    resetForm();
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Complaint Types"
          description="Manage the types of complaints that can be submitted."
          actions={
            <Button onClick={openCreate}>
              <PlusCircle className="h-4 w-4 mr-2" />Add Type
            </Button>
          }
        />

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : types.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Tags className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No complaint types configured yet.</p>
                <Button variant="outline" className="mt-3" onClick={openCreate}>
                  <PlusCircle className="h-4 w-4 mr-2" />Add First Type
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{t.description || '—'}</TableCell>
                      <TableCell>
                        <Badge variant={t.is_active ? 'default' : 'secondary'}>
                          {t.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(t.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                          <Pencil className="h-4 w-4 mr-1" />Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={open => { if (!open) { setDialogOpen(false); resetForm(); } else setDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Complaint Type' : 'Add Complaint Type'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Service Quality" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description..." rows={3} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? 'Saving...' : editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
