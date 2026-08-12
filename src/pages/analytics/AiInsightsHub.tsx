import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Loader2, Sparkles, AlertTriangle } from 'lucide-react';
import { useAiInsights, useReviewAiInsight, isLiveInsight, type AiInsight } from '@/hooks/useAiInsights';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  accepted: 'bg-primary/10 text-primary border-primary/30',
  rejected: 'bg-destructive/10 text-destructive border-destructive/30',
  escalated: 'bg-accent text-accent-foreground',
};

function SourceList({ insight }: { insight: AiInsight }) {
  const records = Array.isArray(insight.source_records) ? (insight.source_records as any[]) : [];
  if (!records.length) return <p className="text-xs text-muted-foreground">No source records recorded.</p>;
  return (
    <ul className="text-xs space-y-1">
      {records.map((r, i) => {
        const type = r?.type ?? insight.object_type;
        const id = r?.id ?? insight.object_id;
        const href =
          type === 'complaint' ? `/complaints/${id}`
          : type === 'conduct_alert' ? `/conduct/alerts`
          : type === 'investigation' ? `/conduct/investigations/${id}`
          : type === 'licensee' ? `/conduct/entities/${id}`
          : null;
        return (
          <li key={i}>
            {href ? <Link className="underline" to={href}>{type}: {r?.label ?? id}</Link>
                  : <span>{type}: {r?.label ?? id}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** Phase 5 — AI Insights Hub: read-only advisory output with a mandatory human review step. */
export default function AiInsightsHub() {
  const [module, setModule] = useState('all');
  const [status, setStatus] = useState('all');
  const [justification, setJustification] = useState<Record<string, string>>({});
  const { data, isLoading } = useAiInsights({ module, status });
  const review = useReviewAiInsight();

  const nonLive = useMemo(() => (data ?? []).filter((i) => !isLiveInsight(i.provider_state)), [data]);

  const act = async (insight: AiInsight, action: 'accept' | 'reject' | 'escalate') => {
    const j = justification[insight.id]?.trim() ?? '';
    if (j.length < 10) { toast.error('A justification of at least 10 characters is required'); return; }
    try {
      await review.mutateAsync({ insightId: insight.id, action, justification: j });
      toast.success(`Insight ${action}ed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Insight Review"
          description="Review, accept, reject or escalate AI insights requiring human disposition. To browse existing AI reports instead, use Supervisory AI Reports."
        />


        {!!nonLive.length && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Provider state disclosure</AlertTitle>
            <AlertDescription>
              {nonLive.length} insight(s) were not produced by a live provider run and are labelled with their actual
              state. They must not be relied on as evidence.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-3">
          <div className="w-48">
            <Label>Module</Label>
            <Select value={module} onValueChange={setModule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['all', 'market_conduct', 'prudential', 'licensing', 'fit_and_proper'].map((m) => (
                  <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Label>Review status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {['all', 'pending', 'accepted', 'rejected', 'escalated'].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : !data?.length ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            No insights recorded for this filter.
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {data.map((i) => (
              <Card key={i.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex flex-wrap items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    {i.title}
                    <Badge variant="outline" className={STATUS_TONE[i.review_status]}>{i.review_status}</Badge>
                    <Badge variant="outline">{i.module?.replace(/_/g, ' ')}</Badge>
                    <Badge variant={isLiveInsight(i.provider_state) ? 'outline' : 'destructive'}>
                      {i.provider_state}
                    </Badge>
                    {i.confidence != null && (
                      <span className="text-xs text-muted-foreground font-mono">
                        confidence {Number(i.confidence).toFixed(2)}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {i.explanation && <p>{i.explanation}</p>}
                  {i.recommendation && (
                    <p className="text-muted-foreground"><strong>Suggested next step:</strong> {i.recommendation}</p>
                  )}
                  <div>
                    <div className="text-xs font-medium mb-1">Source records</div>
                    <SourceList insight={i} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {i.provider ?? 'provider not configured'}{i.model ? ` · ${i.model}` : ''} ·{' '}
                    {new Date(i.generated_at).toLocaleString()}
                  </div>
                  {i.review_status === 'pending' ? (
                    <div className="space-y-2">
                      <Label htmlFor={`j-${i.id}`}>Decision justification (min 10 characters)</Label>
                      <Textarea id={`j-${i.id}`} rows={2}
                        value={justification[i.id] ?? ''}
                        onChange={(e) => setJustification((p) => ({ ...p, [i.id]: e.target.value }))} />
                      <div className="flex gap-2">
                        <Button size="sm" data-rbac="analytics.edit" onClick={() => act(i, 'accept')}>Accept</Button>
                        <Button size="sm" variant="outline" data-rbac="analytics.edit" onClick={() => act(i, 'reject')}>Reject</Button>
                        <Button size="sm" variant="outline" data-rbac="analytics.edit" onClick={() => act(i, 'escalate')}>Escalate</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Reviewed {i.reviewed_at ? new Date(i.reviewed_at).toLocaleString() : ''}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
