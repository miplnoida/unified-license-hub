import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useRegulator } from '@/contexts/RegulatorContext';

const ACTION_LABELS: Record<string, string> = {
  suspension: 'Suspension',
  revocation: 'Revocation',
  cancellation: 'Cancellation',
  reinstatement: 'Reinstatement',
  status_change: 'Status Change',
};

interface ConfigRow {
  id: string;
  regulator_id: string | null;
  sector_id: string | null;
  sub_sector_id: string | null;
  category_id: string | null;
  license_action_type: string;
  form_template_id: string;
  is_required: boolean;
  is_active: boolean;
  created_at: string;
}

export default function LicenseActionFormsPage() {
  const { user } = useAuth();
  const { activeRegulatorId } = useRegulator();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ConfigRow | null>(null);
  const [creating, setCreating] = useState(false);

  // Internal forms (including legacy "internal" and the new "internal_license_action"),
  // plus post_license templates which are also valid here.
  const { data: tplInternalLA = [] } = useFormTemplates('internal_license_action');
  const { data: tplInternal = [] } = useFormTemplates('internal');
  const { data: tplPost = [] } = useFormTemplates('post_license');
  const templates = [...tplInternalLA, ...tplInternal, ...tplPost];

  const { data: sectors = [] } = useQuery({
    queryKey: ['sectors-all'],
    queryFn: async () => (await supabase.from('sectors').select('id, name').order('name')).data || [],
  });
  const { data: subSectors = [] } = useQuery({
    queryKey: ['sub-sectors-all'],
    queryFn: async () => (await supabase.from('sub_sectors').select('id, name, sector_id').order('name')).data || [],
  });
  const { data: categories = [] } = useQuery({
    queryKey: ['categories-all'],
    queryFn: async () => (await supabase.from('categories').select('id, name, sub_sector_id').order('name')).data || [],
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['license_action_form_configs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('license_action_form_configs')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ConfigRow[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (input: Partial<ConfigRow> & { id?: string }) => {
      const payload: any = {
        regulator_id: input.regulator_id || null,
        sector_id: input.sector_id || null,
        sub_sector_id: input.sub_sector_id || null,
        category_id: input.category_id || null,
        license_action_type: input.license_action_type,
        form_template_id: input.form_template_id,
        is_required: input.is_required ?? true,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { error } = await supabase.from('license_action_form_configs').update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('license_action_form_configs').insert({ ...payload, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license_action_form_configs'] });
      toast.success('Configuration saved');
      setEditing(null); setCreating(false);
    },
    onError: (e: any) => toast.error(e?.message || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('license_action_form_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['license_action_form_configs'] });
      toast.success('Configuration removed');
    },
    onError: (e: any) => toast.error(e?.message || 'Delete failed'),
  });

  const lookupName = (list: any[], id: string | null) => id ? (list.find((r: any) => r.id === id)?.name ?? '—') : 'Any';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="License Action Forms"
          description="Map internal forms to license actions (Suspend, Revoke, Cancel, Reinstate)."
          actions={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" />New Mapping</Button>}
        />

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No mappings yet. Add one to gate license actions behind an internal form.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Action</TableHead>
                    <TableHead>Form Template</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{ACTION_LABELS[r.license_action_type] || r.license_action_type}</TableCell>
                      <TableCell>{templates.find((t: any) => t.id === r.form_template_id)?.name || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        Sec: {lookupName(sectors as any[], r.sector_id)} ·
                        Sub: {lookupName(subSectors as any[], r.sub_sector_id)} ·
                        Cat: {lookupName(categories as any[], r.category_id)}
                      </TableCell>
                      <TableCell>{r.is_required ? <Badge>Required</Badge> : <Badge variant="outline">Optional</Badge>}</TableCell>
                      <TableCell>{r.is_active ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                      <TableCell className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => { if (confirm('Delete this mapping?')) deleteMutation.mutate(r.id); }}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <EditDialog
        open={creating || !!editing}
        initial={editing}
        templates={templates as any[]}
        sectors={sectors as any[]}
        subSectors={subSectors as any[]}
        categories={categories as any[]}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSave={(v) => saveMutation.mutate({ ...v, id: editing?.id, regulator_id: activeRegulatorId })}
        saving={saveMutation.isPending}
      />
    </DashboardLayout>
  );
}

function EditDialog({ open, initial, templates, sectors, subSectors, categories, onClose, onSave, saving }: {
  open: boolean;
  initial: ConfigRow | null;
  templates: any[];
  sectors: any[];
  subSectors: any[];
  categories: any[];
  onClose: () => void;
  onSave: (v: Partial<ConfigRow>) => void;
  saving: boolean;
}) {
  const [actionType, setActionType] = useState(initial?.license_action_type || 'suspension');
  const [templateId, setTemplateId] = useState(initial?.form_template_id || '');
  const [sectorId, setSectorId] = useState<string>(initial?.sector_id || 'any');
  const [subSectorId, setSubSectorId] = useState<string>(initial?.sub_sector_id || 'any');
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id || 'any');
  const [isRequired, setIsRequired] = useState(initial?.is_required ?? true);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);

  useEffect(() => {
    if (!open) return;
    setActionType(initial?.license_action_type || 'suspension');
    setTemplateId(initial?.form_template_id || '');
    setSectorId(initial?.sector_id || 'any');
    setSubSectorId(initial?.sub_sector_id || 'any');
    setCategoryId(initial?.category_id || 'any');
    setIsRequired(initial?.is_required ?? true);
    setIsActive(initial?.is_active ?? true);
  }, [open, initial?.id]);


  const filteredSubSectors = sectorId === 'any' ? subSectors : subSectors.filter(s => s.sector_id === sectorId);
  const filteredCategories = subSectorId === 'any' ? categories : categories.filter(c => c.sub_sector_id === subSectorId);

  const submit = () => {
    if (!templateId) { toast.error('Select a form template'); return; }
    onSave({
      license_action_type: actionType,
      form_template_id: templateId,
      sector_id: sectorId === 'any' ? null : sectorId,
      sub_sector_id: subSectorId === 'any' ? null : subSectorId,
      category_id: categoryId === 'any' ? null : categoryId,
      is_required: isRequired,
      is_active: isActive,
    });
  };


  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Mapping' : 'New Mapping'}</DialogTitle>
          <DialogDescription>Pick the action and the internal form to require.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Action Type</Label>
            <Select value={actionType} onValueChange={setActionType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Form Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger><SelectValue placeholder="Select a form" /></SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} <span className="text-xs text-muted-foreground">({t.form_type})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Regulator</Label>
              <Select value={regulatorId} onValueChange={setRegulatorId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {regulators.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sector</Label>
              <Select value={sectorId} onValueChange={(v) => { setSectorId(v); setSubSectorId('any'); setCategoryId('any'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-Sector</Label>
              <Select value={subSectorId} onValueChange={(v) => { setSubSectorId(v); setCategoryId('any'); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {filteredSubSectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-6 pt-2">
            <div className="flex items-center gap-2">
              <Switch checked={isRequired} onCheckedChange={setIsRequired} id="req" />
              <Label htmlFor="req">Required</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} id="act" />
              <Label htmlFor="act">Active</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
