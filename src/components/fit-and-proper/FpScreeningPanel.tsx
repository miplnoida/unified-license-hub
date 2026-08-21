import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, PlayCircle, ShieldAlert, ShieldOff, Sparkles, CheckCircle2, HelpCircle, ExternalLink } from 'lucide-react';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { logFpAction } from '@/lib/fpAudit';
import { fpFindingDisposition, fpFindingSetEvidence, fpFindingSetFalsePositive } from '@/lib/fpGovernedOps';
import { normalizeFpEvidence, fpEvidenceDisplayName, openFpEvidenceFile, uploadFpEvidence } from '@/lib/fpEvidence';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

const ROUTING_BADGE: Record<string, { label: string; className: string }> = {
  high: { label: 'SUPERVISOR QUEUE', className: 'bg-red-100 text-red-800 border-red-300' },
  medium: { label: 'ASSESSOR REVIEW', className: 'bg-amber-50 text-amber-800 border-amber-300' },
  low: { label: 'ASSESSOR REVIEW', className: 'bg-slate-100 text-slate-700 border-slate-300' },
};

interface Props {
  individualId: string;
  assessmentId?: string | null;
  /**
   * EPR-04: when true the panel shows ONLY the runs and findings belonging to
   * `assessmentId`. The assessment case workspace always sets this so evidence
   * from another assessment of the same person can never leak into the case.
   */
  scopeToAssessment?: boolean;
}

type PendingOverride = {
  ruleKey: string;
  originalValue: unknown;
  overriddenValue: unknown;
  metadata: Record<string, unknown>;
  title: string;
  description: string;
  apply: () => Promise<void>;
};

export function FpScreeningPanel({ individualId, assessmentId, scopeToAssessment = false }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [running, setRunning] = useState(false);
  const [runningAi, setRunningAi] = useState(false);
  const [pending, setPending] = useState<PendingOverride | null>(null);
  const [resolving, setResolving] = useState<{ id: string; status: 'true_positive' | 'false_positive' | 'needs_review'; title: string } | null>(null);
  const [resolutionReason, setResolutionReason] = useState('');

  const scoped = scopeToAssessment && !!assessmentId;

  const { data: runs } = useQuery({
    queryKey: ['fp_screening_runs', individualId, scoped ? assessmentId : null],
    queryFn: async () => {
      let q = supabase.from('fp_screening_runs')
        .select('id, assessment_id, run_type, status, total_checks, total_hits, started_at, completed_at, config_snapshot');
      q = scoped ? q.eq('assessment_id', assessmentId!) : q.eq('individual_id', individualId);
      const { data, error } = await q.order('started_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: findings } = useQuery({
    queryKey: ['fp_findings', individualId, scoped ? assessmentId : null],
    queryFn: async () => {
      let q = supabase.from('fp_findings')
        .select('id, run_id, config_id, check_type, title, severity, summary, source, severity_basis, is_false_positive, review_note, reviewed_at, created_at, confidence_score, resolution_status, resolution_reason, resolved_at, citations, evidence_urls');
      q = scoped ? q.eq('assessment_id', assessmentId!) : q.eq('individual_id', individualId);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });


  async function uploadEvidence(findingId: string, file: File) {
    try {
      const current = (findings ?? []).find((f: any) => f.id === findingId);
      const existing = normalizeFpEvidence(current?.evidence_urls);
      const uploaded = await uploadFpEvidence(findingId, file, user?.id ?? null);
      const updated = [...existing, uploaded];
      // Governed operation — it validates and audits the evidence change itself.
      await fpFindingSetEvidence(findingId, updated);
      toast.success(`Evidence uploaded: ${file.name}`);
      qc.invalidateQueries({ queryKey: ['fp_findings', individualId] });
    } catch (e: any) {
      toast.error(e?.message || 'Upload failed');
    }
  }

  const runScreening = async () => {
    if (!assessmentId) { toast.error('Open an assessment first to run screening.'); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('fp-screening-run', {
        body: { assessment_id: assessmentId, run_type: 'manual', triggered_by: user?.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Screening failed');
      toast.success(`Screening complete — ${data.total_hits} findings from ${data.total_checks} checks`, {
        action: {
          label: 'View in AI Analysis',
          onClick: () => navigate(`/fpa/ai-analysis?assessment_id=${assessmentId}`),
        },
      });
      await logFpAction('fp.screening.run', 'fp_screening_run', data.run_id ?? null, {
        after: { total_checks: data.total_checks, total_hits: data.total_hits, status: 'success' },
        context: { individualId, assessmentId, screeningRunId: data.run_id ?? null },
      });
      qc.invalidateQueries({ queryKey: ['fp_screening_runs', individualId] });
      qc.invalidateQueries({ queryKey: ['fp_findings', individualId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
      await logFpAction('fp.screening.failed', 'fp_screening_run', null, {
        after: { error: e?.message ?? 'unknown' },
        context: { individualId, assessmentId },
      });
    } finally {
      setRunning(false);
    }
  };

  const runAiMedia = async () => {
    if (!assessmentId) { toast.error('Open an assessment first.'); return; }
    setRunningAi(true);
    try {
      const { data, error } = await supabase.functions.invoke('fp-ai-media-ingest', {
        body: { individual_id: individualId, assessment_id: assessmentId, triggered_by: user?.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'AI media scan failed');
      toast.success(`AI media scan complete — ${data.total_hits} finding(s)`, {
        action: {
          label: 'View in AI Analysis',
          onClick: () => navigate(`/fpa/ai-analysis?assessment_id=${assessmentId}`),
        },
      });
      await logFpAction('fp.screening.ai_media', 'fp_screening_run', data.run_id ?? null, {
        after: { total_hits: data.total_hits },
        context: { individualId, assessmentId },
      });
      qc.invalidateQueries({ queryKey: ['fp_screening_runs', individualId] });
      qc.invalidateQueries({ queryKey: ['fp_findings', individualId] });
    } catch (e: any) {
      toast.error(e?.message || 'Failed');
    } finally {
      setRunningAi(false);
    }
  };

  async function submitResolution() {
    if (!resolving) return;
    if (resolutionReason.trim().length < 10) { toast.error('Reason must be at least 10 characters.'); return; }
    try {
      await fpFindingDisposition(resolving.id, resolving.status, resolutionReason.trim());
    } catch (e: any) {
      toast.error(e?.message || 'Failed to record disposition');
      return;
    }

    // C1 — dispatch supervisor notification for HIGH true-positive findings
    const resolvedFinding = (findings ?? []).find((f: any) => f.id === resolving.id);
    if (resolving.status === 'true_positive' && resolvedFinding?.severity === 'high') {
      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: {
            event_key: 'fp_high_finding_confirmed',
            entity_type: 'fp_finding',
            entity_id: resolving.id,
            payload: { individual_id: individualId, assessment_id: assessmentId, finding_title: resolving.title, severity: 'high' },
          },
        });
      } catch (e) { console.warn('dispatch-notification-event failed for high finding', e); }
    }

    toast.success('Finding resolved');
    setResolving(null);
    setResolutionReason('');
    qc.invalidateQueries({ queryKey: ['fp_findings', individualId] });
  }

  // Business update runs ONLY after the override has been logged.
  async function applyFindingStatus(findingId: string, isFalse: boolean) {
    await fpFindingSetFalsePositive(
      findingId,
      isFalse,
      isFalse ? 'False-positive override recorded from the screening panel' : null,
    );
    toast.success(isFalse ? 'Marked as false positive' : 'Finding restored');
    qc.invalidateQueries({ queryKey: ['fp_findings', individualId] });
  }

  function openFalsePositive(f: any) {
    setPending({
      ruleKey: 'fit_and_proper.screening.false_positive',
      originalValue: { is_false_positive: false, severity: f.severity, title: f.title },
      overriddenValue: { is_false_positive: true, severity: f.severity, title: f.title },
      metadata: {
        source: 'phase1_override_framework',
        screen: 'FpScreeningPanel',
        finding_id: f.id,
        assessment_id: assessmentId,
        recommendation_source: 'screening_engine',
        rule_result_id: f.run_id,
        previous_status: 'active',
        new_status: 'false_positive',
        previous_severity: f.severity,
      },
      title: 'Mark screening finding as false positive',
      description: `You are overriding the screening engine's finding "${f.title}" (${f.check_type}). A written justification is mandatory.`,
      apply: () => applyFindingStatus(f.id, true),
    });
  }

  function openRestore(f: any) {
    setPending({
      ruleKey: 'fit_and_proper.screening.restore_finding',
      originalValue: { is_false_positive: true, severity: f.severity, title: f.title },
      overriddenValue: { is_false_positive: false, severity: f.severity, title: f.title },
      metadata: {
        source: 'phase1_override_framework',
        screen: 'FpScreeningPanel',
        finding_id: f.id,
        assessment_id: assessmentId,
        recommendation_source: 'screening_engine',
        rule_result_id: f.run_id,
        previous_status: 'false_positive',
        new_status: 'active',
      },
      title: 'Restore finding to active',
      description: `Reactivating a previously suppressed screening finding requires justification.`,
      apply: () => applyFindingStatus(f.id, false),
    });
  }

  return (
    <div className="space-y-3">
      <Card><CardContent className="p-4 flex items-center justify-between">
        <div className="text-sm">
          <div className="font-medium">Screening runs</div>
          <div className="text-xs text-muted-foreground">Runs sanctions / PEP / criminal / financial / regulator watchlist / adverse-media checks configured by admin.</div>
        </div>
        <div className="flex gap-2">
          <Button data-rbac="fit_and_proper.edit" size="sm" variant="outline" onClick={runAiMedia} disabled={runningAi || !assessmentId}>
            {runningAi ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            AI media scan
          </Button>
          <Button data-rbac="fit_and_proper.edit" size="sm" onClick={runScreening} disabled={running || !assessmentId}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
            Run screening
          </Button>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-2">
        {(runs ?? []).length === 0 && <p className="text-sm text-muted-foreground">No screening runs yet.</p>}
        {(runs ?? []).map((r: any) => {
          const snapCount = Array.isArray(r.config_snapshot) ? r.config_snapshot.length : null;
          return (
            <div key={r.id} className="text-xs border rounded p-2 flex justify-between">
              <div>
                <span className="font-mono">{r.id.slice(0, 8)}</span> · {r.run_type} · {r.status}
                <span className="ml-2 text-muted-foreground">{new Date(r.started_at).toLocaleString()}</span>
                {snapCount != null && (
                  <Badge variant="outline" className="ml-2 bg-slate-50 text-slate-700">snapshot: {snapCount} check(s)</Badge>
                )}
              </div>
              <div>{r.total_hits} hit(s) / {r.total_checks} check(s)</div>
            </div>
          );
        })}
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">Findings ({(findings ?? []).length})</div>
        {(findings ?? []).length === 0 && <p className="text-sm text-muted-foreground">No findings raised.</p>}
        {(findings ?? []).map((f: any) => {
          const cites = Array.isArray(f.citations) ? f.citations : [];
          const resolved = f.resolution_status && !['pending', 'needs_review', 'true_positive_draft', 'false_positive_draft'].includes(f.resolution_status);
          return (
          <div key={f.id} className={`border rounded p-3 ${f.is_false_positive ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={SEVERITY_CLASS[f.severity] || SEVERITY_CLASS.low}>{f.severity}</Badge>
                  {(() => { const r = ROUTING_BADGE[f.severity] || ROUTING_BADGE.low; return <Badge variant="outline" className={r.className}>{r.label}</Badge>; })()}
                  <span className="text-xs text-muted-foreground">{f.check_type}</span>
                  {f.source && <span className="text-xs text-muted-foreground">· source: {f.source}</span>}
                  {typeof f.confidence_score === 'number' && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-800">confidence {Number(f.confidence_score).toFixed(0)}%</Badge>
                  )}
                  {f.resolution_status && (
                    <Badge variant="outline" className={resolved ? 'bg-slate-100 text-slate-700' : 'bg-amber-50 text-amber-800'}>
                      {String(f.resolution_status).replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
                <div className="font-medium text-sm mt-1">{f.title}</div>
                {f.summary && <div className="text-xs text-muted-foreground mt-1">{f.summary}</div>}
                {cites.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {cites.map((c: any, i: number) => (
                      <div key={i} className="text-xs border-l-2 border-blue-200 pl-2">
                        <a href={c.source_url} target="_blank" rel="noreferrer" className="text-blue-700 underline inline-flex items-center gap-1">
                          <ExternalLink className="h-3 w-3" /> {c.source_url.slice(0, 70)}
                        </a>
                        {c.excerpt && <div className="text-muted-foreground italic">"{c.excerpt}"</div>}
                      </div>
                    ))}
                  </div>
                )}
                {f.resolution_reason && <div className="text-xs italic mt-1">Resolution: {f.resolution_reason}</div>}
                <div className="mt-2 border-t pt-2">
                  {(() => {
                    const evidence = normalizeFpEvidence(f.evidence_urls);
                    return (
                      <>
                        <div className="text-xs font-medium mb-1">Evidence ({evidence.length})</div>
                        {evidence.map((e, i) => (
                          <div key={i} className="text-xs flex items-center gap-2">
                            <button type="button" className="text-blue-700 underline" onClick={() => openFpEvidenceFile(e.path)}>
                              {fpEvidenceDisplayName(e)}
                            </button>
                            <span className="text-muted-foreground">{e.uploaded_at ? new Date(e.uploaded_at).toLocaleString() : ''}</span>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                  <label className="mt-1 inline-flex items-center gap-2 text-xs cursor-pointer text-blue-700 hover:underline">
                    <input type="file" className="hidden" onChange={(ev) => {
                      const file = ev.target.files?.[0];
                      if (file) uploadEvidence(f.id, file);
                      ev.target.value = '';
                    }} />
                    + Upload evidence
                  </label>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {!resolved && (
                  <>
                    <Button data-rbac="fit_and_proper.edit" size="sm" variant="ghost" onClick={() => setResolving({ id: f.id, status: 'true_positive', title: f.title })}>
                      <CheckCircle2 className="h-4 w-4 mr-1 text-red-600" /> True positive
                    </Button>
                    <Button data-rbac="fit_and_proper.edit" size="sm" variant="ghost" onClick={() => setResolving({ id: f.id, status: 'false_positive', title: f.title })}>
                      <ShieldOff className="h-4 w-4 mr-1" /> False positive
                    </Button>
                    <Button data-rbac="fit_and_proper.edit" size="sm" variant="ghost" onClick={() => setResolving({ id: f.id, status: 'needs_review', title: f.title })}>
                      <HelpCircle className="h-4 w-4 mr-1" /> Needs review
                    </Button>
                  </>
                )}
                {resolved && (
                  <Button data-rbac="fit_and_proper.edit" size="sm" variant="ghost" onClick={() => openRestore(f)}>
                    <ShieldAlert className="h-4 w-4 mr-1" /> Reopen
                  </Button>
                )}
              </div>
            </div>
          </div>
        );
        })}
      </CardContent></Card>

      {pending && (
        <OverrideReasonDialog
          open={!!pending}
          onOpenChange={(o) => { if (!o) setPending(null); }}
          module="fit_and_proper"
          entityType="fp_individual"
          entityId={individualId}
          ruleKey={pending.ruleKey}
          originalValue={pending.originalValue}
          overriddenValue={pending.overriddenValue}
          metadata={pending.metadata}
          title={pending.title}
          description={pending.description}
          onOverridden={async () => {
            try { await pending.apply(); } finally { setPending(null); }
          }}
        />
      )}

      <Dialog open={!!resolving} onOpenChange={(o) => { if (!o) { setResolving(null); setResolutionReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve finding — {resolving?.status.replace('_', ' ')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{resolving?.title}</p>
            <Textarea
              placeholder="Reason for this resolution (min 10 characters)…"
              value={resolutionReason}
              onChange={(e) => setResolutionReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setResolving(null); setResolutionReason(''); }}>Cancel</Button>
            <Button onClick={submitResolution}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
