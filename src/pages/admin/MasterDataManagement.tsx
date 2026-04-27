import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2, Database, Upload, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useMasterDataTypes, useMasterDataItems, useMasterDataMutations,
  type MasterDataType, type MasterDataItem,
} from '@/hooks/useMasterData';
import {
  MasterDataItemsImportDialog, downloadItemSampleExcel, type ParsedItemRow,
} from '@/components/admin/MasterDataItemsImportDialog';

export default function MasterDataManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'types' | 'items'>('types');
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  const { data: types = [], isLoading: loadingTypes } = useMasterDataTypes();
  const { data: items = [], isLoading: loadingItems } = useMasterDataItems(selectedTypeId);
  const mutations = useMasterDataMutations();

  // Type dialog
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editType, setEditType] = useState<MasterDataType | null>(null);
  const [typeName, setTypeName] = useState('');
  const [typeCode, setTypeCode] = useState('');
  const [typeDesc, setTypeDesc] = useState('');
  const [typeStatus, setTypeStatus] = useState('active');
  const [typeSortOrder, setTypeSortOrder] = useState(0);

  // Item dialog
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<MasterDataItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [itemStatus, setItemStatus] = useState('active');
  const [itemParentId, setItemParentId] = useState('');
  const [itemSortOrder, setItemSortOrder] = useState(0);

  const selectedType = types.find(t => t.id === selectedTypeId);

  // Type CRUD
  const openAddType = () => {
    setEditType(null); setTypeName(''); setTypeCode(''); setTypeDesc(''); setTypeStatus('active'); setTypeSortOrder(0);
    setTypeDialogOpen(true);
  };
  const openEditType = (t: MasterDataType) => {
    setEditType(t); setTypeName(t.name); setTypeCode(t.code || ''); setTypeDesc(t.description || '');
    setTypeStatus(t.status); setTypeSortOrder(t.sort_order);
    setTypeDialogOpen(true);
  };
  const handleSaveType = async () => {
    if (!typeName.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    try {
      await mutations.upsertType.mutateAsync({
        id: editType?.id, name: typeName.trim(), code: typeCode.trim() || null,
        description: typeDesc.trim() || null, status: typeStatus, sort_order: typeSortOrder,
      });
      toast({ title: editType ? 'Updated' : 'Created' });
      setTypeDialogOpen(false);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };
  const handleDeleteType = async (id: string) => {
    try { await mutations.deleteType.mutateAsync(id); toast({ title: 'Deleted' }); }
    catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  // Item CRUD
  const openAddItem = () => {
    setEditItem(null); setItemName(''); setItemCode(''); setItemStatus('active'); setItemParentId(''); setItemSortOrder(0);
    setItemDialogOpen(true);
  };
  const openEditItem = (item: MasterDataItem) => {
    setEditItem(item); setItemName(item.name); setItemCode(item.code || '');
    setItemStatus(item.status); setItemParentId(item.parent_item_id || ''); setItemSortOrder(item.sort_order);
    setItemDialogOpen(true);
  };
  const handleSaveItem = async () => {
    if (!itemName.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    if (!selectedTypeId) return;
    try {
      await mutations.upsertItem.mutateAsync({
        id: editItem?.id, type_id: selectedTypeId, name: itemName.trim(),
        code: itemCode.trim() || null, status: itemStatus,
        parent_item_id: itemParentId || null, sort_order: itemSortOrder,
      });
      toast({ title: editItem ? 'Updated' : 'Created' });
      setItemDialogOpen(false);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };
  const handleDeleteItem = async (id: string) => {
    try { await mutations.deleteItem.mutateAsync(id); toast({ title: 'Deleted' }); }
    catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  // Parent items for the selected type (items without a parent themselves)
  const parentOptions = items.filter(i => !i.parent_item_id && i.id !== editItem?.id);

  const getParentName = (parentId: string | null) => {
    if (!parentId) return '—';
    return items.find(i => i.id === parentId)?.name || '—';
  };

  // Columns
  const typeColumns: Column<MasterDataType>[] = [
    { key: 'name', label: 'Name', render: r => <span className="font-medium text-foreground">{r.name}</span> },
    { key: 'code', label: 'Code', render: r => r.code ? <Badge variant="outline">{r.code}</Badge> : <span className="text-muted-foreground">—</span> },
    { key: 'description', label: 'Description', render: r => <span className="text-muted-foreground text-sm">{r.description || '—'}</span> },
    { key: 'status', label: 'Status', render: r => <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge> },
    {
      key: 'actions', label: '', render: r => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedTypeId(r.id); setActiveTab('items'); }}>
            <Database className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditType(r)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteType(r.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  const itemColumns: Column<MasterDataItem>[] = [
    { key: 'name', label: 'Name', render: r => <span className="font-medium text-foreground">{r.name}</span> },
    { key: 'code', label: 'Code', render: r => r.code ? <Badge variant="outline">{r.code}</Badge> : <span className="text-muted-foreground">—</span> },
    { key: 'parent_item_id', label: 'Parent', render: r => <span className="text-muted-foreground">{getParentName(r.parent_item_id)}</span> },
    { key: 'sort_order', label: 'Order', render: r => <span>{r.sort_order}</span> },
    { key: 'status', label: 'Status', render: r => <Badge variant={r.status === 'active' ? 'default' : 'secondary'} className="capitalize">{r.status}</Badge> },
    {
      key: 'actions', label: '', render: r => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditItem(r)}><Edit className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteItem(r.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Master Data Management" description="Manage dropdown datasets used across dynamic forms." />

        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="types">Data Types</TabsTrigger>
            <TabsTrigger value="items">Data Items</TabsTrigger>
          </TabsList>

          <TabsContent value="types">
            <DataTableShell columns={typeColumns} data={types} searchPlaceholder="Search types..."
              actions={<Button onClick={openAddType}><Plus className="h-4 w-4 mr-2" />Add Type</Button>} />
          </TabsContent>

          <TabsContent value="items">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Label className="whitespace-nowrap">Select Type:</Label>
                <Select value={selectedTypeId || ''} onValueChange={setSelectedTypeId}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Choose a data type..." /></SelectTrigger>
                  <SelectContent>
                    {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {selectedTypeId ? (
                <DataTableShell columns={itemColumns} data={items} searchPlaceholder="Search items..."
                  actions={<Button onClick={openAddItem}><Plus className="h-4 w-4 mr-2" />Add Item</Button>} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">Select a data type to manage its items.</div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Type Dialog */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editType ? 'Edit' : 'Add'} Data Type</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="e.g. Country, Document Type" />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={typeCode} onChange={e => setTypeCode(e.target.value)} placeholder="e.g. COUNTRY" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={typeDesc} onChange={e => setTypeDesc(e.target.value)} placeholder="Brief description..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={typeStatus} onValueChange={setTypeStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={typeSortOrder} onChange={e => setTypeSortOrder(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveType}>{editType ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editItem ? 'Edit' : 'Add'} Item — {selectedType?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="Item name..." />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Input value={itemCode} onChange={e => setItemCode(e.target.value)} placeholder="Optional code..." />
            </div>
            {parentOptions.length > 0 && (
              <div className="space-y-2">
                <Label>Parent Item (for dependent dropdowns)</Label>
                <Select value={itemParentId} onValueChange={setItemParentId}>
                  <SelectTrigger><SelectValue placeholder="None (root item)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">None (root item)</SelectItem>
                    {parentOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={itemStatus} onValueChange={setItemStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sort Order</Label>
                <Input type="number" value={itemSortOrder} onChange={e => setItemSortOrder(Number(e.target.value))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveItem}>{editItem ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
