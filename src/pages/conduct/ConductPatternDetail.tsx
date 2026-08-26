/**
 * MC-06 — Pattern detail workspace.
 *
 * Served entirely by the governed pattern read model. Every action runs through
 * a governed operation that enforces permission, regulator scope, state and the
 * mandatory note or rationale. The four objects stay distinct throughout:
 *   Pattern   — recurring behaviour detected by a rule (this page)
 *   Signal    — supervisory intelligence requiring assessment (raised, never merged)
 *   Alert     — attention / threshold notice (raised, never merged)
 *   Complaint — individual consumer case (contributing record, never merged)
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertCircle, AlertTriangle, ArrowUpRight, ClipboardCheck, FileText, Loader2,
  ListChecks, Network, Radar,
} from 'lucide-react';
import {
  useLinkPatternEvidence, usePatternDetail, useRaisePatternAlert, useRaisePatternSignal,
  useReviewPattern, type PatternDetail, type PatternMember,
} from '@/hooks/useConductPatterns';
import { useEvidence } from '@/hooks/useMarketConduct';
import { useCan } from '@/hooks/useCan';
import { formatDateTime } from '@/lib/datetime';
import type { PatternReviewStatus } from '@/lib/conductPatternOps';
import {
  EVIDENCE_TYPE_LABEL, MEMBER_KIND_DESCRIPTION, MEMBER_KIND_LABEL, METRIC_LABEL,
  OPERATOR_PHRASE, PATTERN_HISTORY_LABEL, PATTERN_SEVERITY_LABEL, PATTERN_SEVERITY_VARIANT,
  PATTERN_STATUS_LABEL, PATTERN_STATUS_VARIANT, PATTERN_TYPE_LABEL, formatMeasure, humanise,
  label, patternNarrative, patternReason, reviewNextSteps, windowLength,
} from '@/lib/conductPatternLabels';

type ActionKind = 'review' | 'link_evidence' | 'raise_signal' | 'raise_alert' | null;

const MEMBER_ORDER = ['signal', 'complaint', 'complaint_outcome'];

const MEMBER_ICON: Record<string, typeof Radar> = {
  signal: Radar,
  complaint: AlertCircle,
  complaint_outcome: ClipboardCheck,
};

const MEMBER_HREF: Record<string, (m: PatternMember) => string | null> = {
  signal: (m) => (m.member_id ? `/conduct/signals/${m.member_id}` : null),
  complaint: (m) => (m.member_id ? `/complaints/${m.member_id}` : null),
  complaint_outcome: (m) => {
    const complaintId = m.detail && typeof m.detail.complaint_id === 'string' ? m.detail.complaint_id : null;
    return complaintId ? `/complaints/${complaintId}` : null;
  },
};

export default function ConductPatternDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, error, refetch } = usePatternDetail(id);
  const [action, setAction] = useState<ActionKind>(null);

  const canComplaints = useCan('market_conduct', 'manage_complaints');
  const canAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const canManage = canComplaints || canAnalytics;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-16 text-center text-muted-foreground">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          <p className="mt-2 text-sm">Loading pattern…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !data?.cluster) {
    const message = (error as Error)?.message ?? '';
    return (
      <DashboardLayout>
        <div className="p-16 text-center">
          <AlertCircle className="mx-auto h-6 w-6 text-destructive" />
          <p className="mt-2 text-sm text-muted-foreground">
            {message.includes('not_authorized')
              ? 'This pattern is outside the portfolio you supervise.'
              : message.includes('not found')
                ? 'This pattern could not be found.'
                : 'The pattern could not be loaded. This is a temporary problem — please try again.'}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>Try again</Button>
        </div>
      </DashboardLayout>
    );
  }

  const c = data.cluster;
  const raisedSignal = data.raised?.signal ?? null;
  const raisedAlert = data.raised?.alert ?? null;
  const days = c.window_days ?? windowLength(c.window_start, c.window_end);

  const nextSteps = reviewNextSteps({
    status: c.status,
    member_count: c.member_count,
    evidence_count: data.evidence?.length ?? 0,
    raised_signal: !!raisedSignal,
    raised_alert: !!raisedAlert,
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={c.title}
          description={`Pattern ${c.reference} — a recurring behaviour detected across records that already exist. The contributing complaints, signals and alerts remain separate records.`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {!canManage && <Badge variant="outline">View only</Badge>}
              {canManage && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setAction('review')}>
                    Record review decision
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setAction('link_evidence')}>
                    Attach evidence
                  </Button>
                  {raisedSignal ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/conduct/signals/${raisedSignal.id}`}>
                        Signal {raisedSignal.reference} raised <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setAction('raise_signal')}>Raise conduct signal</Button>
                  )}
                  {raisedAlert ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link to="/conduct/alerts">Alert already raised <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => setAction('raise_alert')}>
                      Raise conduct alert
                    </Button>
                  )}
                </>
              )}
            </div>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={PATTERN_STATUS_VARIANT[c.status] ?? 'outline'}>{label(PATTERN_STATUS_LABEL, c.status)}</Badge>
          <Badge variant={PATTERN_SEVERITY_VARIANT[c.severity ?? ''] ?? 'outline'}>
            {label(PATTERN_SEVERITY_LABEL, c.severity)} severity
          </Badge>
          <Badge variant="outline">{label(PATTERN_TYPE_LABEL, c.pattern_type)}</Badge>
          {raisedSignal && <Badge variant="secondary">Signal raised — do not raise a second</Badge>}
          {raisedAlert && <Badge variant="secondary">Alert raised — do not raise a second</Badge>}
        </div>

        {/* -------------------------------------------------- explainability */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="h-4 w-4" /> What happened
              </CardTitle>
              <CardDescription>A plain-language summary of the behaviour this pattern describes.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>{patternNarrative(c)}</p>
              <Separator />
              <div>
                <p className="mb-1 font-medium">Why this was detected</p>
                <p className="text-muted-foreground">{patternReason(c)}</p>
                {c.match_explanation && (
                  <p className="mt-2 rounded-md bg-muted p-3 text-muted-foreground">{c.match_explanation}</p>
                )}
              </div>
              <Separator />
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field term="Rule applied" desc={data.rule?.name ?? label(PATTERN_TYPE_LABEL, c.pattern_type)} />
                <Field term="Rule version" desc={c.rule_version ? `Version ${c.rule_version}` : '—'} />
                <Field
                  term="Review period"
                  desc={c.window_start && c.window_end
                    ? `${formatDateTime(c.window_start)} to ${formatDateTime(c.window_end)}${days ? ` (${days} days)` : ''}`
                    : '—'}
                />
                <Field term="Measure used" desc={METRIC_LABEL[c.metric ?? ''] ?? humanise(c.metric)} />
                <Field term="Measured value" desc={formatMeasure(c.metric_value, c.metric_unit)} />
                <Field
                  term="Threshold crossed"
                  desc={`${OPERATOR_PHRASE[c.comparison_operator ?? ''] ?? 'above'} ${formatMeasure(c.threshold_value, c.metric_unit)}`}
                />
                <Field term="Entity" desc={c.entity_name ?? (c.distinct_entity_count && c.distinct_entity_count > 1 ? `${c.distinct_entity_count} entities affected` : '—')} />
                <Field term="Product / channel" desc={[c.product_name, c.channel_name].filter(Boolean).join(' · ') || '—'} />
                <Field term="Contributing records" desc={String(c.member_count ?? 0)} />
                <Field term="Records with systemic potential" desc={String(c.systemic_member_count ?? 0)} />
                <Field term="First detected" desc={formatDateTime(c.first_detected_at)} />
                <Field term="Last evaluated" desc={`${formatDateTime(c.last_evaluated_at)}${c.evaluation_count ? ` · ${c.evaluation_count} evaluations` : ''}`} />
                <Field term="Reviewer" desc={c.reviewer_name ?? 'Not yet reviewed'} />
                <Field term="Review recorded" desc={formatDateTime(c.reviewed_at)} />
              </dl>
              {c.review_note && (
                <div className="rounded-md border p-3">
                  <p className="text-xs font-medium">Latest review note</p>
                  <p className="mt-1 text-muted-foreground">{c.review_note}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="h-4 w-4" /> What to review next
              </CardTitle>
              <CardDescription>Suggested supervisory steps for the current status. Nothing happens automatically.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                {nextSteps.map((s, i) => (
                  <li key={s} className="flex gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{i + 1}</span>
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>
              {!canManage && (
                <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Your access to pattern detection is read-only. Review decisions and escalation are recorded by the
                  responsible conduct supervisor.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="records">
          <TabsList>
            <TabsTrigger value="records">Contributing records ({data.members?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="evidence">Evidence ({data.evidence?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="space-y-4">
            <ContributingRecords members={data.members ?? []} />
          </TabsContent>

          <TabsContent value="evidence">
            <EvidenceCard
              items={data.evidence ?? []}
              canManage={canManage}
              onLink={() => setAction('link_evidence')}
            />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <EvaluationHistory detail={data} />
            <ActivityHistory detail={data} />
          </TabsContent>
        </Tabs>
      </div>

      <PatternActions
        clusterId={c.id}
        status={c.status}
        entityId={c.licensee_id}
        action={action}
        close={() => setAction(null)}
      />
    </DashboardLayout>
  );
}

function Field({ term, desc }: { term: string; desc: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="text-sm">{desc || '—'}</dd>
    </div>
  );
}

/* ------------------------------------------------- contributing records */

function ContributingRecords({ members }: { members: PatternMember[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, PatternMember[]>();
    members.forEach((m) => {
      const key = m.member_type ?? 'other';
      map.set(key, [...(map.get(key) ?? []), m]);
    });
    return [...map.entries()].sort(
      (a, b) => (MEMBER_ORDER.indexOf(a[0]) + 99) % 99 - (MEMBER_ORDER.indexOf(b[0]) + 99) % 99,
    );
  }, [members]);

  if (members.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No contributing records are recorded for this pattern.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {grouped.map(([kind, rows]) => {
        const Icon = MEMBER_ICON[kind] ?? Network;
        return (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Icon className="h-4 w-4" /> {label(MEMBER_KIND_LABEL, kind)} ({rows.length})
              </CardTitle>
              <CardDescription>
                {MEMBER_KIND_DESCRIPTION[kind] ?? 'Records that contributed to this pattern remain separate records.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Occurred</TableHead>
                    <TableHead className="text-right">Open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((m) => {
                    const href = MEMBER_HREF[kind]?.(m) ?? null;
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs">{m.member_reference ?? '—'}</TableCell>
                        <TableCell className="max-w-sm truncate text-sm">{m.member_title ?? '—'}</TableCell>
                        <TableCell className="text-sm">
                          {m.member_severity
                            ? <Badge variant={PATTERN_SEVERITY_VARIANT[m.member_severity] ?? 'outline'}>
                                {label(PATTERN_SEVERITY_LABEL, m.member_severity)}
                              </Badge>
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">{formatDateTime(m.occurred_at)}</TableCell>
                        <TableCell className="text-right">
                          {href ? (
                            <Button variant="ghost" size="sm" asChild>
                              <Link to={href}>Open <ArrowUpRight className="ml-1 h-3.5 w-3.5" /></Link>
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not available</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------- evidence */

function EvidenceCard({ items, canManage, onLink }: {
  items: { id: string; title: string | null; evidence_type: string | null; uploaded_at: string | null }[];
  canManage: boolean;
  onLink: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><FileText className="h-4 w-4" /> Evidence</CardTitle>
          <CardDescription>
            Items held in the conduct evidence repository. Evidence is stored once and attached where it is relevant.
          </CardDescription>
        </div>
        {canManage && <Button variant="outline" size="sm" onClick={onLink}>Attach evidence</Button>}
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No evidence is attached to this pattern.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm">{e.title ?? 'Untitled item'}</TableCell>
                  <TableCell className="text-xs">{label(EVIDENCE_TYPE_LABEL, e.evidence_type)}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(e.uploaded_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- history */

function EvaluationHistory({ detail }: { detail: PatternDetail }) {
  const rows = detail.metrics ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evaluations</CardTitle>
        <CardDescription>
          Each time the rule was run, what it measured and whether the threshold was crossed.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No evaluations are recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Evaluated</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Measured</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead>Outcome</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-xs">{formatDateTime(m.evaluated_at)}</TableCell>
                  <TableCell className="text-xs">
                    {m.window_start && m.window_end
                      ? `${formatDateTime(m.window_start)} – ${formatDateTime(m.window_end)}`
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{formatMeasure(m.metric_value, detail.cluster.metric_unit)}</TableCell>
                  <TableCell className="text-sm">
                    {`${OPERATOR_PHRASE[m.comparison_operator ?? ''] ?? 'above'} ${formatMeasure(m.threshold_value, detail.cluster.metric_unit)}`}
                  </TableCell>
                  <TableCell className="text-right text-sm">{m.member_count ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant={m.matched ? 'destructive' : 'outline'}>
                      {m.matched ? 'Threshold crossed' : 'Within threshold'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityHistory({ detail }: { detail: PatternDetail }) {
  const rows = detail.history ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
        <CardDescription>Detection, review decisions and escalations recorded on this pattern.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No activity is recorded yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Status change</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="text-xs">{formatDateTime(h.created_at)}</TableCell>
                  <TableCell className="text-sm">{label(PATTERN_HISTORY_LABEL, h.event_type)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {h.to_status
                      ? `${label(PATTERN_STATUS_LABEL, h.from_status)} → ${label(PATTERN_STATUS_LABEL, h.to_status)}`
                      : '—'}
                  </TableCell>
                  <TableCell className="max-w-sm text-xs text-muted-foreground">{h.reason ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------------------------------------- actions */

const REVIEW_CHOICES: Array<{ value: PatternReviewStatus; label: string; help: string }> = [
  { value: 'under_review', label: 'Take under review', help: 'The pattern is being assessed by a supervisor.' },
  { value: 'confirmed', label: 'Confirm the pattern', help: 'The recurring behaviour is substantiated.' },
  { value: 'dismissed', label: 'Dismiss the pattern', help: 'The records do not describe a genuine recurring concern.' },
  { value: 'open', label: 'Reopen for review', help: 'Return the pattern to the review queue.' },
];

function PatternActions({ clusterId, status, entityId, action, close }: {
  clusterId: string;
  status: string;
  entityId: string | null;
  action: ActionKind;
  close: () => void;
}) {
  const review = useReviewPattern();
  const linkEvidence = useLinkPatternEvidence();
  const raiseSignal = useRaisePatternSignal();
  const raiseAlert = useRaisePatternAlert();

  const { data: evidence = [] } = useEvidence(entityId ? { entity_id: entityId } : {});

  const [decision, setDecision] = useState<PatternReviewStatus>(
    status === 'open' ? 'under_review' : status === 'dismissed' ? 'open' : 'confirmed',
  );
  const [note, setNote] = useState('');
  const [evidenceId, setEvidenceId] = useState('');

  const busy = review.isPending || linkEvidence.isPending || raiseSignal.isPending || raiseAlert.isPending;
  const dismissAll = () => { setNote(''); setEvidenceId(''); close(); };
  const openState = (k: ActionKind) => action === k;

  return (
    <>
      {/* Review decision */}
      <Dialog open={openState('review')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a review decision</DialogTitle>
            <DialogDescription>
              Your decision and note are recorded against the pattern. A dismissed pattern must be reopened before any
              other decision can be taken.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Decision</Label>
              <Select value={decision} onValueChange={(v) => setDecision(v as PatternReviewStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REVIEW_CHOICES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {REVIEW_CHOICES.find((c) => c.value === decision)?.help}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Review note</Label>
              <Textarea
                rows={4}
                placeholder="Explain what you assessed and why you reached this decision (at least 10 characters)."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll} disabled={busy}>Cancel</Button>
            <Button
              disabled={note.trim().length < 10 || busy}
              onClick={async () => {
                await review.mutateAsync({ id: clusterId, status: decision, note: note.trim() });
                dismissAll();
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Record decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Attach existing evidence */}
      <Dialog open={openState('link_evidence')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Attach evidence</DialogTitle>
            <DialogDescription>
              Select an item already held in the conduct evidence repository. Evidence is never duplicated for a pattern.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Evidence item</Label>
              <Select value={evidenceId} onValueChange={setEvidenceId}>
                <SelectTrigger><SelectValue placeholder="Select an evidence item" /></SelectTrigger>
                <SelectContent>
                  {evidence.length === 0 && <SelectItem value="none" disabled>No evidence available for this entity</SelectItem>}
                  {evidence.map((e: { id: string; title: string | null }) => (
                    <SelectItem key={e.id} value={e.id}>{e.title ?? 'Untitled item'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Textarea
                rows={3}
                placeholder="Why this evidence is relevant to the pattern."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll} disabled={busy}>Cancel</Button>
            <Button
              disabled={!evidenceId || evidenceId === 'none' || busy}
              onClick={async () => {
                await linkEvidence.mutateAsync({ id: clusterId, evidenceId, note: note.trim() || undefined });
                dismissAll();
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Attach evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise a conduct signal */}
      <Dialog open={openState('raise_signal')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Radar className="h-4 w-4" /> Raise a conduct signal</DialogTitle>
            <DialogDescription>
              A signal is supervisory intelligence that will be assessed on its own merits. The pattern and its
              contributing records stay unchanged. Only one signal can be raised from a pattern.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Rationale</Label>
            <Textarea
              rows={4}
              placeholder="Why this pattern warrants supervisory assessment (at least 10 characters)."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll} disabled={busy}>Cancel</Button>
            <Button
              disabled={note.trim().length < 10 || busy}
              onClick={async () => {
                await raiseSignal.mutateAsync({ id: clusterId, rationale: note.trim() });
                dismissAll();
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Raise signal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Raise a conduct alert */}
      <Dialog open={openState('raise_alert')} onOpenChange={(v) => !v && dismissAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Raise a conduct alert</DialogTitle>
            <DialogDescription>
              An alert notifies the supervisory team that a threshold has been crossed and attention is required. It does
              not replace the pattern or any consumer complaint. Only one alert can be raised from a pattern.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Rationale</Label>
            <Textarea
              rows={4}
              placeholder="Why immediate supervisory attention is required (at least 10 characters)."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={dismissAll} disabled={busy}>Cancel</Button>
            <Button
              disabled={note.trim().length < 10 || busy}
              onClick={async () => {
                await raiseAlert.mutateAsync({ id: clusterId, rationale: note.trim() });
                dismissAll();
              }}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Raise alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
