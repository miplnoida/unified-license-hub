import { useParams } from 'react-router-dom';
import { useAssessment, useUpsertAssessment, useTransitionAssessment } from '@/hooks/usePrudentialSupervision';
import { useReturnComputedRatios, useReturnBreaches } from '@/hooks/usePrudentialConfig';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { useEffect, useState } from 'react';

const CATEGORIES = ['capital', 'liquidity', 'asset_quality', 'profitability', 'concentration', 'governance', 'operational_resilience'];
const RATINGS = ['1 - Strong', '2 - Satisfactory', '3 - Fair', '4 - Marginal', '5 - Unsatisfactory'];

export default function AssessmentDetail() {
  const { id } = useParams();
  const { data: assessment } = useAssessment(id);
  const upsert = useUpsertAssessment();
  const transition = useTransitionAssessment();
  const { data: ratios = [] } = useReturnComputedRatios(assessment?.return_id);
  const { data: breaches = [] } = useReturnBreaches(assessment?.return_id);

  const [form, setForm] = useState<any>({});
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => { if (assessment) setForm(assessment); }, [assessment]);

  if (!assessment) return <div className="p-6">Loading…</div>;

  // Auto-suggest rating: worst breach severity → suggested rating
  const worst = breaches.reduce((acc: string, b: any) => {
    const order = ['critical','high','medium','low'];
    return order.indexOf(b.severity) < order.indexOf(acc) ? b.severity : acc;
  }, 'low' as string);
  const autoRating = { critical: RATINGS[4], high: RATINGS[3], medium: RATINGS[2], low: RATINGS[1] }[worst as string] || RATINGS[1];

  const isOverride = form.overall_rating && form.overall_rating !== autoRating;
  const canEdit = ['draft','submitted'].includes(form.status);

  const save = async () => {
    if (isOverride && !form.override_reason && !overrideReason) {
      alert('Override rating requires a justification');
      return;
    }
    await upsert.mutateAsync({ ...form, id, override_reason: form.override_reason || overrideReason || null, auto_suggested_rating: autoRating });
  };

  return (
    <div className="p-6 space-y-4">
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
            <div className="flex gap-2">
              {canEdit && <Button onClick={save}>Save</Button>}
              {form.status === 'draft' && <Button variant="secondary" onClick={async () => { await save(); await transition.mutateAsync({ id: id!, to: 'submitted' }); }}>Submit</Button>}
              {form.status === 'submitted' && <Button variant="secondary" onClick={() => transition.mutate({ id: id!, to: 'reviewed' })}>Mark reviewed</Button>}
              {form.status === 'reviewed' && <Button onClick={() => transition.mutate({ id: id!, to: 'approved' })}>Approve</Button>}
              {form.status === 'approved' && <Button variant="outline" onClick={() => transition.mutate({ id: id!, to: 'closed' })}>Close</Button>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Signals</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="font-medium mb-1">Breaches ({breaches.length})</div>
              {breaches.slice(0, 5).map((b: any) => <div key={b.id} className="flex justify-between border-b py-1"><span>{b.metric_key || b.ratio_key}</span><Badge>{b.severity}</Badge></div>)}
              {!breaches.length && <div className="text-muted-foreground">None</div>}
            </div>
            <div>
              <div className="font-medium mb-1">Ratios ({ratios.length})</div>
              {ratios.slice(0, 8).map((r: any) => <div key={r.id} className="flex justify-between border-b py-1"><span>{r.label || r.ratio_key}</span><span>{r.value}</span></div>)}
              {!ratios.length && <div className="text-muted-foreground">None</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
