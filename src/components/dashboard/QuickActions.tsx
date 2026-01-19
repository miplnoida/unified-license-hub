import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  FilePlus,
  FileCheck,
  ClipboardList,
  Search,
  HelpCircle,
  ArrowRight,
} from 'lucide-react';

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: React.ReactNode;
  color: 'primary' | 'secondary' | 'success' | 'warning';
}

const publicActions: QuickAction[] = [
  {
    label: 'New Pre-License Application',
    description: 'Start a new license application',
    href: '/pre-license/new',
    icon: <FilePlus className="h-6 w-6" />,
    color: 'primary',
  },
  {
    label: 'Post-License Services',
    description: 'Apply for additional services',
    href: '/post-license',
    icon: <FileCheck className="h-6 w-6" />,
    color: 'secondary',
  },
  {
    label: 'File a Return',
    description: 'Submit your periodic returns',
    href: '/returns',
    icon: <ClipboardList className="h-6 w-6" />,
    color: 'success',
  },
  {
    label: 'Track Applications',
    description: 'Check your application status',
    href: '/applications',
    icon: <Search className="h-6 w-6" />,
    color: 'warning',
  },
];

const adminActions: QuickAction[] = [
  {
    label: 'Review Applications',
    description: 'Process pending applications',
    href: '/admin/applications',
    icon: <FileCheck className="h-6 w-6" />,
    color: 'primary',
  },
  {
    label: 'Review Returns',
    description: 'Process pending returns',
    href: '/admin/returns',
    icon: <ClipboardList className="h-6 w-6" />,
    color: 'secondary',
  },
  {
    label: 'Form Builder',
    description: 'Create and manage dynamic forms',
    href: '/admin/forms',
    icon: <FilePlus className="h-6 w-6" />,
    color: 'success',
  },
  {
    label: 'Help & Support',
    description: 'Access documentation and guides',
    href: '/help',
    icon: <HelpCircle className="h-6 w-6" />,
    color: 'warning',
  },
];

interface QuickActionsProps {
  userRole: 'public' | 'admin' | 'reviewer' | 'approver' | 'supervisor';
}

export function QuickActions({ userRole }: QuickActionsProps) {
  const actions = userRole === 'public' ? publicActions : adminActions;

  const colorStyles = {
    primary: 'bg-primary/5 text-primary hover:bg-primary/10 border-primary/20',
    secondary: 'bg-secondary/5 text-secondary hover:bg-secondary/10 border-secondary/20',
    success: 'bg-success/5 text-success hover:bg-success/10 border-success/20',
    warning: 'bg-warning/5 text-warning hover:bg-warning/10 border-warning/20',
  };

  const iconBgStyles = {
    primary: 'bg-primary/10',
    secondary: 'bg-secondary/10',
    success: 'bg-success/10',
    warning: 'bg-warning/10',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {actions.map((action) => (
        <Link
          key={action.href}
          to={action.href}
          className={cn(
            'group flex flex-col p-5 rounded-xl border transition-all duration-200',
            colorStyles[action.color]
          )}
        >
          <div className="flex items-start justify-between">
            <div className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl',
              iconBgStyles[action.color]
            )}>
              {action.icon}
            </div>
            <ArrowRight className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">{action.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
        </Link>
      ))}
    </div>
  );
}
