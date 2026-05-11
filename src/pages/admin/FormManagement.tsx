import { useState, useMemo, useEffect } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PlusCircle, Eye, Pencil, Trash2, Search, Loader2, Settings2, FileText, FileSpreadsheet, GitBranch } from 'lucide-react';
import { RowActionsMenu } from '@/components/common/RowActionsMenu';
import { VersionHistory } from '@/components/form-builder/VersionHistory';
import { useFormTemplates, useDeleteFormTemplate, useUpdateTemplateStatus, useLatestVersionsByTemplates, type FormTemplate } from '@/hooks/useFormTemplates';
import { useSectors, useSubSectors, useCategories, useServices } from '@/hooks/useMasterConfig';
import { useRegulator } from '@/contexts/RegulatorContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

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
  { value: 'registration', label: 'Registration' },
] as const;

export default function FormManagement() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeRegulatorId } = useRegulator();
  const queryClient = useQueryClient();
  const { hasPermission } = useUserDynamicPermissions();
  const canEditForms = hasPermission('form_management', 'edit');

  const activeTab = searchParams.get('tab') || 'pre_license';
  const setActiveTab = (tab: string) => {
    setSearchParams({ tab });
    setSelectedIds(new Set());
  };

  const { data: templates = [], isLoading } = useFormTemplates(activeTab, activeRegulatorId);
  const deleteTemplateMutation = useDeleteFormTemplate();
  const updateStatusMutation = useUpdateTemplateStatus();

  // Dynamic master data
  const { data: dbSectors = [] } = useSectors();
  const { data: dbSubSectors = [] } = useSubSectors();
  const { data: dbCategories = [] } = useCategories();
  const { data: dbServices = [] } = useServices();

  const [searchName, setSearchName] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSectorId, setFilterSectorId] = useState('all');
  const [filterSubSectorId, setFilterSubSectorId] = useState('all');
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [filterServiceId, setFilterServiceId] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{
    open: boolean; id: string; name: string; currentStatus: string; newStatus: string;
  }>({ open: false, id: '', name: '', currentStatus: '', newStatus: 'draft' });
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    destructive?: boolean;
    onConfirm?: () => void | Promise<void>;
  }>({ open: false, title: '', description: '', confirmLabel: 'Confirm' });
  const [resultDialog, setResultDialog] = useState<{
    open: boolean; title: string; description: React.ReactNode;
  }>({ open: false, title: '', description: '' });

  // Defensive: remove any stale SweetAlert2 backdrop on unmount, route change,
  // or tab change. Prevents click/scroll being blocked if a legacy modal lingers.
  const cleanupStaleOverlays = () => {
    document.querySelectorAll('.swal2-container, .swal2-backdrop-show').forEach((el) => el.remove());
    document.body.classList.remove('swal2-shown', 'swal2-height-auto');
    document.documentElement.classList.remove('swal2-shown', 'swal2-height-auto');
  };
  useEffect(() => {
    cleanupStaleOverlays();
    return () => cleanupStaleOverlays();
  }, [activeTab]);

  const openConfirm = (cfg: Omit<typeof confirmDialog, 'open'>) => {
    // Defer to next frame so any closing Select/Popover portals release focus
    // and backdrops first, avoiding overlapping overlays.
    requestAnimationFrame(() => setConfirmDialog({ ...cfg, open: true }));
  };


  const activeSectors = useMemo(() => dbSectors.filter(s => s.status === 'active'), [dbSectors]);
  const filteredSubSectors = useMemo(() => {
    if (filterSectorId === 'all') return dbSubSectors.filter(s => s.status === 'active');
    return dbSubSectors.filter(s => s.sector_id === filterSectorId && s.status === 'active');
  }, [dbSubSectors, filterSectorId]);
  const filteredCategories = useMemo(() => {
    if (filterSubSectorId === 'all') return dbCategories.filter(c => c.status === 'active');
    return dbCategories.filter(c => c.sub_sector_id === filterSubSectorId && c.status === 'active');
  }, [dbCategories, filterSubSectorId]);
  const filteredServices = useMemo(() => {
    if (filterSubSectorId === 'all') return dbServices.filter(s => s.status === 'active');
    return dbServices.filter(s => s.sub_sector_id === filterSubSectorId && s.status === 'active');
  }, [dbServices, filterSubSectorId]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (searchName && !t.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (filterStatus !== 'all' && t.status !== filterStatus) return false;
      if (filterSectorId !== 'all' && t.sector_id !== filterSectorId) return false;
      if (filterSubSectorId !== 'all' && t.sub_sector_id !== filterSubSectorId) return false;
      if (filterCategoryId !== 'all' && t.category_id !== filterCategoryId) return false;
      if (filterServiceId !== 'all' && t.service_id !== filterServiceId) return false;
      return true;
    });
  }, [templates, searchName, filterStatus, filterSectorId, filterSubSectorId, filterCategoryId, filterServiceId]);

  const templateIds = useMemo(() => filtered.map(t => t.id), [filtered]);
  const { data: latestVersionsMap = {} } = useLatestVersionsByTemplates(templateIds);

  const allSelected = filtered.length > 0 && filtered.every(t => selectedIds.has(t.id));
  const someSelected = selectedIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const doBulkPublish = async (ids: string[]) => {
    setBulkLoading(true);
    try {
      const results = await Promise.allSettled(
        ids.map((id) => updateStatusMutation.mutateAsync({ id, status: 'published' }))
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      queryClient.invalidateQueries({ queryKey: ['form_templates'] });
      queryClient.invalidateQueries({ queryKey: ['form_versions'] });
      if (failed > 0) toast.error(`${failed} form(s) failed to publish.`);
      else toast.success(`${ids.length} form(s) published successfully.`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to bulk publish forms.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkPublish = () => {
    const ids = Array.from(selectedIds);
    openConfirm({
      title: 'Bulk Publish',
      description: `Publish ${ids.length} selected form(s)?`,
      confirmLabel: 'Yes, publish all',
      onConfirm: () => doBulkPublish(ids),
    });
  };

  const selectedPublishedIds = useMemo(
    () => filtered.filter(t => selectedIds.has(t.id) && t.status === 'published').map(t => t.id),
    [filtered, selectedIds]
  );

  const doBulkUnpublish = async (ids: string[]) => {
    setBulkLoading(true);
    try {
      const { error } = await supabase.from('form_templates').update({ status: 'draft' } as any).in('id', ids);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['form_templates'] });
      toast.success(`${ids.length} form(s) unpublished successfully.`);
      setSelectedIds(new Set());
    } catch {
      toast.error('Failed to bulk unpublish forms.');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkUnpublish = () => {
    const ids = selectedPublishedIds;
    const skipped = selectedIds.size - ids.length;
    if (ids.length === 0) {
      toast.error('No published forms selected. Only published forms can be unpublished.');
      return;
    }
    openConfirm({
      title: 'Bulk Unpublish',
      description: (
        <>
          Unpublish <strong>{ids.length}</strong> selected published form(s)?
          {skipped > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              {skipped} non-published form(s) will be skipped.
            </div>
          )}
        </>
      ),
      confirmLabel: 'Yes, unpublish all',
      onConfirm: () => doBulkUnpublish(ids),
    });
  };

  const doBulkDelete = async (ids: string[]) => {
    setBulkLoading(true);
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await deleteTemplateMutation.mutateAsync(id);
      } catch (e: any) {
        failures.push(`${id.slice(0, 8)}: ${e?.message || 'unknown error'}`);
      }
    }
    setSelectedIds(new Set());
    setBulkLoading(false);
    if (failures.length === 0) {
      toast.success(`${ids.length} form(s) deleted successfully.`);
    } else {
      requestAnimationFrame(() => setResultDialog({
        open: true,
        title: 'Some deletes failed',
        description: (
          <div className="text-xs text-left">
            <b>{ids.length - failures.length}</b> deleted, <b>{failures.length}</b> failed:
            <pre className="whitespace-pre-wrap mt-2">{failures.join('\n')}</pre>
          </div>
        ),
      }));
    }
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    openConfirm({
      title: 'Bulk Delete',
      description: `Permanently delete ${ids.length} selected form(s)? This cannot be undone.`,
      confirmLabel: 'Yes, delete all',
      destructive: true,
      onConfirm: () => doBulkDelete(ids),
    });
  };

  const handleDelete = (id: string) => {
    openConfirm({
      title: 'Delete form template?',
      description: 'This form template will be permanently deleted. This action cannot be undone.',
      confirmLabel: 'Yes, delete it',
      destructive: true,
      onConfirm: () => {
        deleteTemplateMutation.mutate(id, {
          onSuccess: () => toast.success('Form template deleted.'),
          onError: (err: any) => toast.error(err?.message || 'Failed to delete form template.'),
        });
      },
    });
  };

  const handleView = (id: string) => {
    navigate(`/admin/forms/create?type=${activeTab}&id=${id}&mode=view`);
  };

  const requestStatusChange = (template: FormTemplate, newStatus: string) => {
    if (newStatus === template.status) return;
    // Defer so the Select dropdown closes/releases its overlay before the
    // AlertDialog mounts — prevents stacked Radix portals/backdrop conflicts.
    requestAnimationFrame(() => {
      setStatusDialog({ open: true, id: template.id, name: template.name, currentStatus: template.status, newStatus });
    });
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
    setFilterServiceId('all');
  };

  const handleSubSectorFilterChange = (val: string) => {
    setFilterSubSectorId(val);
    setFilterCategoryId('all');
    setFilterServiceId('all');
  };

  const activeTypeLabel = FORM_TYPES.find(t => t.value === activeTab)?.label || 'Form';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Form Management"
          description="Manage all form templates across Pre-License, Post-License, and Returns."
          actions={
            <div className="flex items-center gap-2">
              {activeTab === 'returns' && canEditForms && (
                <Button
                  variant="outline"
                  onClick={() => navigate(`/admin/forms/create?type=returns&import=excel`)}
                  title="Import a workbook (.xlsx, .xlsm, .xls). Each sheet becomes a return form with formulas preserved."
                >
                  <FileSpreadsheet className="h-4 w-4 mr-2" />Import from Excel
                </Button>
              )}
              <Button onClick={() => navigate(`/admin/forms/create?type=${activeTab}`)}>
                <PlusCircle className="h-4 w-4 mr-2" />Add {activeTypeLabel} Form
              </Button>
            </div>
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
              {ft.value === 'registration' ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Settings2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold">Registration Form Configuration</h3>
                    <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                      Registration forms are managed through a dedicated builder where you can configure dynamic steps, documents, declarations, and security settings per licensee type.
                    </p>
                    <Button className="mt-6" onClick={() => navigate('/admin/registration-forms')}>
                      <Settings2 className="h-4 w-4 mr-2" />
                      Open Registration Form Builder
                    </Button>
                  </CardContent>
                </Card>
              ) : (
              <div className="space-y-4">
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
                      <Select value={filterServiceId} onValueChange={setFilterServiceId}>
                        <SelectTrigger><SelectValue placeholder="All Services" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Services</SelectItem>
                          {filteredServices.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
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

                {/* Bulk action bar */}
                {someSelected && (
                  <Card>
                    <CardContent className="py-3 flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-medium">
                        {selectedIds.size} form(s) selected
                        {selectedPublishedIds.length !== selectedIds.size && (
                          <span className="text-muted-foreground font-normal ml-2">
                            ({selectedPublishedIds.length} published eligible to unpublish)
                          </span>
                        )}
                      </span>
                      {canEditForms && (
                        <Button size="sm" onClick={handleBulkPublish} disabled={bulkLoading}>
                          {bulkLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                          Publish Selected
                        </Button>
                      )}
                      {canEditForms && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={handleBulkUnpublish}
                          disabled={bulkLoading || selectedPublishedIds.length === 0}
                        >
                          {bulkLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                          Unpublish Selected
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())} disabled={bulkLoading}>
                        Clear Selection
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardContent className="p-0">
                    {isLoading ? (
                      <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-10">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={toggleSelectAll}
                                aria-label="Select all"
                              />
                            </TableHead>
                            <TableHead>Sector</TableHead>
                            <TableHead>Sub-Sector</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Form Name</TableHead>
                            <TableHead>Service</TableHead>
                            {activeTab === 'returns' && <TableHead>Return Type</TableHead>}
                            <TableHead>Reusable</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Version</TableHead>
                            <TableHead>Created Date</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.length === 0 ? (
                            <TableRow><TableCell colSpan={activeTab === 'returns' ? 12 : 11} className="text-center text-muted-foreground py-8">No {ft.label.toLowerCase()} form templates found.</TableCell></TableRow>
                          ) : filtered.map((tpl) => (
                            <TableRow key={tpl.id} className={selectedIds.has(tpl.id) ? 'bg-muted/50' : ''}>
                              <TableCell>
                                <Checkbox
                                  checked={selectedIds.has(tpl.id)}
                                  onCheckedChange={() => toggleSelect(tpl.id)}
                                  aria-label={`Select ${tpl.name}`}
                                />
                              </TableCell>
                              <TableCell>{tpl.sector_name || tpl.sector || '—'}</TableCell>
                              <TableCell>{tpl.sub_sector_name || tpl.sub_sector || '—'}</TableCell>
                              <TableCell>{tpl.category_name || tpl.category || '—'}</TableCell>
                              <TableCell className="font-medium">{tpl.name}</TableCell>
                              <TableCell>{tpl.service_name || tpl.service || '—'}</TableCell>
                              {activeTab === 'returns' && (
                                <TableCell>
                                  <span className="text-sm">{(tpl as any).return_type_name || '—'}</span>
                                </TableCell>
                              )}
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
                              <TableCell>
                                <VersionHistory
                                  templateId={tpl.id}
                                  formName={tpl.name}
                                  trigger={
                                    <Badge variant="outline" className="text-[11px] font-mono cursor-pointer hover:bg-accent" title="View version history">
                                      <GitBranch className="h-3 w-3 mr-1" />
                                      v{(latestVersionsMap as any)[tpl.id]?.semantic_version
                                          || ((latestVersionsMap as any)[tpl.id]?.version != null ? `${(latestVersionsMap as any)[tpl.id].version}.0` : null)
                                          || (tpl as any).semantic_version
                                          || '1.0'}
                                    </Badge>
                                  }
                                />
                              </TableCell>
                              <TableCell>{new Date(tpl.created_at).toLocaleDateString()}</TableCell>
                              <TableCell className="text-right">
                                <RowActionsMenu actions={[
                                  { label: 'Preview in new tab', icon: Eye, onClick: async () => {
                                    const { data } = await supabase.from('form_versions').select('id').eq('template_id', tpl.id).order('version', { ascending: false }).limit(1).maybeSingle();
                                    if ((data as any)?.id) window.open(`/preview/${(data as any).id}`, '_blank', 'noopener');
                                    else toast.info('No version exists yet for this form.');
                                  } },
                                  { label: 'View', icon: FileText, onClick: () => handleView(tpl.id) },
                                  { label: 'Edit', icon: Pencil, hidden: !canEditForms, onClick: () => navigate(`/admin/forms/create?type=${activeTab}&id=${tpl.id}`) },
                                  { label: 'Delete', icon: Trash2, hidden: !canEditForms, destructive: true, separator: true, onClick: () => handleDelete(tpl.id) },
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
              )}
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
