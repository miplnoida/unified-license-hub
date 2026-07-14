import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { toast } from 'sonner';
import { useRoles } from '@/hooks/useRoles';
import { logAction } from '@/hooks/useAuditLog';
import { useRegulator } from '@/contexts/RegulatorContext';

const PERM_COLS = [
  { key: 'can_view', label: 'View' },
  { key: 'can_comment', label: 'Comment' },
  { key: 'can_reply', label: 'Reply' },
  { key: 'can_suggest', label: 'Suggest' },
  { key: 'can_accept', label: 'Accept' },
  { key: 'can_reject', label: 'Reject' },
  { key: 'can_resolve', label: 'Resolve' },
  { key: 'can_mark_blocking', label: 'Mark blocking' },
] as const;

const REVIEWER_DEFAULTS = {
  enabled: true,
  can_view: true,
  can_comment: true,
  can_reply: true,
  can_suggest: true,
  can_accept: false,
  can_reject: false,
  can_resolve: false,
  can_mark_blocking: false,
  block_approval_on_unresolved_blocking: false,
};

const EMPTY_ROW = {
  enabled: false,
  can_view: false,
  can_comment: false,
  can_reply: false,
  can_suggest: false,
  can_accept: false,
  can_reject: false,
  can_resolve: false,
  can_mark_blocking: false,
  block_approval_on_unresolved_blocking: false,
};

export default function CollabReviewConfigTab() {
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const { activeRegulatorId } = useRegulator();

  const workflowsQ = useQuery({
    queryKey: ['collab-cfg-workflows'],
    queryFn: async () => {
      const { data, error } = await supabase.from('approval_workflows' as any).select('id,name,entity_type').order('name');
      if (error) throw error;
      return data as any[];
    },
  });
  const [workflowId, setWorkflowId] = useState<string | ''>('');
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const filteredWorkflows = useMemo(() => {
    const list = workflowsQ.data ?? [];
    if (entityFilter === 'all') return list;
    return list.filter(w => w.entity_type === entityFilter);
  }, [workflowsQ.data, entityFilter]);
  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    (workflowsQ.data ?? []).forEach(w => w.entity_type && set.add(w.entity_type));
    return Array.from(set).sort();
  }, [workflowsQ.data]);

  const stepsQ = useQuery({
    queryKey: ['collab-cfg-steps', workflowId],
    enabled: !!workflowId,
    queryFn: async () => {
      const { data, error } = await supabase.from('approval_steps' as any).select('id,name,step_order,workflow_id')
        .eq('workflow_id', workflowId).order('step_order');
      if (error) throw error;
      return data as any[];
    },
  });
  const [stepId, setStepId] = useState<string | ''>('');

  const permsQ = useQuery({
    queryKey: ['collab-cfg-perms', stepId],
    enabled: !!stepId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from('review_step_permissions' as any).select('*').eq('step_id', stepId);
      if (error) throw error;
      return data as any[];
    },
  });
  const permsByRole = useMemo(() => {
    const map = new Map<string, any>();
    (permsQ.data ?? []).forEach(p => map.set(p.role_id, p));
    return map;
  }, [permsQ.data]);

  // Role assignment counts (from user_dynamic_roles) so admins see which roles matter.
  const roleCountsQ = useQuery({
    queryKey: ['collab-cfg-role-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_dynamic_roles' as any).select('role_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data as any[]).forEach(r => { counts[r.role_id] = (counts[r.role_id] ?? 0) + 1; });
      return counts;
    },
  });

  const displayQ = useQuery({
    queryKey: ['collab-cfg-display'],
    queryFn: async () => {
      const { data, error } = await supabase.from('review_role_display_settings' as any).select('*');
      if (error) throw error;
      return data as any[];
    },
  });
  const displayByRole = useMemo(() => {
    const map = new Map<string, any>();
    (displayQ.data ?? []).forEach(d => map.set(d.role_id, d));
    return map;
  }, [displayQ.data]);

  const upsertPerm = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from('review_step_permissions' as any)
        .upsert(row, { onConflict: 'step_id,role_id' });
      if (error) throw error;
    },
    onMutate: async (row: any) => {
      // Optimistically merge so rapid toggles compose instead of racing.
      await qc.cancelQueries({ queryKey: ['collab-cfg-perms', stepId] });
      const prev = qc.getQueryData<any[]>(['collab-cfg-perms', stepId]) ?? [];
      const next = [...prev];
      const idx = next.findIndex(r => r.role_id === row.role_id);
      const merged = { ...(idx >= 0 ? next[idx] : {}), ...row };
      if (idx >= 0) next[idx] = merged; else next.push(merged);
      qc.setQueryData(['collab-cfg-perms', stepId], next);
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(['collab-cfg-perms', stepId], ctx.prev);
      toast.error(e.message ?? 'Failed');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['collab-cfg-perms', stepId] }),
  });

  const copyPerms = useMutation({
    mutationFn: async (fromStepId: string) => {
      const { data, error } = await (supabase as any).rpc('copy_review_step_permissions', {
        _from_step: fromStepId,
        _to_step: stepId,
      });
      if (error) throw error;
      await logAction('collab_review.step_permissions_copied', 'workflow_step', stepId, {
        meta: { from_step: fromStepId, to_step: stepId, rows: data },
      });
      return data;
    },
    onSuccess: (n) => {
      toast.success(`Copied ${n} role permission row(s).`);
      qc.invalidateQueries({ queryKey: ['collab-cfg-perms', stepId] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Copy failed'),
  });

  const upsertDisplay = useMutation({
    mutationFn: async (row: any) => {
      const { error } = await supabase.from('review_role_display_settings' as any)
        .upsert(row, { onConflict: 'regulator_id,role_id' });
      if (error) throw error;
      await logAction('collab_review.role_color_updated', 'role', row.role_id, { meta: row });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collab-cfg-display'] }),
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
  });

  const baseRow = (roleId: string) => ({
    workflow_id: workflowId, step_id: stepId, role_id: roleId,
    ...EMPTY_ROW,
  });

  const toggleEnabled = (roleId: string, value: boolean) => {
    const existing = permsByRole.get(roleId);
    if (value && !existing) {
      // First time enabling: grant reviewer defaults so the row is actually useful.
      upsertPerm.mutate({ workflow_id: workflowId, step_id: stepId, role_id: roleId, ...REVIEWER_DEFAULTS });
    } else {
      const row = existing ?? baseRow(roleId);
      upsertPerm.mutate({ ...row, enabled: value });
    }
  };

  const togglePerm = (roleId: string, key: string, value: boolean) => {
    const existing = permsByRole.get(roleId) ?? baseRow(roleId);
    upsertPerm.mutate({ ...existing, [key]: value });
  };

  const grantDefaults = (roleId: string) => {
    upsertPerm.mutate({ workflow_id: workflowId, step_id: stepId, role_id: roleId, ...REVIEWER_DEFAULTS });
  };

  const revoke = (roleId: string) => {
    upsertPerm.mutate({ workflow_id: workflowId, step_id: stepId, role_id: roleId, ...EMPTY_ROW });
  };

  const updateDisplay = (roleId: string, patch: any) => {
    const existing = displayByRole.get(roleId) ?? { role_id: roleId, regulator_id: activeRegulatorId ?? null, color: '#6366F1', show_reviewer_name: true, show_role_name: true };
    upsertDisplay.mutate({ ...existing, regulator_id: existing.regulator_id ?? activeRegulatorId ?? null, ...patch });
  };

  const [copyFromStepId, setCopyFromStepId] = useState<string>('');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Collaborative Review</CardTitle>
          <CardDescription>
            Configure per-step permissions and role display for collaborative comments &amp; tracked suggestions.
            Turning <b>Enabled</b> on for a role grants reviewer defaults (view, comment, reply, suggest); use the quick actions to widen or revoke.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <Label>Entity type</Label>
              <Select value={entityFilter} onValueChange={setEntityFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {entityTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Workflow</Label>
              <Select value={workflowId} onValueChange={v => { setWorkflowId(v); setStepId(''); }}>
                <SelectTrigger><SelectValue placeholder="Select workflow" /></SelectTrigger>
                <SelectContent>
                  {filteredWorkflows.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.entity_type})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Step</Label>
              <Select value={stepId} onValueChange={setStepId} disabled={!workflowId}>
                <SelectTrigger><SelectValue placeholder="Select step" /></SelectTrigger>
                <SelectContent>
                  {(stepsQ.data ?? []).map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.step_order}. {s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {stepId && (stepsQ.data ?? []).length > 1 && (
            <div className="flex flex-wrap items-end gap-2 border rounded-md p-3 bg-muted/30">
              <div className="flex-1 min-w-[200px]">
                <Label>Copy from step</Label>
                <Select value={copyFromStepId} onValueChange={setCopyFromStepId}>
                  <SelectTrigger><SelectValue placeholder="Choose source step" /></SelectTrigger>
                  <SelectContent>
                    {(stepsQ.data ?? []).filter((s: any) => s.id !== stepId).map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.step_order}. {s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                disabled={!copyFromStepId || copyPerms.isPending}
                onClick={() => copyPerms.mutate(copyFromStepId)}
              >
                Copy permissions to this step
              </Button>
            </div>
          )}

          {stepId && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Enabled</TableHead>
                    {PERM_COLS.map(c => <TableHead key={c.key} className="text-center">{c.label}</TableHead>)}
                    <TableHead className="text-center">Block approval</TableHead>
                    <TableHead className="text-right">Quick</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((r: any) => {
                    const row = permsByRole.get(r.id);
                    const userCount = roleCountsQ.data?.[r.id] ?? 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <span>{r.name}</span>
                            {userCount > 0 && (
                              <Badge variant="secondary" className="text-[10px]">{userCount} user{userCount === 1 ? '' : 's'}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch checked={!!row?.enabled} onCheckedChange={v => toggleEnabled(r.id, v)} />
                        </TableCell>
                        {PERM_COLS.map(c => (
                          <TableCell key={c.key} className="text-center">
                            <Switch
                              checked={!!row?.[c.key]}
                              onCheckedChange={v => togglePerm(r.id, c.key, v)}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          <Switch
                            checked={!!row?.block_approval_on_unresolved_blocking}
                            onCheckedChange={v => togglePerm(r.id, 'block_approval_on_unresolved_blocking', v)}
                          />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => grantDefaults(r.id)}>Grant defaults</Button>
                          <Button size="sm" variant="ghost" onClick={() => revoke(r.id)}>Revoke</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Role Display</CardTitle>
          <CardDescription>Set a colour and choose whether reviewer/role names appear on comments.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Colour</TableHead>
                <TableHead className="text-center">Show reviewer name</TableHead>
                <TableHead className="text-center">Show role name</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r: any) => {
                const d = displayByRole.get(r.id);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <Input type="color" defaultValue={d?.color ?? '#6366F1'}
                        onBlur={e => updateDisplay(r.id, { color: e.target.value })}
                        className="w-14 h-8 p-0" />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={d?.show_reviewer_name ?? true}
                        onCheckedChange={v => updateDisplay(r.id, { show_reviewer_name: v })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={d?.show_role_name ?? true}
                        onCheckedChange={v => updateDisplay(r.id, { show_role_name: v })} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
