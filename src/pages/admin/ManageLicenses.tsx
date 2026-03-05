import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Edit, FileCheck, Clock, AlertTriangle } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { useState } from 'react';
import { toast } from 'sonner';

interface License {
  id: string;
  licenseNumber: string;
  holderName: string;
  sector: string;
  licenseType: string;
  status: string;
  issueDate: string;
  expiryDate: string;
}

const initialLicenses: License[] = [
  { id: '1', licenseNumber: 'LIC-2024-001', holderName: 'XYZ Insurance Corp.', sector: 'Insurance', licenseType: 'General Insurance', status: 'active', issueDate: '2024-01-15', expiryDate: '2025-01-15' },
  { id: '2', licenseNumber: 'LIC-2024-002', holderName: 'ABC Financial Ltd.', sector: 'Finance', licenseType: 'Money Services', status: 'active', issueDate: '2024-02-20', expiryDate: '2025-02-20' },
  { id: '3', licenseNumber: 'LIC-2023-045', holderName: 'Global Trust Managers', sector: 'Insurance', licenseType: 'Life Insurance', status: 'expired', issueDate: '2023-03-10', expiryDate: '2024-03-10' },
  { id: '4', licenseNumber: 'LIC-2024-003', holderName: 'Pacific Mutual Fund', sector: 'Finance', licenseType: 'Mutual Fund', status: 'suspended', issueDate: '2024-04-01', expiryDate: '2025-04-01' },
  { id: '5', licenseNumber: 'LIC-2024-004', holderName: 'Island Health Co.', sector: 'Healthcare', licenseType: 'Health Insurance', status: 'active', issueDate: '2024-05-12', expiryDate: '2025-05-12' },
];

export default function ManageLicenses() {
  const [licenses] = useState(initialLicenses);
  const [viewLicense, setViewLicense] = useState<License | null>(null);

  const columns: Column<License>[] = [
    { key: 'licenseNumber', label: 'License Number', render: (r) => <span className="font-medium text-primary">{r.licenseNumber}</span> },
    { key: 'holderName', label: 'License Holder' },
    { key: 'sector', label: 'Sector' },
    { key: 'licenseType', label: 'License Type' },
    { key: 'issueDate', label: 'Issue Date' },
    { key: 'expiryDate', label: 'Expiry Date' },
    {
      key: 'status', label: 'Status', render: (r) => {
        const v = r.status === 'active' ? 'approved' : r.status === 'expired' ? 'draft' : 'rejected';
        return <Badge variant={v as any} className="capitalize">{r.status}</Badge>;
      }
    },
    {
      key: 'actions', label: '', render: (r) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewLicense(r)}><Eye className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8"><Edit className="h-4 w-4" /></Button>
        </div>
      )
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Manage Licenses" description="View and manage all licenses issued in the system." />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-slide-up delay-100">
          <StatCard title="Total Licenses" value={licenses.length} icon={<FileCheck className="h-6 w-6" />} />
          <StatCard title="Active" value={licenses.filter(l => l.status === 'active').length} icon={<FileCheck className="h-6 w-6" />} variant="success" />
          <StatCard title="Expired" value={licenses.filter(l => l.status === 'expired').length} icon={<Clock className="h-6 w-6" />} variant="warning" />
          <StatCard title="Suspended" value={licenses.filter(l => l.status === 'suspended').length} icon={<AlertTriangle className="h-6 w-6" />} variant="danger" />
        </div>
        <div className="animate-slide-up delay-200">
          <DataTableShell columns={columns} data={licenses} searchPlaceholder="Search licenses..." />
        </div>
      </div>

      <Dialog open={!!viewLicense} onOpenChange={() => setViewLicense(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>License Details</DialogTitle></DialogHeader>
          {viewLicense && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-muted-foreground text-xs">License Number</Label><p className="font-medium">{viewLicense.licenseNumber}</p></div>
                <div><Label className="text-muted-foreground text-xs">Holder</Label><p className="font-medium">{viewLicense.holderName}</p></div>
                <div><Label className="text-muted-foreground text-xs">Sector</Label><p>{viewLicense.sector}</p></div>
                <div><Label className="text-muted-foreground text-xs">Type</Label><p>{viewLicense.licenseType}</p></div>
                <div><Label className="text-muted-foreground text-xs">Issue Date</Label><p>{viewLicense.issueDate}</p></div>
                <div><Label className="text-muted-foreground text-xs">Expiry Date</Label><p>{viewLicense.expiryDate}</p></div>
                <div><Label className="text-muted-foreground text-xs">Status</Label><Badge variant={viewLicense.status === 'active' ? 'approved' as any : 'draft' as any} className="capitalize mt-1">{viewLicense.status}</Badge></div>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setViewLicense(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
