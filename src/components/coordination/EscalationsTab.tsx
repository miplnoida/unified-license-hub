import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { authorizedAction } from '@/lib/rbac/authorizedAction';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, ArrowUp } from 'lucide-react';
import { logCoordinationAction } from '@/lib/coordinationAudit';

const TIER_META: Record<string, { label: string; className: string }> = {
  lead: { label: 'Lead Officer', className: 'bg-blue-100 text-blue-800' },
  executive: { label: 'Executive', className: 'bg-amber-100 text-amber-800' },
  chair: { label: 'Chair', className: 'bg-orange-100 text-orange-800' },
  joint_board: { label: 'Joint Board', className: 'bg-red-100 text-red-800' },
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: 'Open', className: 'bg-red-100 text-red-800' },
  in_review: { label: 'In Review', className: 'bg-amber-100 text-amber-800' },
  resolved: { label: 'Resolved', className: 'bg-green-100 text-green-800' },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-700' },
};

const OUTCOMES = [
  { value: 'cleared', label: 'Cleared' },
  { value: 'conditionally_cleared', label: 'Conditionally cleared' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'remitted', label: 'Remitted for further review' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

interface Props {
  caseId: string;
  canParticipate: boolean;
  isOwner: boolean;
  participants: Array<{ user_id: string }>;
  profileMap: Map<string, { name: string; email: string }>;
  subjectType?: string | null;
  subjectId?: string | null;
}

export function EscalationsTab({
  caseId, canParticipate, isOwner, participants, profileMap, subjectType, subjectId,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ tier: 'lead', reason: '', assigned_to: 'none' });
  const [actionFor, setActionFor] = useState<null | { id: string; mode: 'resolve' | 'withdraw' | 'assign' }>(null);
  const [actionForm, setActionForm] = useState({ outcome: 'cleared', rationale: '', assigned_to: 'none', status: 'in_review' });

  const { data: escalations } = useQuery({
    queryKey: ['coordination_escalations', caseId],
    queryFn: async () => {
      const { data, error } = await supabase.from('coordination_escalations')
        .select('*').eq('case_id', caseId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const openCount = useMemo(
    () => (escalations ?? []).filter((e: any) => e.status === 'open' || e.status === 'in_review').length,
    [escalations],
  );

  const raise = useMutation({
    mutationFn: async () => {
      if (form.reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');
      const { data, error } = await supabase.from('coordination_escalations').insert({
        case_id: caseId,
        tier: form.tier,
        reason: form.reason.trim(),
        raised_by: user!.id,
        assigned_to: form.assigned_to === 'none' ? null : form.assigned_to,
        status: 'open',
      }).select('id').single();
      if (error) throw error;
      await logCoordinationAction('coordination.escalation.raised', 'coordination_escalation', data.id, {
        after: { tier: form.tier, status: 'open', assigned_to: form.assigned_to === 'none' ? null : form.assigned_to },
        context: { caseId, escalationId: data.id, subjectType, subjectId },
        justification: form.reason.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Escalation raised');
      qc.invalidateQueries({ queryKey: ['coordination_escalations', caseId] });
      setOpen(false);
      setForm({ tier: 'lead', reason: '', assigned_to: 'none' });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch, action, justification }: { id: string; patch: Record<string, unknown>; action: string; justification?: string }) => {
      await authorizedAction('coordination', 'update', { escalation_id: id, action });
      const before = (escalations ?? []).find((e: any) => e.id === id) ?? null;
      const { error } = await supabase.from('coordination_escalations').update(patch).eq('id', id);
      if (error) throw error;
      await logCoordinationAction(action, 'coordination_escalation', id, {
        before: before ? { status: before.status, assigned_to: before.assigned_to, resolution_outcome: before.resolution_outcome } : null,
        after: patch,
        context: { caseId, escalationId: id, subjectType, subjectId },
        justification,
      });
    },
    onSuccess: () => {
      toast.success('Escalation updated');
      qc.invalidateQueries({ queryKey: ['coordination_escalations', caseId] });
      setActionFor(null);
      setActionForm({ outcome: 'cleared', rationale: '', assigned_to: 'none', status: 'in_review' });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Escalations
          {openCount > 0 && <Badge variant="outline" className="bg-red-100 text-red-800">{openCount} open</Badge>}
        </CardTitle>
        {canParticipate && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-rbac="coordination.update" size="sm"><ArrowUp className="h-4 w-4 mr-2" /> Raise Escalation</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Raise Escalation</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Tier</Label>
                  <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TIER_META).map(([k, m]) => (
                        <SelectItem key={k} value={k}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Assign to (optional)</Label>
                  <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Unassigned —</SelectItem>
                      {participants.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {profileMap.get(p.user_id)?.name || p.user_id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reason (min 10 chars)</Label>
                  <Textarea rows={4} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                    placeholder="Describe why this must be escalated…" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button data-rbac="coordination.update" onClick={() => raise.mutate()} disabled={raise.isPending || form.reason.trim().length < 10}>
                  {raise.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Raise
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {(escalations ?? []).length === 0 && <p className="text-sm text-muted-foreground">No escalations raised.</p>}
        {(escalations ?? []).map((e: any) => {
          const t = TIER_META[e.tier] || TIER_META.lead;
          const s = STATUS_META[e.status] || STATUS_META.open;
          const canAct = canParticipate && (
            e.raised_by === user?.id || e.assigned_to === user?.id || isOwner
          );
          const raiser = profileMap.get(e.raised_by);
          const assignee = e.assigned_to ? profileMap.get(e.assigned_to) : null;
          const resolver = e.resolved_by ? profileMap.get(e.resolved_by) : null;
          return (
            <div key={e.id} className="border rounded p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={s.className}>{s.label}</Badge>
                <Badge variant="outline" className={t.className}>{t.label}</Badge>
                <span className="text-xs text-muted-foreground">
                  raised by {raiser?.name || String(e.raised_by).slice(0, 8)} · {new Date(e.created_at).toLocaleString()}
                </span>
                {assignee && (
                  <span className="text-xs text-muted-foreground">· assigned to {assignee.name}</span>
                )}
              </div>
              <div className="text-xs whitespace-pre-wrap"><strong>Reason: </strong>{e.reason}</div>
              {e.status === 'resolved' && (
                <div className="text-xs border-t pt-2 space-y-1">
                  <div><Badge variant="outline" className="bg-slate-100 text-slate-800">outcome: {e.resolution_outcome}</Badge></div>
                  <div><strong>Rationale: </strong>{e.resolution_rationale}</div>
                  <div className="text-muted-foreground">
                    Resolved {e.resolved_at && new Date(e.resolved_at).toLocaleString()}
                    {resolver && ` · by ${resolver.name}`}
                  </div>
                </div>
              )}
              {e.status === 'withdrawn' && (
                <div className="text-xs border-t pt-2 italic">Withdrawn — {e.resolution_rationale}</div>
              )}

              {canAct && (e.status === 'open' || e.status === 'in_review') && (
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {e.status === 'open' && (
                    <Button data-rbac="coordination.update" size="sm" variant="outline" onClick={() => update.mutate({
                      id: e.id, patch: { status: 'in_review' },
                      action: 'coordination.escalation.in_review',
                    })}>Mark under review</Button>
                  )}
                  <Button data-rbac="coordination.update" size="sm" variant="outline" onClick={() => { setActionFor({ id: e.id, mode: 'assign' }); setActionForm({ ...actionForm, assigned_to: e.assigned_to || 'none' }); }}>
                    Reassign
                  </Button>
                  <Button data-rbac="coordination.update" size="sm" onClick={() => { setActionFor({ id: e.id, mode: 'resolve' }); setActionForm({ outcome: 'cleared', rationale: '', assigned_to: 'none', status: 'in_review' }); }}>
                    Resolve
                  </Button>
                  <Button data-rbac="coordination.update" size="sm" variant="ghost" onClick={() => { setActionFor({ id: e.id, mode: 'withdraw' }); setActionForm({ outcome: 'withdrawn', rationale: '', assigned_to: 'none', status: 'in_review' }); }}>
                    Withdraw
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      <Dialog open={!!actionFor} onOpenChange={(o) => { if (!o) setActionFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionFor?.mode === 'resolve' && 'Resolve escalation'}
              {actionFor?.mode === 'withdraw' && 'Withdraw escalation'}
              {actionFor?.mode === 'assign' && 'Reassign escalation'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {actionFor?.mode === 'assign' && (
              <div>
                <Label>Assign to</Label>
                <Select value={actionForm.assigned_to} onValueChange={(v) => setActionForm({ ...actionForm, assigned_to: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Unassigned —</SelectItem>
                    {participants.map((p) => (
                      <SelectItem key={p.user_id} value={p.user_id}>
                        {profileMap.get(p.user_id)?.name || p.user_id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {actionFor?.mode === 'resolve' && (
              <div>
                <Label>Outcome</Label>
                <Select value={actionForm.outcome} onValueChange={(v) => setActionForm({ ...actionForm, outcome: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTCOMES.filter((o) => o.value !== 'withdrawn').map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(actionFor?.mode === 'resolve' || actionFor?.mode === 'withdraw') && (
              <div>
                <Label>Rationale (min 10 chars)</Label>
                <Textarea rows={4} value={actionForm.rationale} onChange={(e) => setActionForm({ ...actionForm, rationale: e.target.value })} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setActionFor(null)}>Cancel</Button>
            <Button
              disabled={
                update.isPending ||
                ((actionFor?.mode === 'resolve' || actionFor?.mode === 'withdraw') && actionForm.rationale.trim().length < 10)
              }
              onClick={() => {
                if (!actionFor) return;
                if (actionFor.mode === 'assign') {
                  update.mutate({
                    id: actionFor.id,
                    patch: { assigned_to: actionForm.assigned_to === 'none' ? null : actionForm.assigned_to },
                    action: 'coordination.escalation.assigned',
                  });
                } else if (actionFor.mode === 'resolve') {
                  update.mutate({
                    id: actionFor.id,
                    patch: {
                      status: 'resolved',
                      resolution_outcome: actionForm.outcome,
                      resolution_rationale: actionForm.rationale.trim(),
                    },
                    action: 'coordination.escalation.resolved',
                    justification: actionForm.rationale.trim(),
                  });
                } else if (actionFor.mode === 'withdraw') {
                  update.mutate({
                    id: actionFor.id,
                    patch: {
                      status: 'withdrawn',
                      resolution_outcome: 'withdrawn',
                      resolution_rationale: actionForm.rationale.trim(),
                    },
                    action: 'coordination.escalation.withdrawn',
                    justification: actionForm.rationale.trim(),
                  });
                }
              }}
            >
              {update.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
