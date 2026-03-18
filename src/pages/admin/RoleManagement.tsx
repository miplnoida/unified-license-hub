import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Users,
  Search,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
}

interface Role {
  id: string;
  name: string;
  description: string;
  userCount: number;
  permissions: string[];
  isSystem: boolean;
}

const allPermissions: Permission[] = [
  { id: 'app_view', name: 'View Applications', description: 'View all applications', module: 'Applications' },
  { id: 'app_review', name: 'Review Applications', description: 'Review and add comments', module: 'Applications' },
  { id: 'app_approve', name: 'Approve Applications', description: 'Approve or reject applications', module: 'Applications' },
  { id: 'app_return', name: 'Return Applications', description: 'Return applications for revision', module: 'Applications' },
  { id: 'ret_view', name: 'View Returns', description: 'View all returns', module: 'Returns' },
  { id: 'ret_review', name: 'Review Returns', description: 'Review submitted returns', module: 'Returns' },
  { id: 'ret_approve', name: 'Approve Returns', description: 'Approve or reject returns', module: 'Returns' },
  { id: 'user_manage', name: 'Manage Users', description: 'Create and manage users', module: 'Users' },
  { id: 'role_manage', name: 'Manage Roles', description: 'Create and manage roles', module: 'Roles' },
  { id: 'master_config', name: 'Master Configuration', description: 'Configure sectors, categories', module: 'Configuration' },
  { id: 'form_builder', name: 'Form Builder', description: 'Create and edit forms', module: 'Configuration' },
  { id: 'workflow_config', name: 'Workflow Configuration', description: 'Configure workflows', module: 'Configuration' },
];

const initialRoles: Role[] = [
  {
    id: '1',
    name: 'Administrator',
    description: 'Full system access with all permissions',
    userCount: 5,
    permissions: allPermissions.map(p => p.id),
    isSystem: true,
  },
  {
    id: '2',
    name: 'Reviewer',
    description: 'Can review applications and returns',
    userCount: 12,
    permissions: ['app_view', 'app_review', 'ret_view', 'ret_review'],
    isSystem: true,
  },
  {
    id: '3',
    name: 'Approver',
    description: 'Can approve applications and returns',
    userCount: 8,
    permissions: ['app_view', 'app_review', 'app_approve', 'ret_view', 'ret_review', 'ret_approve'],
    isSystem: true,
  },
  {
    id: '4',
    name: 'Supervisor',
    description: 'Supervisory access with user management',
    userCount: 3,
    permissions: ['app_view', 'app_review', 'app_approve', 'app_return', 'ret_view', 'ret_review', 'ret_approve', 'user_manage'],
    isSystem: false,
  },
];

const groupedPermissions = allPermissions.reduce((acc, perm) => {
  if (!acc[perm.module]) acc[perm.module] = [];
  acc[perm.module].push(perm);
  return acc;
}, {} as Record<string, Permission[]>);

export default function RoleManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [roles, setRoles] = useState<Role[]>(initialRoles);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPerms, setFormPerms] = useState<string[]>([]);

  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    role.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCreateDialog = () => {
    setEditingRole(null);
    setFormName('');
    setFormDesc('');
    setFormPerms([]);
    setDialogOpen(true);
  };

  const openEditDialog = (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    setFormName(role.name);
    setFormDesc(role.description);
    setFormPerms([...role.permissions]);
    setDialogOpen(true);
  };

  const togglePerm = (permId: string) => {
    setFormPerms(prev =>
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  const handleSave = () => {
    if (!formName.trim()) {
      toast.error('Role name is required');
      return;
    }

    if (editingRole) {
      setRoles(prev =>
        prev.map(r =>
          r.id === editingRole.id
            ? { ...r, name: formName, description: formDesc, permissions: formPerms }
            : r
        )
      );
      // Update selectedRole if it was the one edited
      if (selectedRole?.id === editingRole.id) {
        setSelectedRole({ ...editingRole, name: formName, description: formDesc, permissions: formPerms });
      }
      toast.success('Role updated successfully');
    } else {
      const newRole: Role = {
        id: crypto.randomUUID(),
        name: formName,
        description: formDesc,
        userCount: 0,
        permissions: formPerms,
        isSystem: false,
      };
      setRoles(prev => [...prev, newRole]);
      toast.success('Role created successfully');
    }
    setDialogOpen(false);
  };

  const handleDelete = (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    if (role.isSystem) return;
    setRoles(prev => prev.filter(r => r.id !== role.id));
    if (selectedRole?.id === role.id) setSelectedRole(null);
    toast.success('Role deleted');
  };

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
            <Plus className="h-4 w-4 mr-2" />
            Create Role
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md animate-slide-up delay-100">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Roles Grid */}
        <div className="grid lg:grid-cols-3 gap-6 animate-slide-up delay-200">
          {/* Roles List */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Roles</CardTitle>
                <CardDescription>Click on a role to view its permissions</CardDescription>
              </CardHeader>
              <CardContent>
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
                    {filteredRoles.map((role) => (
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
                            <span>{role.userCount}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{role.permissions.length} permissions</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={(e) => openEditDialog(role, e)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!role.isSystem && (
                              <Button variant="ghost" size="icon" onClick={(e) => handleDelete(role, e)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Role Details */}
          <div>
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="text-lg">
                  {selectedRole ? selectedRole.name : 'Role Details'}
                </CardTitle>
                <CardDescription>
                  {selectedRole ? selectedRole.description : 'Select a role to view its permissions'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedRole ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{selectedRole.userCount} users assigned</span>
                    </div>
                    {selectedRole.isSystem && (
                      <Badge variant="secondary">System Role</Badge>
                    )}
                    <div className="space-y-3 pt-4 border-t">
                      <p className="text-sm font-medium text-muted-foreground">Permissions</p>
                      {Object.entries(groupedPermissions).map(([module, perms]) => {
                        const modulePerms = perms.filter(p => selectedRole.permissions.includes(p.id));
                        if (modulePerms.length === 0) return null;
                        return (
                          <div key={module}>
                            <p className="text-xs font-medium text-muted-foreground mb-2">{module}</p>
                            <div className="space-y-1">
                              {modulePerms.map((perm) => (
                                <div key={perm.id} className="flex items-center gap-2 text-sm">
                                  <CheckCircle className="h-4 w-4 text-success" />
                                  <span>{perm.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      Click on a role to view its permissions
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create New Role'}</DialogTitle>
            <DialogDescription>
              {editingRole
                ? 'Update the role name, description and permissions.'
                : 'Define a new role with specific permissions for system access.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">Role Name</Label>
              <Input
                id="role-name"
                placeholder="Enter role name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role-desc">Description</Label>
              <Textarea
                id="role-desc"
                placeholder="Describe this role's purpose"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>
            <div className="space-y-4">
              <Label>Permissions</Label>
              {Object.entries(groupedPermissions).map(([module, perms]) => (
                <div key={module} className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">{module}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {perms.map((perm) => (
                      <div key={perm.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dialog-${perm.id}`}
                          checked={formPerms.includes(perm.id)}
                          onCheckedChange={() => togglePerm(perm.id)}
                        />
                        <label
                          htmlFor={`dialog-${perm.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {perm.name}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingRole ? 'Save Changes' : 'Create Role'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
