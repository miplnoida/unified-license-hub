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
import { Loader2, Scale } from 'lucide-react';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { logFpAppealAction } from '@/lib/fpAudit';

const STATUS_META: Record<string, { label: string; className: string }> = {
  submitted: { label: 'Filed', className: 'bg-blue-100 text-blue-800' },
  filed: { label: 'Filed', className: 'bg-blue-100 text-blue-800' },
  under_review: { label: 'Under review', className: 'bg-amber-100 text-amber-800' },
  decided: { label: 'Decided', className: 'bg-slate-200 text-slate-800' },
  withdrawn: { label: 'Withdrawn', className: 'bg-slate-100 text-slate-600' },
};

const DECISION_META: Record<string, { label: string; className: string }> = {
  upheld_original: { label: 'Original upheld', className: 'bg-slate-100 text-slate-800' },
  upheld: { label: 'Upheld', className: 'bg-slate-100 text-slate-800' },
  partially_upheld: { label: 'Partially upheld', className: 'bg-amber-100 text-amber-800' },
  dismissed: { label: 'Dismissed', className: 'bg-slate-100 text-slate-600' },
  remitted: { label: 'Remitted for reconsideration', className: 'bg-blue-100 text-blue-800' },
  overturned_to_approved: { label: 'Overturned → Approved', className: 'bg-green-100 text-green-800' },
  overturned_to_conditional: { label: 'Overturned → Conditional', className: 'bg-amber-100 text-amber-800' },
};

interface Props { individualId: string }

export function FpAppealsPanel({ individualId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [grounds, setGrounds] = useState('');
  const [committeePick, setCommitteePick] = useState<Record<string, string>>({});
  const [decisionPick, setDecisionPick] = useState<Record<string, string>>({});
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<null | {
    appealId: string;
    ruleKey: string;
    original: unknown;
    overridden: unknown;
    metadata: Record<string, unknown>;
    apply: () => Promise<void>;
  }>(null);

  const { data: currentDet } = useQuery({
    queryKey: ['fp_current_determination', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_determinations')
        .select('id, assessment_id, outcome, rationale, determined_at')
        .eq('individual_id', individualId).eq('is_current', true).maybeSingle();
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

  const { data: appeals } = useQuery({
    queryKey: ['fp_appeals', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_appeals')
        .select('*').eq('individual_id', individualId).order('filed_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: eligibleLicenses } = useQuery({
    queryKey: ['fp_appeal_eligible_licenses', individualId],
    queryFn: async () => {
      const { data: roles } = await supabase.from('fp_individual_roles')
        .select('license_id, licensee_id').eq('individual_id', individualId).eq('is_current', true);
      const licIds = Array.from(new Set((roles ?? []).map((r: any) => r.license_id).filter(Boolean)));
      if (licIds.length === 0) return [];
      const { data } = await supabase.from('licenses').select('id, license_number, license_type, status').in('id', licIds);
      return data ?? [];
    },
  });

  const [licenseId, setLicenseId] = useState<string>('none');

  const canFile = useMemo(() => {
    if (!currentDet) return false;
    if (!['rejected', 'conditional'].includes(currentDet.outcome)) return false;
    const openAppeal = (appeals ?? []).find((a: any) => a.determination_id === currentDet.id && a.status !== 'decided' && a.status !== 'withdrawn');
    return !openAppeal;
  }, [currentDet, appeals]);

  // A1: every appeal mutation runs through a governed server operation
  // (permission check + business validation + audit, server-side).
  const fileAppeal = useMutation({
    mutationFn: async () => {
      if (!currentDet) throw new Error('No current determination');
      if (grounds.trim().length < 20) throw new Error('Grounds must be at least 20 characters');
      const { error } = await (supabase.rpc as any)('fp_appeal_file', {
        _individual_id: individualId,
        _determination_id: currentDet.id,
        _grounds: grounds.trim(),
        _license_id: licenseId && licenseId !== 'none' ? licenseId : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Appeal filed');
      setGrounds('');
      setLicenseId('none');
      qc.invalidateQueries({ queryKey: ['fp_appeals', individualId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed to file appeal'),
  });

  const assignAppealCommittee = useMutation({
    mutationFn: async ({ appealId, committeeId }: { appealId: string; committeeId: string }) => {
      const { error } = await (supabase.rpc as any)('fp_appeal_assign_committee', {
        _appeal_id: appealId,
        _committee_id: committeeId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Appeal committee assigned');
      qc.invalidateQueries({ queryKey: ['fp_appeals', individualId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const decideAppeal = useMutation({
    mutationFn: async ({ appeal, decision, note }: { appeal: any; decision: string; note: string }) => {
      if (!decision) throw new Error('Pick a decision');
      if (note.trim().length < 10) throw new Error('Decision rationale required (min 10 chars)');
      const { error } = await (supabase.rpc as any)('fp_appeal_decide', {
        _appeal_id: appeal.id,
        _decision: decision,
        _rationale: note.trim(),
      });
      if (error) throw error;
      // Fire a notification (no-op if no template configured).
      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: { event_key: 'fp_appeal_decided', entity_type: 'fp_appeal', entity_id: appeal.id, payload: { decision, individual_id: individualId, filed_by: appeal.filed_by ?? null } },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => {
      toast.success('Appeal decided');
      qc.invalidateQueries({ queryKey: ['fp_appeals', individualId] });
      qc.invalidateQueries({ queryKey: ['fp_current_determination', individualId] });
      qc.invalidateQueries({ queryKey: ['fp_determinations', individualId] });
      qc.invalidateQueries({ queryKey: ['fp_determinations_for_individual', individualId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });

  const withdrawAppeal = useMutation({
    mutationFn: async (appealId: string) => {
      const { error } = await (supabase.rpc as any)('fp_appeal_withdraw', {
        _appeal_id: appealId,
        _reason: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Appeal withdrawn');
      qc.invalidateQueries({ queryKey: ['fp_appeals', individualId] });
    },
    onError: (e: any) => toast.error(e?.message || 'Failed'),
  });


  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Scale className="h-4 w-4" /> File appeal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!currentDet ? (
            <p className="text-sm text-muted-foreground">No current determination to appeal.</p>
          ) : !['rejected', 'conditional'].includes(currentDet.outcome) ? (
            <p className="text-sm text-muted-foreground">
              Current determination is <Badge variant="outline">{currentDet.outcome}</Badge> — only rejected or conditional determinations may be appealed.
            </p>
          ) : !canFile ? (
            <p className="text-sm text-muted-foreground">An open appeal already exists for the current determination.</p>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">
                Appealing determination from {new Date(currentDet.determined_at).toLocaleDateString()} — outcome <Badge variant="outline">{currentDet.outcome}</Badge>
              </div>
              <div>
                <Label className="text-xs">Grounds for appeal (min 20 chars)</Label>
                <Textarea rows={4} value={grounds} onChange={(e) => setGrounds(e.target.value)}
                  placeholder="Explain the basis for challenging the determination…" />
              </div>
              {(eligibleLicenses ?? []).length > 0 && (
                <div>
                  <Label className="text-xs">Link to license (optional — enables license-impact audit trail on overturn)</Label>
                  <Select value={licenseId} onValueChange={setLicenseId}>
                    <SelectTrigger><SelectValue placeholder="No license link" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No license link</SelectItem>
                      {(eligibleLicenses ?? []).map((l: any) => (
                        <SelectItem key={l.id} value={l.id}>{l.license_number || l.id.slice(0, 8)} · {l.license_type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex justify-end">
                <Button data-rbac="fit_and_proper.edit" onClick={() => fileAppeal.mutate()} disabled={fileAppeal.isPending || grounds.trim().length < 20}>
                  {fileAppeal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  File appeal
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Appeals history</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(appeals ?? []).length === 0 && <p className="text-sm text-muted-foreground">No appeals filed.</p>}
          {(appeals ?? []).map((a: any) => {
            const sMeta = STATUS_META[a.status] || STATUS_META.submitted;
            const dMeta = a.decision ? DECISION_META[a.decision] : null;
            return (
              <div key={a.id} className="border rounded p-3 space-y-2 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={sMeta.className}>{sMeta.label}</Badge>
                  {dMeta && <Badge variant="outline" className={dMeta.className}>{dMeta.label}</Badge>}
                  <span className="text-xs text-muted-foreground">Filed {new Date(a.filed_at).toLocaleString()}</span>
                </div>
                <div className="text-xs whitespace-pre-wrap">{a.grounds}</div>

                {(a.status === 'submitted' || a.status === 'filed') && (
                  <div className="border rounded p-2 bg-muted/30 space-y-2">
                    <Label className="text-xs">Assign appeal committee</Label>
                    <div className="flex gap-2 items-end">
                      <Select
                        value={committeePick[a.id] || ''}
                        onValueChange={(v) => setCommitteePick((p) => ({ ...p, [a.id]: v }))}
                      >
                        <SelectTrigger className="flex-1"><SelectValue placeholder="Pick committee" /></SelectTrigger>
                        <SelectContent>{(committees ?? []).map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}</SelectContent>
                      </Select>
                      <Button data-rbac="fit_and_proper.edit" size="sm" disabled={!committeePick[a.id] || assignAppealCommittee.isPending}
                        onClick={() => assignAppealCommittee.mutate({ appealId: a.id, committeeId: committeePick[a.id] })}>
                        Assign
                      </Button>
                      <Button data-rbac="fit_and_proper.edit" size="sm" variant="ghost" onClick={() => withdrawAppeal.mutate(a.id)}>Withdraw</Button>
                    </div>
                  </div>
                )}

                {a.status === 'under_review' && (
                  <div className="border rounded p-2 bg-muted/30 space-y-2">
                    <Label className="text-xs">Record appeal decision</Label>
                    <Select
                      value={decisionPick[a.id] || ''}
                      onValueChange={(v) => setDecisionPick((p) => ({ ...p, [a.id]: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Pick decision" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="upheld_original">Uphold original determination</SelectItem>
                        <SelectItem value="partially_upheld">Partially uphold</SelectItem>
                        <SelectItem value="dismissed">Dismiss appeal</SelectItem>
                        <SelectItem value="remitted">Remit for reconsideration</SelectItem>
                        <SelectItem value="overturned_to_approved">Overturn → Approved</SelectItem>
                        <SelectItem value="overturned_to_conditional">Overturn → Conditional</SelectItem>
                      </SelectContent>
                    </Select>
                    <Textarea rows={3} placeholder="Decision rationale (min 10 chars)…"
                      value={decisionNote[a.id] || ''}
                      onChange={(e) => setDecisionNote((p) => ({ ...p, [a.id]: e.target.value }))} />
                    <div className="flex justify-end gap-2">
                      <Button data-rbac="fit_and_proper.edit" size="sm" variant="ghost" onClick={() => withdrawAppeal.mutate(a.id)}>Withdraw</Button>
                      <Button data-rbac="fit_and_proper.edit" size="sm" disabled={decideAppeal.isPending}
                        onClick={() => {
                          const decision = decisionPick[a.id] || '';
                          const note = decisionNote[a.id] || '';
                          if (decision === 'overturned_to_approved' || decision === 'overturned_to_conditional') {
                            setPending({
                              appealId: a.id,
                              ruleKey: 'fit_and_proper.appeal.determination_override',
                              original: { determination_id: a.determination_id, outcome: currentDet?.outcome },
                              overridden: { decision, new_outcome: decision === 'overturned_to_approved' ? 'approved' : 'conditional' },
                              metadata: {
                                source: 'phase1_override_framework',
                                screen: 'FpAppealsPanel',
                                appeal_id: a.id,
                                individual_id: individualId,
                                previous_outcome: currentDet?.outcome,
                                new_outcome: decision === 'overturned_to_approved' ? 'approved' : 'conditional',
                              },
                              apply: async () => { await decideAppeal.mutateAsync({ appeal: a, decision, note }); },
                            });
                          } else {
                            decideAppeal.mutate({ appeal: a, decision, note });
                          }
                        }}>
                        {decideAppeal.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Record decision
                      </Button>
                    </div>
                  </div>
                )}

                {a.status === 'decided' && a.decision_rationale && (
                  <div className="text-xs border-t pt-2">
                    <strong>Rationale:</strong> {a.decision_rationale}
                    {a.decided_at && <span className="text-muted-foreground"> · {new Date(a.decided_at).toLocaleString()}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {pending && (
        <OverrideReasonDialog
          open={!!pending}
          onOpenChange={(o) => { if (!o) setPending(null); }}
          module="fit_and_proper"
          entityType="fp_appeal"
          entityId={pending.appealId}
          ruleKey={pending.ruleKey}
          title="Overturn prior determination"
          originalValue={pending.original}
          overriddenValue={pending.overridden}
          metadata={pending.metadata}
          onOverridden={async () => { await pending.apply(); setPending(null); }}
        />
      )}
    </div>
  );
}
