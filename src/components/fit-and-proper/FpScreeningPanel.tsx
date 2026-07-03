import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const SEVERITY_CLASS: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-slate-100 text-slate-700',
};

interface Props { individualId: string; assessmentId?: string | null }

type PendingOverride = {
  ruleKey: string;
  originalValue: unknown;
  overriddenValue: unknown;
  metadata: Record<string, unknown>;
  title: string;
  description: string;
  apply: () => Promise<void>;
};

export function FpScreeningPanel({ individualId, assessmentId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [pending, setPending] = useState<PendingOverride | null>(null);

  const { data: runs } = useQuery({
    queryKey: ['fp_screening_runs', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_screening_runs')
        .select('id, assessment_id, run_type, status, total_checks, total_hits, started_at, completed_at, config_snapshot')
        .eq('individual_id', individualId).order('started_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: findings } = useQuery({
    queryKey: ['fp_findings', individualId],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_findings')
        .select('id, run_id, config_id, check_type, title, severity, summary, source, severity_basis, is_false_positive, review_note, reviewed_at, created_at')
        .eq('individual_id', individualId).order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const runScreening = async () => {
    if (!assessmentId) { toast.error('Open an assessment first to run screening.'); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('fp-screening-run', {
        body: { assessment_id: assessmentId, run_type: 'manual', triggered_by: user?.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Screening failed');
      toast.success(`Screening complete — ${data.total_hits} findings from ${data.total_checks} checks`);
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

  // Business update runs ONLY after the override has been logged.
  async function applyFindingStatus(findingId: string, isFalse: boolean) {
    const before = (findings ?? []).find((f: any) => f.id === findingId) ?? null;
    const { error } = await supabase.from('fp_findings').update({
      is_false_positive: isFalse,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', findingId);
    if (error) throw error;
    await logFpAction(isFalse ? 'fp.finding.false_positive' : 'fp.finding.restored', 'fp_finding', findingId, {
      before: before ? { is_false_positive: before.is_false_positive } : null,
      after: { is_false_positive: isFalse },
      context: { individualId, assessmentId, findingId },
      justification: isFalse ? 'False-positive override' : undefined,
    });
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
        <Button size="sm" onClick={runScreening} disabled={running || !assessmentId}>
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
          Run screening
        </Button>
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
        {(findings ?? []).map((f: any) => (
          <div key={f.id} className={`border rounded p-3 ${f.is_false_positive ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={SEVERITY_CLASS[f.severity] || SEVERITY_CLASS.low}>{f.severity}</Badge>
                  <span className="text-xs text-muted-foreground">{f.check_type}</span>
                  {f.source && <span className="text-xs text-muted-foreground">· source: {f.source}</span>}
                  {f.config_id && <span className="text-xs font-mono text-muted-foreground">· cfg {String(f.config_id).slice(0, 8)}</span>}
                  {f.is_false_positive && <Badge variant="outline" className="bg-slate-100 text-slate-700">false positive</Badge>}
                </div>
                <div className="font-medium text-sm mt-1">{f.title}</div>
                {f.summary && <div className="text-xs text-muted-foreground mt-1">{f.summary}</div>}
                {f.review_note && <div className="text-xs italic mt-1">Note: {f.review_note}</div>}
              </div>
              <div className="flex gap-1">
                {!f.is_false_positive && (
                  <Button size="sm" variant="ghost" onClick={() => openFalsePositive(f)}>
                    <ShieldOff className="h-4 w-4 mr-1" /> False positive
                  </Button>
                )}
                {f.is_false_positive && (
                  <Button size="sm" variant="ghost" onClick={() => openRestore(f)}>
                    <ShieldAlert className="h-4 w-4 mr-1" /> Restore
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
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
    </div>
  );
}
