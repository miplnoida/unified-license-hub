import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, Eye, Pencil, Trash2, Search, Loader2, GitBranch } from 'lucide-react';
import { useFormTemplates, useDeleteFormTemplate, useUpdateTemplateStatus, type FormTemplate } from '@/hooks/useFormTemplates';
import { useRegulator } from '@/contexts/RegulatorContext';
import { toast } from 'sonner';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  published: 'default', draft: 'secondary', archived: 'outline',
};

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

export default function PreLicenseForms() {
  const navigate = useNavigate();
  const { activeRegulatorId } = useRegulator();
  const { data: templates = [], isLoading } = useFormTemplates('pre_license', activeRegulatorId);
  const deleteTemplateMutation = useDeleteFormTemplate();
  const updateStatusMutation = useUpdateTemplateStatus();

  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean; id: string; name: string; currentStatus: string; newStatus: string;
  }>({ open: false, id: '', name: '', currentStatus: '', newStatus: 'draft' });

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (searchName && !t.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterCategory !== 'all' && t.category !== filterCategory) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      return true;
    });
  }, [templates, searchName, filterCategory, filterStatus]);

  const uniqueCategories = [...new Set(templates.map((t) => t.category).filter(Boolean))];

  const handleDelete = (id: string) => {
    deleteTemplateMutation.mutate(id, {
      onSuccess: () => toast.success('Form template deleted.'),
      onError: () => toast.error('Failed to delete form template.'),
    });
  };

  const handleView = (id: string) => {
    navigate(`/admin/forms/create?type=pre_license&id=${id}&mode=view`);
  };

  const requestStatusChange = (template: FormTemplate, newStatus: string) => {
    if (newStatus === template.status) return;
    setStatusDialog({ open: true, id: template.id, name: template.name, currentStatus: template.status, newStatus });
  };

  const confirmStatusChange = () => {
    const { id, newStatus } = statusDialog;
    updateStatusMutation.mutate(
      { id, status: newStatus },
      {
        onSuccess: () => toast.success(`Form status changed to "${newStatus}".`),
        onError: () => toast.error('Failed to update status.'),
      }
    );
    setStatusDialog((prev) => ({ ...prev, open: false }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Pre-License Forms"
          description="Manage all pre-license application form templates."
          actions={
            <Button onClick={() => navigate('/admin/forms/create?type=pre_license')}>
              <PlusCircle className="h-4 w-4 mr-2" />Add Pre-License Form
            </Button>
          }
        />

        <Card>
          <CardContent className="pt-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by form name..." value={searchName} onChange={(e) => setSearchName(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger><SelectValue placeholder="All Statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Reusable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No form templates found.</TableCell></TableRow>
                  ) : filtered.map((tpl) => (
                    <TableRow key={tpl.id}>
                      <TableCell className="font-medium">{tpl.name}</TableCell>
                      <TableCell>{tpl.category}</TableCell>
                      <TableCell>
                        <Badge variant={tpl.is_reusable ? 'default' : 'secondary'} className="text-[10px]">
                          {tpl.is_reusable ? 'Yes' : 'No'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={tpl.status} onValueChange={(val) => requestStatusChange(tpl, val)}>
                          <SelectTrigger className="w-[130px] h-8 border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:ml-1">
                            <Badge variant={statusVariant[tpl.status]} className="cursor-pointer capitalize">{tpl.status}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((opt) => (<SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{new Date(tpl.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View" onClick={() => handleView(tpl.id)}><Eye className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => navigate(`/admin/forms/create?type=pre_license&id=${tpl.id}`)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(tpl.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={statusDialog.open} onOpenChange={(open) => setStatusDialog((prev) => ({ ...prev, open }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Form Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the status of <strong>"{statusDialog.name}"</strong> from{' '}
              <Badge variant={statusVariant[statusDialog.currentStatus]} className="capitalize mx-1">{statusDialog.currentStatus}</Badge> to{' '}
              <Badge variant={statusVariant[statusDialog.newStatus]} className="capitalize mx-1">{statusDialog.newStatus}</Badge>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
