import { useState, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Shield, Plus, Edit, Trash2, Users, Search, CheckCircle, AlertTriangle,
  Menu as MenuIcon, Route as RouteIcon, Info, ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { toast } from 'sonner';
import {
  useRoles, usePermissions, useAllRolePermissions, useRoleUserCounts,
  useCreateRole, useUpdateRole, useDeleteRole, DynamicRole, Permission,
} from '@/hooks/useRoles';
import {
  ACTION_LABELS, ACTION_DESCRIPTIONS, getAllModuleEntries, getModuleEntry,
  validateModuleSelection, PermissionAction,
} from '@/lib/permissionRegistry';
import type { PermissionModule } from '@/lib/permissionModules';

/**
 * Role Management — INTERNAL ONLY.
 * Manages dynamic roles + module permissions for employees/admin/internal staff.
 * External users (applicant, pre_licensee, licensee_primary, licensee_secondary)
 * are NOT managed here. Their entity-scoped portal capabilities live in
 * /admin/external-portal-access (see src/pages/admin/ExternalPortalAccess.tsx).
 */

/** Reject role names that look like external portal users — they must be configured via External Portal Access. */
const EXTERNAL_ROLE_NAME_PATTERNS: RegExp[] = [
  /applicant/i,
  /pre[-\s]?licensee/i,
  /licensee/i,
  /external\s*portal/i,
  /returns?\s*portal/i,
  /complaint\s*portal/i,
  /f\s*&?\s*p\s*declaration|fp\s*declaration/i,
];

function getExternalRoleNameError(name: string): string | null {
  if (EXTERNAL_ROLE_NAME_PATTERNS.some((re) => re.test(name))) {
    return 'External portal users are not managed here. Use External Portal Access for applicant/licensee capabilities.';
  }
  return null;
}


export default function RoleManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<DynamicRole | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<DynamicRole | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<DynamicRole | null>(null);

  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: permissions = [] } = usePermissions();
  const { data: allRolePerms = [] } = useAllRolePermissions();
  const { data: userCounts = {} } = useRoleUserCounts();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const moduleEntries = useMemo(() => getAllModuleEntries(), []);

  /** Index permissions by module → action → row (id, name). */
  const permissionsByModule = useMemo(() => {
    const map: Record<string, Record<string, Permission>> = {};
    for (const p of permissions) {
      map[p.module] ??= {};
      map[p.module][p.name] = p;
    }
    return map;
  }, [permissions]);

  const getPermIdsForRole = (roleId: string) =>
    allRolePerms.filter(rp => rp.role_id === roleId).map(rp => rp.permission_id);

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormName(''); setFormDesc(''); setFormPerms([]);
    setDialogOpen(true);
  };

  const openEditDialog = (role: DynamicRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    setFormName(role.name);
    setFormDesc(role.description || '');
    setFormPerms(getPermIdsForRole(role.id));
    setDialogOpen(true);
  };

  const togglePerm = (permId: string) => {
    setFormPerms(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]);
  };

  const toggleModule = (module: PermissionModule) => {
    const modulePermIds = Object.values(permissionsByModule[module] || {}).map(p => p.id);
    const allSelected = modulePermIds.every(id => formPerms.includes(id));
    if (allSelected) {
      setFormPerms(prev => prev.filter(id => !modulePermIds.includes(id)));
    } else {
      setFormPerms(prev => [...new Set([...prev, ...modulePermIds])]);
    }
  };

  /** Selected actions per module — used for validation + effect preview. */
  const selectedByModule = useMemo(() => {
    const result: Record<string, PermissionAction[]> = {};
    for (const entry of moduleEntries) {
      const actions: PermissionAction[] = [];
      for (const action of entry.actions) {
        const perm = permissionsByModule[entry.module]?.[action];
        if (perm && formPerms.includes(perm.id)) actions.push(action);
      }
      result[entry.module] = actions;
    }
    return result;
  }, [formPerms, moduleEntries, permissionsByModule]);

  const validationWarnings = useMemo(() => {
    const all: string[] = [];
    for (const entry of moduleEntries) {
      all.push(...validateModuleSelection(entry.module, selectedByModule[entry.module] || []));
    }
    return all;
  }, [moduleEntries, selectedByModule]);

  const effectPreview = useMemo(() => {
    const menus = new Set<string>();
    const routes = new Set<string>();
    for (const entry of moduleEntries) {
      if ((selectedByModule[entry.module] || []).length === 0) continue;
      entry.menus.forEach(m => menus.add(m));
      entry.routes.forEach(r => routes.add(r));
    }
    return { menus: [...menus], routes: [...routes] };
  }, [moduleEntries, selectedByModule]);

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Role name is required'); return; }
    const externalErr = getExternalRoleNameError(formName);
    if (externalErr) { toast.error(externalErr); return; }
    if (formPerms.length === 0) {
      toast.error('Select at least one permission — a role with no permissions grants no access.');
      return;
    }

    const payload = {
      name: formName, description: formDesc, system_role: 'analyst', permissionIds: formPerms,
    };
    if (editingRole) {
      await updateRole.mutateAsync({ id: editingRole.id, ...payload });
    } else {
      await createRole.mutateAsync(payload);
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await deleteRole.mutateAsync(deleteConfirm.id);
    if (selectedRole?.id === deleteConfirm.id) setSelectedRole(null);
    setDeleteConfirm(null);
  };

  const selectedRolePerms = selectedRole ? getPermIdsForRole(selectedRole.id) : [];

  /** Compute effect preview for the currently *selected* (read-only) role card. */
  const selectedRoleEffect = useMemo(() => {
    if (!selectedRole) return { menus: [], routes: [], modules: [] as string[] };
    const menus = new Set<string>();
    const routes = new Set<string>();
    const modules = new Set<string>();
    for (const entry of moduleEntries) {
      const hasAny = entry.actions.some(a => {
        const perm = permissionsByModule[entry.module]?.[a];
        return perm && selectedRolePerms.includes(perm.id);
      });
      if (!hasAny) continue;
      modules.add(entry.label);
      entry.menus.forEach(m => menus.add(m));
      entry.routes.forEach(r => routes.add(r));
    }
    return { menus: [...menus], routes: [...routes], modules: [...modules] };
  }, [selectedRole, selectedRolePerms, moduleEntries, permissionsByModule]);

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={150}>
      <div className="space-y-8">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Internal employee/admin roles only</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              This page manages internal employee/admin roles only. Applicant, pre-licensee and licensee primary/secondary
              portal access is managed separately under External Portal Access.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/external-portal-access">
                <ExternalLink className="h-4 w-4 mr-2" />
                Manage External Portal Access
              </Link>
            </Button>
          </AlertDescription>
        </Alert>

        <div className="flex items-start justify-between animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Role Management</h1>
            <p className="mt-1 text-muted-foreground">
              Create and manage internal employee roles with admin/module permissions. Each module shows the menus and routes it unlocks so you can audit access at a glance.
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />Create Role
          </Button>
        </div>


        <div className="relative max-w-md animate-slide-up delay-100">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search roles..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6 animate-slide-up delay-200">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Roles</CardTitle>
                <CardDescription>Click a role to view what it unlocks</CardDescription>
              </CardHeader>
              <CardContent>
                {rolesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading roles...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role</TableHead>
                        <TableHead>Users</TableHead>
                        <TableHead>Permissions</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRoles.map(role => (
                        <TableRow
                          key={role.id}
                          className={`cursor-pointer ${selectedRole?.id === role.id ? 'bg-muted/50' : ''}`}
                          onClick={() => setSelectedRole(role)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                <Shield className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{role.name}</p>
                                <p className="text-sm text-muted-foreground">{role.description}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4 text-muted-foreground" />
                              <span>{userCounts[role.id] || 0}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{getPermIdsForRole(role.id).length} permissions</Badge>
                          </TableCell>
                          <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                            <RowActionsMenu actions={[
                              { label: 'Edit', icon: Edit, onClick: (e) => openEditDialog(role, e as any) },
                              { label: 'Delete', icon: Trash2, onClick: () => setDeleteConfirm(role), destructive: true, hidden: role.is_system, separator: true },
                            ]} />
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredRoles.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No roles found</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Role detail / audit panel */}
          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg">{selectedRole ? selectedRole.name : 'Role Details'}</CardTitle>
                <CardDescription>{selectedRole ? selectedRole.description : 'Select a role to audit access'}</CardDescription>
              </CardHeader>
              <CardContent>
                {selectedRole ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{userCounts[selectedRole.id] || 0} users assigned</span>
                    </div>
                    {selectedRole.is_system && <Badge variant="secondary">System Role</Badge>}

                    <div className="space-y-3 pt-4 border-t">
                      <p className="text-sm font-medium text-muted-foreground">Permissions by module</p>
                      {moduleEntries.map(entry => {
                        const grantedActions = entry.actions.filter(a => {
                          const perm = permissionsByModule[entry.module]?.[a];
                          return perm && selectedRolePerms.includes(perm.id);
                        });
                        if (grantedActions.length === 0) return null;
                        return (
                          <div key={entry.module} className="rounded-md border p-3 space-y-2">
                            <p className="text-sm font-semibold">{entry.label}</p>
                            <div className="flex flex-wrap gap-1">
                              {grantedActions.map(a => (
                                <Badge key={a} variant="secondary" className="gap-1">
                                  <CheckCircle className="h-3 w-3" />{ACTION_LABELS[a]}
                                </Badge>
                              ))}
                            </div>
                            {entry.menus.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium">Menus:</span> {entry.menus.join(', ')}
                              </div>
                            )}
                            {entry.routes.length > 0 && (
                              <div className="text-xs text-muted-foreground break-all">
                                <span className="font-medium">Routes:</span> {entry.routes.join(', ')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {selectedRolePerms.length === 0 && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle>No permissions assigned</AlertTitle>
                          <AlertDescription>
                            Users with this role will not see any admin/internal menu items or routes.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>

                    {selectedRolePerms.length > 0 && (
                      <div className="pt-3 border-t space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">Effective access</p>
                        <div className="flex items-start gap-2 text-xs">
                          <MenuIcon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                          <span>{selectedRoleEffect.menus.length} menu items unlocked</span>
                        </div>
                        <div className="flex items-start gap-2 text-xs">
                          <RouteIcon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground" />
                          <span>{selectedRoleEffect.routes.length} routes unlocked</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground italic pt-1">
                          Changes apply on the user's next page load (permissions are cached for ~60s).
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Click on a role to view permissions</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
            <DialogDescription>
              Each module shows the menus &amp; routes it unlocks. Select actions per module — "View" is recommended whenever Create/Edit/Approve/Reject is chosen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role Name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Insurance Regulator" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Short description" value={formDesc} onChange={e => setFormDesc(e.target.value)} />
              </div>
            </div>
            {formDesc.length > 80 && (
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} />
            )}

            <Separator />

            {validationWarnings.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Check your selection</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5 space-y-1 text-sm">
                    {validationWarnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <Label className="text-base font-semibold">Permissions</Label>

              {moduleEntries.map(entry => {
                const modulePerms = entry.actions
                  .map(a => permissionsByModule[entry.module]?.[a])
                  .filter(Boolean) as Permission[];
                const modulePermIds = modulePerms.map(p => p.id);
                const checkedCount = modulePermIds.filter(id => formPerms.includes(id)).length;
                const allChecked = modulePermIds.length > 0 && checkedCount === modulePermIds.length;
                const someChecked = checkedCount > 0 && !allChecked;

                return (
                  <Card key={entry.module} className="overflow-hidden">
                    <div className="flex items-start gap-3 px-4 py-3 bg-muted/50 border-b">
                      <Checkbox
                        className="mt-1"
                        checked={allChecked}
                        ref={el => { if (el) (el as any).indeterminate = someChecked; }}
                        onCheckedChange={() => toggleModule(entry.module)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold">{entry.label}</span>
                          <Badge variant="secondary" className="text-xs">{checkedCount}/{modulePermIds.length}</Badge>
                          <code className="text-[10px] text-muted-foreground">{entry.module}</code>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{entry.description}</p>
                        <div className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          {entry.menus.length > 0 && (
                            <div className="flex items-start gap-1">
                              <MenuIcon className="h-3 w-3 mt-0.5 shrink-0" />
                              <span><span className="font-medium">Menus:</span> {entry.menus.join(', ')}</span>
                            </div>
                          )}
                          {entry.routes.length > 0 && (
                            <div className="flex items-start gap-1 break-all">
                              <RouteIcon className="h-3 w-3 mt-0.5 shrink-0" />
                              <span><span className="font-medium">Routes:</span> {entry.routes.join(', ')}</span>
                            </div>
                          )}
                          {entry.menus.length === 0 && entry.routes.length === 0 && (
                            <span className="italic">No menus mapped — used for feature-level checks only.</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4">
                      {modulePerms.map(perm => (
                        <div key={perm.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`perm-${perm.id}`}
                            checked={formPerms.includes(perm.id)}
                            onCheckedChange={() => togglePerm(perm.id)}
                          />
                          <label htmlFor={`perm-${perm.id}`} className="text-sm capitalize cursor-pointer flex items-center gap-1">
                            {ACTION_LABELS[perm.name as PermissionAction] || perm.name}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-3 w-3 text-muted-foreground" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                {ACTION_DESCRIPTIONS[perm.name as PermissionAction] || perm.name}
                              </TooltipContent>
                            </Tooltip>
                          </label>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>

            {/* Effect preview */}
            <Card className="border-primary/40 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" /> Effect preview
                </CardTitle>
                <CardDescription>What users with this role will see after their next page load.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-medium mb-1">Menus unlocked ({effectPreview.menus.length})</p>
                  {effectPreview.menus.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {effectPreview.menus.map(m => <Badge key={m} variant="secondary">{m}</Badge>)}
                    </div>
                  ) : <p className="text-muted-foreground text-xs italic">No menus — role grants no sidebar access.</p>}
                </div>
                <div>
                  <p className="font-medium mb-1">Routes unlocked ({effectPreview.routes.length})</p>
                  {effectPreview.routes.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {effectPreview.routes.map(r => <code key={r} className="text-[11px] bg-background border rounded px-1.5 py-0.5">{r}</code>)}
                    </div>
                  ) : <p className="text-muted-foreground text-xs italic">No routes — role grants no page access.</p>}
                </div>
              </CardContent>
            </Card>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createRole.isPending || updateRole.isPending}>
              {(createRole.isPending || updateRole.isPending) ? 'Saving...' : editingRole ? 'Save Changes' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Delete Role
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone. Users assigned to this role will need to be reassigned.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteRole.isPending}>
              {deleteRole.isPending ? 'Deleting...' : 'Delete Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </TooltipProvider>
    </DashboardLayout>
  );
}
