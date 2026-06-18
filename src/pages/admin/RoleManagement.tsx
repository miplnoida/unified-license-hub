import { useState, useMemo, useEffect } from 'react';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Shield, Plus, Edit, Trash2, Users, Search, CheckCircle, XCircle, AlertTriangle, Info, Sparkles,
} from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { toast } from 'sonner';
import {
  useRoles, usePermissions, useAllRolePermissions, useRoleUserCounts,
  useCreateRole, useUpdateRole, useDeleteRole, useResetSystemRole,
  DynamicRole, Permission, RoleType,
} from '@/hooks/useRoles';
import {
  useCatalogModules, useCatalogActions,
} from '@/hooks/usePermissionCatalog';
import PermissionCatalogTab from './PermissionCatalogTab';

/** Strip developer-style "Module N - " prefixes. */
const cleanModuleLabel = (label?: string | null, fallbackKey?: string) => {
  const cleaned = String(label || '').replace(/^\s*Module\s*\d+\s*[-–:]\s*/i, '').trim();
  if (cleaned) return cleaned;
  const k = String(fallbackKey || '');
  return k ? k.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ') : '';
};
/** Humanize an action key like "issue_digital_license" -> "Issue Digital License". */
const humanizeActionLabel = (label?: string | null, key?: string) => {
  const cleaned = String(label || '').trim();
  if (cleaned && cleaned.toLowerCase() !== String(key || '').toLowerCase()) return cleaned;
  const k = String(key || cleaned);
  return k.split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join(' ');
};

/** Business-friendly role type labels. */
const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  internal: 'Internal Regulatory User',
  external: 'External Portal User',
};
const ROLE_TYPE_HELP: Record<RoleType, string> = {
  internal: 'Staff working inside the regulator office',
  external: 'Applicants, licensees and entity portal users',
};

/** Modules considered "external/portal" — only shown for External role type. */
const EXTERNAL_MODULES = new Set([
  'public_complaint_portal',
]);
/** Action keys that are submitter-facing (external) regardless of module. */
const EXTERNAL_ONLY_ACTIONS = new Set([
  'submit', 'view_status', 'upload_documents', 'respond_rfi',
]);
/** Modules considered admin / system — surface them last and group together. */
const ADMIN_MODULES = new Set([
  'user_management', 'role_management', 'settings',
]);

interface CapabilityAction {
  permission: Permission;
  label: string;
}
interface CapabilityGroup {
  moduleKey: string;
  moduleLabel: string;
  description: string;
  actions: CapabilityAction[];
}

/** Quick role templates. Action keys are matched across all modules. */
interface QuickTemplate {
  key: string;
  label: string;
  roleType: RoleType;
  /** modules to include (or undefined for "all non-admin"). */
  modules?: string[];
  /** action keys to include for each listed module (or '*' for all). */
  actions: '*' | string[];
  excludeAdmin?: boolean;
}
const QUICK_TEMPLATES: QuickTemplate[] = [
  { key: 'licensing_officer', label: 'Licensing Officer', roleType: 'internal',
    modules: ['licensing', 'license_management', 'application_management', 'fee_management'],
    actions: ['view', 'create', 'edit', 'approve', 'reject', 'add_legal_notes', 'recommend_conditions', 'issue_digital_license', 'conditional_approve'] },
  { key: 'registration_officer', label: 'Registration Officer', roleType: 'internal',
    modules: ['registration_management'], actions: '*' },
  { key: 'compliance_officer', label: 'Compliance Officer', roleType: 'internal',
    modules: ['returns_management', 'complaint_management', 'fit_and_proper'],
    actions: ['view', 'edit', 'approve', 'reject'] },
  { key: 'supervisor', label: 'Supervisor', roleType: 'internal',
    excludeAdmin: true, actions: ['view', 'approve', 'reject'] },
  { key: 'administrator', label: 'Administrator', roleType: 'internal',
    modules: ['user_management', 'role_management', 'settings', 'report_management'], actions: '*' },
  { key: 'portal_applicant', label: 'Portal Applicant', roleType: 'external',
    modules: ['licensing'], actions: ['submit', 'view_status', 'upload_documents', 'respond_rfi'] },
  { key: 'portal_entity_user', label: 'Portal Entity User', roleType: 'external',
    modules: ['returns_management', 'complaint_management', 'fit_and_proper'],
    actions: ['submit', 'view', 'view_status', 'upload_documents', 'respond_rfi'] },
];

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
  const resetSystemRole = useResetSystemRole();

  /** Map: module key -> { label, description, actions[] } from catalog. */
  const moduleCatalog = useMemo(() => {
    const map = new Map<string, { label: string; description: string; actions: { key: string; label: string }[] }>();
    for (const m of catModules) {
      const acts = catActions
        .filter(a => a.module_id === m.id)
        .sort((x, y) => x.sort_order - y.sort_order)
        .map(a => ({ key: a.key, label: humanizeActionLabel(a.label, a.key) }));
      map.set(m.key, {
        label: cleanModuleLabel(m.label, m.key),
        description: m.description || '',
        actions: acts,
      });
    }
    return map;
  }, [catModules, catActions]);

  /** Lookup: module -> action key -> Permission row. */
  const permLookup = useMemo(() => {
    const map: Record<string, Record<string, Permission>> = {};
    for (const p of permissions) {
      map[p.module] ??= {};
      map[p.module][p.name] = p;
    }
    return map;
  }, [permissions]);

  /** Decide whether (module, action) should appear for the given role type. */
  const isVisibleForRoleType = (moduleKey: string, actionKey: string, roleType: RoleType) => {
    const isExternalAction = EXTERNAL_ONLY_ACTIONS.has(actionKey);
    const isExternalModule = EXTERNAL_MODULES.has(moduleKey);
    if (roleType === 'external') {
      // external sees only submitter actions + portal modules
      return isExternalAction || isExternalModule;
    }
    // internal hides pure submitter actions on internal modules
    if (isExternalAction && !isExternalModule) return false;
    return true;
  };

  /**
   * Build capability groups for the given role type. One card per module.
   * Pulls labels from catalog where available; falls back to permission rows
   * to ensure nothing is hidden if catalog is incomplete.
   */
  const buildCapabilityGroups = (roleType: RoleType): CapabilityGroup[] => {
    const moduleKeys = new Set<string>();
    for (const p of permissions) moduleKeys.add(p.module);
    for (const k of moduleCatalog.keys()) moduleKeys.add(k);

    const groups: CapabilityGroup[] = [];
    for (const moduleKey of moduleKeys) {
      const cat = moduleCatalog.get(moduleKey);
      const moduleLabel = cat?.label || cleanModuleLabel(null, moduleKey);
      const description = cat?.description || '';

      // Build action list (catalog order first, then any extra permission rows).
      const seen = new Set<string>();
      const actions: CapabilityAction[] = [];
      for (const a of cat?.actions || []) {
        const perm = permLookup[moduleKey]?.[a.key];
        if (!perm) continue;
        if (!isVisibleForRoleType(moduleKey, a.key, roleType)) continue;
        actions.push({ permission: perm, label: a.label });
        seen.add(a.key);
      }
      for (const actKey of Object.keys(permLookup[moduleKey] || {})) {
        if (seen.has(actKey)) continue;
        if (!isVisibleForRoleType(moduleKey, actKey, roleType)) continue;
        actions.push({
          permission: permLookup[moduleKey][actKey],
          label: humanizeActionLabel(null, actKey),
        });
      }

      if (actions.length > 0) {
        groups.push({ moduleKey, moduleLabel, description, actions });
      }
    }

    // Sort: non-admin alpha first, admin modules last.
    groups.sort((a, b) => {
      const aAdmin = ADMIN_MODULES.has(a.moduleKey) ? 1 : 0;
      const bAdmin = ADMIN_MODULES.has(b.moduleKey) ? 1 : 0;
      if (aAdmin !== bAdmin) return aAdmin - bAdmin;
      return a.moduleLabel.localeCompare(b.moduleLabel);
    });
    return groups;
  };

  const editGroups = useMemo(
    () => buildCapabilityGroups(formRoleType),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formRoleType, moduleCatalog, permLookup, permissions]
  );

  /** Permissions assigned to the role that don't appear in any capability card
   *  (e.g. legacy keys). Kept in a quiet collapsible section to avoid data loss. */
  const editOrphanPerms = useMemo(() => {
    const visible = new Set<string>();
    for (const g of editGroups) for (const a of g.actions) visible.add(a.permission.id);
    return permissions.filter(p => !visible.has(p.id));
  }, [editGroups, permissions]);

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
    setPermSearch('');
    setDialogOpen(true);
  };

  const openEditDialog = (role: DynamicRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    setFormName(role.name);
    setFormDesc(role.description || '');
    setFormRoleType((role.role_type || 'internal') as RoleType);
    setFormPerms(getPermIdsForRole(role.id));
    setPermSearch('');
    setDialogOpen(true);
  };

  const togglePerm = (permId: string) => {
    setFormPerms(prev => prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]);
  };

  /** Apply a quick template — sets role type and prefills permission ids. */
  const applyTemplate = (tplKey: string) => {
    if (!tplKey || tplKey === 'none') return;
    const tpl = QUICK_TEMPLATES.find(t => t.key === tplKey);
    if (!tpl) return;
    const targetGroups = buildCapabilityGroups(tpl.roleType);
    const ids: string[] = [];
    for (const g of targetGroups) {
      if (tpl.excludeAdmin && ADMIN_MODULES.has(g.moduleKey)) continue;
      if (tpl.modules && !tpl.modules.includes(g.moduleKey)) continue;
      for (const a of g.actions) {
        if (tpl.actions === '*' || tpl.actions.includes(a.permission.name)) {
          ids.push(a.permission.id);
        }
      }
    }
    setFormRoleType(tpl.roleType);
    setFormPerms([...new Set(ids)]);
    toast.success(`Template applied: ${tpl.label}`);
  };

  const handleSave = async () => {
    const name = formName.trim();
    if (!name) { toast.error('Please enter a role name'); return; }
    const dupe = roles.find(r => r.name.trim().toLowerCase() === name.toLowerCase() && r.id !== editingRole?.id);
    if (dupe) { toast.error('A role with this name already exists'); return; }
    if (formPerms.length === 0) {
      toast.error('Please select at least one permission so this role can do something');
      return;
    }
    const payload = {
      name, description: formDesc, system_role: 'analyst',
      role_type: formRoleType, permissionIds: [...new Set(formPerms)],
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

  /** Compute the live "Can / Cannot" summary for the dialog form. */
  const editSummary = useMemo(() => {
    const can: string[] = [];
    const cannot: string[] = [];
    for (const g of editGroups) {
      const selected = g.actions.filter(a => formPerms.includes(a.permission.id));
      if (selected.length === 0) {
        cannot.push(`Access ${g.moduleLabel}`);
        continue;
      }
      // Roll up by module — show "<verb> <module>" for major verbs, else module name.
      const verbs = selected.map(a => a.label);
      if (selected.length === g.actions.length) {
        can.push(`Manage ${g.moduleLabel}`);
      } else {
        can.push(`${g.moduleLabel}: ${verbs.slice(0, 4).join(', ')}${verbs.length > 4 ? '…' : ''}`);
      }
    }
    return { can, cannot };
  }, [editGroups, formPerms]);

  /** Same summary, but for the currently-selected role in the side panel. */
  const detailSummary = useMemo(() => {
    if (!selectedRole) return { can: [], cannot: [] };
    const ids = new Set(getPermIdsForRole(selectedRole.id));
    const groups = buildCapabilityGroups((selectedRole.role_type || 'internal') as RoleType);
    const can: string[] = []; const cannot: string[] = [];
    for (const g of groups) {
      const selected = g.actions.filter(a => ids.has(a.permission.id));
      if (selected.length === 0) {
        cannot.push(`Access ${g.moduleLabel}`);
      } else if (selected.length === g.actions.length) {
        can.push(`Manage ${g.moduleLabel}`);
      } else {
        can.push(`${g.moduleLabel}: ${selected.map(a => a.label).slice(0, 4).join(', ')}${selected.length > 4 ? '…' : ''}`);
      }
    }
    return { can, cannot };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRole, allRolePerms, moduleCatalog, permLookup, permissions]);

  return (
    <DashboardLayout>
      <TooltipProvider delayDuration={150}>
        <div className="space-y-8">
          <div className="flex items-start justify-between animate-slide-up">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Role Management</h1>
              <p className="mt-1 text-muted-foreground">
                Decide what each kind of user can do, in plain language.
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
              <div className="flex items-center justify-between gap-3 flex-wrap">
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
                      <CardDescription>Click a role to see what it can do</CardDescription>
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
                              const permCount = getPermIdsForRole(role.id).length;
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
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="font-medium">{role.name}</p>
                                          {role.is_system && (
                                            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                                              System Role
                                            </Badge>
                                          )}
                                        </div>
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
                                    <span className="text-sm text-muted-foreground">
                                      {permCount === 0
                                        ? 'No permissions'
                                        : permCount === 1
                                          ? '1 permission'
                                          : `${permCount} permissions`}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                                    <RowActionsMenu actions={[
                                      { label: 'Edit', icon: Edit, onClick: (e) => openEditDialog(role, e as any) },
                                      {
                                        label: 'Reset to defaults',
                                        icon: Shield,
                                        onClick: () => {
                                          if (confirm(`Reset "${role.name}" to its default permissions? Any custom changes will be lost.`)) {
                                            resetSystemRole.mutate(role.name);
                                          }
                                        },
                                        hidden: !role.is_system,
                                        separator: true,
                                      },
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

                {/* Role summary panel */}
                <div>
                  <Card className="sticky top-6">
                    <CardHeader>
                      <CardTitle className="text-lg">{selectedRole ? selectedRole.name : 'Role Summary'}</CardTitle>
                      <CardDescription>
                        {selectedRole ? (selectedRole.description || 'What users with this role can and cannot do') : 'Select a role to see what it can do'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedRole ? (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={(selectedRole.role_type || 'internal') === 'external' ? 'outline' : 'secondary'}>
                              {ROLE_TYPE_LABELS[(selectedRole.role_type || 'internal') as RoleType]}
                            </Badge>
                            {selectedRole.is_system && <Badge variant="secondary">System Role</Badge>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{userCounts[selectedRole.id] || 0} users assigned</span>
                          </div>

                          <Separator />

                          <div>
                            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                              <CheckCircle className="h-4 w-4 text-emerald-600" /> Can
                            </p>
                            {detailSummary.can.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">Nothing yet</p>
                            ) : (
                              <ul className="space-y-1">
                                {detailSummary.can.map(line => (
                                  <li key={line} className="text-sm flex gap-2">
                                    <span className="text-emerald-600">✓</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>

                          <div>
                            <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                              <XCircle className="h-4 w-4 text-muted-foreground" /> Cannot
                            </p>
                            {detailSummary.cannot.length === 0 ? (
                              <p className="text-xs text-muted-foreground italic">Full access</p>
                            ) : (
                              <ul className="space-y-1">
                                {detailSummary.cannot.slice(0, 8).map(line => (
                                  <li key={line} className="text-sm flex gap-2 text-muted-foreground">
                                    <span>✗</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                                {detailSummary.cannot.length > 8 && (
                                  <li className="text-xs text-muted-foreground italic">
                                    +{detailSummary.cannot.length - 8} more
                                  </li>
                                )}
                              </ul>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                          <p className="text-sm text-muted-foreground">Click on a role to view its capabilities</p>
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
          <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
              <DialogDescription>
                Describe the role, then tick the things people with this role should be able to do.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {/* Top section: name / description / role type */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Role Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="e.g. Licensing Officer" value={formName}
                    onChange={e => setFormName(e.target.value)}
                    disabled={!!editingRole?.is_system} />
                  {editingRole?.is_system && (
                    <p className="text-[11px] text-muted-foreground">System role name cannot be changed.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input placeholder="Short description of this role"
                    value={formDesc} onChange={e => setFormDesc(e.target.value)} />
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
                  <p className="text-[11px] text-muted-foreground">{ROLE_TYPE_HELP[formRoleType]}</p>
                </div>
              </div>
              {formDesc.length > 80 && (
                <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} />
              )}

              {/* Quick templates */}
              {!editingRole && (
                <Alert className="bg-muted/40 border-muted">
                  <Sparkles className="h-4 w-4" />
                  <AlertTitle className="text-sm">Start from a template (optional)</AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Select onValueChange={applyTemplate}>
                        <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Pick a starting point..." /></SelectTrigger>
                        <SelectContent>
                          {QUICK_TEMPLATES.map(t => (
                            <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="text-[11px] text-muted-foreground">
                        You can change anything after applying a template.
                      </span>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              {/* Permissions: capability cards + live summary */}
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Label className="text-base font-semibold">What can this role do?</Label>
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search e.g. 'approve', 'report'"
                        value={permSearch}
                        onChange={e => setPermSearch(e.target.value)}
                        className="pl-7 h-8 w-64"
                      />
                    </div>
                  </div>

                  {(() => {
                    const search = permSearch.trim().toLowerCase();
                    const cards = editGroups.map(g => {
                      const filtered = search
                        ? g.actions.filter(a =>
                            a.label.toLowerCase().includes(search) ||
                            g.moduleLabel.toLowerCase().includes(search))
                        : g.actions;
                      return { g, filtered };
                    }).filter(x => x.filtered.length > 0);

                    if (cards.length === 0) {
                      return (
                        <p className="text-sm text-muted-foreground italic py-8 text-center">
                          {search ? `No capabilities match "${permSearch}"` : 'No capabilities available'}
                        </p>
                      );
                    }
                    return cards.map(({ g, filtered }) => {
                      const allChecked = filtered.every(a => formPerms.includes(a.permission.id));
                      const someChecked = filtered.some(a => formPerms.includes(a.permission.id)) && !allChecked;
                      const selectedCount = filtered.filter(a => formPerms.includes(a.permission.id)).length;
                      const selectAll = () => {
                        const ids = filtered.map(a => a.permission.id);
                        setFormPerms(prev => [...new Set([...prev, ...ids])]);
                      };
                      const clearAll = () => {
                        const ids = new Set(filtered.map(a => a.permission.id));
                        setFormPerms(prev => prev.filter(id => !ids.has(id)));
                      };
                      const summary =
                        selectedCount === 0 ? 'No permissions selected'
                        : selectedCount === filtered.length ? 'All permissions selected'
                        : `${selectedCount} permission${selectedCount === 1 ? '' : 's'} selected`;

                      return (
                        <Card key={g.moduleKey} className="overflow-hidden">
                          <div className="flex items-start gap-3 px-4 py-2.5 bg-muted/40 border-b">
                            <Checkbox
                              className="mt-1"
                              checked={allChecked}
                              ref={el => { if (el) (el as any).indeterminate = someChecked; }}
                              onCheckedChange={() => (allChecked ? clearAll() : selectAll())}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-sm font-semibold">{g.moduleLabel}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-muted-foreground">{summary}</span>
                                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={selectAll}>
                                    Select all
                                  </Button>
                                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={clearAll}>
                                    Clear
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4">
                            {filtered.map(({ permission, label }) => (
                              <div key={permission.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`perm-${permission.id}`}
                                  checked={formPerms.includes(permission.id)}
                                  onCheckedChange={() => togglePerm(permission.id)}
                                />
                                <label
                                  htmlFor={`perm-${permission.id}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {label}
                                </label>
                              </div>
                            ))}
                          </div>
                        </Card>
                      );
                    });
                  })()}

                  {/* Quiet legacy permissions section — only shown if role already has some. */}
                  {editOrphanPerms.some(p => formPerms.includes(p.id)) && (
                    <details className="rounded-md border bg-muted/20 px-3 py-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        Legacy permissions kept on this role ({editOrphanPerms.filter(p => formPerms.includes(p.id)).length})
                      </summary>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                        {editOrphanPerms.filter(p => formPerms.includes(p.id)).map(p => (
                          <div key={p.id} className="flex items-center space-x-2">
                            <Checkbox
                              id={`legacy-${p.id}`}
                              checked={formPerms.includes(p.id)}
                              onCheckedChange={() => togglePerm(p.id)}
                            />
                            <label htmlFor={`legacy-${p.id}`} className="text-xs cursor-pointer text-muted-foreground">
                              {humanizeActionLabel(null, p.name)}
                            </label>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>

                {/* Live role summary */}
                <div>
                  <Card className="sticky top-2">
                    <CardHeader>
                      <CardTitle className="text-base">This role will be able to</CardTitle>
                      <CardDescription>
                        {formPerms.length === 0
                          ? 'No permissions selected yet'
                          : `${formPerms.length} permission${formPerms.length === 1 ? '' : 's'} selected`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                          <CheckCircle className="h-4 w-4 text-emerald-600" /> Can
                        </p>
                        {editSummary.can.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Nothing yet — tick some boxes on the left</p>
                        ) : (
                          <ul className="space-y-1">
                            {editSummary.can.map(line => (
                              <li key={line} className="text-sm flex gap-2">
                                <span className="text-emerald-600">✓</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                          <XCircle className="h-4 w-4 text-muted-foreground" /> Cannot
                        </p>
                        {editSummary.cannot.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">Full access</p>
                        ) : (
                          <ul className="space-y-1">
                            {editSummary.cannot.slice(0, 8).map(line => (
                              <li key={line} className="text-sm flex gap-2 text-muted-foreground">
                                <span>✗</span>
                                <span>{line}</span>
                              </li>
                            ))}
                            {editSummary.cannot.length > 8 && (
                              <li className="text-xs text-muted-foreground italic">
                                +{editSummary.cannot.length - 8} more
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
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
