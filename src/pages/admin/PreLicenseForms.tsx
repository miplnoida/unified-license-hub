import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, Eye, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { useForms, useDeleteForm, useUpdateFormStatus, type DbForm } from '@/hooks/useForms';
import { toast } from 'sonner';

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  published: 'default',
  draft: 'secondary',
  archived: 'outline',
};

const statusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

export default function PreLicenseForms() {
  const navigate = useNavigate();
  const { data: forms = [], isLoading } = useForms('pre_license');
  const deleteFormMutation = useDeleteForm();
  const updateStatusMutation = useUpdateFormStatus();

  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean; formId: string; formName: string; currentStatus: string; newStatus: string;
  }>({ open: false, formId: '', formName: '', currentStatus: '', newStatus: 'draft' });

  const filtered = useMemo(() => {
    return forms.filter((f) => {
      if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterCategory !== 'all' && f.category !== filterCategory) return false;
      if (filterStatus !== 'all' && f.status !== filterStatus) return false;
      return true;
    });
  }, [forms, searchName, filterCategory, filterStatus]);

  const uniqueCategories = [...new Set(forms.map((f) => f.category).filter(Boolean))];

  const handleDelete = (id: string) => {
    deleteFormMutation.mutate(id, {
      onSuccess: () => toast.success('Form deleted.'),
      onError: () => toast.error('Failed to delete form.'),
    });
  };

  const handleView = (formId: string) => {
    navigate(`/admin/forms/create?type=pre_license&id=${formId}&mode=view`);
  };

  const requestStatusChange = (form: DbForm, newStatus: string) => {
    if (newStatus === form.status) return;
    setStatusDialog({ open: true, formId: form.id, formName: form.name, currentStatus: form.status, newStatus });
  };

  const confirmStatusChange = () => {
    const { formId, newStatus } = statusDialog;
    updateStatusMutation.mutate(
      { id: formId, status: newStatus as DbForm['status'] },
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
          description="Manage all pre-license application forms."
          actions={
            <Button onClick={() => navigate('/admin/forms/create?type=pre_license')}>
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Pre-License Form
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
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Form Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No forms found.</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((form) => (
                      <TableRow key={form.id}>
                        <TableCell className="font-medium">{form.name}</TableCell>
                        <TableCell>{form.category}</TableCell>
                        <TableCell>Pre-License</TableCell>
                        <TableCell>
                          <Select
                            value={form.status}
                            onValueChange={(val) => requestStatusChange(form, val)}
                          >
                            <SelectTrigger className="w-[130px] h-8 border-0 bg-transparent p-0 shadow-none focus:ring-0 [&>svg]:ml-1">
                              <Badge variant={statusVariant[form.status]} className="cursor-pointer capitalize">
                                {form.status}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{new Date(form.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="View" onClick={() => handleView(form.id)}><Eye className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => navigate(`/admin/forms/create?type=pre_license&id=${form.id}`)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(form.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
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
              Are you sure you want to change the status of <strong>"{statusDialog.formName}"</strong> from{' '}
              <Badge variant={statusVariant[statusDialog.currentStatus]} className="capitalize mx-1">{statusDialog.currentStatus}</Badge>
              to{' '}
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
