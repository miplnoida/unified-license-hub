import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ArrowLeft, Eye, Pencil, Plus, Trash2, FileText,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export interface FormItem {
  id: string;
  name: string;
  subSector: string;
  category: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'verified';
  completedFor: string;
  organisationName: string;
}

const initialForms: FormItem[] = [
  { id: 'f1', name: 'Schedule 2 - Company Information', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'completed', completedFor: 'John Smith', organisationName: 'ABC Financial Services Ltd.' },
  { id: 'f2', name: 'Schedule 5 - Directors & Officers', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'completed', completedFor: 'Jane Doe', organisationName: 'ABC Financial Services Ltd.' },
  { id: 'f3', name: 'MLRO/MLCO/CO Declaration', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'in_progress', completedFor: 'Robert Brown', organisationName: 'ABC Financial Services Ltd.' },
  { id: 'f4', name: 'Financial Statements', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'not_started', completedFor: '—', organisationName: 'ABC Financial Services Ltd.' },
  { id: 'f5', name: 'Supporting Documents', subSector: 'Life Insurance', category: 'Life Insurer License', status: 'not_started', completedFor: '—', organisationName: 'ABC Financial Services Ltd.' },
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
  const [forms, setForms] = useState<FormItem[]>(initialForms);
  const [modalOpen, setModalOpen] = useState(false);
  const [targetFormId, setTargetFormId] = useState<string | null>(null);
  const [applicantName, setApplicantName] = useState('');

  const handleAddApplicant = (formId: string) => {
    setTargetFormId(formId);
    setApplicantName('');
    setModalOpen(true);
  };

  const handleConfirmApplicant = () => {
    if (!applicantName.trim() || !targetFormId) return;
    setForms(prev =>
      prev.map(f =>
        f.id === targetFormId ? { ...f, completedFor: applicantName.trim() } : f
      )
    );
    toast({ title: 'Applicant Added', description: `"${applicantName.trim()}" assigned to form.` });
    setModalOpen(false);
  };

  const handleDelete = (formId: string) => {
    setForms(prev => prev.filter(f => f.id !== formId));
    toast({ title: 'Form Removed', description: 'The form entry has been removed.' });
  };

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
                <TableHead>Organisation Name</TableHead>
                <TableHead>Form Name</TableHead>
                <TableHead>Sub Sector</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Form Status</TableHead>
                <TableHead>Completed For</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {forms.map((form) => (
                <TableRow key={form.id}>
                  <TableCell>{form.organisationName}</TableCell>
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
                    <div className="flex items-center justify-end gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => navigate(`/pre-licensee/applications/${applicationId}/forms/${form.id}?mode=view`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>View</TooltipContent>
                      </Tooltip>

                      {(form.status === 'not_started' || form.status === 'in_progress') && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8"
                              onClick={() => navigate(`/pre-licensee/applications/${applicationId}/forms/${form.id}?mode=edit`)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit</TooltipContent>
                        </Tooltip>
                      )}

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => handleAddApplicant(form.id)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Add Applicant</TooltipContent>
                      </Tooltip>

                      {form.status === 'not_started' && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                              onClick={() => handleDelete(form.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add Applicant Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Applicant</DialogTitle>
            <DialogDescription>Please provide the name of the applicant for this form.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Full Name"
              value={applicantName}
              onChange={(e) => setApplicantName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmApplicant()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmApplicant} disabled={!applicantName.trim()}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
