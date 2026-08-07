/**
 * MCS-ENF-001..003 — enforcement lifecycle controls.
 *
 * Every transition goes through the `enforcement_lifecycle_action` RPC which
 * enforces sequencing (propose -> review -> approve -> issue), mandatory
 * rationales, and writes an append-only row to `enforcement_case_events`.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function EnforcementLifecyclePanel({ caseRow }: { caseRow: any }) {
  const qc = useQueryClient();
  const [proposed, setProposed] = useState(caseRow.proposed_action ?? '');
  const [rationale, setRationale] = useState('');
  const [note, setNote] = useState('');
  const [effective, setEffective] = useState('');
  const [outcome, setOutcome] = useState('');

  const act = useMutation({
    mutationFn: async (args: { action: string; payload?: Record<string, unknown> }) => {
      const { data, error } = await supabase.rpc('enforcement_lifecycle_action', {
        _case_id: caseRow.id,
        _action: args.action,
        _payload: (args.payload ?? {}) as never,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enforcement_case', caseRow.id] });
      qc.invalidateQueries({ queryKey: ['enforcement_case_events', caseRow.id] });
      toast.success('Enforcement case updated');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Action failed'),
  });

  const { data: events } = useQuery({
    queryKey: ['enforcement_case_events', caseRow.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('enforcement_case_events')
        .select('*')
        .eq('case_id', caseRow.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Lifecycle
          <Badge variant="outline">{caseRow.review_state}</Badge>
          <Badge variant="outline">monitoring: {caseRow.monitoring_state}</Badge>
          {caseRow.non_compliance_flag && <Badge variant="destructive">non-compliance</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="ef-prop">Proposed action</Label>
            <Input id="ef-prop" value={proposed} onChange={(e) => setProposed(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ef-eff">Effective date</Label>
            <Input id="ef-eff" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ef-rat">Rationale (min 10 characters)</Label>
            <Textarea id="ef-rat" rows={2} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="ef-note">Review / monitoring note</Label>
            <Textarea id="ef-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ef-out">Closure outcome</Label>
            <Input id="ef-out" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" data-rbac="enforcement_management.edit" disabled={act.isPending}
            onClick={() => act.mutate({ action: 'propose', payload: { proposed_action: proposed, proposal_rationale: rationale } })}>
            {act.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Propose
          </Button>
          <Button size="sm" variant="outline" data-rbac="enforcement_management.edit"
            onClick={() => act.mutate({ action: 'review', payload: { note } })}>Record review</Button>
          <Button size="sm" variant="outline" data-rbac="enforcement_management.approve"
            onClick={() => act.mutate({ action: 'approve', payload: { note } })}>Approve</Button>
          <Button size="sm" variant="outline" data-rbac="enforcement_management.approve"
            onClick={() => act.mutate({ action: 'reject', payload: { note } })}>Reject</Button>
          <Button size="sm" variant="outline" data-rbac="enforcement_management.edit"
            onClick={() => act.mutate({ action: 'issue', payload: { effective_date: effective || null } })}>Issue</Button>
          <Button size="sm" variant="outline" data-rbac="enforcement_management.edit"
            onClick={() => act.mutate({ action: 'monitor', payload: { monitoring_state: 'monitoring', note } })}>Monitor</Button>
          <Button size="sm" variant="outline" data-rbac="enforcement_management.edit"
            onClick={() => act.mutate({ action: 'flag_non_compliance', payload: { note } })}>Flag non-compliance</Button>
          <Button size="sm" variant="outline" data-rbac="enforcement_management.edit"
            onClick={() => act.mutate({ action: 'close', payload: { outcome, rationale } })}>Close</Button>
        </div>

        <div>
          <div className="text-xs text-muted-foreground mb-2">Case events (append-only)</div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {!events?.length ? <p className="text-sm text-muted-foreground">No events yet.</p> :
              events.map((ev: any) => (
                <div key={ev.id} className="rounded border p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-medium">{ev.event_type}</span>
                    <span className="text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</span>
                  </div>
                  {ev.note && <div className="mt-1 text-muted-foreground">{ev.note}</div>}
                </div>
              ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
