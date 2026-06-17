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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Shield, Plus, Edit, Trash2, Users, Search, CheckCircle, AlertTriangle, Info,
} from 'lucide-react';

import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { toast } from 'sonner';
import {
  useRoles, usePermissions, useAllRolePermissions, useRoleUserCounts,
  useCreateRole, useUpdateRole, useDeleteRole, DynamicRole, Permission, RoleType,
} from '@/hooks/useRoles';
import {
  useCatalogModules, useCatalogActions,
} from '@/hooks/usePermissionCatalog';
import PermissionCatalogTab from './PermissionCatalogTab';
import {
  getTabsForRoleType, matchesTab, ROLE_TYPE_LABELS, type PermissionTab,
} from '@/lib/permissionTabs';

/**
 * Role Management — unified RBAC with role-type-aware permission tabs.
 * One roles table, one permissions table. Tab grouping is pure UI filtering
 * so external portal users (Applicant, Regulated Entity User) only see
 * submitter-facing permissions while internal staff see review/approval ones.
 */

interface ModuleEntry {
  module: string;
  label: string;
  description: string;
  actions: { key: string; label: string }[];
  actionLabels: Record<string, string>;
}

type AssignedFilter = 'all' | 'assigned' | 'unassigned';

export default function RoleManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<DynamicRole | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<DynamicRole | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formRoleType, setFormRoleType] = useState<RoleType>('internal');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [permSearch, setPermSearch] = useState('');
  const [assignedFilter, setAssignedFilter] = useState<AssignedFilter>('all');
  const [activeTabKey, setActiveTabKey] = useState<string>('');
  const [deleteConfirm, setDeleteConfirm] = useState<DynamicRole | null>(null);

  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: permissions = [] } = usePermissions();
  const { data: allRolePerms = [] } = useAllRolePermissions();
  const { data: userCounts = {} } = useRoleUserCounts();
  const { data: catModules = [] } = useCatalogModules();
  const { data: catActions = [] } = useCatalogActions();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  /** Module entries derived from DB catalog. */
  const moduleEntries = useMemo<ModuleEntry[]>(() => {
    return catModules.map(m => {
      const acts = catActions
        .filter(a => a.module_id === m.id)
        .sort((x, y) => x.sort_order - y.sort_order);
      const actionLabels: Record<string, string> = {};
      for (const a of acts) actionLabels[a.key] = a.label;
      return {
        module: m.key,
        label: m.label,
        description: m.description || '',
        actions: acts.map(a => ({ key: a.key, label: a.label })),
        actionLabels,
      };
    });
  }, [catModules, catActions]);

  /** Lookup: module -> action -> Permission row. */
  const permissionsByModule = useMemo(() => {
    const map: Record<string, Record<string, Permission>> = {};
    for (const p of permissions) {
      map[p.module] ??= {};
      map[p.module][p.name] = p;
    }
    return map;
  }, [permissions]);

  const moduleLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of moduleEntries) m[e.module] = e.label;
    return m;
  }, [moduleEntries]);

  const getPermIdsForRole = (roleId: string) =>
    allRolePerms.filter(rp => rp.role_id === roleId).map(rp => rp.permission_id);

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormName(''); setFormDesc(''); setFormPerms([]);
    setFormRoleType('internal');
    setPermSearch(''); setAssignedFilter('all');
    setActiveTabKey('');
    setDialogOpen(true);
  };

  const openEditDialog = (role: DynamicRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    setFormName(role.name);
    setFormDesc(role.description || '');
    setFormRoleType((role.role_type || 'internal') as RoleType);
    setFormPerms(getPermIdsForRole(role.id));
    setPermSearch(''); setAssignedFilter('all');
    setActiveTabKey('');
    setDialogOpen(true);
  };

  const togglePerm = (permId: string) => {
    setFormPerms(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]);
  };

  /**
   * Build the {tab -> module -> [permissions]} structure for a given role type.
   * Uses moduleEntries (catalog) when available, falling back to permissions
   * table for actions that aren't in the catalog yet.
   */
  const buildTabbedPermissions = (roleType: RoleType): Array<{
    tab: PermissionTab;
    modules: Array<{
      moduleKey: string;
      moduleLabel: string;
      perms: Array<{ permission: Permission; label: string }>;
    }>;
  }> => {
    const tabs = getTabsForRoleType(roleType);
    return tabs.map(tab => {
      const modules = tab.modules.map(moduleKey => {
        const entry = moduleEntries.find(e => e.module === moduleKey);
        // Candidate actions: from catalog if available, else from permissions table
        const candidateActions: { key: string; label: string }[] = entry
          ? entry.actions
          : Object.keys(permissionsByModule[moduleKey] || {}).map(k => ({ key: k, label: k }));

        const perms = candidateActions
          .filter(a => matchesTab(tab, moduleKey, a.key))
          .map(a => {
            const permission = permissionsByModule[moduleKey]?.[a.key];
            return permission ? { permission, label: a.label } : null;
          })
          .filter((x): x is { permission: Permission; label: string } => x !== null);

        return {
          moduleKey,
          moduleLabel: entry?.label || moduleLabelMap[moduleKey] || moduleKey,
          perms,
        };
      }).filter(m => m.perms.length > 0);

      return { tab, modules };
    });
  };

  const editTabs = useMemo(() => buildTabbedPermissions(formRoleType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formRoleType, moduleEntries, permissionsByModule, moduleLabelMap]);

  // Pick the first available tab when role type changes
  useMemo(() => {
    if (!dialogOpen) return;
    const firstKey = editTabs.find(t => t.modules.length > 0)?.tab.key || editTabs[0]?.tab.key || '';
    if (!activeTabKey || !editTabs.some(t => t.tab.key === activeTabKey)) {
      setActiveTabKey(firstKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogOpen, formRoleType, editTabs.length]);

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Role name is required'); return; }
    if (formPerms.length === 0) {
      toast.error('Select at least one permission — a role with no permissions grants no access.');
      return;
    }
    const payload = {
      name: formName, description: formDesc, system_role: 'analyst',
      role_type: formRoleType, permissionIds: formPerms,
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

  const detailTabs = useMemo(() => {
    if (!selectedRole) return [] as ReturnType<typeof buildTabbedPermissions>;
    return buildTabbedPermissions((selectedRole.role_type || 'internal') as RoleType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, moduleEntries, permissionsByModule, moduleLabelMap]);

  /** Permissions on the selected role that don't appear under any visible tab. */
  const detailOrphanPerms = useMemo(() => {
    if (!selectedRole) return [] as Permission[];
    const visible = new Set<string>();
    for (const t of detailTabs) for (const m of t.modules)
      for (const p of m.perms) visible.add(p.permission.id);
    return permissions.filter(p => selectedRolePerms.includes(p.id) && !visible.has(p.id));
  }, [selectedRole, selectedRolePerms, detailTabs, permissions]);

  const editOrphanPerms = useMemo(() => {
    const visible = new Set<string>();
    for (const t of editTabs) for (const m of t.modules)
      for (const p of m.perms) visible.add(p.permission.id);
    return permissions.filter(p => !visible.has(p.id));
  }, [editTabs, permissions]);

  /** Catalog health: permission is categorised if it appears under any tab
   *  for either internal or external role types. */
  const catalogHealth = useMemo(() => {
    const categorised = new Set<string>();
    for (const rt of ['internal', 'external'] as RoleType[]) {
      const tabs = buildTabbedPermissions(rt);
      for (const t of tabs) for (const m of t.modules)
        for (const p of m.perms) categorised.add(p.permission.id);
    }
    const total = permissions.length;
    const categorisedCount = permissions.filter(p => categorised.has(p.id)).length;
    return { total, categorisedCount, uncategorisedCount: total - categorisedCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions, moduleEntries, permissionsByModule, moduleLabelMap]);

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={150}>
        <div className="space-y-8">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Unified roles &amp; permissions</AlertTitle>
            <AlertDescription>
              One framework covers internal regulatory staff and external portal users.
              Choose <strong>Role Type</strong> when editing — the permission list filters to
              only show actions relevant to that audience.
            </AlertDescription>
          </Alert>

          <div className="flex items-start justify-between animate-slide-up">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Role Management</h1>
              <p className="mt-1 text-muted-foreground">
                Manage roles, role types, and the permissions they grant.
              </p>
            </div>
          </div>

          <Tabs defaultValue="roles" className="w-full">
            <TabsList>
              <TabsTrigger value="roles">Roles</TabsTrigger>
              <TabsTrigger value="catalog">Permission Catalog</TabsTrigger>
            </TabsList>

            <TabsContent value="catalog" className="pt-6">
              <PermissionCatalogTab />
            </TabsContent>

            <TabsContent value="roles" className="pt-6 space-y-6">
              <div className="flex items-center justify-between">
                <div className="relative max-w-md flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search roles..." value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
                </div>
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />Create Role
                </Button>
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
                              <TableHead>Type</TableHead>
                              <TableHead>Users</TableHead>
                              <TableHead>Permissions</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRoles.map(role => {
                              const rt = (role.role_type || 'internal') as RoleType;
                              return (
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
                                    <Badge variant={rt === 'external' ? 'outline' : 'secondary'}>
                                      {rt === 'external' ? 'External' : 'Internal'}
                                    </Badge>
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
                              );
                            })}
                            {filteredRoles.length === 0 && (
                              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No roles found</TableCell></TableRow>
                            )}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Role detail panel */}
                <div>
                  <Card className="sticky top-6">
                    <CardHeader>
                      <CardTitle className="text-lg">{selectedRole ? selectedRole.name : 'Role Details'}</CardTitle>
                      <CardDescription>
                        {selectedRole ? selectedRole.description : 'Select a role to audit access'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedRole ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={(selectedRole.role_type || 'internal') === 'external' ? 'outline' : 'secondary'}>
                              Role Type: {ROLE_TYPE_LABELS[(selectedRole.role_type || 'internal') as RoleType]}
                            </Badge>
                            {selectedRole.is_system && <Badge variant="secondary">System Role</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{userCounts[selectedRole.id] || 0} users assigned</span>
                          </div>

                          <div className="space-y-3 pt-4 border-t">
                            <p className="text-sm font-medium text-muted-foreground">Permissions</p>
                            {detailTabs.map(({ tab, modules }) => {
                              const grantedInTab: Array<{ moduleLabel: string; perms: string[] }> = [];
                              for (const m of modules) {
                                const granted = m.perms.filter(p => selectedRolePerms.includes(p.permission.id));
                                if (granted.length > 0) {
                                  grantedInTab.push({ moduleLabel: m.moduleLabel, perms: granted.map(g => g.label) });
                                }
                              }
                              return (
                                <div key={tab.key} className="rounded-md border p-3 space-y-2">
                                  <p className="text-sm font-semibold">{tab.label}</p>
                                  {grantedInTab.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic">No permissions</p>
                                  ) : (
                                    grantedInTab.map(g => (
                                      <div key={g.moduleLabel} className="space-y-1">
                                        <p className="text-xs font-medium text-muted-foreground">{g.moduleLabel}</p>
                                        <div className="flex flex-wrap gap-1">
                                          {g.perms.map(label => (
                                            <Badge key={label} variant="secondary" className="gap-1">
                                              <CheckCircle className="h-3 w-3" />{label}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              );
                            })}

                            {detailOrphanPerms.length > 0 && (
                              <Alert className="border-amber-500/50 bg-amber-500/5">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                <AlertTitle className="text-sm">
                                  Uncategorised / Legacy Permissions
                                  <Badge variant="outline" className="ml-2">{detailOrphanPerms.length}</Badge>
                                </AlertTitle>
                                <AlertDescription className="space-y-2">
                                  <p className="text-xs">
                                    These permissions are not mapped to any permission category yet.
                                    They are shown to prevent existing assignments from being hidden or lost.
                                  </p>
                                  <div className="flex flex-wrap gap-1 pt-1">
                                    {detailOrphanPerms.map(p => (
                                      <Badge key={p.id} variant="outline" className="gap-1">
                                        <CheckCircle className="h-3 w-3" />{p.module}.{p.name}
                                      </Badge>
                                    ))}
                                  </div>
                                </AlertDescription>
                              </Alert>
                            )}

                            {selectedRolePerms.length === 0 && (
                              <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>No permissions assigned</AlertTitle>
                                <AlertDescription>
                                  Users with this role will not see any menus or routes.
                                </AlertDescription>
                              </Alert>
                            )}
                          </div>
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
            </TabsContent>
          </Tabs>
        </div>

        {/* Create / Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
              <DialogDescription>
                Choose a Role Type, then pick permissions grouped by tab. Only permissions
                relevant to the selected audience are shown.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Role Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Insurance Regulator" value={formName}
                    onChange={e => setFormName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input placeholder="Short description" value={formDesc}
                    onChange={e => setFormDesc(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Role Type <span className="text-destructive">*</span></Label>
                  <Select
                    value={formRoleType}
                    onValueChange={(v) => setFormRoleType(v as RoleType)}
                    disabled={!!editingRole?.is_system}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal Regulatory User</SelectItem>
                      <SelectItem value="external">External Portal User</SelectItem>
                    </SelectContent>
                  </Select>
                  {editingRole?.is_system && (
                    <p className="text-[11px] text-muted-foreground">
                      Role type is locked for system roles.
                    </p>
                  )}
                </div>
              </div>
              {formDesc.length > 80 && (
                <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} />
              )}

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <Label className="text-base font-semibold">Permissions</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search permissions"
                        value={permSearch}
                        onChange={e => setPermSearch(e.target.value)}
                        className="pl-7 h-8 w-56"
                      />
                    </div>
                    <Select value={assignedFilter} onValueChange={(v) => setAssignedFilter(v as AssignedFilter)}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="assigned">Assigned</SelectItem>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Tabs value={activeTabKey} onValueChange={setActiveTabKey} className="w-full">
                  <TabsList className="flex flex-wrap h-auto">
                    {editTabs.map(({ tab, modules }) => {
                      const totalPerms = modules.reduce((s, m) => s + m.perms.length, 0);
                      const assigned = modules.reduce(
                        (s, m) => s + m.perms.filter(p => formPerms.includes(p.permission.id)).length, 0,
                      );
                      return (
                        <TabsTrigger key={tab.key} value={tab.key} className="gap-2">
                          {tab.label}
                          <Badge variant="secondary" className="text-[10px]">
                            {assigned}/{totalPerms}
                          </Badge>
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  {editTabs.map(({ tab, modules }) => {
                    const search = permSearch.trim().toLowerCase();
                    return (
                      <TabsContent key={tab.key} value={tab.key} className="space-y-3 pt-4">
                        {modules.length === 0 && (
                          <p className="text-sm text-muted-foreground italic py-6 text-center">
                            No permissions available for this tab.
                          </p>
                        )}
                        {modules.map(m => {
                          const filteredPerms = m.perms.filter(({ permission, label }) => {
                            if (search && !label.toLowerCase().includes(search) &&
                                !permission.name.toLowerCase().includes(search)) return false;
                            const isAssigned = formPerms.includes(permission.id);
                            if (assignedFilter === 'assigned' && !isAssigned) return false;
                            if (assignedFilter === 'unassigned' && isAssigned) return false;
                            return true;
                          });
                          if (filteredPerms.length === 0) return null;
                          const allChecked = filteredPerms.every(p => formPerms.includes(p.permission.id));
                          const someChecked = filteredPerms.some(p => formPerms.includes(p.permission.id)) && !allChecked;
                          const toggleAll = () => {
                            const ids = filteredPerms.map(p => p.permission.id);
                            if (allChecked) {
                              setFormPerms(prev => prev.filter(id => !ids.includes(id)));
                            } else {
                              setFormPerms(prev => [...new Set([...prev, ...ids])]);
                            }
                          };
                          return (
                            <Card key={m.moduleKey} className="overflow-hidden">
                              <div className="flex items-start gap-3 px-4 py-2 bg-muted/50 border-b">
                                <Checkbox
                                  className="mt-1"
                                  checked={allChecked}
                                  ref={el => { if (el) (el as any).indeterminate = someChecked; }}
                                  onCheckedChange={toggleAll}
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-semibold">{m.moduleLabel}</span>
                                    <code className="text-[10px] text-muted-foreground">{m.moduleKey}</code>
                                  </div>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
                                {filteredPerms.map(({ permission, label }) => (
                                  <div key={permission.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`perm-${permission.id}`}
                                      checked={formPerms.includes(permission.id)}
                                      onCheckedChange={() => togglePerm(permission.id)}
                                    />
                                    <label
                                      htmlFor={`perm-${permission.id}`}
                                      className="text-sm cursor-pointer flex items-center gap-1"
                                    >
                                      {label}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Info className="h-3 w-3 text-muted-foreground" />
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs">
                                          {permission.description || `${permission.module}.${permission.name}`}
                                        </TooltipContent>
                                      </Tooltip>
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </Card>
                          );
                        })}
                      </TabsContent>
                    );
                  })}
                </Tabs>

                {editOrphanPerms.length > 0 && (
                  <Card className="overflow-hidden border-dashed">
                    <div className="px-4 py-3 bg-muted/30 border-b">
                      <p className="text-sm font-semibold">Other permissions</p>
                      <p className="text-xs text-muted-foreground">
                        Not categorised under the {ROLE_TYPE_LABELS[formRoleType]} tabs. Shown so legacy
                        assignments are not silently dropped.
                      </p>
                    </div>
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {editOrphanPerms
                        .filter(p => {
                          const search = permSearch.trim().toLowerCase();
                          if (search && !p.name.toLowerCase().includes(search) &&
                              !p.module.toLowerCase().includes(search)) return false;
                          const isAssigned = formPerms.includes(p.id);
                          if (assignedFilter === 'assigned' && !isAssigned) return false;
                          if (assignedFilter === 'unassigned' && isAssigned) return false;
                          return true;
                        })
                        .map(p => (
                          <div key={p.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`perm-${p.id}`}
                              checked={formPerms.includes(p.id)}
                              onCheckedChange={() => togglePerm(p.id)}
                            />
                            <label htmlFor={`perm-${p.id}`} className="text-sm cursor-pointer">
                              <code className="text-[11px]">{p.module}.{p.name}</code>
                            </label>
                          </div>
                        ))}
                    </div>
                  </Card>
                )}
              </div>
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
