/**
 * External Portal Access — role-template based admin UI.
 *
 * Three tabs:
 *  A. External Portal Roles   — manage reusable role templates and their capabilities.
 *  B. User Assignments        — assign a role template to a user (+ optional entity).
 *  C. Effective Access        — see the final resolved capabilities for a user.
 *
 * Internal employee/admin permissions are managed separately in /admin/roles.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Swal from 'sweetalert2';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Plus, Search, ShieldCheck, ShieldOff, Pencil, Trash2, Info, Lock } from 'lucide-react';
import { useExternalPortalRoles } from '@/hooks/useExternalPortalRoles';
import { useExternalUserPortalRoles } from '@/hooks/useExternalUserPortalRoles';
import {
  AREA_CAPABILITIES, ALL_CAPABILITIES, PORTAL_AREAS, PORTAL_AREA_LABEL,
  CAPABILITY_LABEL, EXTERNAL_AUDIENCE_ROLES, EXTERNAL_AUDIENCE_ROLE_LABEL,
  RESTRICTIONS_NOTICE, type ExternalPortalRole, type ExternalPortalRoleCapability,
  type ExternalUserPortalRoleAssignment, type PortalArea, type PortalCapability,
  type ExternalAudienceRole,
} from '@/lib/externalPortalRoles';

interface ProfileLite { id: string; full_name: string | null; email: string | null; role: string | null; licensee_id: string | null; }
interface LicenseeLite { id: string; name: string; }

export default function ExternalPortalAccessPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState<'roles' | 'assignments' | 'effective'>('roles');

  // Shared lookups
  const profilesQuery = useQuery({
    queryKey: ['external_user_profiles'],
    queryFn: async (): Promise<ProfileLite[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, licensee_id')
        .in('role', EXTERNAL_AUDIENCE_ROLES as unknown as string[])
        .order('full_name');
      if (error) throw error;
      return (data || []) as ProfileLite[];
    },
  });
  const licenseesQuery = useQuery({
    queryKey: ['licensees_lite'],
    queryFn: async (): Promise<LicenseeLite[]> => {
      const { data, error } = await supabase.from('licensees').select('id, name').order('name');
      if (error) throw error;
      return (data || []) as LicenseeLite[];
    },
  });
  const profileById = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    (profilesQuery.data || []).forEach(p => m.set(p.id, p));
    return m;
  }, [profilesQuery.data]);
  const licenseeById = useMemo(() => {
    const m = new Map<string, LicenseeLite>();
    (licenseesQuery.data || []).forEach(l => m.set(l.id, l));
    return m;
  }, [licenseesQuery.data]);

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          title="External Portal Access"
          description="Dynamic role templates for applicant and licensee portals. Internal employee/admin permissions are managed separately."
          backHref="/admin/roles"
          backLabel="Back"
        />

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>External portal capabilities only</AlertTitle>
          <AlertDescription>
            These role templates only grant access to the Licensing, Returns, Complaints and F&amp;P
            portals. They never grant internal workflow, findings, audit logs, reports or admin panel access.
          </AlertDescription>
        </Alert>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="space-y-4">
          <TabsList>
            <TabsTrigger value="roles">External Portal Roles</TabsTrigger>
            <TabsTrigger value="assignments">User Assignments</TabsTrigger>
            <TabsTrigger value="effective">Effective Access</TabsTrigger>
          </TabsList>

          <TabsContent value="roles">
            <RolesTab toast={toast} />
          </TabsContent>

          <TabsContent value="assignments">
            <AssignmentsTab
              toast={toast}
              currentUserId={user?.id || null}
              profiles={profilesQuery.data || []}
              licensees={licenseesQuery.data || []}
              profileById={profileById}
              licenseeById={licenseeById}
            />
          </TabsContent>

          <TabsContent value="effective">
            <EffectiveTab
              profiles={profilesQuery.data || []}
              licensees={licenseesQuery.data || []}
              profileById={profileById}
              licenseeById={licenseeById}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ===========================================================================
// Tab A — External Portal Roles
// ===========================================================================
function RolesTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const { rolesQuery, capsQuery, upsertRole, deleteRole, upsertCapability } = useExternalPortalRoles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalPortalRole | null>(null);
  const [form, setForm] = useState<{
    name: string; role_key: string; description: string;
    applies_to_roles: ExternalAudienceRole[]; is_active: boolean;
    caps: Record<PortalArea, Partial<Record<PortalCapability, boolean>>>;
  }>(() => emptyRoleForm());

  const capsByRole = useMemo(() => {
    const m = new Map<string, Record<PortalArea, ExternalPortalRoleCapability | undefined>>();
    (capsQuery.data || []).forEach(c => {
      if (!m.has(c.external_role_id)) {
        m.set(c.external_role_id, { licensing: undefined, returns: undefined, complaints: undefined, fp_declarations: undefined });
      }
      m.get(c.external_role_id)![c.portal_area] = c;
    });
    return m;
  }, [capsQuery.data]);

  const openAdd = () => { setEditing(null); setForm(emptyRoleForm()); setDialogOpen(true); };
  const openEdit = (r: ExternalPortalRole) => {
    setEditing(r);
    const existing = capsByRole.get(r.id) || ({} as any);
    const caps: any = {};
    PORTAL_AREAS.forEach(area => {
      const row = existing[area];
      caps[area] = {};
      AREA_CAPABILITIES[area].forEach(c => { caps[area][c] = !!row?.[c]; });
    });
    setForm({
      name: r.name, role_key: r.role_key, description: r.description || '',
      applies_to_roles: (r.applies_to_roles || []) as ExternalAudienceRole[],
      is_active: r.is_active, caps,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.role_key.trim()) {
      toast({ title: 'Name and key are required', variant: 'destructive' });
      return;
    }
    try {
      const saved = await upsertRole.mutateAsync({
        id: editing?.id,
        name: form.name.trim(),
        role_key: form.role_key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        description: form.description.trim() || null,
        applies_to_roles: form.applies_to_roles,
        is_active: form.is_active,
      });
      // Save capabilities per area
      for (const area of PORTAL_AREAS) {
        await upsertCapability.mutateAsync({
          external_role_id: saved.id, portal_area: area, caps: form.caps[area] || {},
        });
      }
      toast({ title: editing ? 'Role updated' : 'Role created' });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (r: ExternalPortalRole) => {
    if (r.is_system) {
      toast({ title: 'System roles cannot be deleted', variant: 'destructive' });
      return;
    }
    const res = await Swal.fire({
      title: 'Delete role template?',
      text: `"${r.name}" will be removed. Users currently assigned will lose this role.`,
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete',
    });
    if (!res.isConfirmed) return;
    try { await deleteRole.mutateAsync(r.id); toast({ title: 'Role deleted' }); }
    catch (e: any) { toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Role Templates</CardTitle>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />New role</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Applies to</TableHead>
              <TableHead>Portal areas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rolesQuery.data || []).map(r => {
              const caps = capsByRole.get(r.id) || ({} as any);
              const activeAreas = PORTAL_AREAS.filter(a => {
                const row = caps[a]; if (!row) return false;
                return ALL_CAPABILITIES.some(c => (row as any)[c]);
              });
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {r.name}
                      {r.is_system && (
                        <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />System</Badge>
                      )}
                    </div>
                    {r.description && <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.role_key}</TableCell>
                  <TableCell className="text-xs">
                    {(r.applies_to_roles || []).map(x => (
                      <Badge key={x} variant="outline" className="mr-1 mb-1">{EXTERNAL_AUDIENCE_ROLE_LABEL[x as ExternalAudienceRole] || x}</Badge>
                    ))}
                  </TableCell>
                  <TableCell className="text-xs">
                    {activeAreas.map(a => <Badge key={a} className="mr-1 mb-1">{PORTAL_AREA_LABEL[a]}</Badge>)}
                  </TableCell>
                  <TableCell>{r.is_active
                    ? <Badge variant="default" className="gap-1"><ShieldCheck className="h-3 w-3" />Active</Badge>
                    : <Badge variant="secondary" className="gap-1"><ShieldOff className="h-3 w-3" />Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    {!r.is_system && (
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(r)}><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit role template' : 'New role template'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Key</Label>
                <Input value={form.role_key} onChange={e => setForm({ ...form, role_key: e.target.value })}
                  disabled={!!editing?.is_system} placeholder="e.g. licensee_secondary_reduced" />
              </div>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <Label>Applies to external roles</Label>
              <div className="flex flex-wrap gap-3 mt-2">
                {EXTERNAL_AUDIENCE_ROLES.map(role => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.applies_to_roles.includes(role)}
                      onCheckedChange={(v) => {
                        const has = !!v;
                        setForm({
                          ...form,
                          applies_to_roles: has
                            ? Array.from(new Set([...form.applies_to_roles, role]))
                            : form.applies_to_roles.filter(x => x !== role),
                        });
                      }} />
                    {EXTERNAL_AUDIENCE_ROLE_LABEL[role]}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label>Capabilities by portal area</Label>
              {PORTAL_AREAS.map(area => (
                <div key={area} className="border rounded-md p-3">
                  <div className="font-medium text-sm mb-2">{PORTAL_AREA_LABEL[area]}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {AREA_CAPABILITIES[area].map(cap => (
                      <label key={cap} className="flex items-center justify-between gap-2 text-sm">
                        <span>{CAPABILITY_LABEL[cap]}</span>
                        <Switch checked={!!form.caps[area]?.[cap]}
                          onCheckedChange={(v) => setForm({
                            ...form,
                            caps: { ...form.caps, [area]: { ...(form.caps[area] || {}), [cap]: v } },
                          })} />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Explicit restrictions</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 text-xs space-y-0.5 mt-1">
                  {RESTRICTIONS_NOTICE.map(r => <li key={r}>{r}</li>)}
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={upsertRole.isPending}>{editing ? 'Save changes' : 'Create role'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function emptyRoleForm() {
  const caps: any = {};
  PORTAL_AREAS.forEach(a => {
    caps[a] = {};
    AREA_CAPABILITIES[a].forEach(c => { caps[a][c] = false; });
  });
  return {
    name: '', role_key: '', description: '',
    applies_to_roles: [] as ExternalAudienceRole[],
    is_active: true, caps,
  };
}

// ===========================================================================
// Tab B — User Assignments
// ===========================================================================
function AssignmentsTab(props: {
  toast: ReturnType<typeof useToast>['toast'];
  currentUserId: string | null;
  profiles: ProfileLite[];
  licensees: LicenseeLite[];
  profileById: Map<string, ProfileLite>;
  licenseeById: Map<string, LicenseeLite>;
}) {
  const { toast, currentUserId, profiles, licensees, profileById, licenseeById } = props;
  const { rolesQuery } = useExternalPortalRoles();
  const { query, assign, setStatus, remove } = useExternalUserPortalRoles();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalUserPortalRoleAssignment | null>(null);
  const [formUserId, setFormUserId] = useState('');
  const [formEntityId, setFormEntityId] = useState<string>('none');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [formStatusVal, setFormStatusVal] = useState<'active' | 'inactive'>('active');

  const roleById = useMemo(() => {
    const m = new Map<string, ExternalPortalRole>();
    (rolesQuery.data || []).forEach(r => m.set(r.id, r));
    return m;
  }, [rolesQuery.data]);

  const filtered = useMemo(() => {
    const rows = query.data || [];
    const q = search.trim().toLowerCase();
    return rows.filter(a => {
      const p = profileById.get(a.user_id);
      if (roleFilter !== 'all' && p?.role !== roleFilter) return false;
      if (!q) return true;
      const l = a.entity_id ? licenseeById.get(a.entity_id) : null;
      const tpl = roleById.get(a.external_role_id);
      return (
        (p?.full_name || '').toLowerCase().includes(q) ||
        (p?.email || '').toLowerCase().includes(q) ||
        (l?.name || '').toLowerCase().includes(q) ||
        (tpl?.name || '').toLowerCase().includes(q)
      );
    });
  }, [query.data, search, roleFilter, profileById, licenseeById, roleById]);

  const resetForm = () => {
    setEditing(null); setFormUserId(''); setFormEntityId('none');
    setFormTemplateId(''); setFormStatusVal('active');
  };
  const openAdd = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (a: ExternalUserPortalRoleAssignment) => {
    setEditing(a); setFormUserId(a.user_id);
    setFormEntityId(a.entity_id || 'none');
    setFormTemplateId(a.external_role_id);
    setFormStatusVal(a.status); setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formUserId || !formTemplateId) {
      toast({ title: 'User and role template are required', variant: 'destructive' });
      return;
    }
    try {
      await assign.mutateAsync({
        id: editing?.id,
        user_id: formUserId,
        entity_id: formEntityId === 'none' ? null : formEntityId,
        external_role_id: formTemplateId,
        status: formStatusVal,
        assigned_by: currentUserId,
      });
      toast({ title: editing ? 'Assignment updated' : 'Assignment created' });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle>User Assignments</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search user/entity/template" className="pl-8 w-64"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All external roles</SelectItem>
              {EXTERNAL_AUDIENCE_ROLES.map(r => (
                <SelectItem key={r} value={r}>{EXTERNAL_AUDIENCE_ROLE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Assign</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>External role</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(a => {
              const p = profileById.get(a.user_id);
              const l = a.entity_id ? licenseeById.get(a.entity_id) : null;
              const tpl = roleById.get(a.external_role_id);
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="font-medium">{p?.full_name || a.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground">{p?.email}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{p?.role || '—'}</Badge></TableCell>
                  <TableCell className="text-sm">{l?.name || <span className="text-muted-foreground italic">All / not scoped</span>}</TableCell>
                  <TableCell className="text-sm">{tpl?.name || a.external_role_id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === 'active' ? 'default' : 'secondary'}>{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => setStatus.mutate({ id: a.id, status: a.status === 'active' ? 'inactive' : 'active' })}>
                      {a.status === 'active' ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const res = await Swal.fire({
                        title: 'Remove assignment?', icon: 'warning',
                        showCancelButton: true, confirmButtonText: 'Remove',
                      });
                      if (res.isConfirmed) {
                        try { await remove.mutateAsync(a.id); toast({ title: 'Assignment removed' }); }
                        catch (e: any) { toast({ title: 'Failed', description: e.message, variant: 'destructive' }); }
                      }
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit assignment' : 'Assign role template'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>User</Label>
              <Select value={formUserId} onValueChange={setFormUserId} disabled={!!editing}>
                <SelectTrigger><SelectValue placeholder="Select external user" /></SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email} <span className="text-muted-foreground">({p.role})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Entity (optional)</Label>
              <Select value={formEntityId} onValueChange={setFormEntityId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not scoped to an entity</SelectItem>
                  {licensees.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role template</Label>
              <Select value={formTemplateId} onValueChange={setFormTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                <SelectContent>
                  {(rolesQuery.data || []).filter(r => r.is_active).map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={formStatusVal} onValueChange={(v) => setFormStatusVal(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formTemplateId && (
              <InheritedCapabilities templateId={formTemplateId} />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={assign.isPending}>{editing ? 'Save' : 'Assign'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function InheritedCapabilities({ templateId }: { templateId: string }) {
  const { capsQuery } = useExternalPortalRoles();
  const byArea: Record<PortalArea, ExternalPortalRoleCapability | undefined> = {
    licensing: undefined, returns: undefined, complaints: undefined, fp_declarations: undefined,
  };
  (capsQuery.data || []).filter(c => c.external_role_id === templateId).forEach(c => { byArea[c.portal_area] = c; });
  return (
    <div className="border rounded-md p-3 bg-muted/30">
      <div className="text-xs font-medium mb-2">Inherited capabilities (read-only)</div>
      <div className="space-y-2">
        {PORTAL_AREAS.map(area => {
          const row = byArea[area];
          const active = row ? AREA_CAPABILITIES[area].filter(c => (row as any)[c]) : [];
          if (active.length === 0) return null;
          return (
            <div key={area} className="text-xs">
              <span className="font-medium">{PORTAL_AREA_LABEL[area]}: </span>
              {active.map(c => <Badge key={c} variant="outline" className="mr-1">{CAPABILITY_LABEL[c]}</Badge>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===========================================================================
// Tab C — Effective Access
// ===========================================================================
function EffectiveTab(props: {
  profiles: ProfileLite[];
  licensees: LicenseeLite[];
  profileById: Map<string, ProfileLite>;
  licenseeById: Map<string, LicenseeLite>;
}) {
  const { profiles, licensees, licenseeById } = props;
  const { rolesQuery, capsQuery } = useExternalPortalRoles();
  const { query } = useExternalUserPortalRoles();
  const [userId, setUserId] = useState('');
  const [entityId, setEntityId] = useState<string>('any');

  const roleById = useMemo(() => {
    const m = new Map<string, ExternalPortalRole>();
    (rolesQuery.data || []).forEach(r => m.set(r.id, r));
    return m;
  }, [rolesQuery.data]);

  const userAssignments = useMemo(() => {
    return (query.data || []).filter(a => a.user_id === userId && a.status === 'active');
  }, [query.data, userId]);

  const effective = useMemo(() => {
    const result: Record<PortalArea, { caps: Set<PortalCapability>; sources: { templateName: string; entityName: string | null }[] }> = {
      licensing: { caps: new Set(), sources: [] },
      returns: { caps: new Set(), sources: [] },
      complaints: { caps: new Set(), sources: [] },
      fp_declarations: { caps: new Set(), sources: [] },
    };
    userAssignments.forEach(a => {
      if (entityId !== 'any' && a.entity_id && a.entity_id !== entityId) return;
      const tpl = roleById.get(a.external_role_id);
      if (!tpl || !tpl.is_active) return;
      const caps = (capsQuery.data || []).filter(c => c.external_role_id === a.external_role_id);
      caps.forEach(c => {
        AREA_CAPABILITIES[c.portal_area].forEach(k => {
          if ((c as any)[k]) result[c.portal_area].caps.add(k);
        });
        const entityName = a.entity_id ? (licenseeById.get(a.entity_id)?.name || '—') : null;
        result[c.portal_area].sources.push({ templateName: tpl.name, entityName });
      });
    });
    return result;
  }, [userAssignments, entityId, roleById, capsQuery.data, licenseeById]);

  return (
    <Card>
      <CardHeader><CardTitle>Effective Access</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 max-w-2xl">
          <div>
            <Label>User</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Select an external user" /></SelectTrigger>
              <SelectContent>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name || p.email} <span className="text-muted-foreground">({p.role})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Entity</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any / not scoped</SelectItem>
                {licensees.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!userId && <div className="text-sm text-muted-foreground">Pick a user to see their effective portal capabilities.</div>}

        {userId && PORTAL_AREAS.map(area => {
          const e = effective[area];
          return (
            <Card key={area}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{PORTAL_AREA_LABEL[area]}</CardTitle></CardHeader>
              <CardContent>
                {e.caps.size === 0
                  ? <div className="text-sm text-muted-foreground">No capabilities.</div>
                  : (
                    <>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {Array.from(e.caps).map(c => (
                          <Badge key={c} variant="default">{CAPABILITY_LABEL[c]}</Badge>
                        ))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Granted by:{' '}
                        {e.sources.map((s, i) => (
                          <span key={i} className="mr-2">
                            {s.templateName}{s.entityName ? ` (entity: ${s.entityName})` : ' (not entity-scoped)'}{i < e.sources.length - 1 ? ',' : ''}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
              </CardContent>
            </Card>
          );
        })}
      </CardContent>
    </Card>
  );
}
