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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Shield, Plus, Edit, Trash2, Users, Search, CheckCircle, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useRoles, usePermissions, useAllRolePermissions, useRoleUserCounts,
  useCreateRole, useUpdateRole, useDeleteRole, DynamicRole, Permission,
} from '@/hooks/useRoles';


const MODULE_LABELS: Record<string, string> = {
  application_management: 'Application Management',
  license_management: 'License Management',
  returns_management: 'Returns Management',
  complaint_management: 'Complaint Handling',
  user_management: 'User Management',
  role_management: 'Role Management',
  report_management: 'Reports',
  fee_management: 'Fee Management',
  form_management: 'Form Management',
  workflow_management: 'Workflow Management',
  settings: 'System Settings',
};

const PERM_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  approve: 'Approve',
  reject: 'Reject',
};

export default function RoleManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<DynamicRole | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<DynamicRole | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formSystemRole, setFormSystemRole] = useState('analyst');
  const [formPerms, setFormPerms] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<DynamicRole | null>(null);

  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const { data: permissions = [] } = usePermissions();
  const { data: allRolePerms = [] } = useAllRolePermissions();
  const { data: userCounts = {} } = useRoleUserCounts();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const groupedPermissions = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    permissions.forEach(p => {
      if (!groups[p.module]) groups[p.module] = [];
      groups[p.module].push(p);
    });
    return groups;
  }, [permissions]);

  const getPermIdsForRole = (roleId: string) =>
    allRolePerms.filter(rp => rp.role_id === roleId).map(rp => rp.permission_id);

  const filteredRoles = roles.filter(r =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormName('');
    setFormDesc('');
    setFormSystemRole('analyst');
    setFormPerms([]);
    setDialogOpen(true);
  };

  const openEditDialog = (role: DynamicRole, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    setFormName(role.name);
    setFormDesc(role.description || '');
    setFormSystemRole(role.system_role);
    setFormPerms(getPermIdsForRole(role.id));
    setDialogOpen(true);
  };

  const togglePerm = (permId: string) => {
    setFormPerms(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  const toggleModule = (module: string) => {
    const modulePerms = groupedPermissions[module] || [];
    const modulePermIds = modulePerms.map(p => p.id);
    const allSelected = modulePermIds.every(id => formPerms.includes(id));

    if (allSelected) {
      setFormPerms(prev => prev.filter(id => !modulePermIds.includes(id)));
    } else {
      setFormPerms(prev => [...new Set([...prev, ...modulePermIds])]);
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error('Role name is required');
      return;
    }

    if (editingRole) {
      await updateRole.mutateAsync({
        id: editingRole.id,
        name: formName,
        description: formDesc,
        system_role: formSystemRole,
        permissionIds: formPerms,
      });
    } else {
      await createRole.mutateAsync({
        name: formName,
        description: formDesc,
        system_role: formSystemRole,
        permissionIds: formPerms,
      });
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

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between animate-slide-up">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Role Management</h1>
            <p className="mt-1 text-muted-foreground">
              Create and manage roles with granular permissions for system access control.
            </p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />Create Role
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md animate-slide-up delay-100">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search roles..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
        </div>

        {/* Grid */}
        <div className="grid lg:grid-cols-3 gap-6 animate-slide-up delay-200">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Roles</CardTitle>
                <CardDescription>Click a role to view its permissions</CardDescription>
              </CardHeader>
              <CardContent>
                {rolesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Loading roles...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Role</TableHead>
                        <TableHead>System Mapping</TableHead>
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
                            <Badge variant="secondary" className="capitalize text-xs">
                              {role.system_role.replace(/_/g, ' ')}
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
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={e => openEditDialog(role, e)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              {!role.is_system && (
                                <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); setDeleteConfirm(role); }}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredRoles.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No roles found</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Details */}
          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg">{selectedRole ? selectedRole.name : 'Role Details'}</CardTitle>
                <CardDescription>{selectedRole ? selectedRole.description : 'Select a role to view permissions'}</CardDescription>
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
                      <p className="text-sm font-medium text-muted-foreground">Permissions</p>
                      {Object.entries(groupedPermissions).map(([module, perms]) => {
                        const modulePerms = perms.filter(p => selectedRolePerms.includes(p.id));
                        if (modulePerms.length === 0) return null;
                        return (
                          <div key={module}>
                            <p className="text-xs font-medium text-muted-foreground mb-2">{MODULE_LABELS[module] || module}</p>
                            <div className="space-y-1">
                              {modulePerms.map(perm => (
                                <div key={perm.id} className="flex items-center gap-2 text-sm">
                                  <CheckCircle className="h-4 w-4 text-primary" />
                                  <span className="capitalize">{PERM_LABELS[perm.name] || perm.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {selectedRolePerms.length === 0 && (
                        <p className="text-sm text-muted-foreground">No permissions assigned</p>
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
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
            <DialogDescription>
              {editingRole ? 'Update role details and permissions.' : 'Define a new role with specific permissions.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Role Name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Senior Officer" value={formName} onChange={e => setFormName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Access Level Mapping <span className="text-destructive">*</span></Label>
                <Select value={formSystemRole} onValueChange={setFormSystemRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SYSTEM_ROLES.map(r => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Maps to system-level access for data security enforcement.</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Describe this role's purpose" value={formDesc} onChange={e => setFormDesc(e.target.value)} />
            </div>

            <Separator />

            <div className="space-y-4">
              <Label className="text-base font-semibold">Permissions</Label>
              {Object.entries(groupedPermissions).map(([module, perms]) => {
                const modulePermIds = perms.map(p => p.id);
                const allChecked = modulePermIds.every(id => formPerms.includes(id));
                const someChecked = modulePermIds.some(id => formPerms.includes(id));

                return (
                  <Card key={module} className="overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 border-b">
                      <Checkbox
                        checked={allChecked}
                        ref={el => {
                          if (el) (el as any).indeterminate = someChecked && !allChecked;
                        }}
                        onCheckedChange={() => toggleModule(module)}
                      />
                      <span className="text-sm font-semibold">{MODULE_LABELS[module] || module}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {modulePermIds.filter(id => formPerms.includes(id)).length}/{modulePermIds.length}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 p-4">
                      {perms.map(perm => (
                        <div key={perm.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`perm-${perm.id}`}
                            checked={formPerms.includes(perm.id)}
                            onCheckedChange={() => togglePerm(perm.id)}
                          />
                          <label htmlFor={`perm-${perm.id}`} className="text-sm capitalize cursor-pointer">
                            {PERM_LABELS[perm.name] || perm.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
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
    </DashboardLayout>
  );
}
