import {
  LayoutDashboard,
  FileText,
  Shield,
  Users,
  Building2,
  FormInput,
  GitBranch,
  Bell,
  Settings,
  BarChart3,
  ClipboardList,
  AlertTriangle,
  FolderOpen,
  UserCircle,
  KeyRound,
  ScrollText,
  Layers,
  Boxes,
  ListOrdered,
  SlidersHorizontal,
  FileCheck,
  DollarSign,
  CreditCard,
  BookOpen,
  Briefcase,
  CalendarCheck,
} from 'lucide-react';
import { AppRole, INTERNAL_ROLES } from '@/types/platform';

export interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  badge?: number;
  roles: AppRole[];
  children?: NavItem[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

const ALL_ROLES: AppRole[] = ['super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst', 'applicant', 'developer'];
const ALL_INTERNAL: AppRole[] = [...INTERNAL_ROLES];
const ADMIN_ROLES: AppRole[] = ['super_admin', 'admin'];

export const mainNavSections: NavSection[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-5 w-5" />, roles: ALL_ROLES },
    ],
  },
  {
    label: 'Applications',
    items: [
      { label: 'My Applications', href: '/applications', icon: <FileText className="h-5 w-5" />, roles: ['applicant'] },
      { label: 'Applications Queue', href: '/applications/queue', icon: <ClipboardList className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst'] },
    ],
  },
  {
    label: 'Licenses',
    items: [
      { label: 'My Licenses', href: '/licenses', icon: <Shield className="h-5 w-5" />, roles: ['applicant'] },
      { label: 'License Management', href: '/licenses', icon: <Shield className="h-5 w-5" />, roles: ['super_admin', 'admin', 'licensing_officer'] },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'My Returns', href: '/compliance/returns', icon: <CalendarCheck className="h-5 w-5" />, roles: ['applicant'] },
      { label: 'Compliance Returns', href: '/compliance/returns', icon: <CalendarCheck className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'analyst'] },
    ],
  },
  {
    label: 'Payments',
    items: [
      { label: 'Payment History', href: '/payments', icon: <CreditCard className="h-5 w-5" />, roles: ['applicant', ...ADMIN_ROLES] },
    ],
  },
  {
    label: 'Complaints',
    items: [
      { label: 'Complaints', href: '/complaints', icon: <AlertTriangle className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'applicant'] },
    ],
  },
  {
    label: 'Workflows',
    items: [
      { label: 'Approval Workflows', href: '/workflows', icon: <GitBranch className="h-5 w-5" />, roles: ADMIN_ROLES },
      { label: 'Delegation Rules', href: '/delegation-rules', icon: <Layers className="h-5 w-5" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Form Management',
    items: [
      {
        label: 'Form Builder', icon: <FormInput className="h-5 w-5" />, roles: ['super_admin', 'admin', 'developer'],
        children: [
          { label: 'Pre-License Forms', href: '/admin/forms/pre-license', icon: <FileText className="h-4 w-4" />, roles: ['super_admin', 'admin', 'developer'] },
          { label: 'Post-License Forms', href: '/admin/forms/post-license', icon: <FileCheck className="h-4 w-4" />, roles: ['super_admin', 'admin', 'developer'] },
        ],
      },
    ],
  },
  {
    label: 'Configuration',
    items: [
      {
        label: 'Master Configuration', icon: <Building2 className="h-5 w-5" />, roles: ADMIN_ROLES,
        children: [
          { label: 'Sectors', href: '/admin/masters/sectors', icon: <Layers className="h-4 w-4" />, roles: ADMIN_ROLES },
          { label: 'Sub-Sectors', href: '/admin/masters/sub-sectors', icon: <Boxes className="h-4 w-4" />, roles: ADMIN_ROLES },
          { label: 'Categories', href: '/admin/masters/categories', icon: <ListOrdered className="h-4 w-4" />, roles: ADMIN_ROLES },
          { label: 'Services', href: '/admin/masters/services', icon: <SlidersHorizontal className="h-4 w-4" />, roles: ADMIN_ROLES },
        ],
      },
      { label: 'Fee Management', href: '/admin/fees', icon: <DollarSign className="h-5 w-5" />, roles: ADMIN_ROLES },
      { label: 'Return Configuration', href: '/admin/return-config', icon: <CalendarCheck className="h-5 w-5" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Regulators', href: '/admin/regulators', icon: <Building2 className="h-5 w-5" />, roles: ADMIN_ROLES },
      { label: 'User Management', href: '/admin/users', icon: <Users className="h-5 w-5" />, roles: ADMIN_ROLES },
      { label: 'Role Management', href: '/admin/roles', icon: <Shield className="h-5 w-5" />, roles: ['super_admin'] },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: <ScrollText className="h-5 w-5" />, roles: ADMIN_ROLES },
      { label: 'Settings', href: '/settings', icon: <Settings className="h-5 w-5" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { label: 'Dashboards', href: '/analytics', icon: <BarChart3 className="h-5 w-5" />, roles: ALL_INTERNAL },
    ],
  },
  {
    label: 'Documents',
    items: [
      { label: 'Document Store', href: '/documents', icon: <FolderOpen className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'licensing_officer', 'applicant'] },
    ],
  },
];

export const bottomNavItems: NavItem[] = [
  { label: 'Notifications', href: '/notifications', icon: <Bell className="h-5 w-5" />, roles: ALL_ROLES },
  { label: 'Profile', href: '/profile', icon: <UserCircle className="h-5 w-5" />, roles: ALL_ROLES },
  { label: 'Change Password', href: '/change-password', icon: <KeyRound className="h-5 w-5" />, roles: ALL_ROLES },
];
