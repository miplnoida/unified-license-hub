import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import {
  LayoutGrid, Users, Shield, Mail, ScrollText, Settings as SettingsIcon,
  UserCircle, Database, GitBranch, FileBarChart,
} from 'lucide-react';

/**
 * Landing dashboard for internal users whose dynamic role only grants
 * administrative modules (Admin Dashboard, User Management, Role Management,
 * Settings, etc.) and NOT the supervisory surfaces (applications, returns,
 * complaints…). Without this, the standard SupervisoryDashboard shows an
 * "All clear — no supervisory issues" empty state that is misleading for a
 * pure administrator who cannot see supervisory data anyway.
 *
 * Each tile is gated on the exact permission that guards its route, so a
 * user only sees the tiles they can actually open.
 */
type Tile = {
  href: string;
  label: string;
  description: string;
  module: string;
  action?: string;
  icon: React.ReactNode;
};

const TILES: Tile[] = [
  { href: '/admin', label: 'Admin Control Panel', description: 'Central hub for administrative modules.', module: 'admin_dashboard', icon: <LayoutGrid className="h-5 w-5" /> },
  { href: '/admin/users', label: 'Employee Management', description: 'Create, edit and deactivate internal staff.', module: 'user_management', icon: <Users className="h-5 w-5" /> },
  { href: '/admin/roles', label: 'Role Management', description: 'Configure roles and permission templates.', module: 'role_management', icon: <Shield className="h-5 w-5" /> },
  { href: '/admin/permission-coverage', label: 'Permission Coverage', description: 'Diagnostic matrix of enforcement coverage.', module: 'role_management', action: 'view_coverage', icon: <FileBarChart className="h-5 w-5" /> },
  { href: '/admin/ppoc-mappings', label: 'PPOC Mappings', description: 'Manage delegated authorised consultants.', module: 'license_management', icon: <UserCircle className="h-5 w-5" /> },
  { href: '/admin/notification-templates', label: 'Notification Templates', description: 'Configure system email and SMS templates.', module: 'settings', icon: <Mail className="h-5 w-5" /> },
  { href: '/admin/audit-logs', label: 'Activity Logs', description: 'Review actor-level activity across the platform.', module: 'settings', icon: <ScrollText className="h-5 w-5" /> },
  { href: '/admin/master-data', label: 'Master Data', description: 'Maintain shared reference data.', module: 'settings', icon: <Database className="h-5 w-5" /> },
  { href: '/workflows', label: 'Approval Workflows', description: 'Design and version approval chains.', module: 'workflow_management', icon: <GitBranch className="h-5 w-5" /> },
  { href: '/settings', label: 'Settings', description: 'Global platform configuration.', module: 'settings', icon: <SettingsIcon className="h-5 w-5" /> },
];

export function AdminOnlyDashboard() {
  const { hasPermission, hasModuleAccess } = useUserDynamicPermissions();
  const visible = TILES.filter((t) =>
    t.action ? hasPermission(t.module, t.action) : hasModuleAccess(t.module),
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Administration</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Your role grants administrative access. Supervisory data (applications,
          returns, complaints) is not part of your access profile, so it is not
          shown here. Use the tiles below to reach the modules you can manage.
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((tile) => (
          <Link
            key={tile.href}
            to={tile.href}
            className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent/40"
          >
            <div className="flex items-center gap-2 text-primary">
              {tile.icon}
              <span className="font-semibold">{tile.label}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tile.description}</p>
          </Link>
        ))}
        {visible.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3">
            <CardContent className="py-6 text-sm text-muted-foreground">
              No administrative modules are available to your role. Contact a
              Super Administrator if you believe this is a mistake.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
