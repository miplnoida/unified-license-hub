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
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { toast } from 'sonner';
import { AppRole, ROLE_LABELS, ROLE_HIERARCHY } from '@/types/platform';
import { Trash2, Loader2, Calendar, UserCheck, Pencil, ShieldCheck, AlertCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

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


export default function DelegationRules() {
  const [rules, setRules] = useState<DelegationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [creating, setCreating] = useState(false);

  // Date-range delegation form
  const [delegateName, setDelegateName] = useState('');
  const [delegateRemarks, setDelegateRemarks] = useState('');
  const [delegateActive, setDelegateActive] = useState(true);
  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  // Multi-role transfer: roles auto-loaded from selected Absent User.
  const [fromUserRoles, setFromUserRoles] = useState<AppRole[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveUntil, setEffectiveUntil] = useState('');
  const [delegateDialogOpen, setDelegateDialogOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editingOldValue, setEditingOldValue] = useState<DelegationRule | null>(null);

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

  const resetDelegateForm = () => {
    setDelegateName(''); setDelegateRemarks(''); setDelegateActive(true);
    setFromUserId(''); setToUserId('');
    setFromUserRoles([]); setSelectedRoles([]); setRolesLoading(false);
    setEffectiveFrom(''); setEffectiveUntil('');
    setEditingRuleId(null); setEditingOldValue(null);
  };

  // Fetch all assigned roles for a given user from user_roles
  const fetchRolesForUser = async (userId: string): Promise<AppRole[]> => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (error) {
      console.error('[Delegation] Failed to load roles:', error.message);
      return [];
    }
    const roles = Array.from(new Set(((data || []) as any[]).map(r => r.role as AppRole)));
    roles.sort((a, b) => ROLE_HIERARCHY.indexOf(a) - ROLE_HIERARCHY.indexOf(b));
    return roles;
  };

  // Auto-load roles whenever the Absent (From) user changes.
  useEffect(() => {
    if (!delegateDialogOpen) return;
    if (!fromUserId) { setFromUserRoles([]); setSelectedRoles([]); return; }
    let cancelled = false;
    setRolesLoading(true);
    fetchRolesForUser(fromUserId).then(roles => {
      if (cancelled) return;
      setFromUserRoles(roles);
      setSelectedRoles(prev => {
        if (editingRuleId && editingOldValue?.target_role && roles.includes(editingOldValue.target_role)) {
          return [editingOldValue.target_role];
        }
        return roles.filter(r => r !== 'applicant' && r !== 'pre_licensee');
      });
      setRolesLoading(false);
    });
    return () => { cancelled = true; };
  }, [fromUserId, delegateDialogOpen, editingRuleId, editingOldValue]);

  const openEditDelegation = (rule: DelegationRule) => {
    setEditingRuleId(rule.id);
    setEditingOldValue(rule);
    setDelegateName(rule.name || '');
    setDelegateRemarks(rule.description || '');
    setDelegateActive(!!rule.is_active);
    setFromUserId(rule.delegate_from_user_id || '');
    setToUserId(rule.delegate_to_user_id || '');
    setSelectedRoles(rule.target_role ? [rule.target_role] : []);
    const toDateInput = (iso: string | null) => {
      if (!iso) return '';
      const d = new Date(iso);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    setEffectiveFrom(toDateInput(rule.effective_from));
    setEffectiveUntil(toDateInput(rule.effective_until));
    setDelegateDialogOpen(true);
  };

  const toggleSelectedRole = (role: AppRole) => {
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
  };
  const selectAllRoles = () => {
    setSelectedRoles(fromUserRoles.filter(r => r !== 'applicant' && r !== 'pre_licensee'));
  };
  const clearSelectedRoles = () => setSelectedRoles([]);

  const hasConflictingDelegation = (
    fromId: string,
    toId: string,
    role: AppRole,
    startIso: string,
    endIso: string,
    excludeId: string | null,
  ): DelegationRule | null => {
    return rules.find(r =>
      r.id !== excludeId &&
      r.is_active &&
      r.delegate_from_user_id === fromId &&
      r.delegate_to_user_id === toId &&
      r.target_role === role &&
      r.effective_from && r.effective_until &&
      r.effective_from <= endIso && r.effective_until >= startIso
    ) || null;
  };

  const handleSaveDateDelegation = async () => {
    if (!delegateName.trim() || !fromUserId || !toUserId || !effectiveFrom || !effectiveUntil) {
      toast.error('Please fill all required fields');
      return;
    }
    if (fromUserId === toUserId) {
      toast.error('From and To users must be different');
      return;
    }
    if (new Date(effectiveUntil) < new Date(effectiveFrom)) {
      toast.error('End date must be on or after start date');
      return;
    }
    if (fromUserRoles.length === 0) {
      toast.error('The selected Absent User has no active roles assigned. Delegation not allowed.');
      return;
    }
    if (selectedRoles.length === 0) {
      toast.error('Please select at least one role to transfer');
      return;
    }
    setCreating(true);
    const startOfDay = new Date(effectiveFrom);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(effectiveUntil);
    endOfDay.setHours(23, 59, 59, 999);

    for (const role of selectedRoles) {
      const conflict = hasConflictingDelegation(
        fromUserId, toUserId, role,
        startOfDay.toISOString(), endOfDay.toISOString(),
        editingRuleId,
      );
      if (conflict) {
        toast.error(`Conflicts with existing active delegation "${conflict.name}" for role "${ROLE_LABELS[role]}" in this period.`);
        setCreating(false);
        return;
      }
    }

    const baseDescription = delegateRemarks.trim();
    const periodLabel = `${effectiveFrom} to ${effectiveUntil}`;

    if (editingRuleId) {
      const role = selectedRoles[0];
      const payload = {
        name: delegateName.trim(),
        description: baseDescription || `Role transfer (${ROLE_LABELS[role]}): ${periodLabel}`,
        condition: { field: 'delegation_type', operator: '==', value: 'date_range' },
        target_role: role,
        delegate_from_user_id: fromUserId,
        delegate_to_user_id: toUserId,
        effective_from: startOfDay.toISOString(),
        effective_until: endOfDay.toISOString(),
        is_active: delegateActive,
      };
      const { error } = await supabase.from('delegation_rules').update(payload as any).eq('id', editingRuleId);
      if (error) { toast.error(error.message); setCreating(false); return; }
      await logAudit({
        action: 'delegation_date_range_updated',
        entityType: 'delegation_rule',
        entityId: editingRuleId,
        oldValue: editingOldValue ? {
          name: editingOldValue.name,
          description: editingOldValue.description,
          target_role: editingOldValue.target_role,
          delegate_from_user_id: editingOldValue.delegate_from_user_id,
          delegate_to_user_id: editingOldValue.delegate_to_user_id,
          effective_from: editingOldValue.effective_from,
          effective_until: editingOldValue.effective_until,
          is_active: editingOldValue.is_active,
        } : undefined,
        newValue: payload,
      });
      toast.success('Delegation updated. Active sessions will refresh within ~5 minutes.');
    } else {
      const rows = selectedRoles.map(role => ({
        name: selectedRoles.length > 1 ? `${delegateName.trim()} — ${ROLE_LABELS[role]}` : delegateName.trim(),
        description: baseDescription || `Role transfer (${ROLE_LABELS[role]}): ${periodLabel}`,
        condition: { field: 'delegation_type', operator: '==', value: 'date_range' },
        target_role: role,
        delegate_from_user_id: fromUserId,
        delegate_to_user_id: toUserId,
        effective_from: startOfDay.toISOString(),
        effective_until: endOfDay.toISOString(),
        is_active: delegateActive,
      }));
      const { error } = await supabase.from('delegation_rules').insert(rows as any);
      if (error) { toast.error(error.message); setCreating(false); return; }
      await logAudit({
        action: 'delegation_date_range_created',
        entityType: 'delegation_rule',
        newValue: { count: rows.length, roles: selectedRoles, rows },
      });
      toast.success(
        rows.length > 1
          ? `Delegated ${rows.length} roles successfully`
          : 'Date-range delegation created'
      );
    }

    setDelegateDialogOpen(false);
    resetDelegateForm();
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
          title="Role Transfers"
          description="Configure date-based role delegations for leave coverage and temporary access"
        />

        <div className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={delegateDialogOpen} onOpenChange={(o) => { setDelegateDialogOpen(o); if (!o) resetDelegateForm(); }}>
                <DialogTrigger asChild>
                  <Button onClick={() => resetDelegateForm()}><Calendar className="h-4 w-4 mr-2" />New Role Transfer</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingRuleId ? 'Edit Role Transfer' : 'Create Date-Range Role Transfer'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {editingRuleId && editingOldValue?.is_active && (() => {
                      const now = new Date();
                      const from = editingOldValue.effective_from ? new Date(editingOldValue.effective_from) : null;
                      const until = editingOldValue.effective_until ? new Date(editingOldValue.effective_until) : null;
                      const isLive = from && until && from <= now && now <= until;
                      return isLive ? (
                        <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                          ⚠ This delegation is currently active. Changes will affect the covering user's permissions.
                        </div>
                      ) : null;
                    })()}
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
                    <div>
                      <Label>Role to Transfer *</Label>
                      <Select value={transferRole} onValueChange={v => setTransferRole(v as AppRole)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLE_HIERARCHY.filter(r => r !== 'applicant' && r !== 'pre_licensee').map(r => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        The covering user will gain access of this role during the active period.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>From Date *</Label><Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} /></div>
                      <div><Label>Until Date *</Label><Input type="date" value={effectiveUntil} min={effectiveFrom || undefined} onChange={e => setEffectiveUntil(e.target.value)} /></div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Both dates are inclusive (start at 00:00, end at 23:59). Same-day transfers are supported.
                      Roles auto-revert after the end date.
                    </p>
                    <div>
                      <Label>Remarks / Notes</Label>
                      <Textarea value={delegateRemarks} onChange={e => setDelegateRemarks(e.target.value)} placeholder="Optional notes about this delegation..." rows={2} />
                    </div>
                    <div className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <Label className="text-sm">Status</Label>
                        <p className="text-[11px] text-muted-foreground">{delegateActive ? 'Active' : 'Inactive'}</p>
                      </div>
                      <Switch checked={delegateActive} onCheckedChange={setDelegateActive} />
                    </div>
                    <Button onClick={handleSaveDateDelegation} disabled={creating} className="w-full">
                      {creating ? 'Saving...' : editingRuleId ? 'Update Transfer' : 'Create Transfer'}
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
                        <TableHead>Role</TableHead>
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
                            <TableCell><Badge variant="outline">{ROLE_LABELS[rule.target_role]}</Badge></TableCell>
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
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDelegation(rule)} title="Edit delegation">
                                <Pencil className="h-4 w-4" />
                              </Button>
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
        </div>
      </div>
    </DashboardLayout>
  );
}
