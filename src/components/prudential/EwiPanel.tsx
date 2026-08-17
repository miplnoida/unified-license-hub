/**
 * Early Warning Indicator register for a supervised entity (PRU-ANA-001 §3.7).
 *
 * Every alert shows its triggering rule, the evidence the rule fired on, the
 * execution timestamp, severity and review trail — no opaque alerts.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ChevronDown, Loader2, Play } from 'lucide-react';
import { useAcknowledgeEwi, useEvaluateEwi, useEwiAlerts, type EwiAlert } from '@/hooks/usePrudentialPhase2';
import { useCan } from '@/hooks/useCan';
import { AdvisoryAiPanel } from '@/components/prudential/AdvisoryAiPanel';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  high: 'bg-amber-500/10 text-amber-700 border-amber-200',
  medium: 'bg-sky-500/10 text-sky-700 border-sky-200',
  low: 'bg-muted text-muted-foreground',
};

const RULE_TYPE_LABEL: Record<string, string> = {
  repeated_breach: 'Repeated threshold breach',
  multi_ratio_warning: 'Multiple ratios in warning',
  sharp_deterioration: 'Sharp deterioration',
  adverse_trend: 'Adverse multi-period trend',
  late_return: 'Late or missing return',
};

export function EwiPanel({
  entityId,
  availablePeriods = [],
}: {
  entityId: string;
  availablePeriods?: string[];
}) {
  const { data: alerts = [], isLoading } = useEwiAlerts(entityId);
  const evaluate = useEvaluateEwi();
  const acknowledge = useAcknowledgeEwi();
  const canAct = useCan('prudential_supervision', 'workflow_action');

  const [period, setPeriod] = useState<string>(availablePeriods[0] ?? '');
  const [target, setTarget] = useState<EwiAlert | null>(null);
  const [notes, setNotes] = useState('');
  const [decision, setDecision] = useState<'acknowledged' | 'dismissed' | 'resolved'>('acknowledged');

  const openCount = useMemo(() => alerts.filter((a) => a.status === 'open').length, [alerts]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Early Warning Indicators
          <Badge variant="outline">{openCount} open</Badge>
        </CardTitle>
        <CardDescription>
          Configurable supervisory rules evaluated against submitted return data. Each indicator records
          the rule, its evidence and the review trail.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem]">
            <Label className="text-xs">Reporting period</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue placeholder="Select a reported period" /></SelectTrigger>
              <SelectContent>
                {availablePeriods.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button
            data-rbac="prudential_supervision.workflow_action"
            size="sm"
            variant="outline"
            disabled={!canAct || !period || evaluate.isPending}
            onClick={() => evaluate.mutate({ entityId, periodEnd: period })}
          >
            {evaluate.isPending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Evaluating…</>
              : <><Play className="h-4 w-4 mr-2" />Run evaluation</>}
          </Button>
          {!availablePeriods.length && (
            <p className="text-xs text-muted-foreground">
              No reported periods available for this entity yet.
            </p>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading indicators…</p>
        ) : !alerts.length ? (
          <p className="text-sm text-muted-foreground">
            No early warning indicators recorded for this entity.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Evaluated</TableHead>
                <TableHead className="text-right">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((a) => (
                <TableRow key={a.id} className="align-top">
                  <TableCell>
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 text-left font-medium">
                        {a.prudential_ewi_rules?.name || RULE_TYPE_LABEL[a.evidence?.rule_type] || a.rule_code}
                        <ChevronDown className="h-3 w-3" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-1">
                        <p className="text-xs text-muted-foreground">
                          {a.prudential_ewi_rules?.description || 'No rule description configured.'}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {a.rule_code} · v{a.rule_version}
                        </p>
                        <pre className="max-w-md overflow-x-auto rounded bg-muted p-2 text-xs">
                          {JSON.stringify(a.evidence, null, 2)}
                        </pre>
                        {a.notes && <p className="text-xs">Review note: {a.notes}</p>}
                      </CollapsibleContent>
                    </Collapsible>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{a.metric_key || '—'}</TableCell>
                  <TableCell className="text-xs">{a.period_end || '—'}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={SEVERITY_STYLES[a.severity]}>{a.severity}</Badge>
                  </TableCell>
                  <TableCell><Badge variant="outline">{a.status}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(a.executed_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    {a.status === 'open' ? (
                      <Button
                        data-rbac="prudential_supervision.workflow_action"
                        size="sm"
                        variant="outline"
                        disabled={!canAct}
                        onClick={() => { setTarget(a); setNotes(''); setDecision('acknowledged'); }}
                      >
                        Review
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {a.acknowledged_at ? new Date(a.acknowledged_at).toLocaleDateString() : '—'}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <AdvisoryAiPanel
          analysisType="ewi_priority"
          scopeId={entityId}
          periodKey={period || null}
          facts={{
            open_indicator_count: openCount,
            indicators: alerts.slice(0, 40).map((a) => ({
              rule: a.prudential_ewi_rules?.name || a.rule_code,
              rule_type: RULE_TYPE_LABEL[a.prudential_ewi_rules?.rule_type || ''] || a.prudential_ewi_rules?.rule_type || null,
              metric: a.metric_key,
              configured_severity: a.severity,
              status: a.status,
              period_end: a.period_end,
              evaluated_at: a.executed_at,
              evidence: a.evidence ?? {},
            })),
          }}
          ready={alerts.length > 0}
          title="AI-assisted attention priority"
          description="Suggests an order of supervisory attention across the indicators above. Configured severities, statuses and rule outcomes are unchanged."
        />
      </CardContent>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review early warning indicator</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Outcome</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as typeof decision)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="acknowledged">Acknowledge — under supervisory review</SelectItem>
                  <SelectItem value="resolved">Resolved — no further action needed</SelectItem>
                  <SelectItem value="dismissed">Dismiss — not a supervisory concern</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supervisory note</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={acknowledge.isPending || !notes.trim()}
              onClick={async () => {
                if (!target) return;
                try {
                  await acknowledge.mutateAsync({ id: target.id, notes, status: decision });
                  setTarget(null);
                } catch { /* toast from hook */ }
              }}
            >
              {acknowledge.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
                : 'Record review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
