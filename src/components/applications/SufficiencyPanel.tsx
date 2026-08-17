import { useState, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ShieldCheck, Play, RefreshCw, MessageSquarePlus,
  CheckCircle2, AlertTriangle, XCircle, Info, ChevronDown, Gavel, History,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { logAction } from '@/hooks/useAuditLog';
import { useAuth } from '@/contexts/AuthContext';
import { RaiseRfiDialog, type RfiInitialItem } from '@/components/applications/RaiseRfiDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { formatDateTime } from '@/lib/datetime';
import { useUserDisplayNames } from '@/hooks/useUserDisplayNames';
import {
  SUFFICIENCY_CHECKLIST,
  useSufficiencyDeterminations,
  useRecordSufficiencyDetermination,
  type SufficiencyDecision,
} from '@/hooks/useSufficiencyDetermination';
import {
  automatedOutcomeSentence,
  determinationBlockReasons,
  findingDescription,
  findingLabel,
  findingTone,
  humanizeValue,
  isStrictlyAfter,
  sufficiencyDecisionLabel,
  sufficiencySeverityLabel,
  SUFFICIENCY_DECISION_OPTIONS,
} from '@/lib/licensing/sufficiencyLabels';

interface Props { applicationId: string }

type EvalRow = {
  id: string; overall_status: string; blocker_count: number; warning_count: number;
  pass_count: number; evaluated_at: string; triggered_by: string;
};
type ResultRow = {
  id: string; status: string; severity: string; detail: any; rule_snapshot: any;
  auto_rfi_item_id: string | null;
};

function ToneIcon({ tone }: { tone: ReturnType<typeof findingTone> }) {
  if (tone === 'positive') return <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />;
  if (tone === 'attention') return <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />;
  if (tone === 'negative') return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  return <Info className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function SufficiencyPanel({ applicationId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [runFailed, setRunFailed] = useState(false);
  const [exception, setException] = useState<{ result: ResultRow | null; reason: string }>({ result: null, reason: '' });
  const [exceptionSubmitting, setExceptionSubmitting] = useState(false);
  const [viewReason, setViewReason] = useState<{ rule: string; reason: string } | null>(null);
  const [rfiOpen, setRfiOpen] = useState(false);
  const [rfiItems, setRfiItems] = useState<RfiInitialItem[]>([]);
  const [rfiResultIds, setRfiResultIds] = useState<string[]>([]);
  const [determineOpen, setDetermineOpen] = useState(false);
  const [decision, setDecision] = useState<SufficiencyDecision>('sufficient');
  const [determinationReason, setDeterminationReason] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [gateError, setGateError] = useState<string[] | null>(null);

  const {
    data: determinations = [],
    isLoading: determinationsLoading,
    isError: determinationsError,
    refetch: refetchDeterminations,
  } = useSufficiencyDeterminations(applicationId);
  const recordDetermination = useRecordSufficiencyDetermination(applicationId);
  const latestDetermination = determinations[0] ?? null;
  const previousDeterminations = determinations.slice(1);
  const { data: names, isLoading: namesLoading, isError: namesError } = useUserDisplayNames(determinations.map((d) => d.determined_by));

  const {
    data: latest, isLoading: latestLoading, isError: latestError, refetch: refetchLatest,
  } = useQuery({
    queryKey: ['sufficiency_latest', applicationId],
    queryFn: async () => {
      const { data, error } = await supabase.from('sufficiency_evaluations' as any)
        .select('*').eq('application_id', applicationId)
        .order('evaluated_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return data as unknown as EvalRow | null;
    },
  });

  const {
    data: results, isLoading: resultsLoading, isError: resultsError, refetch: refetchResults,
  } = useQuery({
    queryKey: ['sufficiency_results', latest?.id],
    enabled: !!latest?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('sufficiency_evaluation_results' as any)
        .select('*').eq('evaluation_id', latest!.id).order('created_at');
      if (error) throw error;
      return (data || []) as unknown as ResultRow[];
    },
  });

  /**
   * The evaluation id whose findings are currently rendered. Used to tell a
   * first load apart from switching to a newer evaluation, so we never show a
   * new summary beside the previous evaluation's findings.
   */
  const loadedEvalIdRef = useRef<string | null>(null);
  if (results && latest?.id) loadedEvalIdRef.current = latest.id;
  const switchingEvaluation =
    !!latest?.id && !!loadedEvalIdRef.current && loadedEvalIdRef.current !== latest.id;

  /**
   * Accepted exceptions are keyed on the evaluation *and* the exact finding ids
   * they were fetched for, so exception state can never belong to a different
   * evaluation than the findings on screen.
   */
  const resultIds = useMemo(() => (results || []).map((r) => r.id).sort(), [results]);
  const {
    data: overrides,
    isLoading: exceptionsLoading,
    isError: exceptionsError,
    refetch: refetchExceptions,
  } = useQuery({
    queryKey: ['sufficiency_overrides', latest?.id, resultIds.join(',')],
    enabled: !!latest?.id && !!results,
    queryFn: async () => {
      if (resultIds.length === 0) return [] as any[];
      const { data, error } = await supabase.from('sufficiency_overrides' as any)
        .select('*').in('evaluation_result_id', resultIds);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
  /** Only when this is true do we know whether a finding already has an exception. */
  const exceptionStatusKnown = !!overrides && !exceptionsError && !exceptionsLoading;

  const counts = {
    passed: latest?.pass_count ?? 0,
    warnings: latest?.warning_count ?? 0,
    blockers: latest?.blocker_count ?? 0,
  };

  const staleDetermination = !!latest && !!latestDetermination &&
    isStrictlyAfter(latest.evaluated_at, latestDetermination.determined_at);

  const run = async () => {
    setRunning(true);
    setRunFailed(false);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-application-sufficiency', {
        body: { application_id: applicationId, triggered_by: 'manual' },
      });
      if (error) throw error;
      toast.success(
        `Automated checks completed${(data as any)?.generated_rfi_id ? ' — an information request was created' : ''}`,
      );
      await qc.invalidateQueries({ queryKey: ['sufficiency_latest', applicationId] });
      await qc.invalidateQueries({ queryKey: ['sufficiency_results'] });
      await qc.invalidateQueries({ queryKey: ['sufficiency_overrides'] });
      qc.invalidateQueries({ queryKey: ['application_rfis'] });
    } catch (e) {
      setRunFailed(true);
      toast.error((e as Error).message || 'The automated checks could not be updated');
    } finally {
      setRunning(false);
    }
  };

  const submitException = async () => {
    if (!exception.result || !user || exceptionSubmitting) return;
    if (exception.reason.trim().length < 10) return toast.error('Please provide a reason of at least 10 characters');
    // Never record a second exception for the same finding, and never act while
    // the existing exception state is unknown.
    if (!exceptionStatusKnown) {
      return toast.error('Existing exceptions are still being checked. Please try again in a moment.');
    }
    if ((overrides || []).some((o: any) => o.evaluation_result_id === exception.result!.id)) {
      toast.error('An exception has already been accepted for this check');
      setException({ result: null, reason: '' });
      return;
    }
    setExceptionSubmitting(true);
    try {
      const { error } = await supabase.from('sufficiency_overrides' as any).insert({
        evaluation_result_id: exception.result.id,
        overridden_by: user.id,
        reason: exception.reason.trim(),
      });
      if (error) return toast.error(error.message);
      await logAction('sufficiency.override.recorded', 'sufficiency_evaluation_result', exception.result.id, {
        after: { reason: exception.reason.trim(), rule: exception.result.rule_snapshot?.code },
        meta: { application_id: applicationId },
      });
      toast.success('Exception accepted');
      setException({ result: null, reason: '' });
      qc.invalidateQueries({ queryKey: ['sufficiency_overrides', latest?.id] });
    } finally {
      setExceptionSubmitting(false);
    }
  };

  const submitDetermination = async () => {
    setGateError(null);
    if (determinationReason.trim().length < 10) {
      toast.error('Please provide a rationale of at least 10 characters');
      return;
    }
    if (decision === 'sufficient' && SUFFICIENCY_CHECKLIST.some((c) => !checklist[c.key])) {
      toast.error('Confirm every checklist item before recording the application as sufficient');
      return;
    }
    try {
      await recordDetermination.mutateAsync({
        decision,
        reason: determinationReason.trim(),
        checklist: SUFFICIENCY_CHECKLIST.map((c) => ({
          key: c.key, label: c.label, checked: !!checklist[c.key],
        })),
      });
      toast.success('Sufficiency decision recorded');
      setDetermineOpen(false);
      setDeterminationReason('');
      setChecklist({});
    } catch (e) {
      const err = e as Error & { code?: string; details?: Record<string, unknown> };
      const reasons = determinationBlockReasons(err.details);
      if (reasons.length > 0 || err.code === 'SUFFICIENCY_GATES_UNMET') {
        setGateError(reasons.length > 0 ? reasons : ['Outstanding sufficiency issues remain on this application']);
      } else {
        toast.error(err.message || 'The decision could not be recorded');
      }
    }
  };

  /**
   * Bulk request candidates: only unsatisfied findings of the *current*
   * evaluation that are flagged for auto-RFI and are not already linked to an
   * existing request item (prevents duplicate requests for the same finding).
   */
  const autoRfiCandidates = useMemo(
    () => (results || []).filter(
      (r) => (r.status === 'fail' || r.status === 'warning')
        && r.rule_snapshot?.auto_rfi === true
        && !r.auto_rfi_item_id,
    ),
    [results],
  );

  const toRfiItem = (r: ResultRow): RfiInitialItem => ({
    prompt: r.rule_snapshot?.rfi_prompt_template || r.rule_snapshot?.name || 'Please provide the required information.',
    question_type: (r.rule_snapshot?.rfi_question_type || 'text') as 'text' | 'document' | 'both',
    required: true,
    source_rule_id: r.rule_snapshot?.code,
  });

  const openBulkRfi = () => {
    setRfiItems(autoRfiCandidates.map(toRfiItem));
    setRfiResultIds(autoRfiCandidates.map((r) => r.id));
    setRfiOpen(true);
  };

  const openFindingRfi = (r: ResultRow) => {
    setRfiItems([toRfiItem(r)]);
    setRfiResultIds([r.id]);
    setRfiOpen(true);
  };

  /** Falls back safely when the display-name lookup fails or is incomplete. */
  const determinedByLabel = (id: string) =>
    names?.[id] || (namesLoading ? '…' : namesError ? 'Name unavailable' : 'Reviewer');


  return (
    <Card>
      <CardHeader className="space-y-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Application completeness &amp; sufficiency
            </CardTitle>
            <CardDescription>
              Automated checks support the review. The sufficiency decision is made by the reviewer.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {autoRfiCandidates.length > 0 && (
              <Button data-rbac="application_management.edit" size="sm" variant="outline" onClick={openBulkRfi}>
                <MessageSquarePlus className="h-4 w-4 mr-2" />
                Request missing information ({autoRfiCandidates.length})
              </Button>
            )}
            <Button
              size="sm"
              onClick={run}
              disabled={running}
              title="Re-run the automated sufficiency checks using the latest application information."
            >
              {running
                ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                : latest ? <RefreshCw className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {latest ? 'Run checks again' : 'Run automated checks'}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ---------- Automated checks ---------- */}
        <section className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Automated checks</p>
            {latest && (
              <p className="text-xs text-muted-foreground">
                Last checked: {formatDateTime(latest.evaluated_at)}
              </p>
            )}
          </div>

          {latestLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sufficiency checks…
            </p>
          ) : latestError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">Sufficiency checks could not be loaded.</p>
              <Button size="sm" variant="outline" onClick={() => refetchLatest()}>Try again</Button>
            </div>
          ) : !latest ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Automated sufficiency checks have not been run yet. Run the checks to identify missing
                information, warnings or blocking issues.
              </p>
              <Button size="sm" onClick={run} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                Run automated checks
              </Button>
            </div>
          ) : (
            <>
              {runFailed && (
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-2">
                  <p className="font-medium text-destructive">Checks could not be updated</p>
                  <p className="text-muted-foreground">
                    The previous successful evaluation is still shown below (last checked{' '}
                    {formatDateTime(latest.evaluated_at)}).
                  </p>
                  <Button size="sm" variant="outline" onClick={run} disabled={running}>Try again</Button>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />{counts.passed} Passed
                </span>
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />{counts.warnings} Need attention
                </span>
                <span className="flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-destructive" />{counts.blockers}{' '}
                  {counts.blockers === 1 ? 'Blocking issue' : 'Blocking issues'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{automatedOutcomeSentence(counts)}</p>
              <p className="text-xs text-muted-foreground">
                Run the checks again if the applicant has provided new information or documents since the
                last check.
              </p>

              <Separator />

              {resultsLoading || switchingEvaluation ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {switchingEvaluation ? 'Updating sufficiency findings…' : 'Loading sufficiency findings…'}
                </p>
              ) : resultsError ? (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">Sufficiency findings could not be loaded.</p>
                  <Button size="sm" variant="outline" onClick={() => refetchResults()}>Try again</Button>
                </div>
              ) : (results || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No individual findings were recorded for this check.
                </p>
              ) : (
                <div className="space-y-2">
                  {exceptionsError ? (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
                      <p className="font-medium">Exception status unavailable</p>
                      <p className="text-muted-foreground">
                        Accepted exceptions could not be loaded. Some findings may already have a recorded
                        exception.
                      </p>
                      <Button size="sm" variant="outline" onClick={() => refetchExceptions()}>Try again</Button>
                    </div>
                  ) : exceptionsLoading ? (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking whether an exception has already been recorded…
                    </p>
                  ) : null}

                  <ul className="space-y-2">
                    {(results || []).map((r) => {
                      // Exception state is only trusted once the query has loaded.
                      const ov = exceptionStatusKnown
                        ? (overrides || []).find((o: any) => o.evaluation_result_id === r.id)
                        : undefined;
                      const tone = findingTone(r.status, r.severity);
                      const canAct = r.status === 'fail' || r.status === 'warning';
                      return (
                        <li key={r.id} className="rounded-md border bg-background p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <ToneIcon tone={tone} />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium">
                                  {r.rule_snapshot?.name || 'Automated check'}
                                </p>
                                <Badge
                                  variant={
                                    tone === 'positive' ? 'default'
                                      : tone === 'negative' ? 'destructive'
                                        : tone === 'attention' ? 'secondary' : 'outline'
                                  }
                                >
                                  {findingLabel(r.status, r.severity)}
                                  {ov ? ' — exception accepted' : ''}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {findingDescription(r.detail, r.rule_snapshot?.name)}
                              </p>

                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                {canAct && (
                                  <Button
                                    data-rbac="application_management.edit"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openFindingRfi(r)}
                                  >
                                    Request information
                                  </Button>
                                )}
                                {canAct && !exceptionStatusKnown && (
                                  <Button size="sm" variant="outline" disabled>
                                    Accept exception
                                  </Button>
                                )}
                                {canAct && exceptionStatusKnown && !ov && (
                                  <Button
                                    data-rbac="application_management.approve"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setException({ result: r, reason: '' })}
                                  >
                                    Accept exception
                                  </Button>
                                )}
                                {ov && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setViewReason({
                                      rule: r.rule_snapshot?.name || 'Automated check',
                                      reason: ov.reason,
                                    })}
                                  >
                                    View reason
                                  </Button>
                                )}
                              </div>

                              <Collapsible>
                                <CollapsibleTrigger className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                                  <ChevronDown className="h-3 w-3" /> Technical details
                                </CollapsibleTrigger>
                                <CollapsibleContent className="mt-1 space-y-1 rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                                  <p>Rule code: {r.rule_snapshot?.code || '—'}</p>
                                  <p>Rule type: {humanizeValue(r.rule_snapshot?.rule_type)}</p>
                                  <p>Severity: {sufficiencySeverityLabel(r.severity)} ({r.severity})</p>
                                  <p>Stored status: {r.status}</p>
                                  <p>Triggered by: {humanizeValue(latest.triggered_by)}</p>
                                  <pre className="whitespace-pre-wrap break-all">
                                    {r.detail ? JSON.stringify(r.detail, null, 2) : '—'}
                                  </pre>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        {/* ---------- Reviewer determination ---------- */}
        <section className="rounded-lg border-2 border-primary/30 p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Gavel className="h-4 w-4 text-primary" /> Reviewer determination
            </p>
            <Button
              data-rbac="application_management.approve"
              size="sm"
              variant={latestDetermination ? 'outline' : 'default'}
              onClick={() => { setGateError(null); setDetermineOpen(true); }}
            >
              Record sufficiency decision
            </Button>
          </div>

          {staleDetermination && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <p className="font-medium">Review recommended</p>
              <p className="text-muted-foreground">
                Automated checks have been updated since the last sufficiency determination. Review the
                latest findings before proceeding.
              </p>
            </div>
          )}

          {determinationsError ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">Sufficiency decisions could not be loaded.</p>
              <Button size="sm" variant="outline" onClick={() => refetchDeterminations()}>Try again</Button>
            </div>
          ) : determinationsLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading sufficiency decisions…
            </p>
          ) : !latestDetermination ? (
            <p className="text-sm text-muted-foreground">No sufficiency determination has been recorded.</p>
          ) : (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    latestDetermination.decision === 'sufficient' ? 'default'
                      : latestDetermination.decision === 'deferred' ? 'secondary' : 'destructive'
                  }
                >
                  {sufficiencyDecisionLabel(latestDetermination.decision)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Recorded by {determinedByLabel(latestDetermination.determined_by)} ·{' '}
                  {formatDateTime(latestDetermination.determined_at)}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{latestDetermination.reason}</p>
            </div>
          )}

          {previousDeterminations.length > 0 && (
            <Collapsible open={showHistory} onOpenChange={setShowHistory}>
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="ghost" className="text-xs">
                  <History className="h-3.5 w-3.5 mr-1.5" />
                  Previous determinations ({previousDeterminations.length}) — {showHistory ? 'Hide' : 'View'} history
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2">
                {previousDeterminations.map((d) => (
                  <div key={d.id} className="rounded-md border p-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{sufficiencyDecisionLabel(d.decision)}</Badge>
                      <span className="text-muted-foreground">
                        {determinedByLabel(d.determined_by)} · {formatDateTime(d.determined_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{d.reason}</p>
                    {Array.isArray(d.checklist) && d.checklist.length > 0 && (
                      <ul className="list-disc pl-4 text-[11px] text-muted-foreground">
                        {d.checklist.map((c) => (
                          <li key={c.key}>{c.checked ? '✓' : '✗'} {c.label}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </section>
      </CardContent>

      {/* Accept exception */}
      <Dialog open={!!exception.result} onOpenChange={(v) => !v && setException({ result: null, reason: '' })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept exception</DialogTitle>
            <DialogDescription>
              This automated check has not passed. Record why it should not prevent the application from
              proceeding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              Check: <strong>{exception.result?.rule_snapshot?.name || 'Automated check'}</strong>
            </p>
            <Label htmlFor="sufficiency-exception-reason">Reason</Label>
            <Textarea
              id="sufficiency-exception-reason"
              rows={4}
              value={exception.reason}
              onChange={(e) => setException({ ...exception, reason: e.target.value })}
            />
            <p className={`text-xs ${exception.reason.trim().length >= 10 ? 'text-muted-foreground' : 'text-destructive'}`}>
              Your reason will be recorded in the audit history. Minimum 10 characters — current:{' '}
              {exception.reason.trim().length}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setException({ result: null, reason: '' })}>Cancel</Button>
            <Button
              data-rbac="application_management.approve"
              onClick={submitException}
              disabled={exceptionSubmitting || !exceptionStatusKnown}
            >
              {exceptionSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Accept exception
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View accepted exception reason */}
      <Dialog open={!!viewReason} onOpenChange={(v) => !v && setViewReason(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accepted exception</DialogTitle>
            <DialogDescription>{viewReason?.rule}</DialogDescription>
          </DialogHeader>
          <p className="text-sm whitespace-pre-wrap">{viewReason?.reason}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewReason(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record sufficiency decision */}
      <Dialog open={determineOpen} onOpenChange={(v) => { setDetermineOpen(v); if (!v) setGateError(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record sufficiency decision</DialogTitle>
            <DialogDescription>
              This is the reviewer's formal sufficiency decision. Automated checks support this decision but
              do not make it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {gateError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1">
                <p className="font-medium text-destructive">Sufficiency cannot be recorded yet</p>
                <p className="text-muted-foreground">
                  Resolve the following before recording the application as sufficient:
                </p>
                <ul className="list-disc pl-4">
                  {gateError.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            )}

            <div className="space-y-2">
              <Label>Reviewer checklist</Label>
              {SUFFICIENCY_CHECKLIST.map((c) => (
                <label key={c.key} className="flex cursor-pointer items-start gap-2 text-sm">
                  <Checkbox
                    checked={!!checklist[c.key]}
                    onCheckedChange={(v) => setChecklist((prev) => ({ ...prev, [c.key]: !!v }))}
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Decision</Label>
              {SUFFICIENCY_DECISION_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setDecision(o.value)}
                  className={`w-full rounded-md border p-2 text-left text-sm ${
                    decision === o.value ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  <span className="font-medium">{o.label}</span>
                  <span className="block text-xs text-muted-foreground">{o.description}</span>
                </button>
              ))}
            </div>

            <div>
              <Label htmlFor="sufficiency-rationale">Rationale</Label>
              <Textarea
                id="sufficiency-rationale"
                rows={3}
                value={determinationReason}
                onChange={(e) => setDeterminationReason(e.target.value)}
              />
              <p className={`text-xs ${determinationReason.trim().length >= 10 ? 'text-muted-foreground' : 'text-destructive'}`}>
                Recorded in the audit history. Minimum 10 characters — current: {determinationReason.trim().length}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetermineOpen(false)}>Cancel</Button>
            <Button
              data-rbac="application_management.approve"
              onClick={submitDetermination}
              disabled={recordDetermination.isPending}
            >
              {recordDetermination.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {user && (
        <RaiseRfiDialog
          applicationId={applicationId}
          raisedBy={user.id}
          hideTrigger
          open={rfiOpen}
          onOpenChange={setRfiOpen}
          initialItems={rfiItems}
          sufficiencyEvaluationId={latest?.id ?? null}
          sufficiencyResultIds={rfiResultIds}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['application_rfis'] });
            qc.invalidateQueries({ queryKey: ['sufficiency_latest', applicationId] });
          }}
        />
      )}
    </Card>
  );
}
