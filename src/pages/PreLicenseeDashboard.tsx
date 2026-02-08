import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Application, ApplicationStatus, FeeStatus } from '@/types';
import {
  PlusCircle,
  Search,
  Eye,
  Pencil,
  Trash2,
  MoreHorizontal,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';

// Mock applications for Pre-Licensee
const mockPreLicenseeApplications: Application[] = [
  {
    id: '1',
    applicationNumber: 'APP-2024-0156',
    userId: 'user-1',
    organizationName: 'ABC Financial Services Ltd.',
    sectorId: 'sec-1',
    sectorName: 'Insurance',
    subSectorId: 'sub-1',
    subSectorName: 'Life Insurance',
    categoryId: 'cat-1',
    categoryName: 'Class A License',
    formId: 'form-1',
    status: 'submitted',
    feeStatus: 'paid',
    feeApproved: true,
    submittedAt: '2024-01-10T09:00:00Z',
    createdAt: '2024-01-08T10:00:00Z',
    updatedAt: '2024-01-12T14:00:00Z',
    data: {},
  },
  {
    id: '2',
    applicationNumber: 'APP-2024-0155',
    userId: 'user-1',
    organizationName: 'ABC Financial Services Ltd.',
    sectorId: 'sec-2',
    sectorName: 'Banking',
    subSectorId: 'sub-2',
    subSectorName: 'Commercial Banking',
    categoryId: 'cat-2',
    categoryName: 'Class B License',
    formId: 'form-2',
    status: 'work_in_progress',
    feeStatus: 'pending',
    feeApproved: false,
    submittedAt: undefined,
    createdAt: '2024-01-05T11:00:00Z',
    updatedAt: '2024-01-11T16:00:00Z',
    data: {},
  },
  {
    id: '3',
    applicationNumber: 'APP-2024-0154',
    userId: 'user-1',
    organizationName: 'ABC Financial Services Ltd.',
    sectorId: 'sec-3',
    sectorName: 'Capital Markets',
    subSectorId: 'sub-3',
    subSectorName: 'Securities Dealer',
    categoryId: 'cat-3',
    categoryName: 'Class C License',
    formId: 'form-1',
    status: 'draft',
    feeStatus: 'pending',
    feeApproved: false,
    createdAt: '2024-01-12T08:00:00Z',
    updatedAt: '2024-01-12T08:00:00Z',
    data: {},
  },
  {
    id: '4',
    applicationNumber: 'APP-2024-0150',
    userId: 'user-1',
    organizationName: 'ABC Financial Services Ltd.',
    sectorId: 'sec-1',
    sectorName: 'Insurance',
    subSectorId: 'sub-1',
    subSectorName: 'General Insurance',
    categoryId: 'cat-4',
    categoryName: 'Class D License',
    formId: 'form-1',
    status: 'approved',
    feeStatus: 'paid',
    feeApproved: true,
    submittedAt: '2023-12-01T09:00:00Z',
    createdAt: '2023-11-20T10:00:00Z',
    updatedAt: '2024-01-05T14:00:00Z',
    data: {},
  },
];

function getStatusBadge(status: ApplicationStatus) {
  const map: Record<ApplicationStatus, { label: string; variant: string }> = {
    draft: { label: 'Draft', variant: 'bg-muted text-muted-foreground' },
    work_in_progress: { label: 'Work in Progress', variant: 'bg-warning/10 text-warning border border-warning/20' },
    submitted: { label: 'Submitted', variant: 'bg-primary/10 text-primary border border-primary/20' },
    under_review: { label: 'Under Review', variant: 'bg-info/10 text-info border border-info/20' },
    query_raised: { label: 'Query Raised', variant: 'bg-warning/10 text-warning border border-warning/20' },
    approved: { label: 'Approved', variant: 'bg-success/10 text-success border border-success/20' },
    rejected: { label: 'Rejected', variant: 'bg-destructive/10 text-destructive border border-destructive/20' },
    returned: { label: 'Returned', variant: 'bg-warning/10 text-warning border border-warning/20' },
  };
  const { label, variant } = map[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${variant}`}>{label}</span>;
}

function getFeeBadge(status?: FeeStatus) {
  if (status === 'paid') {
    return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-success/10 text-success border border-success/20">Paid</span>;
  }
  return <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-warning/10 text-warning border border-warning/20">Pending</span>;
}

export default function PreLicenseeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (!user) return null;

  const filteredApplications = mockPreLicenseeApplications.filter((app) => {
    const matchesSearch =
      !searchQuery ||
      app.organizationName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.sectorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.applicationNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalApps = mockPreLicenseeApplications.length;
  const draftCount = mockPreLicenseeApplications.filter(a => a.status === 'draft' || a.status === 'work_in_progress').length;
  const submittedCount = mockPreLicenseeApplications.filter(a => a.status === 'submitted' || a.status === 'under_review').length;
  const approvedCount = mockPreLicenseeApplications.filter(a => a.status === 'approved').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome, {user.name}</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your license applications and track their status.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Applications"
            value={totalApps}
            icon={<FileText className="h-6 w-6" />}
          />
          <StatCard
            title="In Progress"
            value={draftCount}
            icon={<Clock className="h-6 w-6" />}
            variant="warning"
          />
          <StatCard
            title="Submitted"
            value={submittedCount}
            icon={<AlertTriangle className="h-6 w-6" />}
            variant="primary"
          />
          <StatCard
            title="Approved"
            value={approvedCount}
            icon={<CheckCircle className="h-6 w-6" />}
            variant="success"
          />
        </div>

        {/* Applications Table */}
        <div className="card-elevated">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b">
            <h2 className="text-lg font-semibold text-foreground">All Applied Applications</h2>
            <Button onClick={() => navigate('/pre-license/new')}>
              <PlusCircle className="h-4 w-4 mr-2" />
              New Application
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 p-4 border-b bg-muted/30">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by organization, sector..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="work_in_progress">Work in Progress</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organisation Name</TableHead>
                <TableHead>Sector Name</TableHead>
                <TableHead>Sub Sector</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Application Status</TableHead>
                <TableHead>Fee Paid Status</TableHead>
                <TableHead>Fee Approved</TableHead>
                <TableHead>Date of Submission</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredApplications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No applications found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredApplications.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-medium">{app.organizationName}</TableCell>
                    <TableCell>{app.sectorName}</TableCell>
                    <TableCell>{app.subSectorName}</TableCell>
                    <TableCell>{app.categoryName}</TableCell>
                    <TableCell>{getStatusBadge(app.status)}</TableCell>
                    <TableCell>{getFeeBadge(app.feeStatus)}</TableCell>
                    <TableCell>
                      {app.feeApproved ? (
                        <span className="text-success font-medium">Yes</span>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {app.submittedAt
                        ? new Date(app.submittedAt).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem>
                            <Eye className="h-4 w-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          {(app.status === 'draft' || app.status === 'work_in_progress') && (
                            <DropdownMenuItem>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}
                          {app.status === 'draft' && (
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
