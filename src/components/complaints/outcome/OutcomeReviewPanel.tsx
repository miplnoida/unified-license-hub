/**
 * MC-04 — Outcome review.
 *
 * The server decides whether outcome review is open (investigation ready, or a
 * referred / outside-remit case reaching a final outcome without an
 * investigation). Allegation findings are shown as recorded during the
 * investigation and are never edited here.
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, AlertTriangle, CheckCircle2, Lock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/datetime';
import { QueryErrorState } from '@/components/complaints/QueryErrorState';
import {
  useComplaintOutcome,
  OVERALL_OUTCOME_OPTIONS,
  HARM_LEVEL_OPTIONS,
  CLOSURE_ROUTE_OPTIONS,
  outcomeLabel,
  harmLabel,
  closureRouteLabel,
  allegationOutcomeLabel,
} from '@/hooks/useComplaintOutcome';

interface Props {
  complaintId: string;
  onOpenRedress?: () => void;
  onOpenClosure?: () => void;
}

interface FormState {
  overall_outcome: string;
  outcome_rationale: string;
  consumer_harm_summary: string;
  harm_level: string;
  redress_required: boolean;
  redress_rationale: string;
  communication_required: boolean;
  communication_basis: string;
  recommended_closure_route: string;
}

const EMPTY: FormState = {
  overall_outcome: '',
  outcome_rationale: '',
  consumer_harm_summary: '',
  harm_level: '',
  redress_required: false,
  redress_rationale: '',
  communication_required: true,
  communication_basis: '',
  recommended_closure_route: '',
};

export function OutcomeReviewPanel({ complaintId, onOpenRedress, onOpenClosure }: Props) {
  const { outcomeQ, saveOutcome, submitOutcome } = useComplaintOutcome(complaintId);
  const ws = outcomeQ.data;
  const outcome = ws?.outcome ?? null;
  const gate = ws?.gate;

  const [form, setForm] = useState<FormState>(EMPTY);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!outcome) { setForm(EMPTY); return; }
    setForm({
      overall_outcome: outcome.overall_outcome ?? '',
      outcome_rationale: outcome.outcome_rationale ?? '',
      consumer_harm_summary: outcome.consumer_harm_summary ?? '',
      harm_level: outcome.harm_level ?? '',
      redress_required: !!outcome.redress_required,
      redress_rationale: outcome.redress_rationale ?? '',
      communication_required: outcome.communication_required !== false,
      communication_basis: outcome.communication_basis ?? '',
      recommended_closure_route: outcome.recommended_closure_route ?? '',
    });
  }, [outcome?.id, outcome?.row_version]);

  const recorded = outcome?.status === 'SUBMITTED';
  const editable = !!gate?.ok && !recorded;

  const allegations = ws?.allegations ?? [];
  const snapshot = useMemo(() => {
    const s = outcome?.allegation_outcome_snapshot;
    return Array.isArray(s) && s.length > 0 ? (s as any[]) : null;
  }, [outcome?.allegation_outcome_snapshot]);
  const shownAllegations = recorded && snapshot ? snapshot : allegations;

  const onError = (e: any) => {
    const m = String(e?.message ?? '');
    if (m.includes('outcome_review_not_open')) toast.error('Outcome review is not open for this complaint yet.');
    else if (m.includes('overall_outcome_required')) toast.error('Select the overall outcome.');
    else if (m.includes('outcome_rationale_required')) toast.error('Give the reasons for the outcome.');
    else if (m.includes('consumer_harm_required')) toast.error('Describe the consumer harm considered.');
    else if (m.includes('redress_items_required')) toast.error('Add at least one redress item, or record that no redress is required.');
    else if (m.includes('no_redress_reason_required')) toast.error('Explain why no redress is required.');
    else if (m.includes('outcome_already_recorded')) toast.error('The outcome has already been completed and cannot be edited.');
    else if (m.includes('stale_state')) toast.error('This record changed elsewhere. Reload before continuing.');
    else toast.error(m || 'Action failed');
  };

  if (outcomeQ.isLoading) {
    return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading outcome…</CardContent></Card>;
  }
  if (outcomeQ.isError) {
    return <QueryErrorState title="Failed to load the outcome record" error={outcomeQ.error} onRetry={() => outcomeQ.refetch()} />;
  }

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- gate */}
      <Card className={gate?.ok ? 'border-emerald-600/40' : undefined}>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <div>
            <CardTitle className="text-base">Outcome review</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              {gate?.route_label || 'Outcome review opens once the case record is complete.'}
            </p>
          </div>
          <Badge variant={recorded ? 'secondary' : gate?.ok ? 'default' : 'outline'}>
            {recorded ? 'Outcome completed' : gate?.ok ? 'Open for review' : 'Not open yet'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {gate?.ok ? (
            <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              {recorded ? 'The final outcome is recorded and locked.' : 'The case is ready for the final outcome to be recorded.'}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">The following must be settled before the outcome can be recorded:</p>
              <ul className="space-y-1.5">
                {(gate?.blockers ?? []).map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" /><span>{b}</span>
                  </li>
                ))}
                {(gate?.blockers ?? []).length === 0 && <li className="text-muted-foreground">No details available.</li>}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------- allegation summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Findings on each allegation</CardTitle>
          <p className="text-xs text-muted-foreground">
            As recorded during the investigation. {recorded ? 'This is the record kept with the final outcome.' : 'These findings cannot be changed here.'}
          </p>
        </CardHeader>
        <CardContent className="text-sm">
          {shownAllegations.length === 0 ? (
            <p className="text-muted-foreground">No allegations have been recorded for this complaint.</p>
          ) : (
            <ul className="divide-y">
              {shownAllegations.map((a: any) => (
                <li key={a.allegation_id} className="space-y-1 py-3 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">Allegation {a.allegation_number}</span>
                    <span className="text-muted-foreground">— {a.title}</span>
                    <Badge variant={a.assessment_outcome ? 'secondary' : 'outline'} className="ml-auto">
                      {a.assessment_outcome ? allegationOutcomeLabel(a.assessment_outcome) : 'Not assessed'}
                    </Badge>
                  </div>
                  {a.assessment_rationale && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{a.assessment_rationale}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* -------------------------------------------------------- the outcome */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
          <CardTitle className="text-base">Final outcome</CardTitle>
          {recorded && (
            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Read only</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {recorded ? (
            <>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Overall outcome</dt><dd>{outcomeLabel(outcome?.overall_outcome)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Level of consumer harm</dt><dd>{harmLabel(outcome?.harm_level)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Redress required</dt><dd>{outcome?.redress_required ? 'Yes' : 'No'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Letter to the consumer required</dt><dd>{outcome?.communication_required ? 'Yes' : 'No'}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Recommended closure route</dt><dd>{closureRouteLabel(outcome?.recommended_closure_route)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Completed</dt><dd>{outcome?.submitted_at ? formatDateTime(outcome.submitted_at) : '—'}</dd></div>
              </dl>
              <div><p className="text-xs text-muted-foreground">Reasons for the outcome</p><p className="whitespace-pre-wrap">{outcome?.outcome_rationale || '—'}</p></div>
              <div><p className="text-xs text-muted-foreground">Consumer harm considered</p><p className="whitespace-pre-wrap">{outcome?.consumer_harm_summary || '—'}</p></div>
              {!outcome?.redress_required && (
                <div><p className="text-xs text-muted-foreground">Why no redress is required</p><p className="whitespace-pre-wrap">{outcome?.redress_rationale || '—'}</p></div>
              )}
              {outcome?.communication_basis && (
                <div><p className="text-xs text-muted-foreground">Basis for the communication decision</p><p className="whitespace-pre-wrap">{outcome.communication_basis}</p></div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {onOpenRedress && <Button size="sm" variant="outline" onClick={onOpenRedress}>Go to redress<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}
                {onOpenClosure && <Button size="sm" variant="outline" onClick={onOpenClosure}>Go to closure &amp; quality review<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}
              </div>
            </>
          ) : (
            <>
              {!gate?.ok && (
                <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                  The outcome can be drafted once outcome review is open. Fields are disabled until then.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Overall outcome</Label>
                  <Select value={form.overall_outcome || 'none'} onValueChange={(v) => set('overall_outcome', v === 'none' ? '' : v)} disabled={!editable}>
                    <SelectTrigger><SelectValue placeholder="Select the overall outcome" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not selected</SelectItem>
                      {OVERALL_OUTCOME_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Level of consumer harm</Label>
                  <Select value={form.harm_level || 'none'} onValueChange={(v) => set('harm_level', v === 'none' ? '' : v)} disabled={!editable}>
                    <SelectTrigger><SelectValue placeholder="Select the level of harm" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not selected</SelectItem>
                      {HARM_LEVEL_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Reasons for the outcome</Label>
                <Textarea rows={4} value={form.outcome_rationale} onChange={(e) => set('outcome_rationale', e.target.value)} disabled={!editable}
                  placeholder="Explain how the findings on the allegations lead to this overall outcome." />
              </div>

              <div>
                <Label>Consumer harm considered</Label>
                <Textarea rows={3} value={form.consumer_harm_summary} onChange={(e) => set('consumer_harm_summary', e.target.value)} disabled={!editable}
                  placeholder="Describe the harm to the consumer that was considered." />
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Redress is required</Label>
                    <p className="text-xs text-muted-foreground">Individual redress for the affected consumer.</p>
                  </div>
                  <Switch checked={form.redress_required} onCheckedChange={(v) => set('redress_required', v)} disabled={!editable} />
                </div>
                {form.redress_required ? (
                  <p className="text-xs text-muted-foreground">
                    Record each remedy in the <strong>Redress</strong> section. At least one item is needed to complete the outcome.
                    {onOpenRedress && (
                      <Button size="sm" variant="link" className="h-auto px-1 py-0 text-xs" onClick={onOpenRedress}>Open redress</Button>
                    )}
                  </p>
                ) : (
                  <div>
                    <Label>Why no redress is required</Label>
                    <Textarea rows={3} value={form.redress_rationale} onChange={(e) => set('redress_rationale', e.target.value)} disabled={!editable}
                      placeholder="A reason is required when no redress is being provided." />
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">A letter to the consumer is required</Label>
                    <p className="text-xs text-muted-foreground">Closure is blocked until the outcome letter is issued.</p>
                  </div>
                  <Switch checked={form.communication_required} onCheckedChange={(v) => set('communication_required', v)} disabled={!editable} />
                </div>
                <div>
                  <Label>Basis for this decision</Label>
                  <Textarea rows={2} value={form.communication_basis} onChange={(e) => set('communication_basis', e.target.value)} disabled={!editable}
                    placeholder="Optional — policy basis for requiring or not requiring a letter." />
                </div>
              </div>

              <div>
                <Label>Recommended closure route</Label>
                <Select value={form.recommended_closure_route || 'none'} onValueChange={(v) => set('recommended_closure_route', v === 'none' ? '' : v)} disabled={!editable}>
                  <SelectTrigger><SelectValue placeholder="Select the recommended route" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not selected</SelectItem>
                    {CLOSURE_ROUTE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button size="sm" variant="outline" disabled={!editable || saveOutcome.isPending}
                  onClick={() => saveOutcome.mutate(form as any, { onSuccess: () => toast.success('Draft outcome saved'), onError })}>
                  {saveOutcome.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Save draft
                </Button>
                <Button size="sm" disabled={!editable || submitOutcome.isPending || saveOutcome.isPending}
                  onClick={() =>
                    saveOutcome.mutate(form as any, {
                      onError,
                      onSuccess: () =>
                        submitOutcome.mutate(undefined, {
                          onError,
                          onSuccess: () => toast.success('Outcome recorded — the case has moved to closure and quality review'),
                        }),
                    })
                  }>
                  {submitOutcome.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}Complete outcome review
                </Button>
                {outcome && <span className="text-xs text-muted-foreground">Draft saved {formatDateTime(outcome.created_at)}</span>}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------------------------- history */}
      {(ws?.history ?? []).length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Earlier outcome records</CardTitle></CardHeader>
          <CardContent className="text-sm">
            <ul className="divide-y">
              {ws!.history.map((h) => (
                <li key={`${h.version}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>Version {h.version} — {outcomeLabel(h.overall_outcome)}</span>
                  <span className="text-xs text-muted-foreground">
                    {h.status === 'SUPERSEDED' ? 'Superseded' : h.status === 'SUBMITTED' ? 'Completed' : 'Draft'}
                    {h.submitted_at ? ` • ${formatDateTime(h.submitted_at)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default OutcomeReviewPanel;
