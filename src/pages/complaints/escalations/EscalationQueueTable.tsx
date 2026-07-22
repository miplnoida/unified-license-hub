import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SeverityBadge, StatusChip } from './severityBadge';
import { TIER_LABEL } from './types';

interface Row {
  id: string; complaint_id: string; rule_key: string; rule_label: string;
  severity: string; target_tier: string; trigger_reason: string; status: string;
  complaint_number?: string | null; subject?: string | null;
}

export function EscalationQueueTable() {
  const qc = useQueryClient();
  const [rule, setRule] = useState('all');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');

  const { data: rules = [] } = useQuery({
    queryKey: ['complaint_escalation_rules_list'],
    queryFn: async () => {
      const { data } = await supabase.from('complaint_escalation_rules' as any).select('key,label').order('priority');
      return (data as any[]) || [];
    },
  });

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ['complaint_escalation_cases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('complaint_escalation_cases' as any)
        .select('id, complaint_id, rule_key, rule_label, severity, target_tier, trigger_reason, status, complaints(complaint_number, subject)')
        .order('triggered_at', { ascending: false });
      if (error) throw error;
      return ((data as any[]) || []).map((r) => ({
        ...r,
        complaint_number: r.complaints?.complaint_number ?? null,
        subject: r.complaints?.subject ?? null,
      }));
    },
  });

  const decide = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: string }) => {
      if (decision === 'escalated') {
        const { error: gateErr } = await supabase.rpc('enforce_action', {
          _module: 'complaint_management', _action: 'escalate', _meta: { case_id: id } as never,
        });
        if (gateErr) throw gateErr;
      }
      const { error } = await (supabase as any).rpc('decide_escalation_case', { _id: id, _decision: decision });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Case updated');
      qc.invalidateQueries({ queryKey: ['complaint_escalation_cases'] });
      qc.invalidateQueries({ queryKey: ['complaint_escalation_stats'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => rows.filter((c) => {
    if (rule !== 'all' && c.rule_key !== rule) return false;
    if (status !== 'all' && c.status !== status) return false;
    if (q) {
      const hay = `${c.complaint_number ?? ''} ${c.subject ?? ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, rule, status, q]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Auto-Escalation Queue</CardTitle>
        <div className="flex flex-wrap gap-2 pt-2">
          <Input placeholder="Search complaint…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
          <Select value={rule} onValueChange={setRule}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Rule" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rules</SelectItem>
              {rules.map((r: any) => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {['all','pending','acknowledged','escalated','dismissed','snoozed','resolved'].map((s) => (
                <SelectItem key={s} value={s}>{s === 'all' ? 'All statuses' : s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Complaint</TableHead>
              <TableHead>Rule</TableHead>
              <TableHead>Trigger reason</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Target tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Loading…</TableCell></TableRow>}
            {!isLoading && filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <div className="font-mono text-xs">{c.complaint_number ?? '—'}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[220px]">{c.subject ?? ''}</div>
                </TableCell>
                <TableCell className="text-sm">{c.rule_label}</TableCell>
                <TableCell className="text-xs text-slate-700 max-w-[240px]">{c.trigger_reason}</TableCell>
                <TableCell><SeverityBadge severity={c.severity as any} /></TableCell>
                <TableCell className="text-sm">{TIER_LABEL[c.target_tier as keyof typeof TIER_LABEL] ?? c.target_tier}</TableCell>
                <TableCell><StatusChip status={c.status as any} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {c.status === 'pending' && (
                      <Button data-rbac="complaint_management.edit" size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, decision: 'acknowledged' })}>Ack</Button>
                    )}
                    {c.status !== 'escalated' && c.status !== 'dismissed' && c.status !== 'resolved' && (
                      <Button data-rbac="complaint_management.escalate" size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, decision: 'escalated' })}>Escalate</Button>
                    )}
                    {c.status !== 'dismissed' && c.status !== 'resolved' && (
                      <Button data-rbac="complaint_management.edit" size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, decision: 'dismissed' })}>Dismiss</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No escalation cases.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
