import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Search, ShieldCheck, ShieldOff, Pencil } from 'lucide-react';
import {
  type ExternalPortalAccessRow, type PortalArea, type PortalCapability,
  PORTAL_AREAS, PORTAL_AREA_LABEL, CAPABILITY_LABEL,
} from '@/lib/portalAccess';

interface ProfileLite { id: string; full_name: string | null; email: string | null; role: string | null; licensee_id: string | null; }
interface LicenseeLite { id: string; name: string; }
interface EntityAccessLite { user_id: string; entity_id: string; is_active: boolean | null; }

const CAPS: PortalCapability[] = [
  'can_submit', 'can_upload_documents', 'can_view_status', 'can_respond_rfi',
  'can_submit_returns', 'can_submit_complaints', 'can_submit_fp_declarations',
];
const EXTERNAL_ROLES = ['applicant', 'pre_licensee', 'licensee_primary', 'licensee_secondary'];
const AREA_CAPS: Record<PortalArea, PortalCapability[]> = {
  licensing: ['can_submit', 'can_upload_documents', 'can_view_status', 'can_respond_rfi'],
  returns: ['can_submit_returns', 'can_upload_documents', 'can_view_status', 'can_respond_rfi'],
  complaints: ['can_submit_complaints', 'can_upload_documents', 'can_view_status'],
  fp_declarations: ['can_submit_fp_declarations', 'can_upload_documents', 'can_view_status'],
};

export default function ExternalPortalAccessPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRow, setEditRow] = useState<ExternalPortalAccessRow | null>(null);
  const [formUserId, setFormUserId] = useState('');
  const [formEntityId, setFormEntityId] = useState<string>('none');
  const [formArea, setFormArea] = useState<PortalArea>('licensing');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');
  const [formCaps, setFormCaps] = useState<Record<PortalCapability, boolean>>({
    can_submit: false, can_upload_documents: false, can_view_status: false,
    can_respond_rfi: false, can_submit_returns: false, can_submit_complaints: false,
    can_submit_fp_declarations: false,
  });

  const accessQuery = useQuery({
    queryKey: ['admin_external_portal_access'],
    queryFn: async (): Promise<ExternalPortalAccessRow[]> => {
      const { data, error } = await (supabase as any)
        .from('external_portal_access')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ExternalPortalAccessRow[];
    },
  });

  const profilesQuery = useQuery({
    queryKey: ['external_user_profiles'],
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, licensee_id')
        .in('role', EXTERNAL_ROLES)
        .order('full_name');
      if (error) throw error;
      return (data || []) as ProfileLite[];
    },
  });

  const licenseesQuery = useQuery({
    queryKey: ['licensees_lite'],
    queryFn: async (): Promise<LicenseeLite[]> => {
      const { data, error } = await supabase
        .from('licensees')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data || []) as LicenseeLite[];
    },
  });

  const entityAccessQuery = useQuery({
    queryKey: ['external_user_entity_links'],
    queryFn: async (): Promise<EntityAccessLite[]> => {
      const { data, error } = await (supabase as any)
        .from('entity_user_access')
        .select('user_id, entity_id, is_active')
        .eq('is_active', true);
      if (error) throw error;
      return (data || []) as EntityAccessLite[];
    },
  });

  const profileById = useMemo(() => {
    const map = new Map<string, ProfileLite>();
    (profilesQuery.data || []).forEach(p => map.set(p.id, p));
    return map;
  }, [profilesQuery.data]);

  const licenseeById = useMemo(() => {
    const map = new Map<string, LicenseeLite>();
    (licenseesQuery.data || []).forEach(l => map.set(l.id, l));
    return map;
  }, [licenseesQuery.data]);

  const linkedEntityIdsByUser = useMemo(() => {
    const map = new Map<string, Set<string>>();
    (profilesQuery.data || []).forEach(p => {
      if (!map.has(p.id)) map.set(p.id, new Set());
      if (p.licensee_id) map.get(p.id)!.add(p.licensee_id);
    });
    (entityAccessQuery.data || []).forEach(link => {
      if (!map.has(link.user_id)) map.set(link.user_id, new Set());
      if (link.entity_id) map.get(link.user_id)!.add(link.entity_id);
    });
    return map;
  }, [profilesQuery.data, entityAccessQuery.data]);

  const allowedCaps = AREA_CAPS[formArea];
  const selectedProfile = formUserId ? profileById.get(formUserId) : null;
  const selectedLinkedEntityIds = selectedProfile ? linkedEntityIdsByUser.get(selectedProfile.id) || new Set<string>() : new Set<string>();
  const selectedEntityIsLinked = formEntityId === 'none' || selectedLinkedEntityIds.has(formEntityId);

  const filteredRows = useMemo(() => {
    const rows = accessQuery.data || [];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => {
      const p = profileById.get(r.user_id);
      const l = r.entity_id ? licenseeById.get(r.entity_id) : null;
      return (
        (p?.full_name || '').toLowerCase().includes(q)
        || (p?.email || '').toLowerCase().includes(q)
        || (l?.name || '').toLowerCase().includes(q)
        || r.portal_area.includes(q)
      );
    });
  }, [accessQuery.data, search, profileById, licenseeById]);

  const resetForm = () => {
    setEditRow(null);
    setFormUserId('');
    setFormEntityId('none');
    setFormArea('licensing');
    setFormStatus('active');
    setFormCaps({
      can_submit: false, can_upload_documents: false, can_view_status: false,
      can_respond_rfi: false, can_submit_returns: false, can_submit_complaints: false,
      can_submit_fp_declarations: false,
    });
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (row: ExternalPortalAccessRow) => {
    setEditRow(row);
    setFormUserId(row.user_id);
    setFormEntityId(row.entity_id || 'none');
    setFormArea(row.portal_area);
    setFormStatus(row.status);
    setFormCaps({
      can_submit: row.can_submit, can_upload_documents: row.can_upload_documents,
      can_view_status: row.can_view_status, can_respond_rfi: row.can_respond_rfi,
      can_submit_returns: row.can_submit_returns, can_submit_complaints: row.can_submit_complaints,
      can_submit_fp_declarations: row.can_submit_fp_declarations,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formUserId) throw new Error('User is required');
      const payload: any = {
        user_id: formUserId,
        entity_id: formEntityId === 'none' ? null : formEntityId,
        portal_area: formArea,
        status: formStatus,
        ...formCaps,
      };
      if (editRow) {
        const { error } = await (supabase as any)
          .from('external_portal_access').update(payload).eq('id', editRow.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from('external_portal_access').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_external_portal_access'] });
      toast({ title: editRow ? 'Access updated' : 'Access granted' });
      setDialogOpen(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const toggleStatus = useMutation({
    mutationFn: async (row: ExternalPortalAccessRow) => {
      const next = row.status === 'active' ? 'inactive' : 'active';
      const { error } = await (supabase as any)
        .from('external_portal_access').update({ status: next }).eq('id', row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin_external_portal_access'] });
      toast({ title: 'Status updated' });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const handleToggle = async (row: ExternalPortalAccessRow) => {
    const next = row.status === 'active' ? 'revoke' : 'reactivate';
    const res = await Swal.fire({
      title: `${next === 'revoke' ? 'Revoke' : 'Reactivate'} portal access?`,
      text: `${PORTAL_AREA_LABEL[row.portal_area]} access for this user will be ${next === 'revoke' ? 'revoked' : 'reactivated'}.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: `Yes, ${next}`,
      confirmButtonColor: next === 'revoke' ? 'hsl(0 84% 60%)' : 'hsl(142 71% 45%)',
      focusCancel: true,
    });
    if (!res.isConfirmed) return;
    toggleStatus.mutate(row);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="External Portal Access"
        description="Manage entity-scoped portal capabilities for applicants, pre-licensees and licensee users. Separate from internal employee module permissions."
        actions={<Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Grant Access</Button>}
      />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by user, email, entity or portal area..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Portal Area</TableHead>
                  <TableHead>Capabilities</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessQuery.isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No access rows yet.</TableCell></TableRow>
                ) : filteredRows.map(row => {
                  const p = profileById.get(row.user_id);
                  const l = row.entity_id ? licenseeById.get(row.entity_id) : null;
                  const enabledCaps = CAPS.filter(c => (row as any)[c]);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{p?.full_name || '—'}</div>
                        <div className="text-xs text-muted-foreground">{p?.email || row.user_id.slice(0, 8)}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{p?.role || '—'}</Badge></TableCell>
                      <TableCell>{l?.name || <span className="text-muted-foreground italic">none</span>}</TableCell>
                      <TableCell><Badge>{PORTAL_AREA_LABEL[row.portal_area]}</Badge></TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {enabledCaps.length === 0
                            ? <span className="text-xs text-muted-foreground">none</span>
                            : enabledCaps.map(c => (
                                <Badge key={c} variant="secondary" className="text-xs">{CAPABILITY_LABEL[c]}</Badge>
                              ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === 'active' ? 'default' : 'destructive'}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleToggle(row)}>
                          {row.status === 'active'
                            ? <ShieldOff className="h-4 w-4 text-destructive" />
                            : <ShieldCheck className="h-4 w-4 text-primary" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(v) => { setDialogOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editRow ? 'Edit Portal Access' : 'Grant Portal Access'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>External User</Label>
              <Select value={formUserId} onValueChange={setFormUserId} disabled={!!editRow}>
                <SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {(profilesQuery.data || []).map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email} · <span className="text-muted-foreground">{p.role}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Entity (Licensee)</Label>
              <Select value={formEntityId} onValueChange={setFormEntityId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="none">— No entity (pre-license) —</SelectItem>
                  {(licenseesQuery.data || []).map(l => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Portal Area</Label>
              <Select value={formArea} onValueChange={v => setFormArea(v as PortalArea)} disabled={!!editRow}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PORTAL_AREAS.map(a => (
                    <SelectItem key={a} value={a}>{PORTAL_AREA_LABEL[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-2 border rounded-md p-3">
              <Label className="text-sm font-semibold">Capabilities</Label>
              <div className="grid grid-cols-2 gap-3">
                {CAPS.map(cap => (
                  <div key={cap} className="flex items-center justify-between gap-2">
                    <span className="text-sm">{CAPABILITY_LABEL[cap]}</span>
                    <Switch
                      checked={formCaps[cap]}
                      onCheckedChange={(v) => setFormCaps(prev => ({ ...prev, [cap]: v }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2 col-span-2">
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={v => setFormStatus(v as 'active' | 'inactive')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : (editRow ? 'Update' : 'Grant')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
