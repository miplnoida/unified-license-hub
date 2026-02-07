import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/dashboard/StatCard';
import { Plus, Edit, Lock, Unlock, Users, Shield, UserCheck, UserX } from 'lucide-react';

interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
  lastLogin: string;
  createdDate: string;
}

const data: UserRecord[] = [
  { id: '1', name: 'Sarah Johnson', email: 'sarah.johnson@afsc.gov', role: 'Administrator', department: 'IT', status: 'active', lastLogin: '2024-01-15 10:30', createdDate: '2022-03-15' },
  { id: '2', name: 'Michael Chen', email: 'michael.chen@afsc.gov', role: 'Reviewer', department: 'Insurance', status: 'active', lastLogin: '2024-01-15 09:15', createdDate: '2022-06-20' },
  { id: '3', name: 'Emily Davis', email: 'emily.davis@afsc.gov', role: 'Approver', department: 'Banking', status: 'active', lastLogin: '2024-01-14 16:45', createdDate: '2022-08-10' },
  { id: '4', name: 'Robert Wilson', email: 'robert.wilson@afsc.gov', role: 'Supervisor', department: 'Compliance', status: 'active', lastLogin: '2024-01-15 08:00', createdDate: '2021-11-05' },
  { id: '5', name: 'Lisa Anderson', email: 'lisa.anderson@afsc.gov', role: 'Reviewer', department: 'Capital Markets', status: 'inactive', lastLogin: '2023-12-01 11:30', createdDate: '2023-01-15' },
  { id: '6', name: 'James Brown', email: 'james.brown@afsc.gov', role: 'Reviewer', department: 'Insurance', status: 'locked', lastLogin: '2024-01-10 14:20', createdDate: '2023-04-22' },
];

const columns: Column<UserRecord>[] = [
  {
    key: 'name', label: 'User', render: (r) => (
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">{r.name.split(' ').map(n => n[0]).join('')}</div>
        <div>
          <p className="font-medium text-foreground">{r.name}</p>
          <p className="text-sm text-muted-foreground">{r.email}</p>
        </div>
      </div>
    )
  },
  { key: 'role', label: 'Role', render: (r) => <Badge variant="outline">{r.role}</Badge> },
  { key: 'department', label: 'Department' },
  { key: 'lastLogin', label: 'Last Login' },
  {
    key: 'status', label: 'Status', render: (r) => {
      const v = r.status === 'active' ? 'approved' : r.status === 'locked' ? 'rejected' : 'draft';
      return <Badge variant={v as any} className="capitalize">{r.status}</Badge>;
    }
  },
  {
    key: 'actions', label: '', render: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          {r.status === 'locked' ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </Button>
      </div>
    )
  },
];

export default function UserManagement() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="User Management" description="Create, manage, and monitor system user accounts." actions={<Button><Plus className="h-4 w-4 mr-2" />Add User</Button>} />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Users" value={data.length} icon={<Users className="h-6 w-6" />} />
          <StatCard title="Active" value={data.filter(u => u.status === 'active').length} icon={<UserCheck className="h-6 w-6" />} variant="success" />
          <StatCard title="Inactive" value={data.filter(u => u.status === 'inactive').length} icon={<UserX className="h-6 w-6" />} variant="warning" />
          <StatCard title="Locked" value={data.filter(u => u.status === 'locked').length} icon={<Shield className="h-6 w-6" />} variant="danger" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={data} searchPlaceholder="Search users..." />
        </div>
      </div>
    </DashboardLayout>
  );
}
