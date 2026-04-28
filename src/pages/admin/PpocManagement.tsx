import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Link2, Pencil } from 'lucide-react';

interface PpocMapping {
  id: string;
  ppoc_user_id: string;
  licensee_id: string;
  is_active: boolean;
  created_at: string;
  ppoc_name?: string;
  ppoc_email?: string;
  licensee_name?: string;
}

export default function PpocManagement() {
  const [mappings, setMappings] = useState<PpocMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ppocUserId, setPpocUserId] = useState('');
  const [licenseeId, setLicenseeId] = useState('');
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [licensees, setLicensees] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ppoc_entity_mappings' as any)
      .select('*')
      .order('created_at', { ascending: false });

    const rows = (data || []) as any[];
    const userIds = [...new Set(rows.map(r => r.ppoc_user_id))];
    const licIds = [...new Set(rows.map(r => r.licensee_id))];

    const [{ data: profiles }, { data: lics }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', userIds.length ? userIds : ['__none__']),
      supabase.from('licensees').select('id, name').in('id', licIds.length ? licIds : ['__none__']),
    ]);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
    const licMap = Object.fromEntries((lics || []).map((l: any) => [l.id, l]));

    setMappings(rows.map(r => ({
      ...r,
      ppoc_name: profileMap[r.ppoc_user_id]?.full_name || '—',
      ppoc_email: profileMap[r.ppoc_user_id]?.email || '',
      licensee_name: licMap[r.licensee_id]?.name || '—',
    })));
    setLoading(false);
  };

  const loadOptions = async () => {
    // PPOC must be a licensee-side primary user (an entity contact),
    // NOT an internal employee/admin of the regulator.
    const [{ data: p }, { data: l }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, role, user_type')
        .eq('status', 'active')
        .in('role', ['licensee_primary', 'licensee_secondary'])
        .order('full_name'),
      supabase.from('licensees').select('id, name').eq('status', 'active').order('name'),
    ]);
    setUsers((p || []) as any[]);
    setLicensees((l || []) as any[]);
  };

  useEffect(() => { load(); loadOptions(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setPpocUserId('');
    setLicenseeId('');
    setDialogOpen(true);
  };

  const openEdit = (m: PpocMapping) => {
    setEditingId(m.id);
    setPpocUserId(m.ppoc_user_id);
    setLicenseeId(m.licensee_id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!ppocUserId || !licenseeId) {
      toast.error('Please select both a PPOC user and a licensee');
      return;
    }
    setSaving(true);
    let error;
    if (editingId) {
      ({ error } = await supabase
        .from('ppoc_entity_mappings' as any)
        .update({ ppoc_user_id: ppocUserId, licensee_id: licenseeId })
        .eq('id', editingId));
    } else {
      ({ error } = await supabase.from('ppoc_entity_mappings' as any).insert({
        ppoc_user_id: ppocUserId,
        licensee_id: licenseeId,
        is_active: true,
      }));
    }
    if (error) {
      toast.error(error.message?.includes('duplicate') ? 'This mapping already exists' : error.message);
    } else {
      toast.success(editingId ? 'PPOC mapping updated' : 'PPOC mapping created');
      setDialogOpen(false);
      setEditingId(null);
      setPpocUserId('');
      setLicenseeId('');
      load();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Delete mapping?',
      text: 'This PPOC mapping will be permanently removed.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: 'hsl(var(--destructive))',
    });
    if (!result.isConfirmed) return;
    await supabase.from('ppoc_entity_mappings' as any).delete().eq('id', id);
    toast.success('Mapping removed');
    load();
  };

  const handleToggle = async (m: PpocMapping) => {
    const next = !m.is_active;
    const result = await Swal.fire({
      title: next ? 'Activate mapping?' : 'Deactivate mapping?',
      text: next
        ? 'This PPOC will regain access to the licensee entity.'
        : 'This PPOC will lose access to the licensee entity.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: next ? 'Activate' : 'Deactivate',
      cancelButtonText: 'Cancel',
    });
    if (!result.isConfirmed) return;
    const { error } = await supabase
      .from('ppoc_entity_mappings' as any)
      .update({ is_active: next })
      .eq('id', m.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next ? 'Mapping activated' : 'Mapping deactivated');
    load();
  };

  const columns: Column<PpocMapping>[] = [
    {
      key: 'ppoc_name' as any, label: 'PPOC User', render: (r) => (
        <div>
          <p className="font-medium">{r.ppoc_name}</p>
          <p className="text-xs text-muted-foreground">{r.ppoc_email}</p>
        </div>
      ),
    },
    { key: 'licensee_name' as any, label: 'Licensee Entity', render: (r) => <span className="font-medium">{r.licensee_name}</span> },
    {
      key: 'is_active', label: 'Status', render: (r) => (
        <Badge variant={r.is_active ? 'default' : 'secondary'} className="cursor-pointer" onClick={() => handleToggle(r)}>
          {r.is_active ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      key: 'created_at', label: 'Created', render: (r) => (
        <span className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
      ),
    },
    {
      key: 'actions' as any, label: '', render: (r) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} title="Edit mapping">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(r.id)} title="Delete mapping">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="PPOC Entity Mappings"
          description="Manage Primary Point of Contact assignments to licensee entities. A PPOC can be mapped to multiple entities."
          actions={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />Add Mapping
            </Button>
          }
        />

        <DataTableShell columns={columns} data={mappings} searchPlaceholder="Search PPOC mappings..." />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> {editingId ? 'Edit PPOC Mapping' : 'Map PPOC to Entity'}
            </DialogTitle>
            <DialogDescription>Assign a user as Primary Point of Contact for a licensee entity.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>PPOC User *</Label>
              <Select value={ppocUserId} onValueChange={setPpocUserId}>
                <SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Licensee Entity *</Label>
              <Select value={licenseeId} onValueChange={setLicenseeId}>
                <SelectTrigger><SelectValue placeholder="Select licensee..." /></SelectTrigger>
                <SelectContent>
                  {licensees.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Update Mapping' : 'Create Mapping'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
