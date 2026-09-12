/**
 * MC-08 — Governance → AI Governance → Exceptions.
 *
 * The operational queue of AI activity that needs governance attention:
 * awaiting review beyond the agreed period, facts changed since preparation,
 * confidence below the threshold, no supporting record cited, refusals and
 * failures. Every item drills through to the full evidence chain.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Info, Loader2 } from 'lucide-react';
import {
  useAiActivity, useAiGovernanceExceptions, useAiThresholds, useAiUseCases,
  useAssuranceCreate, useAssuranceReviews,
} from '@/hooks/useAiGovernance';
import {
  EXCEPTION_LABEL, REVIEW_STATE_LABEL, label,
} from '@/lib/aiGovernanceLabels';
import { formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';

const CATEGORIES = [
  'UNREVIEWED_OVERDUE', 'STALE_FACTS', 'LOW_CONFIDENCE', 'NO_CITATION',
  'GOVERNANCE_REFUSAL', 'SCOPE_REFUSAL', 'MODEL_REFUSAL', 'GENERATION_FAILURE',
];

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  HIGH: 'destructive', MEDIUM: 'secondary', LOW: 'outline',
};

export default function AiExceptions() {
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canAssurePrimary = useCan('ai_management', 'assure');
  const canAssureAlternate = useCan('ai_management', 'approve');
  const canAssure = canAssurePrimary || canAssureAlternate;
  const { data: exceptions = [], isLoading } = useAiGovernanceExceptions(300);
  const { data: activity = [] } = useAiActivity({ limit: 500 });
  const { data: useCases = [] } = useAiUseCases();
  const { data: thresholds } = useAiThresholds();
  const { data: reviews = [] } = useAssuranceReviews();
  const createAssurance = useAssuranceCreate();
  const [category, setCategory] = useState('all');

  const activityById = useMemo(() => {
    const m = new Map<string, (typeof activity)[number]>();
    activity.forEach((a) => m.set(a.activity_id, a));
    return m;
  }, [activity]);

  const reviewedInsights = new Set(reviews.map((r) => r.conduct_ai_insight_id));

  const rows = exceptions.filter((e) => category === 'all' || e.exception_code === category);

  const ageDays = (iso: string) =>
    Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Governance Exceptions"
          description="AI activity requiring governance attention, with the reason, the capability, the model version, the age and the current human-review state."
        />

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            An exception is a prompt to act, not a defect record. Items clear when the underlying condition changes —
            a supervisor completes their review, assistance is prepared again on current facts, or an assurance review
            reaches a conclusion.
            {thresholds && (
              <> Current thresholds: review expected within {thresholds.unreviewed_hours} hours; confidence below {thresholds.low_confidence_below} is treated as low.</>
            )}
          </AlertDescription>
        </Alert>

        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="w-72">
              <label className="text-xs text-muted-foreground">Exception type</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All exception types</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{label(EXCEPTION_LABEL, c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{rows.length} item(s)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Queue</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading exceptions…
              </p>
            ) : rows.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No exception is outstanding for this filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Exception</TableHead>
                      <TableHead>Capability</TableHead>
                      <TableHead>Entity</TableHead>
                      <TableHead>Model version</TableHead>
                      <TableHead>When / age</TableHead>
                      <TableHead>Human review</TableHead>
                      <TableHead>Freshness</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((e) => {
                      const a = activityById.get(e.activity_id);
                      const insightId = a?.conduct_ai_insight_id ?? null;
                      const canOpenReview = canAssure && !!insightId && !reviewedInsights.has(insightId);
                      return (
                        <TableRow key={`${e.exception_code}-${e.activity_id}`}>
                          <TableCell className="text-sm">
                            <Badge variant={SEVERITY_VARIANT[e.severity] ?? 'outline'}>
                              {label(EXCEPTION_LABEL, e.exception_code)}
                            </Badge>
                            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{e.detail}</p>
                          </TableCell>
                          <TableCell className="text-xs">
                            {useCases.find((u) => u.code === e.use_case_code)?.label ?? e.use_case_code ?? 'Not recorded'}
                          </TableCell>
                          <TableCell className="break-all font-mono text-xs">{e.entity_id ?? '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{a?.model_version ?? a?.model ?? 'Not recorded'}</TableCell>
                          <TableCell className="text-xs">
                            {formatDateTime(e.occurred_at)}
                            <p className="text-muted-foreground">{ageDays(e.occurred_at)} day(s) old</p>
                          </TableCell>
                          <TableCell className="text-xs">
                            {label(REVIEW_STATE_LABEL, a?.review_state ?? 'NOT_APPLICABLE')}
                          </TableCell>
                          <TableCell className="text-xs">
                            {a?.staleness_state === 'STALE' ? 'Facts changed' : 'Facts unchanged'}
                          </TableCell>
                          <TableCell className="space-x-1 text-right">
                            <Button asChild size="sm" variant="ghost">
                              <Link to={`/governance/ai/activity/${e.activity_kind}/${e.activity_id}`}>Open</Link>
                            </Button>
                            {canOpenReview && (
                              <Button data-rbac="ai_management.edit"
                                size="sm" variant="outline" disabled={createAssurance.isPending}
                                onClick={() => createAssurance.mutate({ insightId })}
                              >
                                Start assurance
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
