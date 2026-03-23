import { useState, useMemo } from 'react';
import Swal from 'sweetalert2';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, Eye, Pencil, Trash2, Search, Loader2 } from 'lucide-react';
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

const FORM_TYPES = [
  { value: 'pre_license', label: 'Pre-License' },
  { value: 'post_license', label: 'Post-License' },
  { value: 'returns', label: 'Returns' },
] as const;

export default function FormManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeRegulatorId } = useRegulator();

  const activeTab = searchParams.get('tab') || 'pre_license';
  const setActiveTab = (tab: string) => setSearchParams({ tab });

  const { data: templates = [], isLoading } = useFormTemplates(activeTab, activeRegulatorId);
  const deleteTemplateMutation = useDeleteFormTemplate();
  const updateStatusMutation = useUpdateTemplateStatus();

  const [searchName, setSearchName] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSector, setFilterSector] = useState('all');
  const [filterSubSector, setFilterSubSector] = useState('all');
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean; id: string; name: string; currentStatus: string; newStatus: string;
  }>({ open: false, id: '', name: '', currentStatus: '', newStatus: 'draft' });

  const uniqueSectors = useMemo(() => [...new Set(templates.map(t => t.sector).filter(Boolean))], [templates]);
  const uniqueSubSectors = useMemo(() => {
    const filtered = filterSector !== 'all' ? templates.filter(t => t.sector === filterSector) : templates;
    return [...new Set(filtered.map(t => t.sub_sector).filter(Boolean))];
  }, [templates, filterSector]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (searchName && !t.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterSector !== 'all' && t.sector !== filterSector) return false;
      if (filterSubSector !== 'all' && t.sub_sector !== filterSubSector) return false;
      return true;
    });
  }, [templates, searchName, filterStatus, filterSector, filterSubSector]);

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
    navigate(`/admin/forms/create?type=${activeTab}&id=${id}&mode=view`);
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

  const activeTypeLabel = FORM_TYPES.find(t => t.value === activeTab)?.label || 'Form';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Form Management"
          description="Manage all form templates across Pre-License, Post-License, and Returns."
          actions={
            <Button onClick={() => navigate(`/admin/forms/create?type=${activeTab}`)}>
              <PlusCircle className="h-4 w-4 mr-2" />Add {activeTypeLabel} Form
            </Button>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {FORM_TYPES.map(ft => (
              <TabsTrigger key={ft.value} value={ft.value}>{ft.label}</TabsTrigger>
            ))}
          </TabsList>

          {FORM_TYPES.map(ft => (
            <TabsContent key={ft.value} value={ft.value}>
              <div className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search by form name..." value={searchName} onChange={(e) => setSearchName(e.target.value)} className="pl-9" />
                      </div>
                      <Select value={filterSector} onValueChange={(val) => { setFilterSector(val); setFilterSubSector('all'); }}>
                        <SelectTrigger><SelectValue placeholder="All Sectors" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sectors</SelectItem>
                          {uniqueSectors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={filterSubSector} onValueChange={setFilterSubSector}>
                        <SelectTrigger><SelectValue placeholder="All Sub-Sectors" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sub-Sectors</SelectItem>
                          {uniqueSubSectors.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
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
                            <TableHead>Service</TableHead>
                            <TableHead>Reusable</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Created Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.length === 0 ? (
                            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No {ft.label.toLowerCase()} form templates found.</TableCell></TableRow>
                          ) : filtered.map((tpl) => (
                            <TableRow key={tpl.id}>
                              <TableCell>{tpl.sector || '—'}</TableCell>
                              <TableCell>{tpl.sub_sector || '—'}</TableCell>
                              <TableCell>{tpl.category || '—'}</TableCell>
                              <TableCell className="font-medium">{tpl.name}</TableCell>
                              <TableCell>{tpl.service || '—'}</TableCell>
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
                                  <Button variant="ghost" size="icon" title="Edit" onClick={() => navigate(`/admin/forms/create?type=${activeTab}&id=${tpl.id}`)}><Pencil className="h-4 w-4" /></Button>
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
            </TabsContent>
          ))}
        </Tabs>
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
