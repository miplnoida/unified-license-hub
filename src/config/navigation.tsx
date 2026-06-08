import {
  LayoutDashboard, FileText, Shield, Users, Building2, FormInput, GitBranch,
  Bell, Settings, BarChart3, ClipboardList, AlertTriangle, FolderOpen,
  UserCircle, KeyRound, ScrollText, Layers, Boxes, ListOrdered,
  SlidersHorizontal, DollarSign, CreditCard, BookOpen, Briefcase,
  CalendarCheck, LayoutGrid, Mail, CalendarDays, Clock, Timer, FileBarChart,
  ClipboardEdit, Database,
} from 'lucide-react';
import { AppRole, INTERNAL_ROLES, LICENSEE_ROLES } from '@/types/platform';
import type { PermissionModule } from '@/lib/permissionModules';

export interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  badge?: number;
  roles: AppRole[];
  /** If set, item is also gated by the dynamic role having access to this module */
  module?: PermissionModule;
  children?: NavItem[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

const ALL_ROLES: AppRole[] = [
  'super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst',
  'applicant', 'developer', 'pre_licensee', 'licensee_primary', 'licensee_secondary',
];
const ALL_INTERNAL: AppRole[] = [...INTERNAL_ROLES];
const ADMIN_ROLES: AppRole[] = ['super_admin', 'admin'];
const LICENSEE_ALL: AppRole[] = [...LICENSEE_ROLES];
const PRE_LICENSEE: AppRole[] = ['pre_licensee'];

export const mainNavSections: NavSection[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: ALL_ROLES },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Admin Control Panel', href: '/admin', icon: <LayoutGrid className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
      { label: 'Employee Management', href: '/admin/users', icon: <Users className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'user_management' },
      { label: 'Role Management', href: '/admin/roles', icon: <Shield className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'role_management' },
      { label: 'PPOC Mappings', href: '/admin/ppoc-mappings', icon: <UserCircle className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'license_management' },
      { label: 'Notification Templates', href: '/admin/notification-templates', icon: <Mail className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: <ScrollText className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
      { label: 'Settings', href: '/settings', icon: <Settings className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
    ],
  },
  {
    label: 'Licenses',
    items: [
      { label: 'My Licenses', href: '/licenses', icon: <Shield className="h-5 w-5" />, roles: LICENSEE_ALL },
      { label: 'Active Sector', href: '/change-sector', icon: <Layers className="h-5 w-5" />, roles: LICENSEE_ALL },
    ],
  },
  {
    label: 'License Requests',
    items: [
      { label: 'Pre Licensing Applications', href: '/applications?type=pre', icon: <FileText className="h-5 w-5" />, roles: [...PRE_LICENSEE, ...LICENSEE_ALL, 'applicant'] },
      { label: 'Post Licensing Applications', href: '/applications?type=post', icon: <FileText className="h-5 w-5" />, roles: LICENSEE_ALL },
      { label: 'All License Requests', href: '/applications/queue', icon: <ClipboardList className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst'], module: 'application_management' },
      { label: 'Licensee Entities', href: '/admin/licensees', icon: <Briefcase className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'license_management' },
    ],
  },
  {
    label: 'Returns Management',
    items: [
      {
        label: 'Returns Admin', icon: <CalendarCheck className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'returns_management',
        children: [
          { label: 'Return Types', href: '/admin/returns/types', icon: <Layers className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Configurations', href: '/admin/returns/configurations', icon: <Settings className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Cutoff Config', href: '/admin/returns/cutoff', icon: <Timer className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Due Dates', href: '/admin/returns/due-dates', icon: <CalendarDays className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Late Fees', href: '/admin/returns/late-fees', icon: <DollarSign className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Schedule Calendar', href: '/admin/returns/schedule', icon: <CalendarDays className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Notif Templates', href: '/admin/returns/notifications/templates', icon: <Mail className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
          { label: 'Notif Log', href: '/admin/returns/notifications/log', icon: <FileBarChart className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'returns_management' },
        ],
      },
      { label: 'Returns Queue', href: '/admin/returns/queue', icon: <ClipboardList className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'analyst'], module: 'returns_management' },
      { label: 'Returns Dashboard', href: '/entity/returns/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: LICENSEE_ALL },
      { label: 'My Returns', href: '/entity/returns', icon: <CalendarCheck className="h-5 w-5" />, roles: LICENSEE_ALL },
    ],
  },
  {
    label: 'Payments',
    items: [
      { label: 'Payment History', href: '/payments', icon: <CreditCard className="h-5 w-5" />, roles: ['licensee_primary', 'licensee_secondary', 'pre_licensee', 'applicant', ...ADMIN_ROLES] },
    ],
  },
  {
    label: 'Complaints',
    items: [
      { label: 'Complaints', href: '/complaints', icon: <AlertTriangle className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'licensee_primary'], module: 'complaint_management' },
      { label: 'Complaint Types', href: '/admin/complaint-types', icon: <Layers className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'complaint_management' },
    ],
  },
  {
    label: 'Workflows',
    items: [
      { label: 'Approval Workflows', href: '/workflows', icon: <GitBranch className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'workflow_management' },
      { label: 'Delegation Rules', href: '/delegation-rules', icon: <Layers className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'workflow_management' },
    ],
  },
  {
    label: 'Form Management',
    items: [
      { label: 'Form Management', href: '/admin/forms', icon: <FormInput className="h-5 w-5" />, roles: ['super_admin', 'admin', 'developer'], module: 'form_management' },
      { label: 'Registration Forms', href: '/admin/registration-forms', icon: <ClipboardEdit className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'form_management' },
    ],
  },
  {
    label: 'Configuration',
    items: [
      {
        label: 'Master Configuration', icon: <Building2 className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings',
        children: [
          { label: 'Sectors', href: '/admin/masters/sectors', icon: <Layers className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'settings' },
          { label: 'Sub-Sectors', href: '/admin/masters/sub-sectors', icon: <Boxes className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'settings' },
          { label: 'Categories', href: '/admin/masters/categories', icon: <ListOrdered className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'settings' },
          { label: 'Services', href: '/admin/masters/services', icon: <SlidersHorizontal className="h-4 w-4" />, roles: ADMIN_ROLES, module: 'settings' },
        ],
      },
      { label: 'Master Data', href: '/admin/master-data', icon: <Database className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'settings' },
      { label: 'Fee Management', href: '/admin/fees', icon: <DollarSign className="h-5 w-5" />, roles: ADMIN_ROLES, module: 'fee_management' },
    ],
  },
  {
    label: 'Analytics & Reports',
    items: [
      { label: 'Analytics', href: '/analytics', icon: <BarChart3 className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'report_management' },
      { label: 'Reports', href: '/reports', icon: <BookOpen className="h-5 w-5" />, roles: ALL_INTERNAL, module: 'report_management' },
    ],
  },
];

export const bottomNavItems: NavItem[] = [];
