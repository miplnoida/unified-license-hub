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
  ArrowLeft, Eye, Plus, Pencil, Trash2, FileText, Loader2,
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useForms } from '@/hooks/useForms';

function getFormStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    not_started: { label: 'Not Started', className: 'bg-muted text-muted-foreground' },
    in_progress: { label: 'In Progress', className: 'bg-warning/10 text-warning border border-warning/20' },
    completed: { label: 'Completed', className: 'bg-success/10 text-success border border-success/20' },
    verified: { label: 'Verified', className: 'bg-primary/10 text-primary border border-primary/20' },
  };
  const { label, className } = map[status] || { label: status, className: 'bg-muted text-muted-foreground' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

export default function ApplicationForms() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { data: dbForms = [], isLoading } = useForms('pre_license');

  // Only show published forms from admin panel
  const publishedForms = dbForms.filter(f => f.status === 'published');

  const [modalOpen, setModalOpen] = useState(false);
  const [targetFormId, setTargetFormId] = useState<string | null>(null);
  const [applicantName, setApplicantName] = useState('');
  const [formApplicants, setFormApplicants] = useState<Record<string, string>>({});

  const handleAddApplicant = (formId: string) => {
    setTargetFormId(formId);
    setApplicantName('');
    setModalOpen(true);
  };

  const handleConfirmApplicant = () => {
    if (!applicantName.trim() || !targetFormId) return;
    setFormApplicants(prev => ({ ...prev, [targetFormId]: applicantName.trim() }));
    toast({ title: 'Applicant Added', description: `"${applicantName.trim()}" assigned to form.` });
    setModalOpen(false);
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

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : publishedForms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No forms have been configured for this application type yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form Name</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Sub Sector</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Form Status</TableHead>
                  <TableHead>Completed For</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {publishedForms.map((form) => (
                  <TableRow key={form.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {form.name}
                      </div>
                    </TableCell>
                    <TableCell>{form.sector}</TableCell>
                    <TableCell>{form.sub_sector}</TableCell>
                    <TableCell>{form.category}</TableCell>
                    <TableCell>{getFormStatusBadge('not_started')}</TableCell>
                    <TableCell>{formApplicants[form.id] || '—'}</TableCell>
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
