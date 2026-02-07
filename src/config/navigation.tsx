import {
  LayoutDashboard,
  FileText,
  FileCheck,
  ClipboardList,
  Settings,
  Users,
  Building2,
  FormInput,
  GitBranch,
  Bell,
  Shield,
  CreditCard,
  BarChart3,
  Calendar,
  DollarSign,
  Upload,
  UserCircle,
  MessageSquare,
  Mail,
  ListOrdered,
  FileBarChart,
  Landmark,
  HandCoins,
  Layers,
  Boxes,
  BookOpen,
  SlidersHorizontal,
  CheckSquare,
  Eye,
  BadgeDollarSign,
  Receipt,
} from 'lucide-react';
import { UserRole } from '@/types';

export interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  badge?: number;
  roles: UserRole[];
  children?: NavItem[];
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

export const mainNavSections: NavSection[] = [
  {
    label: 'Main',
    items: [
      {
        label: 'Dashboard',
        href: '/dashboard',
        icon: <LayoutDashboard className="h-5 w-5" />,
        roles: ['public', 'admin', 'reviewer', 'approver', 'supervisor'],
      },
    ],
  },
  {
    label: 'Licensing',
    items: [
      {
        label: 'Pre-License Applications',
        href: '/pre-license',
        icon: <FileText className="h-5 w-5" />,
        roles: ['public'],
      },
      {
        label: 'Post-License Services',
        href: '/post-license',
        icon: <FileCheck className="h-5 w-5" />,
        roles: ['public'],
      },
      {
        label: 'Returns',
        href: '/returns',
        icon: <ClipboardList className="h-5 w-5" />,
        badge: 3,
        roles: ['public'],
      },
    ],
  },
  {
    label: 'Processing',
    items: [
      {
        label: 'Applications Queue',
        href: '/admin/applications',
        icon: <FileText className="h-5 w-5" />,
        badge: 12,
        roles: ['admin', 'reviewer', 'approver', 'supervisor'],
      },
      {
        label: 'Returns Queue',
        href: '/admin/returns',
        icon: <ClipboardList className="h-5 w-5" />,
        badge: 8,
        roles: ['admin', 'reviewer', 'approver', 'supervisor'],
      },
    ],
  },
  {
    label: 'Billing',
    items: [
      {
        label: 'Billing',
        icon: <CreditCard className="h-5 w-5" />,
        roles: ['admin', 'supervisor', 'approver'],
        children: [
          {
            label: 'Pre-Licensee Applications',
            href: '/billing/pre-licensee',
            icon: <FileText className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'approver'],
          },
          {
            label: 'Post-Licensee Applications',
            href: '/billing/post-licensee',
            icon: <FileCheck className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'approver'],
          },
          {
            label: 'Penalties',
            href: '/billing/penalties',
            icon: <BadgeDollarSign className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'approver'],
          },
        ],
      },
      {
        label: 'Payment List',
        href: '/payments',
        icon: <DollarSign className="h-5 w-5" />,
        roles: ['admin', 'supervisor', 'approver'],
      },
    ],
  },
  {
    label: 'Returns Management',
    items: [
      {
        label: 'Returns Management',
        icon: <Boxes className="h-5 w-5" />,
        roles: ['admin', 'supervisor'],
        children: [
          {
            label: 'Manage Structures',
            href: '/returns-mgmt/structures',
            icon: <Layers className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'Manage Rules',
            href: '/returns-mgmt/rules',
            icon: <BookOpen className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'Manage Validations',
            href: '/returns-mgmt/validations',
            icon: <CheckSquare className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'Return Groups',
            href: '/returns-mgmt/groups',
            icon: <ListOrdered className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'Manage Scheduling',
            href: '/returns-mgmt/scheduling',
            icon: <Calendar className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'View Returns',
            href: '/returns-mgmt/view',
            icon: <Eye className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
        ],
      },
      {
        label: 'Upload Returns',
        href: '/upload-returns',
        icon: <Upload className="h-5 w-5" />,
        roles: ['public', 'admin', 'supervisor'],
      },
    ],
  },
  {
    label: 'Reports',
    items: [
      {
        label: 'Reports',
        icon: <BarChart3 className="h-5 w-5" />,
        roles: ['admin', 'supervisor', 'reviewer', 'approver'],
        children: [
          {
            label: 'Consolidated Reports',
            href: '/reports/consolidated',
            icon: <FileBarChart className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'reviewer', 'approver'],
          },
          {
            label: 'Insurance Internal',
            href: '/reports/insurance-internal',
            icon: <Shield className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'Cooperatives',
            href: '/reports/cooperatives',
            icon: <Users className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'reviewer', 'approver'],
          },
          {
            label: 'Insurance',
            href: '/reports/insurance',
            icon: <Shield className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'reviewer', 'approver'],
          },
          {
            label: 'Money Services',
            href: '/reports/money-services',
            icon: <HandCoins className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'reviewer', 'approver'],
          },
          {
            label: 'Mutual Fund',
            href: '/reports/mutual-fund',
            icon: <DollarSign className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'reviewer', 'approver'],
          },
          {
            label: 'International Banks',
            href: '/reports/international-banks',
            icon: <Landmark className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'reviewer', 'approver'],
          },
          {
            label: 'Trust & Company Mgrs',
            href: '/reports/trust-company',
            icon: <Building2 className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'reviewer', 'approver'],
          },
          {
            label: 'Internal Reports',
            href: '/reports/internal',
            icon: <FileText className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'Other Reports',
            href: '/reports/other',
            icon: <FileBarChart className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'reviewer', 'approver'],
          },
          {
            label: 'Payment Reports',
            href: '/reports/payments',
            icon: <Receipt className="h-4 w-4" />,
            roles: ['admin', 'supervisor', 'approver'],
          },
        ],
      },
      {
        label: 'Statement Reports',
        href: '/statement-reports',
        icon: <FileBarChart className="h-5 w-5" />,
        roles: ['admin', 'supervisor', 'approver'],
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        label: 'Role Management',
        href: '/admin/roles',
        icon: <Shield className="h-5 w-5" />,
        roles: ['admin', 'supervisor'],
      },
      {
        label: 'User Management',
        href: '/admin/users',
        icon: <Users className="h-5 w-5" />,
        roles: ['admin', 'supervisor'],
      },
      {
        label: 'Master Configuration',
        href: '/admin/masters',
        icon: <Building2 className="h-5 w-5" />,
        roles: ['admin'],
      },
      {
        label: 'Form Builder',
        href: '/admin/forms',
        icon: <FormInput className="h-5 w-5" />,
        roles: ['admin'],
      },
      {
        label: 'Workflow Config',
        href: '/admin/workflows',
        icon: <GitBranch className="h-5 w-5" />,
        roles: ['admin'],
      },
      {
        label: 'Settings',
        icon: <Settings className="h-5 w-5" />,
        roles: ['admin', 'supervisor'],
        children: [
          {
            label: 'General Settings',
            href: '/settings/general',
            icon: <SlidersHorizontal className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'Schedule Settings',
            href: '/settings/schedule',
            icon: <Calendar className="h-4 w-4" />,
            roles: ['admin', 'supervisor'],
          },
          {
            label: 'Payment Settings',
            href: '/settings/payment',
            icon: <CreditCard className="h-4 w-4" />,
            roles: ['admin'],
          },
        ],
      },
    ],
  },
];

export const bottomNavItems: NavItem[] = [
  {
    label: 'Notifications',
    href: '/notifications',
    icon: <Bell className="h-5 w-5" />,
    badge: 5,
    roles: ['public', 'admin', 'reviewer', 'approver', 'supervisor'],
  },
  {
    label: 'Messages',
    href: '/messages',
    icon: <MessageSquare className="h-5 w-5" />,
    roles: ['public', 'admin', 'reviewer', 'approver', 'supervisor'],
  },
  {
    label: 'Mail & SMS',
    href: '/mail-sms',
    icon: <Mail className="h-5 w-5" />,
    roles: ['admin', 'supervisor'],
  },
  {
    label: 'Profile',
    href: '/profile',
    icon: <UserCircle className="h-5 w-5" />,
    roles: ['public', 'admin', 'reviewer', 'approver', 'supervisor'],
  },
];
