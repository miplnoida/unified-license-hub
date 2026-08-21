import { useParams } from 'react-router-dom';
import { useAssessment, useUpsertAssessment, useTransitionAssessment, useAssessmentPrefill, useEvaluateStressForReturn } from '@/hooks/usePrudentialSupervision';
import { useReturnComputedRatios, useReturnBreaches } from '@/hooks/usePrudentialConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CreatePrudentialActionDialog } from '@/components/prudential/CreatePrudentialActionDialog';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CamelsComponentsPanel } from '@/components/prudential/CamelsComponentsPanel';
import { isAssessmentEditable, isAssessmentFinal } from '@/lib/prudentialPhase2';

const CATEGORIES = ['capital', 'liquidity', 'asset_quality', 'profitability', 'concentration', 'governance', 'operational_resilience'];
const RATINGS = ['1 - Strong', '2 - Satisfactory', '3 - Fair', '4 - Marginal', '5 - Unsatisfactory'];

export default function AssessmentDetail() {
  const { id } = useParams();
  const { data: assessment } = useAssessment(id);
  const upsert = useUpsertAssessment();
  const transition = useTransitionAssessment();
  const { data: ratios = [] } = useReturnComputedRatios(assessment?.return_filing_id);
  const { data: breaches = [] } = useReturnBreaches(assessment?.return_filing_id);
  const { data: prefill } = useAssessmentPrefill(assessment?.return_filing_id);
  const evalStress = useEvaluateStressForReturn();

  const [form, setForm] = useState<any>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [createAction, setCreateAction] = useState<any>(null);

  useEffect(() => { if (assessment) setForm(assessment); }, [assessment]);

  if (!assessment) return <DashboardLayout><div>Loading…</div></DashboardLayout>;

  // Auto-suggest rating: worst breach severity → suggested rating
  const worst = breaches.reduce((acc: string, b: any) => {
    const order = ['critical','high','medium','low'];
    return order.indexOf(b.severity) < order.indexOf(acc) ? b.severity : acc;
  }, 'low' as string);
  const autoRating = { critical: RATINGS[4], high: RATINGS[3], medium: RATINGS[2], low: RATINGS[1] }[worst as string] || RATINGS[1];

  const isOverride = form.overall_rating && form.overall_rating !== autoRating;
  const canEdit = isAssessmentEditable(form.status);
  const isFinal = isAssessmentFinal(form.status);

  const save = async () => {
    if (upsert.isPending) return;
    if (isOverride && !form.override_reason && !overrideReason) {
      alert('Override rating requires a justification');
      return;
    }
    try {
      await upsert.mutateAsync({
        id,
        entity_id: form.entity_id,
        return_id: form.return_id || null,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
        overall_rating: form.overall_rating || null,
        ratings: form.ratings || {},
        rationale: form.rationale || null,
        evidence_refs: form.evidence_refs || [],
        conclusion: form.conclusion || null,
        recommended_response: form.recommended_response || null,
        status: form.status,
        override_reason: form.override_reason || overrideReason || null,
        auto_suggested_rating: autoRating,
        signal_snapshot: form.signal_snapshot || null,
      });
    } catch { /* toast from hook */ }
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Assessment</h1>
          <p className="text-sm text-muted-foreground">{assessment.licensees?.name} · {assessment.period_start} → {assessment.period_end}</p>
        </div>
        <div className="flex gap-2">
          <HistoryButton entityType="prudential_assessment" entityId={id!} />
          <Badge variant="outline">{form.status}</Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Ratings</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Overall rating <span className="text-xs text-muted-foreground">(suggested: {autoRating})</span></Label>
              <Select disabled={!canEdit} value={form.overall_rating || ''} onValueChange={(v) => setForm({ ...form, overall_rating: v })}>
                <SelectTrigger><SelectValue placeholder="Select rating" /></SelectTrigger>
                <SelectContent>{RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
              {isOverride && (
                <div className="mt-2">
                  <Label className="text-destructive">Override justification (required)</Label>
                  <Textarea value={form.override_reason || overrideReason} onChange={(e) => setOverrideReason(e.target.value)} disabled={!canEdit} />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <div key={c}>
                  <Label className="capitalize">{c.replace('_', ' ')}</Label>
                  <Select disabled={!canEdit} value={form.ratings?.[c] || ''} onValueChange={(v) => setForm({ ...form, ratings: { ...(form.ratings || {}), [c]: v } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RATINGS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div><Label>Rationale</Label><Textarea disabled={!canEdit} value={form.rationale || ''} onChange={(e) => setForm({ ...form, rationale: e.target.value })} /></div>
            <div><Label>Conclusion</Label><Textarea disabled={!canEdit} value={form.conclusion || ''} onChange={(e) => setForm({ ...form, conclusion: e.target.value })} /></div>
            <div><Label>Recommended response</Label><Textarea disabled={!canEdit} value={form.recommended_response || ''} onChange={(e) => setForm({ ...form, recommended_response: e.target.value })} /></div>
            <div><Label>Linked return id (optional)</Label><Input disabled={!canEdit} value={form.return_id || ''} onChange={(e) => setForm({ ...form, return_id: e.target.value || null })} /></div>
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button disabled={upsert.isPending} onClick={save}>
                  {upsert.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : 'Save'}
                </Button>
              )}
              {form.status === 'draft' && (
                <Button variant="secondary" disabled={!form.rationale || upsert.isPending || transition.isPending} onClick={async () => {
                  if (upsert.isPending || transition.isPending) return;
                  try { await save(); await transition.mutateAsync({ id: id!, to: 'submitted' }); } catch { /* toast */ }
                }}>
                  {(upsert.isPending || transition.isPending) ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting…</>) : 'Submit for review'}
                </Button>
              )}
              {form.status === 'submitted' && (
                <Button variant="secondary" disabled={!reviewNotes.trim() || transition.isPending} onClick={() => transition.mutate({ id: id!, to: 'reviewed', reason: reviewNotes })}>
                  {transition.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : 'Mark reviewed'}
                </Button>
              )}
              {['submitted','reviewed'].includes(form.status) && (
                <Button variant="outline" disabled={!reviewNotes.trim() || transition.isPending}
                  onClick={() => transition.mutate({ id: id!, to: 'returned_for_revision', reason: reviewNotes })}>
                  {transition.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Returning…</>) : 'Return for revision'}
                </Button>
              )}
              {form.status === 'returned_for_revision' && (
                <Button variant="secondary" disabled={!form.rationale || upsert.isPending || transition.isPending} onClick={async () => {
                  if (upsert.isPending || transition.isPending) return;
                  try { await save(); await transition.mutateAsync({ id: id!, to: 'submitted' }); } catch { /* toast */ }
                }}>
                  {(upsert.isPending || transition.isPending) ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Resubmitting…</>) : 'Resubmit for review'}
                </Button>
              )}
              {form.status === 'reviewed' && (
                <Button disabled={transition.isPending} onClick={() => transition.mutate({ id: id!, to: 'approved' })}>
                  {transition.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Approving…</>) : 'Approve'}
                </Button>
              )}
              {form.status === 'approved' && (
                <Button variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ id: id!, to: 'closed' })}>
                  {transition.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Closing…</>) : 'Close'}
                </Button>
              )}
              {['submitted','reviewed'].includes(form.status) && (
                <div className="w-full">
                  <Label>Review notes <span className="text-destructive">*</span></Label>
                  <Textarea value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} rows={2} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="md:col-span-2 md:order-last">
          <CamelsComponentsPanel
            assessmentId={id!}
            sectorId={(assessment.licensees as any)?.sector_id ?? null}
            status={form.status}
            suggestions={{ C: { rating: autoRating, source: { basis: 'worst_breach_severity', severity: worst } } }}
          />
        </div>


        <Card>
          <CardHeader><CardTitle>Signals</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {assessment.return_id && (
              <div>
                <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" className="w-full" onClick={() => evalStress.mutate(assessment.return_id!)}>Re-run stress evaluation</Button>
              </div>
            )}
            <div>
              <div className="font-medium mb-1">Breaches ({breaches.length})</div>
              {breaches.slice(0, 6).map((b: any) => (
                <div key={b.id} className="flex justify-between border-b py-1 gap-2">
                  <span className="truncate">{b.metric_key || b.ratio_key}</span>
                  <span className="flex items-center gap-1">
                    <Badge>{b.severity}</Badge>
                    <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setCreateAction({
                      entity_id: assessment.entity_id, source_type: 'assessment', source_id: id,
                      title: `Address breach: ${b.metric_key || b.ratio_key}`, severity: b.severity,
                      description: `From assessment. ${b.metric_key || b.ratio_key} = ${b.observed_value ?? b.value}, threshold ${b.threshold_value}.`,
                    })}>Action</Button>
                  </span>
                </div>
              ))}
              {!breaches.length && <div className="text-muted-foreground">None</div>}
            </div>
            <div>
              <div className="font-medium mb-1">Ratios ({ratios.length})</div>
              {ratios.slice(0, 8).map((r: any) => <div key={r.id} className="flex justify-between border-b py-1"><span>{r.label || r.ratio_key}</span><span className="tabular-nums">{r.value}</span></div>)}
              {!ratios.length && <div className="text-muted-foreground">None</div>}
            </div>
            {prefill?.stress_events?.length ? (
              <div>
                <div className="font-medium mb-1">Stress events ({prefill.stress_events.length})</div>
                {prefill.stress_events.slice(0, 5).map((s: any) => (
                  <div key={s.id} className="flex justify-between border-b py-1">
                    <span className="truncate">{s.prudential_stress_indicators?.label || s.indicator_id}</span>
                    <Badge>{s.prudential_stress_indicators?.severity}</Badge>
                  </div>
                ))}
              </div>
            ) : null}
            {prefill?.analysis ? (
              <div>
                <div className="font-medium mb-1">Consolidated analysis</div>
                <div className="text-xs text-muted-foreground">Health score: {(prefill.analysis as any).health_score ?? '—'}</div>
              </div>
            ) : null}
            {form.recommended_response ? (
              <div>
                <Button data-rbac="prudential_supervision.create" size="sm" variant="outline" className="w-full" onClick={() => setCreateAction({
                  entity_id: assessment.entity_id, source_type: 'assessment', source_id: id,
                  title: 'Follow-up on assessment recommendation', description: form.recommended_response,
                })}>Create action from recommendation</Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <CreatePrudentialActionDialog open={!!createAction} onOpenChange={(o) => !o && setCreateAction(null)} defaults={createAction} />
      </div>
    </DashboardLayout>
  );
}
