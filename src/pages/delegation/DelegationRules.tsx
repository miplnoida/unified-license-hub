import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { AppRole, ROLE_LABELS, ROLE_HIERARCHY } from '@/types/platform';
import { Layers, Plus, Trash2, Loader2 } from 'lucide-react';

interface DelegationRule {
  id: string;
  name: string;
  description: string | null;
  condition: {
    field: string;
    operator: string;
    value: string;
  };
  target_role: AppRole;
  target_user_id: string | null;
  is_active: boolean;
  created_at: string;
}

const operators = [
  { value: '>', label: 'Greater than' },
  { value: '<', label: 'Less than' },
  { value: '>=', label: 'Greater or equal' },
  { value: '<=', label: 'Less or equal' },
  { value: '==', label: 'Equals' },
  { value: '!=', label: 'Not equals' },
  { value: 'contains', label: 'Contains' },
];

export default function DelegationRules() {
  const [rules, setRules] = useState<DelegationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // New rule form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [condField, setCondField] = useState('amount');
  const [condOp, setCondOp] = useState('>');
  const [condValue, setCondValue] = useState('');
  const [targetRole, setTargetRole] = useState<AppRole>('supervisor');
  const [creating, setCreating] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    const { data } = await supabase.from('delegation_rules').select('*').order('created_at', { ascending: false });
    setRules((data || []) as any);
    setLoading(false);
  };

  useEffect(() => { loadRules(); }, []);

  const handleCreate = async () => {
    if (!name.trim() || !condValue.trim()) {
      toast.error('Please fill all required fields');
      return;
    }
    setCreating(true);
    const condition = { field: condField, operator: condOp, value: condValue };
    const { error } = await supabase.from('delegation_rules').insert({
      name: name.trim(),
      description: description.trim() || null,
      condition,
      target_role: targetRole,
      is_active: true,
    } as any);

    if (error) { toast.error(error.message); setCreating(false); return; }

    await logAudit({ action: 'delegation_rule_created', entityType: 'delegation_rule', newValue: { name, condition, target_role: targetRole } });
    toast.success('Delegation rule created');
    setDialogOpen(false);
    setName(''); setDescription(''); setCondField('amount'); setCondOp('>'); setCondValue('');
    setCreating(false);
    loadRules();
  };

  const handleToggle = async (rule: DelegationRule) => {
    const { error } = await supabase.from('delegation_rules').update({ is_active: !rule.is_active } as any).eq('id', rule.id);
    if (error) { toast.error(error.message); return; }
    toast.success(rule.is_active ? 'Rule deactivated' : 'Rule activated');
    loadRules();
  };

  const handleDelete = async (id: string) => {
    await supabase.from('delegation_rules').delete().eq('id', id);
    await logAudit({ action: 'delegation_rule_deleted', entityType: 'delegation_rule', entityId: id });
    toast.success('Rule deleted');
    loadRules();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Delegation Rules"
          description="Configure automatic routing rules for application approvals"
          actions={
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />New Rule</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Create Delegation Rule</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Rule Name</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., High Value Applications" /></div>
                  <div><Label>Description</Label><Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description..." /></div>

                  <div className="space-y-2">
                    <Label>Condition</Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={condField} onValueChange={setCondField}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="amount">Amount</SelectItem>
                          <SelectItem value="license_type">License Type</SelectItem>
                          <SelectItem value="sector">Sector</SelectItem>
                          <SelectItem value="risk_score">Risk Score</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={condOp} onValueChange={setCondOp}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {operators.map(op => (
                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={condValue} onChange={e => setCondValue(e.target.value)} placeholder="Value" className="text-sm" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      If {condField} {condOp} {condValue || '...'} → route to {ROLE_LABELS[targetRole]}
                    </p>
                  </div>

                  <div>
                    <Label>Route to Role</Label>
                    <Select value={targetRole} onValueChange={v => setTargetRole(v as AppRole)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROLE_HIERARCHY.filter(r => r !== 'applicant').map(r => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={handleCreate} disabled={creating} className="w-full">
                    {creating ? 'Creating...' : 'Create Rule'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          }
        />

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : rules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Layers className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No delegation rules configured</p>
                <p className="text-sm mt-1">Create rules to automatically route applications</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Route To</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map(rule => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{rule.name}</p>
                          {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {rule.condition.field} {rule.condition.operator} {rule.condition.value}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ROLE_LABELS[rule.target_role]}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule)} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(rule.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
