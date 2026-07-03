import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Loader2, ShieldAlert } from 'lucide-react';
import {
  useDecisionOptions,
  fetchRationaleTemplate,
  renderRationaleTemplate,
  type DecisionOption,
  type DecisionContext,
} from '@/hooks/useDecisionOptions';
import {
  evaluateApplicationSufficiency,
  getLatestSufficiencyEvaluation,
  type SufficiencyEvaluationSummary,
} from '@/lib/applicationSufficiency';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { logAction } from '@/hooks/useAuditLog';
import { fetchClearances, isTwinPeaksBlocked, type TwinPeaksClearance } from '@/lib/twinPeaksClearance';

const OUTCOMES_GATED = new Set([
  'approve',
  'conditional_approve',
  'reject',
  'defer',
  'return',
  'escalate',
  'info_request',
]);

export interface DecisionExecutePayload {
  option: DecisionOption;
  rationale: string;
  conditions: string;
  sufficiency: SufficiencyEvaluationSummary | null;
  overrideId?: string | null;
}

interface Props {
  applicationId: string;
  context: DecisionContext;
  templateVars?: Record<string, unknown>;
  processing?: boolean;
  onExecute: (payload: DecisionExecutePayload) => Promise<void> | void;
}

const btnVariant = (color: string): any => {
  switch ((color || '').toLowerCase()) {
    case 'destructive':
    case 'red':
      return 'destructive';
    case 'outline':
    case 'secondary':
    case 'amber':
    case 'yellow':
      return 'outline';
    case 'ghost':
      return 'ghost';
    default:
      return 'default';
  }
};

/**
 * Renders decision buttons from `decision_options` (falling back to Approve /
 * Reject / Return). Enforces reason length, conditions, rationale-template
 * autofill, and sufficiency gates with rule_overrides for blockers.
 */
export function ConfigurableDecisionActions({
  applicationId,
  context,
  templateVars,
  processing,
  onExecute,
}: Props) {
  const { options, isLoading, isFallback } = useDecisionOptions(context);
  const [selected, setSelected] = useState<DecisionOption | null>(null);
  const [rationale, setRationale] = useState('');
  const [conditions, setConditions] = useState('');
  const [sufficiency, setSufficiency] = useState<SufficiencyEvaluationSummary | null>(null);
  const [gateBusy, setGateBusy] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [twinPeaksOverrideOpen, setTwinPeaksOverrideOpen] = useState(false);
  const [twinPeaks, setTwinPeaks] = useState<TwinPeaksClearance[]>([]);
  const [warningAckOpen, setWarningAckOpen] = useState(false);
  const [pendingExecute, setPendingExecute] = useState(false);

  useEffect(() => {
    if (!selected) return;
    let alive = true;
    (async () => {
      const tpl = await fetchRationaleTemplate(selected.rationale_template_id);
      if (!alive) return;
      if (tpl?.body) setRationale(renderRationaleTemplate(tpl.body, templateVars ?? {}));
      else setRationale('');
      setConditions('');
    })();
    return () => {
      alive = false;
    };
  }, [selected, templateVars]);

  const minLen = selected?.min_reason_length ?? 10;
  const reasonOk = !selected?.requires_reason || rationale.trim().length >= minLen;
  const conditionsOk = !selected?.requires_conditions || conditions.trim().length > 0;
  const canSubmit = !!selected && reasonOk && conditionsOk && !processing && !gateBusy;

  async function ensureFreshSufficiency(): Promise<SufficiencyEvaluationSummary | null> {
    try {
      const latest = await getLatestSufficiencyEvaluation(applicationId);
      const stale = !latest || !latest.evaluatedAt || Date.now() - new Date(latest.evaluatedAt).getTime() > 5 * 60_000;
      if (stale) {
        const fresh = await evaluateApplicationSufficiency({
          applicationId,
          triggerSource: 'decision_attempt',
        });
        setSufficiency(fresh);
        return fresh;
      }
      setSufficiency(latest);
      return latest;
    } catch (e: any) {
      toast.error(`Sufficiency check failed: ${e.message ?? e}`);
      return null;
    }
  }

  async function attemptSubmit(overrideId?: string, twinPeaksOverrideId?: string) {
    if (!selected) return;
    if (!OUTCOMES_GATED.has(selected.outcome)) {
      await runExecute(null, overrideId ?? null);
      return;
    }
    setGateBusy(true);
    const s = sufficiency ?? (await ensureFreshSufficiency());
    // Twin-peaks gate applies only to approval outcomes
    const isApproval = selected.outcome === 'approve' || selected.outcome === 'conditional_approve';
    let tp: TwinPeaksClearance[] = twinPeaks;
    if (isApproval) {
      try {
        tp = await fetchClearances(applicationId);
        setTwinPeaks(tp);
      } catch (e: any) {
        toast.error(`Twin-peaks check failed: ${e?.message ?? e}`);
        setGateBusy(false);
        return;
      }
    }
    setGateBusy(false);
    if (!s) return;
    if (isApproval && isTwinPeaksBlocked(tp) && !twinPeaksOverrideId) {
      setTwinPeaksOverrideOpen(true);
      setPendingExecute(true);
      return;
    }
    if (s.status === 'blocked' && !overrideId) {
      setOverrideOpen(true);
      setPendingExecute(true);
      return;
    }
    if (s.status === 'warning' && !overrideId) {
      setWarningAckOpen(true);
      setPendingExecute(true);
      return;
    }
    await runExecute(s, overrideId ?? null);
  }

  async function runExecute(s: SufficiencyEvaluationSummary | null, overrideId: string | null) {
    if (!selected) return;
    try {
      await onExecute({
        option: selected,
        rationale: rationale.trim(),
        conditions: conditions.trim(),
        sufficiency: s,
        overrideId,
      });
      await logAction('application.decision_option_executed', 'applications', applicationId, {
        after: {
          option_id: selected.id,
          option_code: selected.code,
          outcome: selected.outcome,
          sufficiency_status: s?.status ?? 'not_evaluated',
          sufficiency_evaluation_id: s?.evaluationId ?? null,
          override_id: overrideId,
        },
      });
      setSelected(null);
      setRationale('');
      setConditions('');
      setPendingExecute(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Decision failed');
    }
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-base font-semibold text-foreground">Decision Actions</div>
              <p className="text-sm text-muted-foreground">
                {isFallback
                  ? 'Using default decision options — configure in Admin › Decision Options.'
                  : 'Configured decision options for this application context.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isLoading && <span className="text-sm text-muted-foreground">Loading options…</span>}
            {options.map((opt) => (
              <Button
                key={opt.id}
                variant={btnVariant(opt.color)}
                disabled={processing}
                onClick={() => setSelected(opt)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && !pendingExecute && setSelected(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selected?.label}</DialogTitle>
            <DialogDescription>
              Outcome: <strong>{selected?.outcome}</strong>
              {selected?.requires_reason && ` — reason required (min ${minLen} chars)`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {selected?.requires_reason && (
              <div className="space-y-1">
                <Label>Rationale</Label>
                <Textarea rows={5} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                <p className={`text-xs ${reasonOk ? 'text-muted-foreground' : 'text-destructive'}`}>
                  {rationale.trim().length}/{minLen}
                </p>
              </div>
            )}
            {selected?.requires_conditions && (
              <div className="space-y-1">
                <Label>Conditions</Label>
                <Textarea
                  rows={3}
                  value={conditions}
                  onChange={(e) => setConditions(e.target.value)}
                  placeholder="List the conditions attached to this decision…"
                />
              </div>
            )}
            {sufficiency && sufficiency.status !== 'passed' && (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-2 text-xs flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 text-warning mt-0.5" />
                <div>
                  Sufficiency: <strong>{sufficiency.status}</strong> ({sufficiency.blockerCount} blockers,{' '}
                  {sufficiency.warningCount} warnings). Bypass requires an override.
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={pendingExecute}>
              Cancel
            </Button>
            <Button onClick={() => attemptSubmit()} disabled={!canSubmit}>
              {(gateBusy || pendingExecute) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selected && (
        <OverrideReasonDialog
          open={overrideOpen}
          onOpenChange={(o) => {
            setOverrideOpen(o);
            if (!o) setPendingExecute(false);
          }}
          module="licensing"
          entityType="application"
          entityId={applicationId}
          ruleKey="licensing.sufficiency.blocker_override"
          title="Override sufficiency blocker"
          description={`Sufficiency evaluation reported ${sufficiency?.blockerCount ?? 0} blocker(s). Provide justification to proceed with "${selected.label}".`}
          originalValue={{ sufficiency_status: sufficiency?.status, blockers: sufficiency?.blockerCount }}
          overriddenValue={{ decision_option: selected.code, outcome: selected.outcome }}
          metadata={{
            sufficiency_evaluation_id: sufficiency?.evaluationId,
            decision_option_id: selected.id,
          }}
          onOverridden={async (id) => {
            setOverrideOpen(false);
            await runExecute(sufficiency, id);
          }}
        />
      )}

      {selected && (
        <OverrideReasonDialog
          open={warningAckOpen}
          onOpenChange={(o) => {
            setWarningAckOpen(o);
            if (!o) setPendingExecute(false);
          }}
          module="licensing"
          entityType="application"
          entityId={applicationId}
          ruleKey="licensing.sufficiency.warning_acknowledgement"
          title="Acknowledge sufficiency warnings"
          description={`Sufficiency evaluation reported ${sufficiency?.warningCount ?? 0} warning(s). Acknowledge to continue with "${selected.label}".`}
          confirmLabel="Acknowledge & continue"
          metadata={{
            sufficiency_evaluation_id: sufficiency?.evaluationId,
            decision_option_id: selected.id,
          }}
          onOverridden={async (id) => {
            setWarningAckOpen(false);
            await runExecute(sufficiency, id);
          }}
        />
      )}
    </>
  );
}
