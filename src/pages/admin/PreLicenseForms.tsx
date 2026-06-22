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
import { PlusCircle, Eye, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { useFormTemplates, useDeleteFormTemplate, useUpdateTemplateStatus, type FormTemplate } from '@/hooks/useFormTemplates';
import { useSectors, useSubSectors, useCategories } from '@/hooks/useMasterConfig';
import { useRegulator } from '@/contexts/RegulatorContext';
import { toast } from 'sonner';
import Swal from 'sweetalert2';

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

  const { data: dbSectors = [] } = useSectors();
  const { data: dbSubSectors = [] } = useSubSectors();
  const { data: dbCategories = [] } = useCategories();

  const [searchName, setSearchName] = useState('');
  const [filterSectorId, setFilterSectorId] = useState('all');
  const [filterSubSectorId, setFilterSubSectorId] = useState('all');
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const [statusDialog, setStatusDialog] = useState<{
    open: boolean; id: string; name: string; currentStatus: string; newStatus: string;
  }>({ open: false, id: '', name: '', currentStatus: '', newStatus: 'draft' });

  const activeSectors = useMemo(() => dbSectors.filter(s => s.status === 'active'), [dbSectors]);
  const filteredSubSectors = useMemo(() => {
    if (filterSectorId === 'all') return dbSubSectors.filter(s => s.status === 'active');
    return dbSubSectors.filter(s => s.sector_id === filterSectorId && s.status === 'active');
  }, [dbSubSectors, filterSectorId]);
  const filteredCategories = useMemo(() => {
    if (filterSubSectorId === 'all') return dbCategories.filter(c => c.status === 'active');
    return dbCategories.filter(c => c.sub_sector_id === filterSubSectorId && c.status === 'active');
  }, [dbCategories, filterSubSectorId]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (searchName && !t.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterSectorId !== 'all' && t.sector_id !== filterSectorId) return false;
      if (filterSubSectorId !== 'all' && t.sub_sector_id !== filterSubSectorId) return false;
      if (filterCategoryId !== 'all' && t.category_id !== filterCategoryId) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      return true;
    });
  }, [templates, searchName, filterSectorId, filterSubSectorId, filterCategoryId, filterStatus]);

  const handleDelete = async (id: string) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: 'This form template will be permanently deleted.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: 'hsl(var(--destructive))',
      cancelButtonColor: 'hsl(var(--muted-foreground))',
      confirmButtonText: 'Yes, delete it!',
    });
    if (!result.isConfirmed) return;
    deleteTemplateMutation.mutate(id, {
      onSuccess: () => Swal.fire({ title: 'Deleted!', text: 'Form template has been deleted.', icon: 'success', timer: 1500, showConfirmButton: false }),
      onError: () => Swal.fire({ title: 'Error', text: 'Failed to delete form template.', icon: 'error' }),
    });
  };

  const handleView = (id: string) => {
    navigate(`/admin/forms/${id}/view`);
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

  const handleSectorFilterChange = (val: string) => {
    setFilterSectorId(val);
    setFilterSubSectorId('all');
    setFilterCategoryId('all');
  };

  const handleSubSectorFilterChange = (val: string) => {
    setFilterSubSectorId(val);
    setFilterCategoryId('all');
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
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by form name..." value={searchName} onChange={(e) => setSearchName(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterSectorId} onValueChange={handleSectorFilterChange}>
                <SelectTrigger><SelectValue placeholder="All Sectors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sectors</SelectItem>
                  {activeSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSubSectorId} onValueChange={handleSubSectorFilterChange}>
                <SelectTrigger><SelectValue placeholder="All Sub-Sectors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sub-Sectors</SelectItem>
                  {filteredSubSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCategoryId} onValueChange={setFilterCategoryId}>
                <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
                    <TableHead>Sector</TableHead>
                    <TableHead>Sub-Sector</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Form Name</TableHead>
                    <TableHead>Reusable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No form templates found.</TableCell></TableRow>
                  ) : filtered.map((tpl) => (
                    <TableRow key={tpl.id}>
                      <TableCell>{tpl.sector_name || tpl.sector || '—'}</TableCell>
                      <TableCell>{tpl.sub_sector_name || tpl.sub_sector || '—'}</TableCell>
                      <TableCell>{tpl.category_name || tpl.category || '—'}</TableCell>
                      <TableCell className="font-medium">{tpl.name}</TableCell>
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
                        <RowActionsMenu actions={[
                          { label: 'View', icon: Eye, onClick: () => handleView(tpl.id) },
                          { label: 'Edit', icon: Pencil, onClick: () => navigate(`/admin/forms/create?type=pre_license&id=${tpl.id}`) },
                          { label: 'Delete', icon: Trash2, onClick: () => handleDelete(tpl.id), destructive: true, separator: true },
                        ]} />
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
