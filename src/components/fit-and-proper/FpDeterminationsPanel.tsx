import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Gavel, CheckCircle2, XCircle, MinusCircle, AlertCircle } from 'lucide-react';
import { logFpAction } from '@/lib/fpAudit';

const OUTCOME_META: Record<string, { label: string; className: string }> = {
  approved: { label: 'Approved', className: 'bg-green-100 text-green-800' },
  conditional: { label: 'Conditional', className: 'bg-amber-100 text-amber-800' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-800' },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-700' },
};

const VOTE_META: Record<string, { icon: any; className: string }> = {
  approve: { icon: CheckCircle2, className: 'text-green-700' },
  conditional: { icon: AlertCircle, className: 'text-amber-700' },
  reject: { icon: XCircle, className: 'text-red-700' },
  abstain: { icon: MinusCircle, className: 'text-slate-500' },
};

interface Props { individualId: string; assessmentId?: string | null }

export function FpDeterminationsPanel({ individualId, assessmentId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [assignCommitteeId, setAssignCommitteeId] = useState<string>('');
  const [voteChoice, setVoteChoice] = useState<string>('approve');
  const [voteNote, setVoteNote] = useState('');
  const [rationale, setRationale] = useState('');

  const { data: assessment } = useQuery({
    queryKey: ['fp_assessment_for_det', assessmentId],
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_assessments')
        .select('id, individual_id, status, committee_id').eq('id', assessmentId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: committees } = useQuery({
    queryKey: ['fp_committees_active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_committees')
        .select('id, name, quorum, approval_threshold_pct').eq('is_active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: committee } = useQuery({
    queryKey: ['fp_committee', assessment?.committee_id],
    enabled: !!assessment?.committee_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_committees')
        .select('*').eq('id', assessment!.committee_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: myMembership } = useQuery({
    queryKey: ['fp_my_membership', assessment?.committee_id, user?.id],
    enabled: !!assessment?.committee_id && !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_committee_members')
        .select('id, member_role, is_active, vote_weight').eq('committee_id', assessment!.committee_id!).eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: votes } = useQuery({
    queryKey: ['fp_committee_votes', assessmentId],
    enabled: !!assessmentId,
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_committee_votes')
        .select('id, member_id, vote, justification, voted_at').eq('assessment_id', assessmentId!);
      if (error) throw error;
      const memberIds = (data ?? []).map((v: any) => v.member_id);
      if (!memberIds.length) return [];
      const { data: mems } = await supabase.from('fp_committee_members').select('id, user_id, member_role').in('id', memberIds);
      const userIds = (mems ?? []).map((m: any) => m.user_id);
      const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', userIds);
      const memMap = new Map((mems ?? []).map((m: any) => [m.id, m]));
      const profMap = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((v: any) => ({
        ...v, member: memMap.get(v.member_id), profile: memMap.get(v.member_id) ? profMap.get((memMap.get(v.member_id) as any).user_id) : null,
      }));
    },
  });

  const { data: determinations } = useQuery({
    queryKey: ['fp_determinations', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_determinations')
        .select('id, assessment_id, outcome, rationale, determined_at, is_current, supersedes_id')
        .eq('individual_id', individualId).order('determined_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const myVote = useMemo(
    () => (votes ?? []).find((v: any) => v.member?.user_id === user?.id) || null,
    [votes, user?.id],
  );

  const assign = useMutation({
    mutationFn: async () => {
      if (!assessmentId || !assignCommitteeId) throw new Error('Pick a committee');
      const { error } = await supabase.from('fp_assessments')
        .update({ committee_id: assignCommitteeId, status: 'awaiting_committee' })
        .eq('id', assessmentId);
      if (error) throw error;
      await logFpAction('fp.assessment.committee_assigned', 'fp_assessment', assessmentId, {
        after: { committee_id: assignCommitteeId, status: 'awaiting_committee' },
        context: { individualId, assessmentId, committeeId: assignCommitteeId },
      });
    },
    onSuccess: () => {
      toast.success('Committee assigned');
      qc.invalidateQueries({ queryKey: ['fp_assessment_for_det', assessmentId] });
      qc.invalidateQueries({ queryKey: ['fp_assessment', assessmentId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const castVote = useMutation({
    mutationFn: async () => {
      if (!assessmentId || !assessment?.committee_id || !myMembership) throw new Error('Not a member');
      if ((voteChoice === 'reject' || voteChoice === 'conditional') && voteNote.trim().length < 10) {
        throw new Error('Justification required for reject/conditional votes (min 10 chars)');
      }
      const { data, error } = await supabase.from('fp_committee_votes').insert({
        assessment_id: assessmentId, committee_id: assessment.committee_id,
        member_id: myMembership.id, vote: voteChoice, justification: voteNote || null,
      }).select('id').single();
      if (error) throw error;
      await logFpAction('fp.committee.vote_cast', 'fp_committee_vote', data.id, {
        after: { vote: voteChoice, justification: voteNote || null },
        context: { individualId, assessmentId, committeeId: assessment.committee_id },
      });
    },
    onSuccess: () => {
      toast.success('Vote recorded');
      setVoteNote('');
      qc.invalidateQueries({ queryKey: ['fp_committee_votes', assessmentId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Vote failed'),
  });

  const tally = useMemo(() => {
    const t = { approve: 0, conditional: 0, reject: 0, abstain: 0, total: 0 };
    for (const v of votes ?? []) {
      if (v.vote in t) (t as any)[v.vote]++;
      t.total++;
    }
    return t;
  }, [votes]);

  const quorumMet = committee ? tally.total >= (committee.quorum || 1) : false;
  const voting = tally.approve + tally.conditional + tally.reject;
  const outcome = useMemo(() => {
    if (!quorumMet || voting === 0) return null;
    const approvePct = ((tally.approve + tally.conditional) / voting) * 100;
    if (approvePct >= (committee?.approval_threshold_pct || 50)) {
      return tally.conditional > tally.approve ? 'conditional' : 'approved';
    }
    return 'rejected';
  }, [quorumMet, voting, tally, committee]);

  const finalize = useMutation({
    mutationFn: async () => {
      if (!assessmentId || !assessment || !outcome) throw new Error('Nothing to finalize');
      if (!rationale.trim() || rationale.trim().length < 10) throw new Error('Rationale required (min 10 chars)');
      const { data: prior } = await supabase.from('fp_determinations')
        .select('id').eq('individual_id', individualId).eq('is_current', true).maybeSingle();
      if (prior) {
        await supabase.from('fp_determinations').update({ is_current: false }).eq('id', prior.id);
      }
      const { data: inserted, error } = await supabase.from('fp_determinations').insert({
        assessment_id: assessmentId, individual_id: individualId,
        outcome, rationale: rationale.trim(), determined_by: user!.id,
        supersedes_id: prior?.id ?? null, is_current: true,
        effective_from: new Date().toISOString().slice(0, 10),
      }).select('id').single();
      if (error) throw error;
      await supabase.from('fp_assessments').update({
        status: 'determined', determined_at: new Date().toISOString(),
      }).eq('id', assessmentId);
      await logFpAction(`fp.determination.${outcome}`, 'fp_determination', inserted.id, {
        after: { outcome, rationale: rationale.trim(), supersedes_id: prior?.id ?? null },
        context: { individualId, assessmentId, determinationId: inserted.id },
        justification: rationale.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Determination recorded');
      setRationale('');
      qc.invalidateQueries({ queryKey: ['fp_determinations', individualId] });
      qc.invalidateQueries({ queryKey: ['fp_assessment_for_det', assessmentId] });
      qc.invalidateQueries({ queryKey: ['fp_assessment', assessmentId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  return (
    <div className="space-y-4">
      {!assessmentId ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">Open an assessment to route it to a committee.</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Gavel className="h-4 w-4" /> Committee</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {!committee ? (
                <>
                  <p className="text-sm text-muted-foreground">No committee assigned yet.</p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">Assign committee</Label>
                      <Select value={assignCommitteeId} onValueChange={setAssignCommitteeId}>
                        <SelectTrigger><SelectValue placeholder="Pick active committee" /></SelectTrigger>
                        <SelectContent>{(committees ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name} (quorum {c.quorum}, {c.approval_threshold_pct}%)</SelectItem>
                        ))}</SelectContent>
                      </Select>
                    </div>
                    <Button onClick={() => assign.mutate()} disabled={assign.isPending || !assignCommitteeId}>Assign</Button>
                  </div>
                </>
              ) : (
                <div className="text-sm">
                  <div className="font-medium">{committee.name}</div>
                  <div className="text-xs text-muted-foreground">Quorum {committee.quorum} · Approval threshold {committee.approval_threshold_pct}%</div>
                  {committee.description && <div className="text-xs mt-1">{committee.description}</div>}
                </div>
              )}
            </CardContent>
          </Card>

          {committee && (
            <Card>
              <CardHeader><CardTitle className="text-base">Voting</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span>Total: <strong>{tally.total}</strong> / {committee.quorum}</span>
                  <span className="text-green-700">Approve: {tally.approve}</span>
                  <span className="text-amber-700">Conditional: {tally.conditional}</span>
                  <span className="text-red-700">Reject: {tally.reject}</span>
                  <span className="text-slate-500">Abstain: {tally.abstain}</span>
                </div>

                {myMembership && !myVote && (
                  <div className="border rounded p-3 bg-muted/30 space-y-2">
                    <Label>Cast your vote ({myMembership.member_role})</Label>
                    <div className="flex gap-2 items-end">
                      <Select value={voteChoice} onValueChange={setVoteChoice}>
                        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="approve">Approve</SelectItem>
                          <SelectItem value="conditional">Conditional</SelectItem>
                          <SelectItem value="reject">Reject</SelectItem>
                          <SelectItem value="abstain">Abstain</SelectItem>
                        </SelectContent>
                      </Select>
                      <Textarea rows={1} placeholder="Justification (optional)" value={voteNote} onChange={(e) => setVoteNote(e.target.value)} />
                      <Button onClick={() => castVote.mutate()} disabled={castVote.isPending}>Vote</Button>
                    </div>
                  </div>
                )}
                {myVote && (
                  <div className="text-sm text-muted-foreground border rounded p-2 bg-muted/20">
                    Your vote: <Badge variant="outline">{myVote.vote}</Badge>
                    {myVote.justification && <span className="ml-2 italic">"{myVote.justification}"</span>}
                  </div>
                )}

                <div className="space-y-1">
                  {(votes ?? []).map((v: any) => {
                    const meta = VOTE_META[v.vote] || VOTE_META.abstain;
                    const Icon = meta.icon;
                    return (
                      <div key={v.id} className="flex items-start gap-2 text-sm border rounded p-2">
                        <Icon className={`h-4 w-4 mt-0.5 ${meta.className}`} />
                        <div className="flex-1">
                          <div><strong>{v.profile?.full_name || 'Member'}</strong> <span className="text-xs text-muted-foreground">· {v.member?.member_role}</span></div>
                          {v.justification && <div className="text-xs italic">{v.justification}</div>}
                          <div className="text-xs text-muted-foreground">{new Date(v.voted_at).toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {quorumMet && outcome && assessment?.status !== 'determined' && (
                  <div className="border rounded p-3 bg-primary/5 space-y-2">
                    <div className="text-sm">Quorum reached — proposed outcome: <Badge variant="outline" className={OUTCOME_META[outcome].className}>{OUTCOME_META[outcome].label}</Badge></div>
                    <Textarea rows={3} placeholder="Determination rationale (min 10 chars)…" value={rationale} onChange={(e) => setRationale(e.target.value)} />
                    <div className="flex justify-end">
                      <Button onClick={() => finalize.mutate()} disabled={finalize.isPending || rationale.trim().length < 10}>
                        {finalize.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Finalize determination
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Determinations history</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(determinations ?? []).length === 0 && <p className="text-sm text-muted-foreground">No determinations recorded.</p>}
          {(determinations ?? []).map((d: any) => {
            const meta = OUTCOME_META[d.outcome] || OUTCOME_META.rejected;
            return (
              <div key={d.id} className="border rounded p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
                  {d.is_current && <Badge variant="outline" className="bg-blue-100 text-blue-800">current</Badge>}
                  <span className="text-xs text-muted-foreground">{new Date(d.determined_at).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs">{d.rationale}</div>
                {d.supersedes_id && <div className="text-xs text-muted-foreground mt-1">Supersedes {String(d.supersedes_id).slice(0, 8)}…</div>}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
