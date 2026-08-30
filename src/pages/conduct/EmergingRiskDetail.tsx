/**
 * MC-09 — Emerging conduct risk detail.
 *
 * The record of a supervisory judgement: the factual basis it was raised from,
 * the records linked to it, the versioned assessments recorded against it, the
 * follow-up a supervisor chose to take, and the full history of who changed what
 * and why. Assessments are append-only — a new judgement never overwrites an
 * earlier one. AI assistance sits at the foot of the page, separated from the
 * record, and changes nothing here.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { RaiseAttentionFromRisk } from '@/components/conduct/planning/RaiseAttentionFromRisk';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ArrowLeft, ClipboardCheck, Link2, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { formatDate, formatDateTime } from '@/lib/datetime';
import {
  CONFIDENCE_LABEL, EVENT_TYPE_LABEL, FOLLOW_UP_LABEL, RECORD_TYPE_LABEL,
  RISK_NEXT_STATES, RISK_STATUS_LABEL, SEVERITY_LABEL, SYSTEMIC_LABEL,
  riskErrorMessage, useAssessEmergingRisk, useEmergingRisk, useLinkEmergingRiskRecord,
  useRecordEmergingRiskFollowUp, useTransitionEmergingRisk,
  type EmergingRiskRecord, type EmergingRiskStatus, type FollowUpKind,
} from '@/hooks/useConductEmergingRisk';
import { IntelAdvisoryPanel } from '@/components/conduct/intelligence/IntelAdvisoryPanel';
import { EMERGING_RISK_ADVISORY_USE_CASES } from '@/lib/conductAdvisoryLabels';

const SEVERITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  critical: 'destructive', high: 'destructive', medium: 'default', low: 'secondary',
};

function FactBasis({ basis }: { basis: Record<string, unknown> }) {
  const entries = Object.entries(basis ?? {});
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No factual basis was captured with this risk.</p>;
  }
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            {key.replace(/_/g, ' ')}
          </dt>
          <dd className="break-words text-sm">
            {typeof value === 'object' && value !== null
              ? Object.entries(value as Record<string, unknown>)
                  .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
                  .join(' · ')
              : String(value ?? '—')}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function EmergingRiskDetail() {
  const { riskId } = useParams<{ riskId: string }>();
  const navigate = useNavigate();

  const canComplaints = useCan('market_conduct', 'manage_complaints');
  const canAnalytics = useCan('market_conduct', 'run_conduct_analytics');
  const canOperate = canComplaints || canAnalytics;

  const { data, isLoading, isError, error } = useEmergingRisk(riskId);
  const transition = useTransitionEmergingRisk(riskId);
  const link = useLinkEmergingRiskRecord(riskId);
  const assess = useAssessEmergingRisk(riskId);
  const followUp = useRecordEmergingRiskFollowUp(riskId);

  const risk = data?.risk ?? null;
  const concluded = risk ? ['DISMISSED', 'CLOSED'].includes(risk.status) : false;
  const canAct = canOperate && !concluded;

  /* dialogs */
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<EmergingRiskStatus | ''>('');
  const [statusRationale, setStatusRationale] = useState('');

  const [assessOpen, setAssessOpen] = useState(false);
  const [judgement, setJudgement] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [systemic, setSystemic] = useState('unassessed');
  const [confidence, setConfidence] = useState('indicative');
  const [actions, setActions] = useState('');
  const [nextReview, setNextReview] = useState('');

  const [linkOpen, setLinkOpen] = useState(false);
  const [recordType, setRecordType] = useState<EmergingRiskRecord['record_type']>('signal');
  const [recordId, setRecordId] = useState('');
  const [recordRef, setRecordRef] = useState('');
  const [recordNote, setRecordNote] = useState('');

  const [followOpen, setFollowOpen] = useState(false);
  const [followKind, setFollowKind] = useState<FollowUpKind>('signal_raised');
  const [followRef, setFollowRef] = useState('');
  const [followNote, setFollowNote] = useState('');

  const subject = useMemo(
    () => (riskId ? ({ kind: 'emerging_risk', riskId, windowDays: 180 } as const) : null),
    [riskId],
  );

  const fail = (e: unknown) => toast.error(riskErrorMessage(String((e as Error)?.message ?? '')));

  const submitStatus = async () => {
    if (!nextStatus) return;
    try {
      await transition.mutateAsync({ status: nextStatus, rationale: statusRationale.trim() });
      toast.success('Status change recorded.');
      setStatusOpen(false);
      setStatusRationale('');
      setNextStatus('');
    } catch (e) { fail(e); }
  };

  const submitAssessment = async () => {
    try {
      const result = await assess.mutateAsync({
        judgement: judgement.trim(),
        severity, systemic_potential: systemic, confidence,
        actions_considered: actions.trim() || undefined,
        next_review_date: nextReview || null,
      });
      toast.success(`Assessment version ${result.version} recorded.`);
      setAssessOpen(false);
      setJudgement('');
      setActions('');
    } catch (e) { fail(e); }
  };

  const submitLink = async () => {
    try {
      const result = await link.mutateAsync({
        recordType, recordId: recordId.trim(),
        reference: recordRef.trim() || undefined,
        note: recordNote.trim() || undefined,
      });
      toast.success(result?.already_linked ? 'That record is already linked to this risk.' : 'Record linked.');
      setLinkOpen(false);
      setRecordId('');
      setRecordRef('');
      setRecordNote('');
    } catch (e) { fail(e); }
  };

  const submitFollowUp = async () => {
    try {
      await followUp.mutateAsync({
        kind: followKind,
        reference: followRef.trim() || undefined,
        note: followNote.trim(),
      });
      toast.success('Supervisory follow-up recorded.');
      setFollowOpen(false);
      setFollowRef('');
      setFollowNote('');
    } catch (e) { fail(e); }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !risk) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => navigate('/conduct/emerging-risks')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to the register
          </Button>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">This risk could not be opened</AlertTitle>
            <AlertDescription className="text-xs">
              {isError
                ? riskErrorMessage(String((error as Error)?.message ?? ''))
                : 'The risk does not exist, or it is outside the sectors you supervise.'}
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  const nextStates = RISK_NEXT_STATES[risk.status] ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/conduct/emerging-risks')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to the register
        </Button>

        <PageHeader
          title={risk.title}
          description={`${risk.reference} — emerging conduct risk recorded by a supervisor. Its severity, systemic potential and status are the outcome of recorded human assessments, not of any automated calculation.`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{RISK_STATUS_LABEL[risk.status] ?? risk.status}</Badge>
              <Badge variant={SEVERITY_VARIANT[risk.severity] ?? 'outline'}>
                {SEVERITY_LABEL[risk.severity] ?? risk.severity}
              </Badge>
              {!canOperate && <Badge variant="outline">View only</Badge>}
            </div>
          }
        />

        {concluded && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">This risk has been concluded</AlertTitle>
            <AlertDescription className="text-xs">
              It is retained in full as a supervisory record and can no longer be amended.
              {risk.closure_note ? ` Closing note: ${risk.closure_note}` : ''}
            </AlertDescription>
          </Alert>
        )}

        {canAct && (
          <div className="flex flex-wrap gap-2">
            <Button data-rbac="market_conduct.manage_complaints" onClick={() => setAssessOpen(true)}>
              <ClipboardCheck className="mr-1.5 h-4 w-4" /> Record an assessment
            </Button>
            <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => setLinkOpen(true)}>
              <Link2 className="mr-1.5 h-4 w-4" /> Link a record
            </Button>
            <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => setFollowOpen(true)}>
              <ShieldAlert className="mr-1.5 h-4 w-4" /> Record supervisory follow-up
            </Button>
            {nextStates.length > 0 && (
              <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => setStatusOpen(true)}>
                Change status
              </Button>
            )}
          </div>
        )}

        <RaiseAttentionFromRisk risk={risk} canOperate={canAct} />

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Why this risk was recorded</CardTitle>
              <CardDescription>The supervisor's written basis, kept exactly as recorded.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm">{risk.basis}</p>
              {risk.summary && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Recorded position at the time</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{risk.summary}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current supervisory view</CardTitle>
              <CardDescription>As set by the latest recorded assessment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                ['Theme', risk.thematic_scope],
                ['Entities in scope', String(risk.entity_count)],
                ['Severity', SEVERITY_LABEL[risk.severity] ?? risk.severity],
                ['Systemic potential', SYSTEMIC_LABEL[risk.systemic_potential] ?? risk.systemic_potential],
                ['Confidence', CONFIDENCE_LABEL[risk.confidence] ?? risk.confidence],
                ['Observation window', risk.window_start && risk.window_end
                  ? `${formatDate(risk.window_start)} to ${formatDate(risk.window_end)}`
                  : 'Not stated'],
                ['Recorded', formatDateTime(risk.created_at)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{k}</span>
                  <span className="text-right">{v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="assessments">
          <TabsList className="flex-wrap">
            <TabsTrigger value="assessments">Assessments ({data?.assessments.length ?? 0})</TabsTrigger>
            <TabsTrigger value="records">Linked records ({data?.records.length ?? 0})</TabsTrigger>
            <TabsTrigger value="basis">Factual basis</TabsTrigger>
            <TabsTrigger value="history">History ({data?.events.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="assessments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recorded assessments</CardTitle>
                <CardDescription>
                  Append-only. Each assessment is kept as its own version, so an earlier supervisory judgement is
                  never overwritten or lost.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(data?.assessments ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No assessment has been recorded yet.</p>
                ) : (
                  data!.assessments.map((a) => (
                    <div key={a.id} className="rounded-md border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Version {a.version}</Badge>
                        <Badge variant={SEVERITY_VARIANT[a.severity] ?? 'outline'}>
                          {SEVERITY_LABEL[a.severity] ?? a.severity}
                        </Badge>
                        <Badge variant="outline">
                          Systemic: {SYSTEMIC_LABEL[a.systemic_potential] ?? a.systemic_potential}
                        </Badge>
                        <Badge variant="outline">
                          Confidence: {CONFIDENCE_LABEL[a.confidence] ?? a.confidence}
                        </Badge>
                        <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(a.assessed_at)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm">{a.judgement}</p>
                      {a.actions_considered && (
                        <p className="mt-2 text-sm">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">Actions considered — </span>
                          {a.actions_considered}
                        </p>
                      )}
                      {a.next_review_date && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Next review due {formatDate(a.next_review_date)}.
                        </p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="records" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Linked records</CardTitle>
                <CardDescription>
                  The complaints, conduct signals, alerts, outcomes and detected patterns a supervisor linked to this
                  risk. Linking does not alter the linked record.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-0">
                {(data?.records ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No record has been linked to this risk.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead>Linked</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.records.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{RECORD_TYPE_LABEL[r.record_type] ?? r.record_type}</TableCell>
                          <TableCell className="font-mono text-xs">{r.record_reference ?? r.record_id}</TableCell>
                          <TableCell className="max-w-[24rem] text-sm">{r.note ?? '—'}</TableCell>
                          <TableCell className="text-xs">{formatDateTime(r.linked_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="basis" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Factual basis captured at the time</CardTitle>
                <CardDescription>
                  The recorded position and driver measures as they stood when this risk was raised. Retained
                  unchanged so the judgement can be read against what was then known.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Driver measures</h3>
                  <FactBasis basis={risk.driver_metrics} />
                </section>
                <Separator />
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Provenance of the facts</h3>
                  <FactBasis basis={risk.fact_basis} />
                </section>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">History</CardTitle>
                <CardDescription>Every change to this risk, in the order it happened.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {(data?.events ?? []).length === 0 ? (
                  <p className="p-6 text-sm text-muted-foreground">No history has been recorded.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Event</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Reason given</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.events.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm">{EVENT_TYPE_LABEL[e.event_type] ?? e.event_type}</TableCell>
                          <TableCell className="text-xs">
                            {e.from_status || e.to_status
                              ? `${RISK_STATUS_LABEL[(e.from_status ?? '') as EmergingRiskStatus] ?? e.from_status ?? '—'} → ${RISK_STATUS_LABEL[(e.to_status ?? '') as EmergingRiskStatus] ?? e.to_status ?? '—'}`
                              : '—'}
                          </TableCell>
                          <TableCell className="max-w-[24rem] text-sm">{e.rationale ?? '—'}</TableCell>
                          <TableCell className="text-xs">{formatDateTime(e.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <IntelAdvisoryPanel
          subject={subject}
          useCases={EMERGING_RISK_ADVISORY_USE_CASES}
          canOperate={canAct}
          emptySubjectMessage="Assistance is unavailable for this risk."
        />
      </div>

      {/* ------------------------------------------------ status change */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change the status of this risk</DialogTitle>
            <DialogDescription>
              A written reason is required and is kept permanently on the record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">New status</Label>
              <Select value={nextStatus || 'none'} onValueChange={(v) => setNextStatus(v === 'none' ? '' : v as EmergingRiskStatus)}>
                <SelectTrigger><SelectValue placeholder="Choose a status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Choose a status</SelectItem>
                  {nextStates.map((s) => (
                    <SelectItem key={s} value={s}>{RISK_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Textarea rows={4} value={statusRationale} onChange={(e) => setStatusRationale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitStatus} disabled={transition.isPending || !nextStatus || statusRationale.trim().length < 10}>
              {transition.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Record change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* -------------------------------------------------- assessment */}
      <Dialog open={assessOpen} onOpenChange={setAssessOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Record a supervisory assessment</DialogTitle>
            <DialogDescription>
              Your judgement is recorded as a new version and sets the risk's current severity, systemic potential and
              confidence. Earlier assessments are retained unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Severity</Label>
                <Select value={severity} onValueChange={setSeverity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEVERITY_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Systemic potential</Label>
                <Select value={systemic} onValueChange={setSystemic}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SYSTEMIC_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Confidence</Label>
                <Select value={confidence} onValueChange={setConfidence}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONFIDENCE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Your judgement</Label>
              <Textarea
                rows={5}
                value={judgement}
                onChange={(e) => setJudgement(e.target.value)}
                placeholder="State what the recorded facts show, and the supervisory view you have reached."
              />
              <p className="text-xs text-muted-foreground">At least 20 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Actions considered (optional)</Label>
              <Textarea rows={3} value={actions} onChange={(e) => setActions(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Next review date (optional)</Label>
              <Input type="date" value={nextReview} onChange={(e) => setNextReview(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssessOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitAssessment} disabled={assess.isPending || judgement.trim().length < 20}>
              {assess.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Record assessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------ link a record */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link a record to this risk</DialogTitle>
            <DialogDescription>
              Linking is a cross-reference only. The complaint, signal, alert, outcome or pattern you link is not
              changed in any way.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type of record</Label>
              <Select value={recordType} onValueChange={(v) => setRecordType(v as EmergingRiskRecord['record_type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECORD_TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Record identifier</Label>
              <Input value={recordId} onChange={(e) => setRecordId(e.target.value)} placeholder="The record's unique identifier" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference shown on the record (optional)</Label>
              <Input value={recordRef} onChange={(e) => setRecordRef(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Why it is relevant (optional)</Label>
              <Textarea rows={3} value={recordNote} onChange={(e) => setRecordNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitLink} disabled={link.isPending || recordId.trim().length < 8}>
              {link.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Link record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --------------------------------------------------- follow-up */}
      <Dialog open={followOpen} onOpenChange={setFollowOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record supervisory follow-up</DialogTitle>
            <DialogDescription>
              This records the follow-up a supervisor has decided on. It does not itself raise a signal, alert,
              investigation or correspondence — those remain their own explicit actions in their own modules.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type of follow-up</Label>
              <Select value={followKind} onValueChange={(v) => setFollowKind(v as FollowUpKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FOLLOW_UP_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reference of the record created (optional)</Label>
              <Input value={followRef} onChange={(e) => setFollowRef(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">What was done and why</Label>
              <Textarea rows={4} value={followNote} onChange={(e) => setFollowNote(e.target.value)} />
              <p className="text-xs text-muted-foreground">At least 10 characters.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFollowOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitFollowUp} disabled={followUp.isPending || followNote.trim().length < 10}>
              {followUp.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Record follow-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
