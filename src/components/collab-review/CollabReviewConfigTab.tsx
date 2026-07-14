import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['collab-cfg-perms', stepId] }),
    onError: (e: any) => toast.error(e.message ?? 'Failed'),
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

  const togglePerm = (roleId: string, key: string, value: boolean) => {
    const existing = permsByRole.get(roleId) ?? {
      workflow_id: workflowId, step_id: stepId, role_id: roleId, enabled: false,
      block_approval_on_unresolved_blocking: false,
    };
    upsertPerm.mutate({ ...existing, [key]: value });
  };

  const updateDisplay = (roleId: string, patch: any) => {
    const existing = displayByRole.get(roleId) ?? { role_id: roleId, regulator_id: activeRegulatorId ?? null, color: '#6366F1', show_reviewer_name: true, show_role_name: true };
    upsertDisplay.mutate({ ...existing, regulator_id: existing.regulator_id ?? activeRegulatorId ?? null, ...patch });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Collaborative Review</CardTitle>
          <CardDescription>
            Configure per-step permissions and role display for collaborative comments & tracked suggestions.
            Existing workflows are unaffected until you enable a step here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Workflow</Label>
              <Select value={workflowId} onValueChange={v => { setWorkflowId(v); setStepId(''); }}>
                <SelectTrigger><SelectValue placeholder="Select workflow" /></SelectTrigger>
                <SelectContent>
                  {(workflowsQ.data ?? []).map(w => (
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

          {stepId && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead>Enabled</TableHead>
                    {PERM_COLS.map(c => <TableHead key={c.key} className="text-center">{c.label}</TableHead>)}
                    <TableHead className="text-center">Block approval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((r: any) => {
                    const row = permsByRole.get(r.id);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>
                          <Switch checked={!!row?.enabled} onCheckedChange={v => togglePerm(r.id, 'enabled', v)} />
                        </TableCell>
                        {PERM_COLS.map(c => (
                          <TableCell key={c.key} className="text-center">
                            <Switch
                              disabled={!row?.enabled}
                              checked={!!row?.[c.key]}
                              onCheckedChange={v => togglePerm(r.id, c.key, v)}
                            />
                          </TableCell>
                        ))}
                        <TableCell className="text-center">
                          <Switch
                            disabled={!row?.enabled}
                            checked={!!row?.block_approval_on_unresolved_blocking}
                            onCheckedChange={v => togglePerm(r.id, 'block_approval_on_unresolved_blocking', v)}
                          />
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
