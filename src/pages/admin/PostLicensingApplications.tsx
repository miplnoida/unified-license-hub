import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/dashboard/StatCard';
import { Eye, FileText, Clock, CheckCircle, XCircle, PlusCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';

interface PostLicApp {
  id: string;
  applicationNumber: string;
  applicantName: string;
  sector: string;
  service: string;
  status: string;
  submittedDate: string;
  remarks: string;
}

const initialApps: PostLicApp[] = [
  { id: '1', applicationNumber: 'PLA-2024-001', applicantName: 'XYZ Insurance Corp.', sector: 'Insurance', service: 'Claim Settlement', status: 'Pending', submittedDate: '2024-12-01', remarks: '' },
  { id: '2', applicationNumber: 'PLA-2024-002', applicantName: 'ABC Financial Ltd.', sector: 'Finance', service: 'Policy Renewal', status: 'Under Review', submittedDate: '2024-12-05', remarks: 'Documents verified' },
  { id: '3', applicationNumber: 'PLA-2024-003', applicantName: 'Global Trust Managers', sector: 'Insurance', service: 'New Branch', status: 'Approved', submittedDate: '2024-11-20', remarks: 'All conditions met' },
  { id: '4', applicationNumber: 'PLA-2024-004', applicantName: 'Pacific Mutual Fund', sector: 'Finance', service: 'Fund Registration', status: 'Rejected', submittedDate: '2024-11-15', remarks: 'Incomplete documentation' },
  { id: '5', applicationNumber: 'PLA-2024-005', applicantName: 'Island Health Co.', sector: 'Healthcare', service: 'License Amendment', status: 'Pending', submittedDate: '2024-12-10', remarks: '' },
];

const statusVariant = (s: string) => {
  switch (s) {
    case 'Approved': return 'approved';
    case 'Rejected': return 'rejected';
    case 'Under Review': return 'secondary';
    default: return 'draft';
  }
};

export default function PostLicensingApplications() {
  const navigate = useNavigate();
  const location = useLocation();
  const [apps, setApps] = useState(initialApps);
  const [viewApp, setViewApp] = useState<PostLicApp | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editRemarks, setEditRemarks] = useState('');

  // Merge new application from navigation state
  useEffect(() => {
    const state = location.state as { newApplication?: any } | null;
    if (state?.newApplication) {
      const newApp = state.newApplication;
      const app: PostLicApp = {
        id: newApp.id || `pla-${Date.now()}`,
        applicationNumber: newApp.applicationNumber || `PLA-${Date.now()}`,
        applicantName: newApp.applicantName || 'Current User',
        sector: newApp.sectorName || '',
        service: newApp.serviceName || '',
        status: newApp.status || 'Draft',
        submittedDate: new Date().toISOString().split('T')[0],
        remarks: '',
      };
      setApps(prev => {
        if (prev.some(a => a.id === app.id)) return prev;
        return [app, ...prev];
      });
      // Clear the state so it doesn't re-add on re-render
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const openView = (a: PostLicApp) => { setViewApp(a); setEditStatus(a.status); setEditRemarks(a.remarks); };
  const handleUpdate = () => {
    if (!viewApp) return;
    setApps(prev => prev.map(a => a.id === viewApp.id ? { ...a, status: editStatus, remarks: editRemarks } : a));
    toast.success('Application updated');
    setViewApp(null);
  };

  const columns: Column<PostLicApp>[] = [
    { key: 'applicationNumber', label: 'Application #', render: (r) => <span className="font-medium text-primary">{r.applicationNumber}</span> },
    { key: 'applicantName', label: 'Applicant' },
    { key: 'sector', label: 'Sector' },
    { key: 'service', label: 'Service' },
    { key: 'submittedDate', label: 'Submitted' },
    { key: 'status', label: 'Status', render: (r) => <Badge variant={statusVariant(r.status) as any}>{r.status}</Badge> },
    {
      key: 'actions', label: '', render: (r) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/post-licensee/applications/${r.id}/forms?service=${encodeURIComponent(r.service)}`)}><Eye className="h-4 w-4" /></Button>
      )
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Post Licensing Applications" description="Manage applications submitted after licensing." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 animate-slide-up delay-100">
          <StatCard title="Total" value={apps.length} icon={<FileText className="h-6 w-6" />} />
          <StatCard title="Pending" value={apps.filter(a => a.status === 'Pending').length} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Approved" value={apps.filter(a => a.status === 'Approved').length} icon={<CheckCircle className="h-6 w-6" />} variant="success" />
          <StatCard title="Rejected" value={apps.filter(a => a.status === 'Rejected').length} icon={<XCircle className="h-6 w-6" />} variant="danger" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell
            columns={columns}
            data={apps.filter(a => a.status !== 'Draft')}
            searchPlaceholder="Search applications..."
            actions={
              <Button size="sm" onClick={() => navigate('/post-license/new')}>
                <PlusCircle className="h-4 w-4 mr-2" />
                New Application
              </Button>
            }
          />
        </div>
      </div>

      <Dialog open={!!viewApp} onOpenChange={() => setViewApp(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Application Details</DialogTitle></DialogHeader>
          {viewApp && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-xs">Application #</Label><p className="font-medium">{viewApp.applicationNumber}</p></div>
                <div><Label className="text-muted-foreground text-xs">Applicant</Label><p className="font-medium">{viewApp.applicantName}</p></div>
                <div><Label className="text-muted-foreground text-xs">Sector</Label><p>{viewApp.sector}</p></div>
                <div><Label className="text-muted-foreground text-xs">Service</Label><p>{viewApp.service}</p></div>
                <div><Label className="text-muted-foreground text-xs">Submitted</Label><p>{viewApp.submittedDate}</p></div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Under Review">Under Review</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Remarks</Label>
                <Textarea value={editRemarks} onChange={e => setEditRemarks(e.target.value)} placeholder="Add remarks..." />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewApp(null)}>Cancel</Button>
            <Button onClick={handleUpdate}>Update</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
