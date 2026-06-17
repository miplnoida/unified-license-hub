/**
 * External Portal Access — manage external portal roles and their capabilities.
 *
 * Internal employee/admin permissions are managed separately in /admin/roles.
 */
import { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Plus, ShieldCheck, ShieldOff, Pencil, Trash2, Info, Lock } from 'lucide-react';
import { useExternalPortalRoles } from '@/hooks/useExternalPortalRoles';
import {
  AREA_CAPABILITIES, ALL_CAPABILITIES, PORTAL_AREAS, PORTAL_AREA_LABEL,
  CAPABILITY_LABEL, RESTRICTIONS_NOTICE,
  type ExternalPortalRole, type ExternalPortalRoleCapability,
  type PortalArea, type PortalCapability,
} from '@/lib/externalPortalRoles';

export default function ExternalPortalAccessPage() {
  const { toast } = useToast();
  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        <PageHeader
          title="External Portal Access"
          description="Dynamic roles for applicant and licensee portals. Internal employee/admin permissions are managed separately."
          backHref="/admin/roles"
          backLabel="Back"
        />

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>External portal capabilities only</AlertTitle>
          <AlertDescription>
            These roles only grant access to the Licensing, Returns, Complaints and F&amp;P
            portals. They never grant internal workflow, findings, audit logs, reports or admin panel access.
          </AlertDescription>
        </Alert>

        <RolesTab toast={toast} />
      </div>
    </DashboardLayout>
  );
}

function RolesTab({ toast }: { toast: ReturnType<typeof useToast>['toast'] }) {
  const { rolesQuery, capsQuery, upsertRole, deleteRole, upsertCapability } = useExternalPortalRoles();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExternalPortalRole | null>(null);
  const [form, setForm] = useState<{
    name: string; role_key: string; description: string; is_active: boolean;
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
        applies_to_roles: [],
        is_active: form.is_active,
      });
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
      title: 'Delete role?',
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
        <CardTitle>External Portal Roles</CardTitle>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-1" />New role</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
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
          <DialogHeader><DialogTitle>{editing ? 'Edit role' : 'New role'}</DialogTitle></DialogHeader>
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
    is_active: true, caps,
  };
}
