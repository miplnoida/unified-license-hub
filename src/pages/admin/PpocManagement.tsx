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
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Trash2, Link2, Pencil, X } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { getEligibleUsersForPpocMapping, type EligiblePpocUser } from '@/lib/ppocUsers';
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
  const [sectorSearch, setSectorSearch] = useState('');

  const toggleSector = (sectorId: string) => {
    setSelectedSectorIds(prev => {
      const next = prev.includes(sectorId)
        ? prev.filter(id => id !== sectorId)
        : [...prev, sectorId];
      if (licenseeId) {
        const lic = licensees.find(l => l.id === licenseeId);
        const licSector = lic?.resolved_sector_id || lic?.sector_id;
        if (!licSector || !next.includes(licSector)) {
          setLicenseeId('');
        }
      }
      return next;
    });
  };

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

    const licenseeIds = [...new Set(rows.map(r => r.licensee_id).filter(Boolean))];

    const [{ data: profiles }, enrichedLicensees, { data: mapSectors }, { data: secList }, { data: rawLicRows }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, email').in('id', userIds.length ? userIds : ['__none__']),
      // Use enriched helper without dedupe so every licensee id (including
      // "losing" duplicates) has a resolved entity display name available.
      loadApprovedLicenseeOptions({ onlyActive: false, dedupe: false }),
      supabase.from('ppoc_mapping_sectors' as any).select('mapping_id, sector_id').in('mapping_id', mappingIds.length ? mappingIds : ['__none__']),
      supabase.from('sectors').select('id, name'),
      supabase.from('licensees').select('id, name').in('id', licenseeIds.length ? licenseeIds : ['__none__']),
    ]);


    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));
    const licMap = Object.fromEntries(enrichedLicensees.map(l => [l.id, l]));
    const rawLicMap = Object.fromEntries(((rawLicRows || []) as any[]).map((l: any) => [l.id, l]));
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
        licensee_name: licMap[r.licensee_id]?.display_name || rawLicMap[r.licensee_id]?.name || '—',
        sector_ids: sectorIds,
        sector_names: sectorIds.map(id => sectorMap[id]?.name).filter(Boolean),
        needs_sector_assignment: sectorIds.length === 0,
      };
    }));
    setLoading(false);
  };

  const loadOptions = async (includeUserId?: string | null, keepLicenseeId?: string | null) => {
    const [eligibleUsers, deduped, { data: s }] = await Promise.all([
      getEligibleUsersForPpocMapping(includeUserId),
      // Use the same enriched/deduped pipeline as the Licensee Entities page so
      // PPOC entity dropdown shows real entity names and uses resolved sector ids.
      loadApprovedLicenseeOptions({ keepLicenseeId, onlyActive: true }),
      supabase.from('sectors').select('id, name').eq('status', 'active').order('name'),
    ]);

    setUsers(eligibleUsers);
    setLicensees(deduped);
    setSectors((s || []) as any[]);
  };

  useEffect(() => { load(); loadOptions(); }, []);

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setPpocUserId('');
    setLicenseeId('');
    setSelectedSectorIds([]);
    setSectorSearch('');
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
    setSectorSearch('');
    loadOptions();
    setDialogOpen(true);
  };

  const openEdit = (m: PpocMapping) => {
    setEditingId(m.id);
    setPpocUserId(m.ppoc_user_id);
    setLicenseeId(m.licensee_id);
    setSelectedSectorIds(m.sector_ids || []);
    setSectorSearch('');
    // Ensure the currently mapped user AND licensee are present in the dropdowns
    // even if dedupe/eligibility rules would otherwise hide them.
    loadOptions(m.ppoc_user_id, m.licensee_id);
    setDialogOpen(true);
  };
  const handleSave = async () => {
    if (!ppocUserId) {
      toast.error('Please select a user to assign as PPOC.');
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
    const licSector = lic?.resolved_sector_id || lic?.sector_id;
    if (!licSector || !selectedSectorIds.includes(licSector)) {
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
    const { data, error } = await supabase.rpc('delete_ppoc_mapping' as any, { _mapping_id: id });
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error || 'Failed to delete');
      return;
    }
    toast.success('Mapping removed');
    await Promise.all([load(), loadOptions()]);
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
    const { data, error } = await supabase.rpc('toggle_ppoc_mapping_status' as any, {
      _mapping_id: m.id,
      _is_active: next,
    });
    if (error || (data as any)?.error) {
      toast.error(error?.message || (data as any)?.error || 'Failed to update');
      return;
    }
    toast.success(next ? 'Mapping activated' : 'Mapping deactivated');
    await Promise.all([load(), loadOptions()]);
  };

  // When sectors are selected in the dialog, restrict the licensee dropdown to matching sectors.
  const dialogLicenseeOptions = selectedSectorIds.length === 0
    ? []
    : licensees.filter(l => {
        const sec = l.resolved_sector_id || l.sector_id;
        return sec && selectedSectorIds.includes(sec);
      });

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
          description="A user becomes a Principal Point of Contact (PPOC) only after being explicitly mapped to a licensee entity and one or more sectors here. Primary Users already have direct access to their own entity — a PPOC mapping is only needed to grant a user PPOC rights for additional or different entities/sectors."
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
              Select an active licensee contact user to assign as PPOC. PPOC rights only take effect through this mapping — a user is not automatically a PPOC just because they are a Primary or Secondary user.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Select user to assign as PPOC *</Label>
              <Select value={ppocUserId} onValueChange={setPpocUserId}>
                <SelectTrigger><SelectValue placeholder="Select candidate user..." /></SelectTrigger>
                <SelectContent
                  position="popper"
                  side="bottom"
                  align="start"
                  sideOffset={4}
                  className="z-[9999] max-h-[300px] overflow-y-auto bg-popover"
                >
                  {users.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No eligible candidates found. The user must be active and have a licensee contact role (primary, secondary, or contact).
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
                Only users explicitly mapped here become PPOCs for the selected entity/sectors. Primary Users may be selected as candidates, but PPOC rights come from this mapping — not from their profile role.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Assign Sectors *</Label>
              {sectors.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  No active sectors found. Please create or activate sectors first.
                </div>
              ) : (
                <>
                  <Input
                    placeholder="Search sectors..."
                    value={sectorSearch}
                    onChange={(e) => setSectorSearch(e.target.value)}
                  />
                  <div className="max-h-56 overflow-y-auto rounded-md border p-1">
                    {(() => {
                      const filtered = sectors.filter(s =>
                        s.name.toLowerCase().includes(sectorSearch.toLowerCase())
                      );
                      if (filtered.length === 0) {
                        return (
                          <div className="px-2 py-3 text-sm text-muted-foreground">No sectors match your search.</div>
                        );
                      }
                      return filtered.map(sector => {
                        const checked = selectedSectorIds.includes(sector.id);
                        return (
                          <label
                            key={sector.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleSector(sector.id)}
                            />
                            <span className="text-sm">{sector.name}</span>
                          </label>
                        );
                      });
                    })()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {selectedSectorIds.length} sector(s) selected
                  </div>
                  {selectedSectorIds.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedSectorIds.map(id => {
                        const s = sectors.find(x => x.id === id);
                        if (!s) return null;
                        return (
                          <Badge key={id} variant="secondary" className="text-xs">
                            {s.name}
                            <X
                              className="ml-1 h-3 w-3 cursor-pointer"
                              onClick={() => toggleSector(id)}
                            />
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </>
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
                <SelectContent
                  position="popper"
                  side="bottom"
                  align="start"
                  sideOffset={4}
                  className="z-[9999] max-h-[300px] overflow-y-auto bg-popover"
                >
                  {dialogLicenseeOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      {selectedSectorIds.length === 0
                        ? 'Select sector(s) first.'
                        : 'No licensee entities found for the selected sectors.'}
                    </div>
                  ) : dialogLicenseeOptions.map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.display_name}</SelectItem>
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
