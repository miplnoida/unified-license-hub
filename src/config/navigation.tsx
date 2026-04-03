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
  DollarSign,
  CreditCard,
  BookOpen,
  Briefcase,
  CalendarCheck,
  LayoutGrid,
  Mail,
} from 'lucide-react';
import { AppRole, INTERNAL_ROLES, LICENSEE_ROLES } from '@/types/platform';

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
      { label: 'Admin Control Panel', href: '/admin', icon: <LayoutGrid className="h-5 w-5" />, roles: ADMIN_ROLES },
      
      { label: 'Licensee Entities', href: '/admin/licensees', icon: <Briefcase className="h-5 w-5" />, roles: ADMIN_ROLES },
      { label: 'Employee Management', href: '/admin/users', icon: <Users className="h-5 w-5" />, roles: ADMIN_ROLES },
      
      { label: 'Role Management', href: '/admin/roles', icon: <Shield className="h-5 w-5" />, roles: ['super_admin'] },
      { label: 'Notification Templates', href: '/admin/notification-templates', icon: <Mail className="h-5 w-5" />, roles: ADMIN_ROLES },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: <ScrollText className="h-5 w-5" />, roles: ADMIN_ROLES },
      { label: 'Settings', href: '/settings', icon: <Settings className="h-5 w-5" />, roles: ADMIN_ROLES },
    ],
  },
  {
    label: 'Licenses',
    items: [
      { label: 'My Licenses', href: '/licenses', icon: <Shield className="h-5 w-5" />, roles: LICENSEE_ALL },
    ],
  },
  {
    label: 'License Requests',
    items: [
      { label: 'My Applications', href: '/applications', icon: <FileText className="h-5 w-5" />, roles: [...PRE_LICENSEE, ...LICENSEE_ALL, 'applicant'] },
      { label: 'All License Requests', href: '/applications/queue', icon: <ClipboardList className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst'] },
      
    ],
  },
  {
    label: 'Returns Management',
    items: [
      { label: 'My Returns', href: '/compliance/returns', icon: <CalendarCheck className="h-5 w-5" />, roles: LICENSEE_ALL },
      { label: 'Submitted Returns', href: '/returns-management', icon: <CalendarCheck className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'analyst'] },
    ],
  },
  {
    label: 'Payments',
    items: [
      { label: 'Payment History', href: '/payments', icon: <CreditCard className="h-5 w-5" />, roles: ['licensee_primary', ...ADMIN_ROLES] },
    ],
  },
  {
    label: 'Complaints',
    items: [
      { label: 'Complaints', href: '/complaints', icon: <AlertTriangle className="h-5 w-5" />, roles: ['super_admin', 'admin', 'supervisor', 'licensee_primary'] },
      { label: 'Complaint Types', href: '/admin/complaint-types', icon: <Layers className="h-5 w-5" />, roles: ADMIN_ROLES },
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
      { label: 'Form Management', href: '/admin/forms', icon: <FormInput className="h-5 w-5" />, roles: ['super_admin', 'admin', 'developer'] },
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
    label: 'Analytics & Reports',
    items: [
      { label: 'Analytics', href: '/analytics', icon: <BarChart3 className="h-5 w-5" />, roles: ALL_INTERNAL },
      { label: 'Reports', href: '/reports', icon: <BookOpen className="h-5 w-5" />, roles: ALL_INTERNAL },
    ],
  },
];

export const bottomNavItems: NavItem[] = [];
