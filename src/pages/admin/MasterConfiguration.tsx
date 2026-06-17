import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Upload, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Swal from 'sweetalert2';
import { useRegulator } from '@/contexts/RegulatorContext';
import {
  useSectors, useSubSectors, useCategories, useServices, useMasterMutations,
  type SectorRow, type SubSectorRow, type CategoryRow, type ServiceRow,
} from '@/hooks/useMasterConfig';
import { MasterDataImportDialog, downloadSampleExcel, type ImportEntity, type ParsedRow } from '@/components/admin/MasterDataImportDialog';

type EntityType = 'sectors' | 'sub-sectors' | 'categories' | 'services';

export default function MasterConfiguration() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathTab = location.pathname.split('/admin/masters/')[1] as EntityType || 'sectors';
  const [activeTab, setActiveTab] = useState<EntityType>(pathTab);
  const { toast } = useToast();
  const { activeRegulatorId } = useRegulator();

  useEffect(() => { setActiveTab(pathTab); }, [pathTab]);

  const handleTabChange = (v: string) => {
    setActiveTab(v as EntityType);
    navigate(`/admin/masters/${v}`);
  };

  const { data: sectors = [], isLoading: loadingSectors } = useSectors(activeRegulatorId);
  const { data: subSectors = [], isLoading: loadingSubs } = useSubSectors(activeRegulatorId);
  const { data: categories = [], isLoading: loadingCats } = useCategories(activeRegulatorId);
  const { data: services = [], isLoading: loadingSvcs } = useServices(activeRegulatorId);
  const mutations = useMasterMutations();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEntity, setDialogEntity] = useState<EntityType>('sectors');
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formSectorId, setFormSectorId] = useState('');
  const [formSubSectorId, setFormSubSectorId] = useState('');

  // Import dialog state
  const [importOpen, setImportOpen] = useState(false);
  const [importEntity, setImportEntity] = useState<ImportEntity>('sectors');

  const openImport = (entity: ImportEntity) => { setImportEntity(entity); setImportOpen(true); };

  const handleImportRows = async (rows: ParsedRow[]) => {
    let success = 0; let failed = 0; const errors: string[] = [];
    for (const r of rows) {
      try {
        if (importEntity === 'sectors') {
          await mutations.upsertSector.mutateAsync({ name: r.name, status: r.status, regulator_id: activeRegulatorId });
        } else if (importEntity === 'sub-sectors') {
          await mutations.upsertSubSector.mutateAsync({ sector_id: r.sector_id!, name: r.name, status: r.status });
        } else if (importEntity === 'categories') {
          await mutations.upsertCategory.mutateAsync({ sector_id: r.sector_id!, sub_sector_id: r.sub_sector_id!, name: r.name, status: r.status });
        } else {
          await mutations.upsertService.mutateAsync({ sector_id: r.sector_id!, sub_sector_id: r.sub_sector_id!, name: r.name, status: r.status });
        }
        success++;
      } catch (e: any) {
        failed++; errors.push(`Row ${r.rowNumber}: ${e.message}`);
      }
    }
    return { success, failed, errors };
  };


  const openAdd = (entity: EntityType) => {
    setDialogEntity(entity);
    setEditId(null);
    setFormName('');
    setFormStatus('active');
    setFormSectorId('');
    setFormSubSectorId('');
    setDialogOpen(true);
  };

  const openEdit = (entity: EntityType, row: any) => {
    setDialogEntity(entity);
    setEditId(row.id);
    setFormName(row.name);
    setFormStatus(row.status);
    setFormSectorId(row.sector_id || '');
    setFormSubSectorId(row.sub_sector_id || '');
    setDialogOpen(true);
  };

  const handleDelete = async (entity: EntityType, id: string) => {
    try {
      if (entity === 'sectors') await mutations.deleteSector.mutateAsync(id);
      else if (entity === 'sub-sectors') await mutations.deleteSubSector.mutateAsync(id);
      else if (entity === 'categories') await mutations.deleteCategory.mutateAsync(id);
      else await mutations.deleteService.mutateAsync(id);
      toast({ title: 'Deleted successfully' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const checkDuplicate = (): string | null => {
    const name = formName.trim().toLowerCase();
    if (dialogEntity === 'sectors') {
      const dup = sectors.find(s => s.name.toLowerCase() === name && s.id !== editId);
      if (dup) return 'A sector with this name already exists.';
    } else if (dialogEntity === 'sub-sectors') {
      const dup = subSectors.find(s => s.sector_id === formSectorId && s.name.toLowerCase() === name && s.id !== editId);
      if (dup) return 'A sub-sector with this name already exists in the selected sector.';
    } else if (dialogEntity === 'categories') {
      const dup = categories.find(c => c.sector_id === formSectorId && c.sub_sector_id === formSubSectorId && c.name.toLowerCase() === name && c.id !== editId);
      if (dup) return 'A category with this name already exists for this sector and sub-sector.';
    } else {
      const dup = services.find(s => s.sector_id === formSectorId && s.sub_sector_id === formSubSectorId && s.name.toLowerCase() === name && s.id !== editId);
      if (dup) return 'A service with this name already exists for this sector and sub-sector.';
    }
    return null;
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    const dupError = checkDuplicate();
    if (dupError) {
      toast({ title: 'Duplicate Entry', description: dupError, variant: 'destructive' });
      return;
    }
    try {
      if (dialogEntity === 'sectors') {
        await mutations.upsertSector.mutateAsync({ id: editId || undefined, name: formName.trim(), status: formStatus, regulator_id: activeRegulatorId });
      } else if (dialogEntity === 'sub-sectors') {
        if (!formSectorId) { toast({ title: 'Sector is required', variant: 'destructive' }); return; }
        await mutations.upsertSubSector.mutateAsync({ id: editId || undefined, sector_id: formSectorId, name: formName.trim(), status: formStatus });
      } else if (dialogEntity === 'categories') {
        if (!formSectorId || !formSubSectorId) { toast({ title: 'Sector & Sub-Sector are required', variant: 'destructive' }); return; }
        await mutations.upsertCategory.mutateAsync({ id: editId || undefined, sector_id: formSectorId, sub_sector_id: formSubSectorId, name: formName.trim(), status: formStatus });
      } else {
        if (!formSectorId || !formSubSectorId) { toast({ title: 'Sector & Sub-Sector are required', variant: 'destructive' }); return; }
        await mutations.upsertService.mutateAsync({ id: editId || undefined, sector_id: formSectorId, sub_sector_id: formSubSectorId, name: formName.trim(), status: formStatus });
      }
      toast({ title: editId ? 'Updated successfully' : 'Created successfully' });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Duplicate Entry', description: e.message, variant: 'destructive' });
    }
  };

  const filteredSubSectors = formSectorId ? subSectors.filter(s => s.sector_id === formSectorId) : subSectors;

  const entityLabel: Record<EntityType, string> = { sectors: 'Sector', 'sub-sectors': 'Sub-Sector', categories: 'Category', services: 'Service' };

  // Column helpers
  const actionCol = (entity: EntityType): Column<any> => ({
    key: 'actions', label: '', render: (r: any) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(entity, r)}><Edit className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(entity, r.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    ),
  });

  const statusCol: Column<any> = {
    key: 'status', label: 'Status', render: (r: any) => (
      <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge>
    ),
  };

  const sectorColumns: Column<SectorRow>[] = [
    { key: 'name', label: 'Sector Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    statusCol,
    actionCol('sectors'),
  ];

  const subSectorColumns: Column<SubSectorRow>[] = [
    { key: 'sector_name', label: 'Sector', render: (r) => <Badge variant="outline">{r.sector_name}</Badge> },
    { key: 'name', label: 'Sub-Sector Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    statusCol,
    actionCol('sub-sectors'),
  ];

  const categoryColumns: Column<CategoryRow>[] = [
    { key: 'sector_name', label: 'Sector', render: (r) => <Badge variant="outline">{r.sector_name}</Badge> },
    { key: 'sub_sector_name', label: 'Sub-Sector', render: (r) => <Badge variant="outline">{r.sub_sector_name}</Badge> },
    { key: 'name', label: 'Category Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    statusCol,
    actionCol('categories'),
  ];

  const serviceColumns: Column<ServiceRow>[] = [
    { key: 'sector_name', label: 'Sector', render: (r) => <Badge variant="outline">{r.sector_name}</Badge> },
    { key: 'sub_sector_name', label: 'Sub-Sector', render: (r) => <Badge variant="outline">{r.sub_sector_name}</Badge> },
    { key: 'name', label: 'Service Name', render: (r) => <span className="font-medium text-foreground">{r.name}</span> },
    statusCol,
    actionCol('services'),
  ];

  const needsSector = dialogEntity !== 'sectors';
  const needsSubSector = dialogEntity === 'categories' || dialogEntity === 'services';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Master Configuration" description="Manage sectors, sub-sectors, categories, and services." />

        <Tabs value={activeTab} onValueChange={handleTabChange} className="animate-slide-up delay-100">
          <TabsList>
            <TabsTrigger value="sectors">Sectors</TabsTrigger>
            <TabsTrigger value="sub-sectors">Sub-Sectors</TabsTrigger>
            <TabsTrigger value="categories">Categories</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
          </TabsList>

          {(['sectors','sub-sectors','categories','services'] as EntityType[]).map(ent => {
            const cfg = {
              'sectors': { cols: sectorColumns, data: sectors, ph: 'Search sectors...', label: 'Sector' },
              'sub-sectors': { cols: subSectorColumns, data: subSectors, ph: 'Search sub-sectors...', label: 'Sub-Sector' },
              'categories': { cols: categoryColumns, data: categories, ph: 'Search categories...', label: 'Category' },
              'services': { cols: serviceColumns, data: services, ph: 'Search services...', label: 'Service' },
            }[ent] as any;
            return (
              <TabsContent key={ent} value={ent}>
                <DataTableShell columns={cfg.cols} data={cfg.data} searchPlaceholder={cfg.ph}
                  actions={
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => downloadSampleExcel(ent)}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />Sample Excel
                      </Button>
                      <Button variant="outline" onClick={() => openImport(ent)}>
                        <Upload className="h-4 w-4 mr-2" />Import Excel
                      </Button>
                      <Button onClick={() => openAdd(ent)}><Plus className="h-4 w-4 mr-2" />Add {cfg.label}</Button>
                    </div>
                  } />
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit' : 'Add'} {entityLabel[dialogEntity]}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {needsSector && (
              <div className="space-y-2">
                <Label>Sector *</Label>
                <Select value={formSectorId} onValueChange={(v) => { setFormSectorId(v); setFormSubSectorId(''); }}>
                  <SelectTrigger><SelectValue placeholder="Select sector..." /></SelectTrigger>
                  <SelectContent>
                    {sectors.filter(s => s.status === 'active').map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {needsSubSector && (
              <div className="space-y-2">
                <Label>Sub-Sector *</Label>
                <Select value={formSubSectorId} onValueChange={setFormSubSectorId} disabled={!formSectorId}>
                  <SelectTrigger><SelectValue placeholder="Select sub-sector..." /></SelectTrigger>
                  <SelectContent>
                    {filteredSubSectors.filter(s => s.status === 'active').map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{entityLabel[dialogEntity]} Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder={`Enter ${entityLabel[dialogEntity].toLowerCase()} name...`} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MasterDataImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        entity={importEntity}
        sectors={sectors}
        subSectors={subSectors}
        categories={categories}
        services={services}
        onImport={handleImportRows}
      />
    </DashboardLayout>
  );
}
