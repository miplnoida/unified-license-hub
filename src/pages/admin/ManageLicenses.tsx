import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Eye, FileCheck, Clock, AlertTriangle, PlusCircle, ClipboardList } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface PreLicenseApplication {
  id: string;
  applicationNumber: string;
  organizationName: string;
  sector: string;
  subSector: string;
  category: string;
  status: string;
  feeStatus: string;
  feeApproved: string;
  submittedDate: string;
}

const initialApplications: PreLicenseApplication[] = [
  { id: '1', applicationNumber: 'APP-2024-0001', organizationName: 'XYZ Insurance Corp.', sector: 'Insurance', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'Approved', feeStatus: 'Paid', feeApproved: 'Yes', submittedDate: '2024-01-15' },
  { id: '2', applicationNumber: 'APP-2024-0002', organizationName: 'ABC Financial Ltd.', sector: 'Banking', subSector: 'Commercial Banking', category: 'Commercial Bank License', status: 'Approved', feeStatus: 'Paid', feeApproved: 'Yes', submittedDate: '2024-02-20' },
  { id: '3', applicationNumber: 'APP-2024-0003', organizationName: 'Global Trust Managers', sector: 'Insurance', subSector: 'General Insurance', category: 'General Insurer License', status: 'Under Review', feeStatus: 'Paid', feeApproved: 'Yes', submittedDate: '2024-03-10' },
  { id: '4', applicationNumber: 'APP-2024-0004', organizationName: 'Pacific Mutual Fund', sector: 'Capital Markets', subSector: 'Securities', category: 'Broker-Dealer License', status: 'Submitted', feeStatus: 'Pending', feeApproved: 'No', submittedDate: '2024-04-01' },
  { id: '5', applicationNumber: 'APP-2024-0005', organizationName: 'Island Health Co.', sector: 'Insurance', subSector: 'Life Insurance', category: 'Life Insurance Broker', status: 'Draft', feeStatus: 'Pending', feeApproved: 'No', submittedDate: '2024-05-12' },
  { id: '6', applicationNumber: 'APP-2024-0006', organizationName: 'Caribbean Pensions Ltd.', sector: 'Pension & Retirement', subSector: 'Pension Funds', category: 'Pension Fund Administrator', status: 'Rejected', feeStatus: 'Paid', feeApproved: 'Yes', submittedDate: '2024-06-18' },
];

const statusVariant = (s: string) => {
  switch (s) {
    case 'Approved': return 'approved';
    case 'Rejected': return 'rejected';
    case 'Under Review': return 'secondary';
    case 'Submitted': return 'default';
    default: return 'draft';
  }
};

export default function ManageLicenses() {
  const navigate = useNavigate();
  const [applications] = useState(initialApplications);
  const [viewApp, setViewApp] = useState<PreLicenseApplication | null>(null);

  const columns: Column<PreLicenseApplication>[] = [
    { key: 'applicationNumber', label: 'Application #', render: (r) => <span className="font-medium text-primary">{r.applicationNumber}</span> },
    { key: 'organizationName', label: 'Organisation Name' },
    { key: 'sector', label: 'Sector' },
    { key: 'subSector', label: 'Sub-Sector' },
    { key: 'category', label: 'Category' },
    { key: 'submittedDate', label: 'Submitted Date' },
    { key: 'feeStatus', label: 'Fee Status', render: (r) => <Badge variant={r.feeStatus === 'Paid' ? 'approved' as any : 'draft' as any}>{r.feeStatus}</Badge> },
    { key: 'feeApproved', label: 'Fee Approved', render: (r) => <Badge variant={r.feeApproved === 'Yes' ? 'approved' as any : 'draft' as any}>{r.feeApproved}</Badge> },
    {
      key: 'status', label: 'Status', render: (r) => <Badge variant={statusVariant(r.status) as any}>{r.status}</Badge>
    },
    {
      key: 'actions', label: '', render: (r) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewApp(r)}><Eye className="h-4 w-4" /></Button>
      )
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Pre-License Applications" description="View and manage all pre-license applications." />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Applications" value={applications.length} icon={<FileCheck className="h-6 w-6" />} />
          <StatCard title="Approved" value={applications.filter(a => a.status === 'Approved').length} icon={<FileCheck className="h-6 w-6" />} variant="success" />
          <StatCard title="Under Review" value={applications.filter(a => a.status === 'Under Review').length} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Rejected" value={applications.filter(a => a.status === 'Rejected').length} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell
            columns={columns}
            data={applications}
            searchPlaceholder="Search applications..."
            actions={
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => navigate('/pre-license/new')}>
                  <PlusCircle className="h-4 w-4 mr-2" />
                  New Application
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate('/returns')}>
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Manage Returns
                </Button>
              </div>
            }
          />
        </div>
      </div>

      <Dialog open={!!viewApp} onOpenChange={() => setViewApp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Application Details</DialogTitle></DialogHeader>
          {viewApp && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-xs">Application #</Label><p className="font-medium">{viewApp.applicationNumber}</p></div>
                <div><Label className="text-muted-foreground text-xs">Organisation</Label><p className="font-medium">{viewApp.organizationName}</p></div>
                <div><Label className="text-muted-foreground text-xs">Sector</Label><p>{viewApp.sector}</p></div>
                <div><Label className="text-muted-foreground text-xs">Sub-Sector</Label><p>{viewApp.subSector}</p></div>
                <div><Label className="text-muted-foreground text-xs">Category</Label><p>{viewApp.category}</p></div>
                <div><Label className="text-muted-foreground text-xs">Submitted</Label><p>{viewApp.submittedDate}</p></div>
                <div><Label className="text-muted-foreground text-xs">Fee Status</Label><Badge variant={viewApp.feeStatus === 'Paid' ? 'approved' as any : 'draft' as any} className="mt-1">{viewApp.feeStatus}</Badge></div>
                <div><Label className="text-muted-foreground text-xs">Fee Approved</Label><Badge variant={viewApp.feeApproved === 'Yes' ? 'approved' as any : 'draft' as any} className="mt-1">{viewApp.feeApproved}</Badge></div>
                <div><Label className="text-muted-foreground text-xs">Status</Label><Badge variant={statusVariant(viewApp.status) as any} className="mt-1">{viewApp.status}</Badge></div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setViewApp(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
