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
import { loadApprovedLicenseeOptions, type ApprovedLicenseeOption } from '@/lib/licenseeOptions';

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
  needs_sector_assignment?: boolean;
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
  const [licensees, setLicensees] = useState<ApprovedLicenseeOption[]>([]);
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('ppoc_entity_mappings' as any)
      .select('*')
      .order('created_at', { ascending: false });

    const rows = (data || []) as any[];
    const userIds = [...new Set(rows.map(r => r.ppoc_user_id))];
    const mappingIds = rows.map(r => r.id);

    const [{ data: profiles }, enrichedLicensees, { data: mapSectors }, { data: secList }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', userIds.length ? userIds : ['__none__']),
      // Use enriched helper so mapping table shows the same display name as the Licensee Entities page.
      // Pass onlyActive:false because mappings may reference any licensee row regardless of status.
      loadApprovedLicenseeOptions({ onlyActive: false }),
      supabase.from('ppoc_mapping_sectors' as any).select('mapping_id, sector_id').in('mapping_id', mappingIds.length ? mappingIds : ['__none__']),
      supabase.from('sectors').select('id, name'),
    ]);

    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
    const licMap = Object.fromEntries(enrichedLicensees.map(l => [l.id, l]));
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
        licensee_name: licMap[r.licensee_id]?.display_name || '—',
        sector_ids: sectorIds,
        sector_names: sectorIds.map(id => sectorMap[id]?.name).filter(Boolean),
        needs_sector_assignment: sectorIds.length === 0,
      };
    }));
    setLoading(false);
  };

  const loadOptions = async (includeUserId?: string | null, keepLicenseeId?: string | null) => {
    const [eligibleUsers, { data: l }, { data: s }] = await Promise.all([
      getEligiblePpocUsers(includeUserId),
      // 'active' is the post-approval status used in this schema (verified: no other status values exist on licensees).
      supabase
        .from('licensees')
        .select('id, name, sector_id, updated_at, created_at')
        .eq('status', 'active')
        .order('updated_at', { ascending: false }),
      supabase.from('sectors').select('id, name').eq('status', 'active').order('name'),
    ]);

    // Deduplicate by normalized name + sector_id. Prefer rows with sector_id
    // populated and most recently updated. Always keep the row matching
    // keepLicenseeId so edit modals never lose their current selection.
    const norm = (n: string) => (n || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const rows = ((l || []) as any[]).filter(r => (r.name || '').trim().length > 0);
    const bestByKey = new Map<string, any>();
    for (const row of rows) {
      const key = `${norm(row.name)}::${row.sector_id || ''}`;
      const prev = bestByKey.get(key);
      if (!prev) { bestByKey.set(key, row); continue; }
      const prevTs = new Date(prev.updated_at || prev.created_at || 0).getTime();
      const curTs = new Date(row.updated_at || row.created_at || 0).getTime();
      const prevHasSector = !!prev.sector_id;
      const curHasSector = !!row.sector_id;
      if ((curHasSector && !prevHasSector) || (curHasSector === prevHasSector && curTs > prevTs)) {
        bestByKey.set(key, row);
      }
    }
    let deduped = Array.from(bestByKey.values());
    if (keepLicenseeId && !deduped.some(r => r.id === keepLicenseeId)) {
      const original = rows.find(r => r.id === keepLicenseeId);
      if (original) deduped.push(original);
    }
    deduped.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    setUsers(eligibleUsers);
    setLicensees(deduped as any[]);
    setSectors((s || []) as any[]);
  };

  useEffect(() => { load(); loadOptions(); }, []);

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setPpocUserId('');
    setLicenseeId('');
    setSelectedSectorIds([]);
    setSaving(false);
  };

  // Fallback cleanup: Radix Dialog + nested Select/Popover portals can leave
  // body styles (pointer-events:none, overflow:hidden) stuck after close.
  useEffect(() => {
    if (!dialogOpen) {
      const clear = () => {
        if (document.body.style.pointerEvents === 'none') document.body.style.pointerEvents = '';
        if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
        document.body.removeAttribute('data-scroll-locked');
        // Remove any orphaned Radix dismissable layer overlays still blocking clicks
        document.querySelectorAll('[data-radix-dismissable-layer]').forEach((el) => {
          const parent = el.parentElement;
          if (parent && parent.childElementCount === 1 && !parent.hasAttribute('data-state')) {
            // leave alone — only stale overlays handled below
          }
        });
      };
      clear();
      const t1 = setTimeout(clear, 100);
      const t2 = setTimeout(clear, 350);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [dialogOpen]);

  useEffect(() => () => {
    document.body.style.pointerEvents = '';
    document.body.style.overflow = '';
    document.body.removeAttribute('data-scroll-locked');
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setPpocUserId('');
    setLicenseeId('');
    setSelectedSectorIds([]);
    loadOptions();
    setDialogOpen(true);
  };

  const openEdit = (m: PpocMapping) => {
    setEditingId(m.id);
    setPpocUserId(m.ppoc_user_id);
    setLicenseeId(m.licensee_id);
    setSelectedSectorIds(m.sector_ids || []);
    // Ensure the currently mapped user AND licensee are present in the dropdowns
    // even if dedupe/eligibility rules would otherwise hide them.
    loadOptions(m.ppoc_user_id, m.licensee_id);
    setDialogOpen(true);
  };
  const handleSave = async () => {
    if (!ppocUserId) {
      toast.error('Please select a PPOC user.');
      return;
    }
    if (selectedSectorIds.length === 0) {
      toast.error('Please select at least one sector for this PPOC mapping.');
      return;
    }
    if (!licenseeId) {
      toast.error('Please select a licensee entity.');
      return;
    }
    const lic = licensees.find(l => l.id === licenseeId);
    if (!lic?.sector_id || !selectedSectorIds.includes(lic.sector_id)) {
      toast.error('Selected entity does not belong to the assigned PPOC sectors.');
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('save_ppoc_mapping' as any, {
        _mapping_id: editingId,
        _ppoc_user_id: ppocUserId,
        _licensee_id: licenseeId,
        _sector_ids: selectedSectorIds,
      });
      if (error) throw error;
      const result: any = data;
      if (result?.error) throw new Error(result.error);

      toast.success(editingId ? 'PPOC mapping updated' : 'PPOC mapping created');
      closeDialog();
      await Promise.all([load(), loadOptions()]);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save');
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
    ? []
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
            : <Badge variant="secondary" className="text-xs">Needs sector assignment</Badge>}
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
          description="PPOC is the Primary Point of Contact mapped to selected licensee entities and sectors. PPOC mapping controls contact/access assignment and is separate from entity Primary User ownership unless explicitly configured elsewhere."
          actions={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />Add Mapping
            </Button>
          }
        />

        <DataTableShell columns={columns} data={mappings} searchPlaceholder="Search PPOC mappings..." />
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) closeDialog(); else setDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" /> {editingId ? 'Edit PPOC Mapping' : 'Map PPOC to Entity'}
            </DialogTitle>
            <DialogDescription>
              Select an active external/licensee contact user to map as PPOC for this entity.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>PPOC User *</Label>
              <Select value={ppocUserId} onValueChange={setPpocUserId}>
                <SelectTrigger><SelectValue placeholder="Select contact user..." /></SelectTrigger>
                <SelectContent>
                  {users.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No eligible PPOC users found. Check that the user is active and has a licensee/contact role.
                    </div>
                  ) : users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="flex items-center gap-2">
                        <span>{u.full_name || u.email}{u.email ? ` (${u.email})` : ''}</span>
                        {u.status && u.status !== 'active' && (
                          <Badge variant="secondary" className="text-[10px]">{u.status}</Badge>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Select an active external/licensee contact user.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Assign Sectors</Label>
              {sectors.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  No active sectors found. Please create or activate sectors first.
                </div>
              ) : (
              <MultiSelect
                options={sectors.map(s => ({ value: s.id, label: s.name }))}
                selected={selectedSectorIds}
                onChange={(ids) => {
                  setSelectedSectorIds(ids);
                  if (licenseeId) {
                    const lic = licensees.find(l => l.id === licenseeId);
                    if (!lic?.sector_id || !ids.includes(lic.sector_id)) setLicenseeId('');
                  }
                }}
                placeholder="Select one or more sectors"
              />
              )}
              <p className="text-xs text-muted-foreground">
                Select one or more sectors. This PPOC will only be assigned entities/applications from these sectors.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Licensee Entity *</Label>
              <Select value={licenseeId} onValueChange={setLicenseeId}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    selectedSectorIds.length === 0
                      ? 'Select sector(s) first.'
                      : dialogLicenseeOptions.length === 0
                        ? 'No licensee entities found for the selected sectors.'
                        : 'Select licensee...'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {dialogLicenseeOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {selectedSectorIds.length === 0
                        ? 'Select sector(s) first.'
                        : 'No licensee entities found for the selected sectors.'}
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
