import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { AppRole, ROLE_LABELS, ROLE_HIERARCHY } from '@/types/platform';
import { Layers, Plus, Trash2, Loader2, Calendar, UserCheck } from 'lucide-react';

interface DelegationRule {
  id: string;
  name: string;
  description: string | null;
  condition: { field: string; operator: string; value: string };
  target_role: AppRole;
  target_user_id: string | null;
  delegate_from_user_id: string | null;
  delegate_to_user_id: string | null;
  effective_from: string | null;
  effective_until: string | null;
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
  const [activeTab, setActiveTab] = useState('routing');
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);

  // Routing rule form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [condField, setCondField] = useState('amount');
  const [condOp, setCondOp] = useState('>');
  const [condValue, setCondValue] = useState('');
  const [targetRole, setTargetRole] = useState<AppRole>('supervisor');
  const [creating, setCreating] = useState(false);

  // Date-range delegation form
  const [delegateName, setDelegateName] = useState('');
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveUntil, setEffectiveUntil] = useState('');
  const [delegateDialogOpen, setDelegateDialogOpen] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    const { data } = await supabase.from('delegation_rules').select('*').order('created_at', { ascending: false });
    setRules((data || []) as any);
    setLoading(false);
  };

  const loadUsers = async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, email').eq('status', 'active').order('full_name');
    setUsers((data || []) as any[]);
  };

  useEffect(() => { loadRules(); loadUsers(); }, []);

  // Check and auto-expire delegation rules at runtime
  useEffect(() => {
    const now = new Date().toISOString();
    const expired = rules.filter(r => r.effective_until && r.effective_until < now && r.is_active && r.delegate_from_user_id);
    expired.forEach(async (rule) => {
      await supabase.from('delegation_rules').update({ is_active: false } as any).eq('id', rule.id);
      await logAudit({
        action: 'delegation_rule_auto_expired',
        entityType: 'delegation_rule',
        entityId: rule.id,
        newValue: { expired_at: now },
      });
    });
    if (expired.length > 0) {
      loadRules();
      toast.info(`${expired.length} delegation rule(s) have expired and been deactivated.`);
    }
  }, [rules.length]);

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

  const handleCreateDateDelegation = async () => {
    if (!delegateName.trim() || !fromUserId || !toUserId || !effectiveFrom || !effectiveUntil) {
      toast.error('Please fill all required fields');
      return;
    }
    if (fromUserId === toUserId) {
      toast.error('From and To users must be different');
      return;
    }
    if (new Date(effectiveUntil) <= new Date(effectiveFrom)) {
      toast.error('End date must be after start date');
      return;
    }
    setCreating(true);
    const { error } = await supabase.from('delegation_rules').insert({
      name: delegateName.trim(),
      description: `Role transfer: ${effectiveFrom} to ${effectiveUntil}`,
      condition: { field: 'delegation_type', operator: '==', value: 'date_range' },
      target_role: 'supervisor' as AppRole,
      delegate_from_user_id: fromUserId,
      delegate_to_user_id: toUserId,
      effective_from: new Date(effectiveFrom).toISOString(),
      effective_until: new Date(effectiveUntil).toISOString(),
      is_active: true,
    } as any);

    if (error) { toast.error(error.message); setCreating(false); return; }

    await logAudit({
      action: 'delegation_date_range_created',
      entityType: 'delegation_rule',
      newValue: { from_user: fromUserId, to_user: toUserId, effective_from: effectiveFrom, effective_until: effectiveUntil },
    });
    toast.success('Date-range delegation created');
    setDelegateDialogOpen(false);
    setDelegateName(''); setFromUserId(''); setToUserId(''); setEffectiveFrom(''); setEffectiveUntil('');
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

  const routingRules = rules.filter(r => !r.delegate_from_user_id);
  const dateRules = rules.filter(r => !!r.delegate_from_user_id);

  const getUserName = (id: string | null) => {
    if (!id) return '—';
    const u = users.find(u => u.id === id);
    return u ? u.full_name : id.substring(0, 8);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Delegation Rules"
          description="Configure automatic routing rules and date-based role transfers"
        />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="routing">Routing Rules</TabsTrigger>
            <TabsTrigger value="transfers">Role Transfers</TabsTrigger>
          </TabsList>

          <TabsContent value="routing" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Plus className="h-4 w-4 mr-2" />New Routing Rule</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Create Routing Rule</DialogTitle></DialogHeader>
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
            </div>

            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : routingRules.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Layers className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No routing rules configured</p>
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
                      {routingRules.map(rule => (
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
                          <TableCell><Badge variant="outline">{ROLE_LABELS[rule.target_role]}</Badge></TableCell>
                          <TableCell><Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule)} /></TableCell>
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
          </TabsContent>

          <TabsContent value="transfers" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={delegateDialogOpen} onOpenChange={setDelegateDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Calendar className="h-4 w-4 mr-2" />New Role Transfer</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>Create Date-Range Role Transfer</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div><Label>Name *</Label><Input value={delegateName} onChange={e => setDelegateName(e.target.value)} placeholder="e.g., User A leave coverage" /></div>
                    <div>
                      <Label>Transfer From (Absent User) *</Label>
                      <Select value={fromUserId} onValueChange={setFromUserId}>
                        <SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger>
                        <SelectContent>
                          {users.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Transfer To (Covering User) *</Label>
                      <Select value={toUserId} onValueChange={setToUserId}>
                        <SelectTrigger><SelectValue placeholder="Select user..." /></SelectTrigger>
                        <SelectContent>
                          {users.filter(u => u.id !== fromUserId).map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.full_name} ({u.email})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>From Date *</Label><Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} /></div>
                      <div><Label>Until Date *</Label><Input type="date" value={effectiveUntil} onChange={e => setEffectiveUntil(e.target.value)} /></div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      During the specified period, the covering user will assume the absent user's roles. Roles auto-revert after the end date.
                    </p>
                    <Button onClick={handleCreateDateDelegation} disabled={creating} className="w-full">
                      {creating ? 'Creating...' : 'Create Transfer'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : dateRules.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No role transfers configured</p>
                    <p className="text-sm mt-1">Create a date-range transfer for leave coverage</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>From User</TableHead>
                        <TableHead>To User</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dateRules.map(rule => {
                        const now = new Date();
                        const from = rule.effective_from ? new Date(rule.effective_from) : null;
                        const until = rule.effective_until ? new Date(rule.effective_until) : null;
                        const isExpired = until && until < now;
                        const isActive = rule.is_active && from && until && from <= now && now <= until;
                        const isPending = rule.is_active && from && from > now;
                        return (
                          <TableRow key={rule.id} className={isExpired ? 'opacity-60' : ''}>
                            <TableCell>
                              <p className="font-medium">{rule.name}</p>
                            </TableCell>
                            <TableCell>{getUserName(rule.delegate_from_user_id)}</TableCell>
                            <TableCell>{getUserName(rule.delegate_to_user_id)}</TableCell>
                            <TableCell className="text-xs">
                              {from ? from.toLocaleDateString() : '—'} — {until ? until.toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell>
                              {isExpired ? (
                                <Badge variant="outline" className="text-muted-foreground">Expired</Badge>
                              ) : isActive ? (
                                <Badge variant="approved">Active</Badge>
                              ) : isPending ? (
                                <Badge variant="pending">Pending</Badge>
                              ) : (
                                <Badge variant="outline">Inactive</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(rule.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
