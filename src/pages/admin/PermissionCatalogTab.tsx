import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Edit, Trash2, FolderTree, Zap, Info, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCatalogModules, useCatalogActions,
  useUpsertModule, useDeleteModule,
  useUpsertAction, useDeleteAction,
  CatalogModule, CatalogAction,
} from '@/hooks/usePermissionCatalog';

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Catalog tab — admin-managed Modules → Sub-modules → Actions.
 * Route mapping is developer-owned and intentionally not exposed here.
 */
export default function PermissionCatalogTab() {
  const { data: modules = [] } = useCatalogModules();
  const { data: actions = [] } = useCatalogActions();

  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [moduleDialogOpen, setModuleDialogOpen] = useState(false);
  const [editingModule, setEditingModule] = useState<CatalogModule | null>(null);
  const [editingParentId, setEditingParentId] = useState<string | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [editingAction, setEditingAction] = useState<CatalogAction | null>(null);

  const upsertModule = useUpsertModule();
  const deleteModule = useDeleteModule();
  const upsertAction = useUpsertAction();
  const deleteAction = useDeleteAction();

  const rootModules = useMemo(() => modules.filter(m => !m.parent_id), [modules]);
  const childrenOf = (id: string) => modules.filter(m => m.parent_id === id);
  const actionsFor = (mid: string) => actions.filter(a => a.module_id === mid);


  const selectedModule = modules.find(m => m.id === selectedModuleId) || null;

  const openCreateModule = (parentId: string | null) => {
    setEditingModule(null); setEditingParentId(parentId); setModuleDialogOpen(true);
  };
  const openEditModule = (m: CatalogModule) => {
    setEditingModule(m); setEditingParentId(m.parent_id); setModuleDialogOpen(true);
  };

  const handleDeleteModule = (m: CatalogModule) => {
    if (m.is_system) { toast.error('System modules cannot be deleted'); return; }
    if (!confirm(`Delete module "${m.label}"? This removes all sub-modules and actions.`)) return;
    deleteModule.mutate(m.id);
    if (selectedModuleId === m.id) setSelectedModuleId(null);
  };

  const handleDeleteAction = (a: CatalogAction) => {
    if (a.is_system) { toast.error('System actions cannot be deleted'); return; }
    if (!confirm(`Delete action "${a.label}"?`)) return;
    deleteAction.mutate(a.id);
  };

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Permission catalog</AlertTitle>
        <AlertDescription>
          Define the tree of modules and sub-modules and the actions inside each.
          Roles in the next tab pick from this catalog.
        </AlertDescription>

      </Alert>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Module tree */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><FolderTree className="h-4 w-4" /> Modules</CardTitle>
              <CardDescription>Top-level modules and their sub-modules</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => openCreateModule(null)}>
              <Plus className="h-4 w-4 mr-1" />Module
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {rootModules.map(m => (
              <ModuleRow
                key={m.id}
                module={m}
                selected={selectedModuleId === m.id}
                onSelect={() => setSelectedModuleId(m.id)}
                onEdit={() => openEditModule(m)}
                onDelete={() => handleDeleteModule(m)}
                onAddChild={() => openCreateModule(m.id)}
                children={childrenOf(m.id).map(c => (
                  <ModuleRow
                    key={c.id}
                    module={c}
                    nested
                    selected={selectedModuleId === c.id}
                    onSelect={() => setSelectedModuleId(c.id)}
                    onEdit={() => openEditModule(c)}
                    onDelete={() => handleDeleteModule(c)}
                  />
                ))}
              />
            ))}
            {rootModules.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No modules yet</p>
            )}
          </CardContent>
        </Card>

        {/* Detail pane */}
        <div className="lg:col-span-2 space-y-6">
          {selectedModule ? (
            <>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4" /> Actions in {selectedModule.label}</CardTitle>
                    <CardDescription>Operations users can be granted on this module</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { setEditingAction(null); setActionDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-1" />Action
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {actionsFor(selectedModule.id).map(a => (
                      <div key={a.id} className="flex items-center justify-between border rounded-md p-2">
                        <div>
                          <div className="font-medium text-sm flex items-center gap-2">
                            {a.label}
                            {a.is_system && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />system</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono">{a.key}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditingAction(a); setActionDialogOpen(true); }}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          {!a.is_system && (
                            <Button size="sm" variant="ghost" onClick={() => handleDeleteAction(a)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {actionsFor(selectedModule.id).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No actions defined</p>
                    )}
                  </div>
                </CardContent>
              </Card>

            </>
          ) : (
            <Card><CardContent className="py-10 text-center text-muted-foreground">Select a module to edit its actions</CardContent></Card>
          )}
        </div>
      </div>


      {/* Module dialog */}
      <Dialog open={moduleDialogOpen} onOpenChange={setModuleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingModule ? 'Edit module' : 'New module'}</DialogTitle>
            <DialogDescription>Keys must be lowercase letters, numbers and underscores.</DialogDescription>
          </DialogHeader>
          <ModuleForm
            module={editingModule}
            parentId={editingParentId}
            modules={modules}
            onCancel={() => setModuleDialogOpen(false)}
            onSave={async (values) => {
              await upsertModule.mutateAsync({ id: editingModule?.id, ...values });
              setModuleDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Action dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAction ? 'Edit action' : 'New action'}</DialogTitle>
            <DialogDescription>Keys are lowercase letters / numbers / underscores.</DialogDescription>
          </DialogHeader>
          {selectedModule && (
            <ActionForm
              action={editingAction}
              onCancel={() => setActionDialogOpen(false)}
              onSave={async (values) => {
                await upsertAction.mutateAsync({
                  id: editingAction?.id,
                  module_id: selectedModule.id,
                  module_key: selectedModule.key,
                  ...values,
                });
                setActionDialogOpen(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ModuleRow({
  module: m, nested, selected, onSelect, onEdit, onDelete, onAddChild, children,
}: {
  module: CatalogModule;
  nested?: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={nested ? 'ml-5' : ''}>
      <div className={`flex items-center justify-between rounded-md border px-2 py-1.5 ${selected ? 'bg-muted border-primary' : ''}`}>
        <button className="text-left flex-1 min-w-0" onClick={onSelect}>
          <div className="text-sm font-medium flex items-center gap-2">
            {m.label}
            {m.is_system && <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />system</Badge>}
          </div>
          <div className="text-xs font-mono text-muted-foreground truncate">{m.key}</div>
        </button>
        <div className="flex gap-0.5">
          {onAddChild && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onAddChild} title="Add sub-module">
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Edit className="h-3.5 w-3.5" /></Button>
          {!m.is_system && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
          )}
        </div>
      </div>
      {children && <div className="mt-1 space-y-1">{children}</div>}
    </div>
  );
}

function ModuleForm({
  module: m, parentId, modules, onCancel, onSave,
}: {
  module: CatalogModule | null;
  parentId: string | null;
  modules: CatalogModule[];
  onCancel: () => void;
  onSave: (v: { key: string; label: string; description?: string | null; parent_id?: string | null; sort_order?: number }) => Promise<void>;
}) {
  const [key, setKey] = useState(m?.key || '');
  const [label, setLabel] = useState(m?.label || '');
  const [description, setDescription] = useState(m?.description || '');
  const [parent, setParent] = useState<string>(m?.parent_id || parentId || 'none');
  const [sortOrder, setSortOrder] = useState(m?.sort_order ?? 100);

  const parentOptions = modules.filter(x => !x.parent_id && x.id !== m?.id);

  const submit = async () => {
    if (!KEY_PATTERN.test(key)) { toast.error('Key must be lowercase letters/numbers/underscores'); return; }
    if (!label.trim()) { toast.error('Label is required'); return; }
    await onSave({
      key, label, description: description || null,
      parent_id: parent === 'none' ? null : parent,
      sort_order: sortOrder,
    });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Key</Label>
        <Input value={key} onChange={e => setKey(e.target.value)} placeholder="fit_and_proper" disabled={!!m?.is_system} className="font-mono" />
      </div>
      <div>
        <Label>Label</Label>
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Fit & Proper" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
      </div>
      <div>
        <Label>Parent module</Label>
        <Select value={parent} onValueChange={setParent}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Top level —</SelectItem>
            {parentOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Sort order</Label>
        <Input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit}>Save</Button>
      </DialogFooter>
    </div>
  );
}

function ActionForm({
  action: a, onCancel, onSave,
}: {
  action: CatalogAction | null;
  onCancel: () => void;
  onSave: (v: { key: string; label: string; description?: string | null; sort_order?: number }) => Promise<void>;
}) {
  const [key, setKey] = useState(a?.key || '');
  const [label, setLabel] = useState(a?.label || '');
  const [description, setDescription] = useState(a?.description || '');
  const [sortOrder, setSortOrder] = useState(a?.sort_order ?? 100);

  const submit = async () => {
    if (!KEY_PATTERN.test(key)) { toast.error('Key must be lowercase letters/numbers/underscores'); return; }
    if (!label.trim()) { toast.error('Label is required'); return; }
    await onSave({ key, label, description: description || null, sort_order: sortOrder });
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>Key</Label>
        <Input value={key} onChange={e => setKey(e.target.value)} placeholder="override_ai_recommendation" disabled={!!a?.is_system} className="font-mono" />
      </div>
      <div>
        <Label>Label</Label>
        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Override AI Recommendation" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
      </div>
      <div>
        <Label>Sort order</Label>
        <Input type="number" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit}>Save</Button>
      </DialogFooter>
    </div>
  );
}
