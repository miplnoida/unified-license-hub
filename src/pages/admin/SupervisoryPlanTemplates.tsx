import { useEffect, useState, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Target, Pencil } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string | null;
  sector_id: string | null;
  is_active: boolean;
}

interface Action {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  owner_role: string | null;
  offset_days: number;
  sort_order: number;
}

export default function SupervisoryPlanTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [sectors, setSectors] = useState<Array<{ id: string; name: string }>>([]);
  const [actionsByTpl, setActionsByTpl] = useState<Record<string, Action[]>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [showActionEdit, setShowActionEdit] = useState<{ templateId: string; action: Action | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [tRes, aRes, sRes] = await Promise.all([
      supabase.from('supervisory_plan_templates' as any).select('*').order('created_at', { ascending: false }),
      supabase.from('supervisory_plan_template_actions' as any).select('*').order('sort_order'),
      supabase.from('sectors').select('id, name').order('name'),
    ]);
    setTemplates(((tRes.data as any) || []));
    setSectors(((sRes.data as any) || []));
    const map: Record<string, Action[]> = {};
    ((aRes.data as any[]) || []).forEach((a: Action) => {
      (map[a.template_id] ||= []).push(a);
    });
    setActionsByTpl(map);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveTemplate = async (t: Partial<Template>) => {
    if (!t.name?.trim()) { toast.error('Name required'); return; }
    const payload = {
      name: t.name.trim(),
      description: t.description?.trim() || null,
      sector_id: t.sector_id || null,
      is_active: t.is_active ?? true,
    };
    const { error } = t.id
      ? await supabase.from('supervisory_plan_templates' as any).update(payload).eq('id', t.id)
      : await supabase.from('supervisory_plan_templates' as any).insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved');
    setShowEdit(false); setEditing(null);
    load();
  };

  const removeTemplate = async (id: string) => {
    if (!confirm('Delete this template and all its actions?')) return;
    const { error } = await supabase.from('supervisory_plan_templates' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const saveAction = async (a: Partial<Action> & { template_id: string }) => {
    if (!a.title?.trim()) { toast.error('Title required'); return; }
    const payload = {
      template_id: a.template_id,
      title: a.title.trim(),
      description: a.description?.trim() || null,
      owner_role: a.owner_role?.trim() || null,
      offset_days: Number(a.offset_days || 90),
      sort_order: Number(a.sort_order || 0),
    };
    const { error } = a.id
      ? await supabase.from('supervisory_plan_template_actions' as any).update(payload).eq('id', a.id)
      : await supabase.from('supervisory_plan_template_actions' as any).insert(payload);
    if (error) { toast.error(error.message); return; }
    setShowActionEdit(null);
    load();
  };

  const removeAction = async (id: string) => {
    if (!confirm('Delete this action?')) return;
    const { error } = await supabase.from('supervisory_plan_template_actions' as any).delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader
          title="Supervisory Plan Templates"
          description="Per-sector templates seeded into a new supervisory plan when an application is approved."
          icon={<Target className="h-5 w-5" />}
          actions={
            <Button onClick={() => { setEditing({ id: '', name: '', description: '', sector_id: null, is_active: true } as Template); setShowEdit(true); }}>
              <Plus className="h-4 w-4 mr-1" /> New template
            </Button>
          }
        />

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : templates.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            No templates yet. Create one to seed future approvals.
          </CardContent></Card>
        ) : (
          <div className="grid gap-4">
            {templates.map(t => (
              <Card key={t.id}>
                <CardHeader className="pb-3 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {t.name}
                      {!t.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                      <Badge variant="secondary" className="text-xs">
                        {t.sector_id ? sectors.find(s => s.id === t.sector_id)?.name || 'Sector' : 'Global (all sectors)'}
                      </Badge>
                    </CardTitle>
                    {t.description && <p className="text-sm text-muted-foreground mt-1">{t.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setShowEdit(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => removeTemplate(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(actionsByTpl[t.id] || []).map(a => (
                    <div key={a.id} className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{a.title}</div>
                        {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                      </div>
                      {a.owner_role && <Badge variant="outline" className="text-xs">{a.owner_role}</Badge>}
                      <span className="text-xs text-muted-foreground">+{a.offset_days}d</span>
                      <Button size="sm" variant="ghost" onClick={() => setShowActionEdit({ templateId: t.id, action: a })}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => removeAction(a.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setShowActionEdit({ templateId: t.id, action: null })}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add action
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Template editor */}
      {editing && (
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing.id ? 'Edit' : 'New'} template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name *</Label>
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div>
                <Label>Sector</Label>
                <Select value={editing.sector_id || 'none'} onValueChange={(v) => setEditing({ ...editing, sector_id: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Global (all sectors)</SelectItem>
                    {sectors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
              <Button onClick={() => saveTemplate(editing)}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Action editor */}
      {showActionEdit && (
        <ActionEditor
          templateId={showActionEdit.templateId}
          action={showActionEdit.action}
          onClose={() => setShowActionEdit(null)}
          onSave={saveAction}
        />
      )}
    </DashboardLayout>
  );
}

function ActionEditor({ templateId, action, onClose, onSave }: {
  templateId: string;
  action: Action | null;
  onClose: () => void;
  onSave: (a: any) => void;
}) {
  const [form, setForm] = useState({
    id: action?.id || '',
    template_id: templateId,
    title: action?.title || '',
    description: action?.description || '',
    owner_role: action?.owner_role || '',
    offset_days: action?.offset_days ?? 90,
    sort_order: action?.sort_order ?? 0,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>{action ? 'Edit' : 'New'} action</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Owner role</Label>
              <Input value={form.owner_role} onChange={(e) => setForm({ ...form, owner_role: e.target.value })} placeholder="e.g. Supervisor" />
            </div>
            <div>
              <Label>Days after issuance</Label>
              <Input type="number" min={1} value={form.offset_days}
                onChange={(e) => setForm({ ...form, offset_days: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Sort</Label>
              <Input type="number" value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
