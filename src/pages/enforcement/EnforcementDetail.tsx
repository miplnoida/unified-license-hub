import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Send, MessageSquare, Gavel, XCircle, CheckCircle2 } from 'lucide-react';
import { logAction } from '@/hooks/useAuditLog';
import { ENFORCEMENT_STATUS_META } from './EnforcementList';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { DecisionGatesBanner } from '@/components/decision-gates/DecisionGatesBanner';
import { notifyComplaintLifecycle } from '@/lib/complaintNotifications';

const DECISION_OPTIONS = [
  { value: 'upheld', label: 'Upheld — full penalty' },
  { value: 'reduced', label: 'Upheld — reduced penalty' },
  { value: 'warning_only', label: 'Warning only (no penalty)' },
  { value: 'dismissed', label: 'Dismissed' },
];

export default function EnforcementDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [noticeText, setNoticeText] = useState('');
  const [responseText, setResponseText] = useState('');
  const [responseDate, setResponseDate] = useState(new Date().toISOString().slice(0, 10));
  const [decisionOutcome, setDecisionOutcome] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');
  const [decisionPenalty, setDecisionPenalty] = useState('');
  const [appealDeadline, setAppealDeadline] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  const [pending, setPending] = useState<null | { ruleKey: string; title: string; original: unknown; overridden: unknown; metadata: Record<string, unknown>; apply: () => Promise<void> }>(null);

  const { data: caseRow, isLoading } = useQuery({
    queryKey: ['enforcement_case', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('enforcement_actions').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: licensee } = useQuery({
    queryKey: ['enforcement_case_licensee', caseRow?.entity_id],
    enabled: !!caseRow?.entity_id,
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name').eq('id', caseRow!.entity_id).maybeSingle();
      return data;
    },
  });

  const { data: events } = useQuery({
    queryKey: ['enforcement_case_events', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('enforcement_case_events')
        .select('*').eq('case_id', id!).order('created_at', { ascending: false });
      if (error) throw error;
      const actorIds = Array.from(new Set((data ?? []).map((e: any) => e.actor_id).filter(Boolean)));
      const profMap = new Map<string, string>();
      if (actorIds.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', actorIds);
        (profs ?? []).forEach((p: any) => profMap.set(p.id, p.full_name || p.email));
      }
      return (data ?? []).map((e: any) => ({ ...e, actor_name: e.actor_id ? profMap.get(e.actor_id) || 'Staff' : 'System' }));
    },
  });

  const recordEvent = async (eventType: string, note: string, detail: Record<string, unknown> = {}) => {
    await (supabase.from('enforcement_case_events') as any).insert({
      case_id: id!, event_type: eventType, actor_id: user?.id ?? null, note, detail,
    });
    await logAction(`enforcement.${eventType}`, 'enforcement_action', id!, { meta: { entity_id: caseRow?.entity_id, ...detail } });
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['enforcement_case', id] });
    qc.invalidateQueries({ queryKey: ['enforcement_case_events', id] });
  };

  const issueNotice = useMutation({
    mutationFn: async () => {
      if (noticeText.trim().length < 20) throw new Error('Notice text required (min 20 chars)');
      const { error } = await supabase.from('enforcement_actions').update({
        status: 'notice_issued', notice_issued_at: new Date().toISOString(),
      }).eq('id', id!);
      if (error) throw error;
      await recordEvent('notice_issued', noticeText.trim());
    },
    onSuccess: () => { toast.success('Notice issued'); setNoticeText(''); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const recordResponse = useMutation({
    mutationFn: async () => {
      if (responseText.trim().length < 10) throw new Error('Response summary required');
      const { error } = await supabase.from('enforcement_actions').update({
        status: 'response_received',
        response_received_at: new Date(responseDate).toISOString(),
        response_summary: responseText.trim(),
      }).eq('id', id!);
      if (error) throw error;
      await recordEvent('response_received', responseText.trim(), { response_date: responseDate });
    },
    onSuccess: () => { toast.success('Response recorded'); setResponseText(''); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const recordDecision = useMutation({
    mutationFn: async () => {
      if (!decisionOutcome) throw new Error('Pick an outcome');
      if (decisionRationale.trim().length < 15) throw new Error('Rationale required (min 15 chars)');
      const patch: Record<string, unknown> = {
        status: 'decided',
        decision_at: new Date().toISOString(),
        decision_outcome: decisionOutcome,
        decision_rationale: decisionRationale.trim(),
      };
      if (decisionPenalty !== '') patch.penalty_amount = Number(decisionPenalty);
      if (appealDeadline) patch.appeal_deadline = appealDeadline;
      const { error } = await supabase.from('enforcement_actions').update(patch).eq('id', id!);
      if (error) throw error;
      await recordEvent('decision_recorded', decisionRationale.trim(), {
        outcome: decisionOutcome, penalty_amount: decisionPenalty || null, appeal_deadline: appealDeadline || null,
      });
    },
    onSuccess: () => {
      toast.success('Decision recorded');
      setDecisionOutcome(''); setDecisionRationale(''); setDecisionPenalty(''); setAppealDeadline('');
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const recordPayment = useMutation({
    mutationFn: async () => {
      const amt = Number(paymentAmount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Payment amount required');
      const currentPaid = Number(caseRow?.penalty_paid_amount || 0);
      const { error } = await supabase.from('enforcement_actions').update({
        penalty_paid_amount: currentPaid + amt,
      }).eq('id', id!);
      if (error) throw error;
      await recordEvent('payment_received', `Payment of ${caseRow?.penalty_currency || 'USD'} ${amt}`, { amount: amt });
    },
    onSuccess: () => { toast.success('Payment recorded'); setPaymentAmount(''); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const closeCase = useMutation({
    mutationFn: async () => {
      if (closeNote.trim().length < 5) throw new Error('Closing note required');
      const { error } = await supabase.from('enforcement_actions').update({
        status: 'closed', closed_at: new Date().toISOString(), closed_by: user?.id ?? null, resolution_date: new Date().toISOString().slice(0, 10),
      }).eq('id', id!);
      if (error) throw error;
      await recordEvent('case_closed', closeNote.trim());
    },
    onSuccess: () => { toast.success('Case closed'); setCloseNote(''); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const withdrawCase = useMutation({
    mutationFn: async () => {
      if (withdrawReason.trim().length < 10) throw new Error('Withdrawal reason required');
      const { error } = await supabase.from('enforcement_actions').update({
        status: 'withdrawn', closed_at: new Date().toISOString(), closed_by: user?.id ?? null,
      }).eq('id', id!);
      if (error) throw error;
      await recordEvent('case_withdrawn', withdrawReason.trim());
    },
    onSuccess: () => { toast.success('Case withdrawn'); setWithdrawReason(''); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const markAppealed = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('enforcement_actions').update({ status: 'appealed' }).eq('id', id!);
      if (error) throw error;
      await recordEvent('appeal_filed', 'Appeal filed against decision');
    },
    onSuccess: () => { toast.success('Marked as appealed'); invalidate(); },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  if (isLoading) return <DashboardLayout><div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…</div></DashboardLayout>;
  if (!caseRow) return <DashboardLayout><div className="p-8 text-center text-muted-foreground">Case not found or access denied.</div></DashboardLayout>;

  const meta = ENFORCEMENT_STATUS_META[caseRow.status] || ENFORCEMENT_STATUS_META.opened;
  const currency = caseRow.penalty_currency || 'USD';
  const isTerminal = ['closed', 'withdrawn'].includes(caseRow.status);
  const canIssueNotice = ['open', 'opened'].includes(caseRow.status);
  const canRecordResponse = caseRow.status === 'notice_issued';
  const canDecide = ['response_received', 'notice_issued'].includes(caseRow.status);
  const canAppeal = caseRow.status === 'decided';
  const canCloseOrWithdraw = !isTerminal;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Case ${caseRow.case_number}`}
          description={`${caseRow.enforcement_type} · ${licensee?.name || 'Licensee'}`}
          backHref="/enforcement"
          backLabel="Queue"
          actions={<div className="flex items-center gap-2"><Badge variant="outline" className={meta.className}>{meta.label}</Badge><HistoryButton entityType="enforcement_action" entityId={caseRow.id} title={`History — ${caseRow.case_number}`} /></div>}
        />

        <DecisionGatesBanner subjectType="enforcement_action" subjectId={caseRow.id} compact />

        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-xs text-muted-foreground">Licensee</div><div>{licensee ? <Link to={`/admin/licensees/${licensee.id}`} className="underline">{licensee.name}</Link> : '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Opened</div><div>{caseRow.date_opened || '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Notice issued</div><div>{caseRow.notice_issued_at ? new Date(caseRow.notice_issued_at).toLocaleDateString() : '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Decision</div><div>{caseRow.decision_outcome || '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Penalty</div><div>{caseRow.penalty_amount != null ? `${currency} ${Number(caseRow.penalty_amount).toLocaleString()}` : '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Collected</div><div className="text-green-700">{caseRow.penalty_paid_amount ? `${currency} ${Number(caseRow.penalty_paid_amount).toLocaleString()}` : '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Appeal deadline</div><div>{caseRow.appeal_deadline || '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Closed</div><div>{caseRow.closed_at ? new Date(caseRow.closed_at).toLocaleDateString() : '—'}</div></div>
          </CardContent>
        </Card>

        {caseRow.description && (
          <Card><CardContent className="p-4 text-sm"><div className="text-xs text-muted-foreground mb-1">Description</div>{caseRow.description}</CardContent></Card>
        )}

        {!isTerminal && (
          <Card>
            <CardHeader><CardTitle className="text-base">Lifecycle actions</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {canIssueNotice && (
                <div className="border rounded p-3 space-y-2">
                  <Label className="text-xs flex items-center gap-1"><Send className="h-3 w-3" /> Issue notice</Label>
                  <Textarea rows={3} placeholder="Notice content / grounds… (min 20 chars)" value={noticeText} onChange={(e) => setNoticeText(e.target.value)} />
                  <div className="flex justify-end"><Button size="sm" onClick={() => issueNotice.mutate()} disabled={issueNotice.isPending}>Issue notice</Button></div>
                </div>
              )}

              {canRecordResponse && (
                <div className="border rounded p-3 space-y-2">
                  <Label className="text-xs flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Record licensee response</Label>
                  <Input type="date" value={responseDate} onChange={(e) => setResponseDate(e.target.value)} className="w-48" />
                  <Textarea rows={3} placeholder="Response summary (min 10 chars)…" value={responseText} onChange={(e) => setResponseText(e.target.value)} />
                  <div className="flex justify-end"><Button size="sm" onClick={() => recordResponse.mutate()} disabled={recordResponse.isPending}>Record response</Button></div>
                </div>
              )}

              {canDecide && (
                <div className="border rounded p-3 space-y-2">
                  <Label className="text-xs flex items-center gap-1"><Gavel className="h-3 w-3" /> Record decision</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={decisionOutcome} onValueChange={setDecisionOutcome}>
                      <SelectTrigger><SelectValue placeholder="Outcome" /></SelectTrigger>
                      <SelectContent>{DECISION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input placeholder={`Penalty ${currency} (optional override)`} type="number" min="0" value={decisionPenalty} onChange={(e) => setDecisionPenalty(e.target.value)} />
                  </div>
                  <Input type="date" placeholder="Appeal deadline (optional)" value={appealDeadline} onChange={(e) => setAppealDeadline(e.target.value)} />
                  <Textarea rows={3} placeholder="Decision rationale (min 15 chars)…" value={decisionRationale} onChange={(e) => setDecisionRationale(e.target.value)} />
                  <div className="flex justify-end"><Button size="sm" onClick={() => {
                    if (decisionOutcome === 'warning_only' || decisionOutcome === 'dismissed' || decisionOutcome === 'reduced') {
                      const ruleKey = decisionOutcome === 'reduced' ? 'enforcement.penalty.waiver' : 'enforcement.recommended_action.override';
                      setPending({
                        ruleKey,
                        title: decisionOutcome === 'reduced' ? 'Reduce / waive penalty' : `Decide with "${decisionOutcome}"`,
                        original: { status: caseRow.status, penalty_amount: caseRow.penalty_amount },
                        overridden: { outcome: decisionOutcome, penalty_amount: decisionPenalty || null },
                        metadata: {
                          source: 'phase1_override_framework',
                          screen: 'EnforcementDetail',
                          enforcement_id: caseRow.id,
                          case_number: caseRow.case_number,
                          previous_status: caseRow.status,
                          new_status: 'decided',
                          decision_outcome: decisionOutcome,
                        },
                        apply: async () => { await recordDecision.mutateAsync(); },
                      });
                    } else {
                      recordDecision.mutate();
                    }
                  }} disabled={recordDecision.isPending}>Record decision</Button></div>
                </div>
              )}

              {canAppeal && (
                <div className="border rounded p-3 flex items-center justify-between">
                  <div className="text-sm">Licensee filed an appeal within the deadline?</div>
                  <Button size="sm" variant="outline" onClick={() => markAppealed.mutate()} disabled={markAppealed.isPending}>Mark appealed</Button>
                </div>
              )}

              {caseRow.penalty_amount != null && Number(caseRow.penalty_paid_amount || 0) < Number(caseRow.penalty_amount) && (
                <div className="border rounded p-3 space-y-2">
                  <Label className="text-xs">Record penalty payment</Label>
                  <div className="flex gap-2">
                    <Input placeholder={`Amount (${currency})`} type="number" min="0" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                    <Button size="sm" onClick={() => recordPayment.mutate()} disabled={recordPayment.isPending}>Record</Button>
                  </div>
                </div>
              )}

              {canCloseOrWithdraw && (
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="border rounded p-3 space-y-2">
                    <Label className="text-xs flex items-center gap-1 text-green-700"><CheckCircle2 className="h-3 w-3" /> Close case</Label>
                    <Textarea rows={2} placeholder="Closing note (min 5 chars)" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
                    <div className="flex justify-end"><Button size="sm" onClick={() => closeCase.mutate()} disabled={closeCase.isPending}>Close</Button></div>
                  </div>
                  <div className="border rounded p-3 space-y-2">
                    <Label className="text-xs flex items-center gap-1 text-red-700"><XCircle className="h-3 w-3" /> Withdraw case</Label>
                    <Textarea rows={2} placeholder="Withdrawal reason (min 10 chars)" value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} />
                    <div className="flex justify-end"><Button size="sm" variant="destructive" onClick={() => withdrawCase.mutate()} disabled={withdrawCase.isPending}>Withdraw</Button></div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Case timeline</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(events ?? []).length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
            {(events ?? []).map((e: any) => (
              <div key={e.id} className="border rounded p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{e.event_type}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()} · {e.actor_name}</span>
                </div>
                {e.note && <div className="mt-1 text-xs whitespace-pre-wrap">{e.note}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {pending && (
        <OverrideReasonDialog
          open={!!pending}
          onOpenChange={(o) => { if (!o) setPending(null); }}
          module="enforcement"
          entityType="enforcement_action"
          entityId={caseRow.id}
          ruleKey={pending.ruleKey}
          title={pending.title}
          originalValue={pending.original}
          overriddenValue={pending.overridden}
          metadata={pending.metadata}
          onOverridden={async () => { await pending.apply(); setPending(null); }}
        />
      )}
    </DashboardLayout>
  );
}
