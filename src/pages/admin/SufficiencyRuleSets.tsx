import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { Badge } from '@/components/ui/badge';

type RuleSet = {
  id: string; name: string; description: string | null;
  application_type: string | null; license_type: string | null;
  sector_id: string | null; sub_sector_id: string | null; category_id: string | null;
  priority: number; is_active: boolean;
};

type Item = { id: string; rule_set_id: string; rule_id: string; severity_override: string | null; ordinal: number };

const empty: Partial<RuleSet> = { name: '', description: '', priority: 100, is_active: true };

export default function SufficiencyRuleSets() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<RuleSet>>(empty);
  const [manageId, setManageId] = useState<string | null>(null);

  const { data: sets = [], isLoading } = useQuery({
    queryKey: ['sufficiency_rule_sets'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sufficiency_rule_sets' as any).select('*').order('priority', { ascending: false });
      if (error) throw error;
      return data as unknown as RuleSet[];
    },
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['sufficiency_rules_all'],
    queryFn: async () => {
      const { data } = await supabase.from('sufficiency_rules' as any).select('id,name,code,severity,rule_type').eq('is_active', true);
      return (data || []) as any[];
    },
  });

  const { data: items = [], refetch: refetchItems } = useQuery({
    queryKey: ['suff_set_items', manageId],
    enabled: !!manageId,
    queryFn: async () => {
      const { data } = await supabase.from('sufficiency_rule_set_items' as any).select('*').eq('rule_set_id', manageId!).order('ordinal');
      return (data || []) as unknown as Item[];
    },
  });

  const save = async () => {
    try {
      if ((editing as any).id) {
        await supabase.from('sufficiency_rule_sets' as any).update(editing).eq('id', (editing as any).id);
        await logAction('sufficiency_rule_set.updated', 'sufficiency_rule_set', (editing as any).id, { after: editing });
      } else {
        const { data, error } = await supabase.from('sufficiency_rule_sets' as any).insert(editing).select().single();
        if (error) throw error;
        await logAction('sufficiency_rule_set.created', 'sufficiency_rule_set', (data as any).id, { after: editing });
      }
      toast.success('Saved');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['sufficiency_rule_sets'] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const del = async (s: RuleSet) => {
    if (!confirm(`Delete set "${s.name}"?`)) return;
    await supabase.from('sufficiency_rule_sets' as any).delete().eq('id', s.id);
    await logAction('sufficiency_rule_set.deleted', 'sufficiency_rule_set', s.id, { before: s });
    qc.invalidateQueries({ queryKey: ['sufficiency_rule_sets'] });
  };

  const addRule = async (rule_id: string) => {
    if (!manageId) return;
    if (items.some((i) => i.rule_id === rule_id)) return toast.error('Already added');
    await supabase.from('sufficiency_rule_set_items' as any).insert({ rule_set_id: manageId, rule_id, ordinal: items.length + 1 });
    refetchItems();
  };
  const removeItem = async (id: string) => {
    await supabase.from('sufficiency_rule_set_items' as any).delete().eq('id', id);
    refetchItems();
  };

  const managedSet = sets.find((s) => s.id === manageId);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Sufficiency Rule Sets"
          description="Bundle rules and scope them to application/license types."
          actions={<Button data-rbac="application_management.create" onClick={() => { setEditing(empty); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />New Rule Set</Button>}
        />
        <Card>
          <CardContent className="pt-6">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Name</TableHead><TableHead>Application Type</TableHead><TableHead>License Type</TableHead>
                  <TableHead>Priority</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {sets.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.application_type || '—'}</TableCell>
                      <TableCell>{s.license_type || '—'}</TableCell>
                      <TableCell>{s.priority}</TableCell>
                      <TableCell>{s.is_active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setManageId(s.id)}><Settings2 className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => del(s)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {sets.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No rule sets yet.</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>{(editing as any).id ? 'Edit' : 'New'} Rule Set</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Application Type</Label><Input value={editing.application_type || ''} onChange={(e) => setEditing({ ...editing, application_type: e.target.value || null })} placeholder="e.g. new_license" /></div>
                <div><Label>License Type</Label><Input value={editing.license_type || ''} onChange={(e) => setEditing({ ...editing, license_type: e.target.value || null })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Priority</Label><Input type="number" value={editing.priority || 100} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} /></div>
                <div className="flex items-end gap-2"><Checkbox checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: !!v })} /><Label>Active</Label></div>
              </div>
            </div>
            <DialogFooter><Button data-rbac="application_management.edit" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!manageId} onOpenChange={(v) => !v && setManageId(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Manage Rules — {managedSet?.name}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Add Rule</Label>
                <Select onValueChange={addRule}>
                  <SelectTrigger><SelectValue placeholder="Pick a rule to add" /></SelectTrigger>
                  <SelectContent>
                    {rules.filter((r: any) => !items.some((i) => i.rule_id === r.id)).map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name} ({r.rule_type})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Rule</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {items.map((it, i) => {
                    const r = (rules as any[]).find((x) => x.id === it.rule_id);
                    return (
                      <TableRow key={it.id}>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell>{r?.name || it.rule_id}</TableCell>
                        <TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => removeItem(it.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    );
                  })}
                  {items.length === 0 && <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">No rules in this set.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
