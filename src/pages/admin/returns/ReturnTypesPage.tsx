import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useReturnTypes, useMutateReturnType } from '@/hooks/useReturnsManagement';
import { PlusCircle, Pencil, Trash2, Loader2 } from 'lucide-react';

export default function ReturnTypesPage() {
  const { data: types = [], isLoading } = useReturnTypes();
  const { create, update, remove } = useMutateReturnType();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState(true);

  const reset = () => { setName(''); setCode(''); setDescription(''); setStatus(true); setEditing(null); };
  const openEdit = (t: any) => { setEditing(t); setName(t.name); setCode(t.code); setDescription(t.description || ''); setStatus(t.status === 'active'); setOpen(true); };

  const handleSave = () => {
    if (!name.trim() || !code.trim()) return;
    const payload = { name: name.trim(), code: code.trim().toUpperCase(), description: description.trim() || null, status: status ? 'active' : 'inactive' };
    if (editing) {
      update.mutate({ id: editing.id, ...payload }, { onSuccess: () => { setOpen(false); reset(); } });
    } else {
      create.mutate(payload, { onSuccess: () => { setOpen(false); reset(); } });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Return Types" description="Manage return frequency types (Annual, Quarterly, Monthly, etc.)"
          actions={
            <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) reset(); }}>
              <DialogTrigger asChild><Button><PlusCircle className="h-4 w-4 mr-2" />Add Return Type</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? 'Edit' : 'New'} Return Type</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Annual" /></div>
                  <div className="space-y-2"><Label>Code *</Label><Input value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. ANNUAL" /></div>
                  <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
                  <div className="flex items-center gap-2"><Switch checked={status} onCheckedChange={setStatus} /><Label>Active</Label></div>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead><TableHead>Code</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {types.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No return types configured</TableCell></TableRow>
                  ) : types.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell><Badge variant="outline">{t.code}</Badge></TableCell>
                      <TableCell className="text-muted-foreground max-w-[300px] truncate">{t.description || '—'}</TableCell>
                      <TableCell><Badge variant={t.status === 'active' ? 'default' : 'secondary'}>{t.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
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
