import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  FileText,
  FileCheck,
  ClipboardList,
  Settings,
  Users,
  Building2,
  Layers,
  FormInput,
  GitBranch,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: number;
  roles: string[];
}

const navItems: NavItem[] = [
  // Public user items
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: ['public', 'admin', 'reviewer', 'approver', 'supervisor'] },
  { label: 'Pre-License Applications', href: '/pre-license', icon: <FileText className="h-5 w-5" />, roles: ['public'] },
  { label: 'Post-License Services', href: '/post-license', icon: <FileCheck className="h-5 w-5" />, roles: ['public'] },
  { label: 'Returns', href: '/returns', icon: <ClipboardList className="h-5 w-5" />, badge: 3, roles: ['public'] },
  
  // AFSC Admin items
  { label: 'Applications Queue', href: '/admin/applications', icon: <FileText className="h-5 w-5" />, badge: 12, roles: ['admin', 'reviewer', 'approver', 'supervisor'] },
  { label: 'Returns Queue', href: '/admin/returns', icon: <ClipboardList className="h-5 w-5" />, badge: 8, roles: ['admin', 'reviewer', 'approver', 'supervisor'] },
  { label: 'Role Management', href: '/admin/roles', icon: <Shield className="h-5 w-5" />, roles: ['admin', 'supervisor'] },
  { label: 'User Management', href: '/admin/users', icon: <Users className="h-5 w-5" />, roles: ['admin', 'supervisor'] },
  { label: 'Master Configuration', href: '/admin/masters', icon: <Building2 className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Form Builder', href: '/admin/forms', icon: <FormInput className="h-5 w-5" />, roles: ['admin'] },
  { label: 'Workflow Config', href: '/admin/workflows', icon: <GitBranch className="h-5 w-5" />, roles: ['admin'] },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  const filteredItems = navItems.filter(item => 
    user && item.roles.includes(user.role)
  );

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin': return 'admin';
      case 'reviewer': return 'reviewer';
      case 'approver': return 'approver';
      case 'supervisor': return 'supervisor';
      default: return 'public';
    }
  };

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-sidebar transition-all duration-300 flex flex-col',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
              <Layers className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-sidebar-foreground">ARIAS</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* User info */}
      {!collapsed && user && (
        <div className="border-b border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground font-medium">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user.name}</p>
              <Badge variant={getRoleBadgeVariant(user.role)} className="mt-1 capitalize">
                {user.role}
              </Badge>
            </div>
          </div>
          {user.licenseNumber && (
            <div className="mt-3 rounded-md bg-sidebar-accent/50 px-3 py-2">
              <p className="text-xs text-sidebar-foreground/70">License #</p>
              <p className="text-sm font-medium text-sidebar-primary">{user.licenseNumber}</p>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'nav-item',
                isActive && 'nav-item-active'
              )}
              title={collapsed ? item.label : undefined}
            >
              {item.icon}
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-sidebar-primary px-1.5 text-xs font-medium text-sidebar-primary-foreground">
                      {item.badge}
                    </span>
                  )}
                </>
              )}
              {collapsed && item.badge && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-primary px-1 text-xs font-medium text-sidebar-primary-foreground">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-sidebar-border p-3 space-y-1">
        <Link to="/notifications" className="nav-item">
          <Bell className="h-5 w-5" />
          {!collapsed && <span className="flex-1">Notifications</span>}
        </Link>
        <Link to="/settings" className="nav-item">
          <Settings className="h-5 w-5" />
          {!collapsed && <span className="flex-1">Settings</span>}
        </Link>
        <button onClick={logout} className="nav-item w-full text-left">
          <LogOut className="h-5 w-5" />
          {!collapsed && <span className="flex-1">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
