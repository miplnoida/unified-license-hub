import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowLeft, Eye, Pencil, CheckCircle, Clock, FileText } from 'lucide-react';

interface FormItem {
  id: string;
  name: string;
  subSector: string;
  category: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'verified';
  completedFor: string;
}

const mockForms: FormItem[] = [
  { id: 'f1', name: 'Company Information', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'completed', completedFor: 'ABC Financial Services Ltd.' },
  { id: 'f2', name: 'Directors & Officers', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'completed', completedFor: 'ABC Financial Services Ltd.' },
  { id: 'f3', name: 'Financial Statements', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'in_progress', completedFor: 'ABC Financial Services Ltd.' },
  { id: 'f4', name: 'Compliance Declaration', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'not_started', completedFor: '—' },
  { id: 'f5', name: 'Supporting Documents', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'not_started', completedFor: '—' },
];

function getFormStatusBadge(status: FormItem['status']) {
  const map = {
    not_started: { label: 'Not Started', className: 'bg-muted text-muted-foreground' },
    in_progress: { label: 'In Progress', className: 'bg-warning/10 text-warning border border-warning/20' },
    completed: { label: 'Completed', className: 'bg-success/10 text-success border border-success/20' },
    verified: { label: 'Verified', className: 'bg-primary/10 text-primary border border-primary/20' },
  };
  const { label, className } = map[status];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

export default function ApplicationForms() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/pre-license')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Application Forms</h1>
            <p className="text-muted-foreground">Application ID: {applicationId}</p>
          </div>
        </div>

        <div className="card-elevated">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-foreground">Forms List</h2>
            <p className="text-sm text-muted-foreground mt-1">Complete all required forms for this application.</p>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Form Name</TableHead>
                <TableHead>Sub Sector</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Form Status</TableHead>
                <TableHead>Completed For</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockForms.map((form) => (
                <TableRow key={form.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {form.name}
                    </div>
                  </TableCell>
                  <TableCell>{form.subSector}</TableCell>
                  <TableCell>{form.category}</TableCell>
                  <TableCell>{getFormStatusBadge(form.status)}</TableCell>
                  <TableCell>{form.completedFor}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="View Form">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(form.status === 'not_started' || form.status === 'in_progress') && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit Form">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {form.status === 'completed' && (
                        <CheckCircle className="h-4 w-4 text-success" />
                      )}
                      {form.status === 'in_progress' && (
                        <Clock className="h-4 w-4 text-warning" />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
}
