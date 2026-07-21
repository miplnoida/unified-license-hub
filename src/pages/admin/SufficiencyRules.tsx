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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';

const RULE_TYPES = [
  { value: 'form_submitted', label: 'Required form submitted' },
  { value: 'document_uploaded', label: 'Required document uploaded' },
  { value: 'field_present', label: 'Field value present' },
  { value: 'fee_paid', label: 'Fee paid' },
  { value: 'declaration_answered', label: 'Declaration answered' },
  { value: 'risk_flag_present', label: 'Risk flag present' },
  { value: 'ai_flag_review', label: 'AI flag requires review' },
  { value: 'regulator_clearance', label: 'Regulator clearance required' },
];

type Rule = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rule_type: string;
  config: Record<string, any>;
  severity: 'blocker' | 'warning' | 'info';
  auto_rfi: boolean;
  rfi_prompt_template: string | null;
  rfi_question_type: 'text' | 'document' | 'both';
  is_active: boolean;
};

const emptyForm: Partial<Rule> = {
  code: '', name: '', description: '', rule_type: 'form_submitted',
  config: {}, severity: 'blocker', auto_rfi: true, rfi_prompt_template: '',
  rfi_question_type: 'text', is_active: true,
};

export default function SufficiencyRules() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Rule>>(emptyForm);
  const [configText, setConfigText] = useState('{}');

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['sufficiency_rules'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sufficiency_rules' as any).select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as unknown as Rule[];
    },
  });

  const startNew = () => { setEditing(emptyForm); setConfigText('{}'); setOpen(true); };
  const startEdit = (r: Rule) => { setEditing(r); setConfigText(JSON.stringify(r.config || {}, null, 2)); setOpen(true); };

  const save = async () => {
    try {
      const cfg = JSON.parse(configText || '{}');
      const payload = { ...editing, config: cfg };
      if ((editing as any).id) {
        const { error } = await supabase.from('sufficiency_rules' as any).update(payload).eq('id', (editing as any).id);
        if (error) throw error;
        await logAction('sufficiency_rule.updated', 'sufficiency_rule', (editing as any).id, { after: payload });
      } else {
        const { data, error } = await supabase.from('sufficiency_rules' as any).insert(payload).select().single();
        if (error) throw error;
        await logAction('sufficiency_rule.created', 'sufficiency_rule', (data as any).id, { after: payload });
      }
      toast.success('Rule saved');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['sufficiency_rules'] });
    } catch (e) { toast.error((e as Error).message); }
  };

  const del = async (r: Rule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    const { error } = await supabase.from('sufficiency_rules' as any).delete().eq('id', r.id);
    if (error) return toast.error(error.message);
    await logAction('sufficiency_rule.deleted', 'sufficiency_rule', r.id, { before: r });
    toast.success('Deleted');
    qc.invalidateQueries({ queryKey: ['sufficiency_rules'] });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Sufficiency Rules"
          description="Reusable rules that automate application sufficiency review."
          actions={<Button data-rbac="application_management.create" onClick={startNew}><Plus className="mr-2 h-4 w-4" />New Rule</Button>}
        />
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Auto-RFI</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{RULE_TYPES.find(t => t.value === r.rule_type)?.label || r.rule_type}</TableCell>
                      <TableCell><Badge variant={r.severity === 'blocker' ? 'destructive' : r.severity === 'warning' ? 'default' : 'secondary'}>{r.severity}</Badge></TableCell>
                      <TableCell>{r.auto_rfi ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{r.is_active ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => del(r)}><Trash2 className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rules.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No rules yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{(editing as any).id ? 'Edit' : 'New'} Sufficiency Rule</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Code</Label><Input value={editing.code || ''} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
                <div><Label>Name</Label><Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              </div>
              <div><Label>Description</Label><Textarea value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Rule Type</Label>
                  <Select value={editing.rule_type} onValueChange={(v) => setEditing({ ...editing, rule_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RULE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Severity</Label>
                  <Select value={editing.severity} onValueChange={(v: any) => setEditing({ ...editing, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blocker">Blocker</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Config (JSON)</Label>
                <Textarea rows={5} className="font-mono text-xs" value={configText} onChange={(e) => setConfigText(e.target.value)} placeholder='{"form_template_id":"..."}' />
                <p className="text-xs text-muted-foreground mt-1">
                  Common keys: form_template_id, document_group_id, document_type, field_path, expected, min_amount, regulator_id.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><Checkbox checked={editing.auto_rfi} onCheckedChange={(v) => setEditing({ ...editing, auto_rfi: !!v })} /><Label>Auto-generate RFI on failure</Label></div>
                <div className="flex items-center gap-2"><Checkbox checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: !!v })} /><Label>Active</Label></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>RFI Prompt Template</Label><Textarea value={editing.rfi_prompt_template || ''} onChange={(e) => setEditing({ ...editing, rfi_prompt_template: e.target.value })} /></div>
                <div>
                  <Label>RFI Question Type</Label>
                  <Select value={editing.rfi_question_type} onValueChange={(v: any) => setEditing({ ...editing, rfi_question_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button data-rbac="application_management.edit" onClick={save}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
