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
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRegulator } from '@/contexts/RegulatorContext';
import {
  useSectors, useSubSectors, useCategories, useServices, useMasterMutations,
  type SectorRow, type SubSectorRow, type CategoryRow, type ServiceRow,
} from '@/hooks/useMasterConfig';

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

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    try {
      if (dialogEntity === 'sectors') {
        await mutations.upsertSector.mutateAsync({ id: editId || undefined, name: formName, status: formStatus, regulator_id: activeRegulatorId });
      } else if (dialogEntity === 'sub-sectors') {
        if (!formSectorId) { toast({ title: 'Sector is required', variant: 'destructive' }); return; }
        await mutations.upsertSubSector.mutateAsync({ id: editId || undefined, sector_id: formSectorId, name: formName, status: formStatus });
      } else if (dialogEntity === 'categories') {
        if (!formSectorId || !formSubSectorId) { toast({ title: 'Sector & Sub-Sector are required', variant: 'destructive' }); return; }
        await mutations.upsertCategory.mutateAsync({ id: editId || undefined, sector_id: formSectorId, sub_sector_id: formSubSectorId, name: formName, status: formStatus });
      } else {
        if (!formSectorId || !formSubSectorId) { toast({ title: 'Sector & Sub-Sector are required', variant: 'destructive' }); return; }
        await mutations.upsertService.mutateAsync({ id: editId || undefined, sector_id: formSectorId, sub_sector_id: formSubSectorId, name: formName, status: formStatus });
      }
      toast({ title: editId ? 'Updated successfully' : 'Created successfully' });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
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

          <TabsContent value="sectors">
            <DataTableShell columns={sectorColumns} data={sectors} searchPlaceholder="Search sectors..."
              actions={<Button onClick={() => openAdd('sectors')}><Plus className="h-4 w-4 mr-2" />Add Sector</Button>} />
          </TabsContent>
          <TabsContent value="sub-sectors">
            <DataTableShell columns={subSectorColumns} data={subSectors} searchPlaceholder="Search sub-sectors..."
              actions={<Button onClick={() => openAdd('sub-sectors')}><Plus className="h-4 w-4 mr-2" />Add Sub-Sector</Button>} />
          </TabsContent>
          <TabsContent value="categories">
            <DataTableShell columns={categoryColumns} data={categories} searchPlaceholder="Search categories..."
              actions={<Button onClick={() => openAdd('categories')}><Plus className="h-4 w-4 mr-2" />Add Category</Button>} />
          </TabsContent>
          <TabsContent value="services">
            <DataTableShell columns={serviceColumns} data={services} searchPlaceholder="Search services..."
              actions={<Button onClick={() => openAdd('services')}><Plus className="h-4 w-4 mr-2" />Add Service</Button>} />
          </TabsContent>
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
    </DashboardLayout>
  );
}
