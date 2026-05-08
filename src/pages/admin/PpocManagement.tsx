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
import { MultiSelect } from '@/components/ui/multi-select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Link2, Pencil } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { getEligiblePpocUsers, type EligiblePpocUser } from '@/lib/ppocUsers';

interface PpocMapping {
  id: string;
  ppoc_user_id: string;
  licensee_id: string;
  is_active: boolean;
  created_at: string;
  ppoc_name?: string;
  ppoc_email?: string;
  licensee_name?: string;
  sector_ids?: string[];
  sector_names?: string[];
}

export default function PpocManagement() {
  const [mappings, setMappings] = useState<PpocMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ppocUserId, setPpocUserId] = useState('');
  const [licenseeId, setLicenseeId] = useState('');
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [users, setUsers] = useState<EligiblePpocUser[]>([]);
  const [licensees, setLicensees] = useState<{ id: string; name: string; sector_id?: string | null }[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ppoc_entity_mappings' as any)
      .select('*')
      .order('created_at', { ascending: false });

    const rows = (data || []) as any[];
    const userIds = [...new Set(rows.map(r => r.ppoc_user_id))];
    const licIds = [...new Set(rows.map(r => r.licensee_id))];
    const mappingIds = rows.map(r => r.id);

    const [{ data: profiles }, { data: lics }, { data: mapSectors }, { data: secList }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', userIds.length ? userIds : ['__none__']),
      supabase.from('licensees').select('id, name').in('id', licIds.length ? licIds : ['__none__']),
      supabase.from('ppoc_mapping_sectors' as any).select('mapping_id, sector_id').in('mapping_id', mappingIds.length ? mappingIds : ['__none__']),
      supabase.from('sectors').select('id, name'),
    ]);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
    const licMap = Object.fromEntries((lics || []).map((l: any) => [l.id, l]));
    const sectorMap = Object.fromEntries((secList || []).map((s: any) => [s.id, s]));
    const sectorsByMapping: Record<string, string[]> = {};
    ((mapSectors || []) as any[]).forEach(r => {
      if (!sectorsByMapping[r.mapping_id]) sectorsByMapping[r.mapping_id] = [];
      sectorsByMapping[r.mapping_id].push(r.sector_id);
    });

    setMappings(rows.map(r => {
      const sectorIds = sectorsByMapping[r.id] || [];
      return {
        ...r,
        ppoc_name: profileMap[r.ppoc_user_id]?.full_name || '—',
        ppoc_email: profileMap[r.ppoc_user_id]?.email || '',
        licensee_name: licMap[r.licensee_id]?.name || '—',
        sector_ids: sectorIds,
        sector_names: sectorIds.map(id => sectorMap[id]?.name).filter(Boolean),
      };
    }));
    setLoading(false);
  };

  const loadOptions = async (includeUserId?: string | null) => {
    const [eligibleUsers, { data: l }, { data: s }] = await Promise.all([
      getEligiblePpocUsers(includeUserId),
      supabase.from('licensees').select('id, name, sector_id').eq('status', 'active').order('name'),
      supabase.from('sectors').select('id, name').eq('status', 'active').order('name'),
    ]);
    setUsers(eligibleUsers);
    setLicensees((l || []) as any[]);
    setSectors((s || []) as any[]);
  };

  useEffect(() => { load(); loadOptions(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setPpocUserId('');
    setLicenseeId('');
    setSelectedSectorIds([]);
    setDialogOpen(true);
  };

  const openEdit = (m: PpocMapping) => {
    setEditingId(m.id);
    setPpocUserId(m.ppoc_user_id);
    setLicenseeId(m.licensee_id);
    setSelectedSectorIds(m.sector_ids || []);
    // Ensure the currently mapped user is present in the dropdown even if
    // their role data has drifted away from the eligibility rules.
    loadOptions(m.ppoc_user_id);
    setDialogOpen(true);
  };



  const syncMappingSectors = async (mappingId: string) => {
    // Replace existing sector rows with the current selection
    await supabase.from('ppoc_mapping_sectors' as any).delete().eq('mapping_id', mappingId);
    if (selectedSectorIds.length > 0) {
      const rows = selectedSectorIds.map(sid => ({ mapping_id: mappingId, sector_id: sid }));
      const { error } = await supabase.from('ppoc_mapping_sectors' as any).insert(rows);
      if (error) throw error;
    }
  };

  const handleSave = async () => {
    if (!ppocUserId || !licenseeId) {
      toast.error('Please select both a PPOC user and a licensee');
      return;
    }
    // Optional warning: licensee sector vs selected sectors
    const lic = licensees.find(l => l.id === licenseeId);
    if (selectedSectorIds.length > 0 && lic?.sector_id && !selectedSectorIds.includes(lic.sector_id)) {
      toast.error('Selected entity does not belong to the assigned PPOC sectors.');
      return;
    }

    setSaving(true);
    try {
      let mappingId = editingId;
      if (editingId) {
        const { error } = await supabase
          .from('ppoc_entity_mappings' as any)
          .update({ ppoc_user_id: ppocUserId, licensee_id: licenseeId })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('ppoc_entity_mappings' as any)
          .insert({ ppoc_user_id: ppocUserId, licensee_id: licenseeId, is_active: true })
          .select('id')
          .single();
        if (error) throw error;
        mappingId = (data as any).id;
      }
      if (mappingId) await syncMappingSectors(mappingId);
      toast.success(editingId ? 'PPOC mapping updated' : 'PPOC mapping created');
      setDialogOpen(false);
      setEditingId(null);
      setPpocUserId('');
      setLicenseeId('');
      setSelectedSectorIds([]);
      load();
    } catch (e: any) {
      toast.error(e?.message?.includes('duplicate') ? 'This mapping already exists' : (e?.message || 'Failed to save'));
    } finally {
      setSaving(false);
    }
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

  // When sectors are selected in the dialog, restrict the licensee dropdown to matching sectors.
  const dialogLicenseeOptions = selectedSectorIds.length === 0
    ? licensees
    : licensees.filter(l => l.sector_id && selectedSectorIds.includes(l.sector_id));

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
      key: 'sector_names' as any, label: 'Assigned Sectors', render: (r) => (
        <div className="flex flex-wrap gap-1">
          {(r.sector_names && r.sector_names.length > 0)
            ? r.sector_names.map(n => <Badge key={n} variant="outline" className="text-xs">{n}</Badge>)
            : <Badge variant="secondary" className="text-xs">All sectors</Badge>}
        </div>
      ),
    },
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
        <RowActionsMenu actions={[
          { label: 'Edit mapping', icon: Pencil, onClick: () => openEdit(r) },
          { label: 'Delete mapping', icon: Trash2, onClick: () => handleDelete(r.id), destructive: true, separator: true },
        ]} />
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="PPOC Entity Mappings"
          description="A Primary Point of Contact (PPOC) is an external person who acts as the primary user for one or more licensee entities. The same PPOC can be linked to multiple entities (e.g. one person serving as PPOC for both ABC Ltd and DEF Ltd)."
          actions={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />Add Mapping
            </Button>
          }
        />

        <DataTableShell columns={columns} data={mappings} searchPlaceholder="Search PPOC mappings..." />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditingId(null); setSelectedSectorIds([]); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> {editingId ? 'Edit PPOC Mapping' : 'Map PPOC to Entity'}
            </DialogTitle>
            <DialogDescription>
              Select an external licensee user (entity contact) to act as Primary Point of Contact for a licensee entity. Internal staff/employees cannot be assigned as PPOC.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>PPOC User * <span className="text-xs text-muted-foreground font-normal">(licensee primary users only)</span></Label>
              <Select value={ppocUserId} onValueChange={setPpocUserId}>
                <SelectTrigger><SelectValue placeholder="Select primary user..." /></SelectTrigger>
                <SelectContent>
                  {users.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No active primary users available.</div>
                  ) : users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Assign Sectors</Label>
              <MultiSelect
                options={sectors.map(s => ({ value: s.id, label: s.name }))}
                selected={selectedSectorIds}
                onChange={(ids) => {
                  setSelectedSectorIds(ids);
                  // Clear licensee if it no longer matches the selected sectors
                  if (ids.length > 0 && licenseeId) {
                    const lic = licensees.find(l => l.id === licenseeId);
                    if (lic?.sector_id && !ids.includes(lic.sector_id)) setLicenseeId('');
                  }
                }}
                placeholder="All sectors (leave empty for unrestricted)"
              />
              <p className="text-xs text-muted-foreground">
                Selected PPOC will only be assigned entities/applications from the selected sectors. Leave empty to allow all sectors.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Licensee Entity *</Label>
              <Select value={licenseeId} onValueChange={setLicenseeId}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    selectedSectorIds.length > 0 && dialogLicenseeOptions.length === 0
                      ? 'No entities match selected sectors'
                      : 'Select licensee...'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {dialogLicenseeOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {selectedSectorIds.length > 0
                        ? 'No entities match selected sectors.'
                        : 'No licensees available.'}
                    </div>
                  ) : dialogLicenseeOptions.map(l => (
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
