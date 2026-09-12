/**
 * MC-10 — Supervisory attention workspace.
 *
 * The operational loop for one matter: the factual basis it was raised from, the
 * deterministic priority calculation and its factors, the supervisor's confirmed
 * priority, ownership, the plan and interventions raised in response, the
 * reassessment history, and the full audit of who changed what and why. AI
 * assistance sits at the foot of the page, separated from the record, and changes
 * nothing here.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
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
import { AlertTriangle, Calculator, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { formatDate, formatDateTime } from '@/lib/datetime';
import {
  ATTENTION_EVENT_LABEL, ATTENTION_NEXT_STATUS, ATTENTION_SOURCE_LABEL, ATTENTION_STATUS_LABEL,
  CONCERN_STATE_LABEL, MATERIALITY_LABEL, NEXT_STEP_LABEL, OUTCOME_RESULT_LABEL,
  PLAN_STATUS_LABEL, PRIORITY_BAND_LABEL, URGENCY_LABEL, attentionErrorMessage,
  useAssignAttention, useAttentionCase, useComputeAttentionPriority, useConfirmAttentionPriority,
  useCreatePlan, useInitiateIntervention, useReassessAttention, useTransitionAttention,
  type AttentionStatus, type PriorityBand,
} from '@/hooks/useConductAttention';
import { PlanningAdvisoryPanel } from '@/components/conduct/intelligence/PlanningAdvisoryPanel';
import { ATTENTION_ADVISORY_USE_CASES } from '@/lib/conductAdvisoryLabels';

const PRIORITY_VARIANT: Record<PriorityBand, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  IMMEDIATE: 'destructive', HIGH: 'destructive', PLANNED: 'default', MONITOR: 'secondary',
};

const FACTOR_LABEL: Record<string, string> = {
  materiality: 'Recorded materiality',
  urgency: 'Recorded urgency',
  breadth: 'Entities affected',
  recurrence: 'Recurrence in the records',
  unresolved_exposure: 'Unresolved supervisory exposure',
  trend: 'Movement in the records',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

export default function SupervisoryAttentionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Hooks must run unconditionally: evaluate both permissions, then combine.

  const canOperatePrimary = useCan('market_conduct', 'run_conduct_analytics');

  const canOperateAlternate = useCan('market_conduct', 'manage_complaints');

  const canOperate = canOperatePrimary || canOperateAlternate;
  const canApprove = useCan('market_conduct', 'approve');

  const { data, isLoading, isError } = useAttentionCase(id);
  const compute = useComputeAttentionPriority(id);
  const confirm = useConfirmAttentionPriority(id);
  const assign = useAssignAttention(id);
  const transition = useTransitionAttention(id);
  const reassess = useReassessAttention(id);
  const createPlan = useCreatePlan();
  const initiate = useInitiateIntervention();

  const item = data?.attention;
  const closed = item?.status === 'CLOSED';
  const canAct = canOperate && !closed;

  /* dialogs */
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBand, setConfirmBand] = useState<PriorityBand | ''>('');
  const [confirmRationale, setConfirmRationale] = useState('');

  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<AttentionStatus | ''>('');
  const [statusRationale, setStatusRationale] = useState('');
  const [disposition, setDisposition] = useState('');

  const [planOpen, setPlanOpen] = useState(false);
  const [planTitle, setPlanTitle] = useState('');
  const [planObjective, setPlanObjective] = useState('');
  const [planScope, setPlanScope] = useState('');
  const [planPeriod, setPlanPeriod] = useState('ad_hoc');
  const [planTarget, setPlanTarget] = useState('');

  const [ivOpen, setIvOpen] = useState(false);
  const [ivCode, setIvCode] = useState('');
  const [ivTitle, setIvTitle] = useState('');
  const [ivBasis, setIvBasis] = useState('');
  const [ivPlanId, setIvPlanId] = useState('none');
  const [ivStart, setIvStart] = useState('');
  const [ivEnd, setIvEnd] = useState('');
  const [ivInsightId, setIvInsightId] = useState<string | null>(null);

  const [reassessOpen, setReassessOpen] = useState(false);
  const [concernState, setConcernState] = useState('unchanged');
  const [assessment, setAssessment] = useState('');
  const [nextStep, setNextStep] = useState('continue_monitoring');
  const [nextReview, setNextReview] = useState('');

  const [reviewDate, setReviewDate] = useState('');

  const subject = useMemo(() => (id ? ({ kind: 'attention', id } as const) : null), [id]);
  const latestCalc = data?.calculations?.[0] ?? null;

  const fail = (e: unknown) => toast.error(attentionErrorMessage(String((e as Error)?.message ?? '')));

  const runCompute = async () => {
    try {
      const result = await compute.mutateAsync(180);
      toast.success(`Priority calculated: ${PRIORITY_BAND_LABEL[result.band]}. A supervisor must confirm it.`);
    } catch (e) { fail(e); }
  };

  const submitConfirm = async () => {
    if (!confirmBand) return;
    try {
      await confirm.mutateAsync({ priority: confirmBand, rationale: confirmRationale.trim() });
      toast.success('Priority confirmed and recorded against your name.');
      setConfirmOpen(false); setConfirmRationale(''); setConfirmBand('');
    } catch (e) { fail(e); }
  };

  const submitStatus = async () => {
    if (!nextStatus) return;
    try {
      await transition.mutateAsync({
        toStatus: nextStatus,
        rationale: statusRationale.trim(),
        disposition: nextStatus === 'CLOSED' ? disposition.trim() : null,
      });
      toast.success('Status change recorded.');
      setStatusOpen(false); setStatusRationale(''); setDisposition(''); setNextStatus('');
    } catch (e) { fail(e); }
  };

  const submitAssign = async () => {
    try {
      await assign.mutateAsync({ targetReviewDate: reviewDate || null, rationale: 'Review date set by supervisor.' });
      toast.success('Review date recorded.');
      setReviewDate('');
    } catch (e) { fail(e); }
  };

  const submitPlan = async () => {
    try {
      const result = await createPlan.mutateAsync({
        title: planTitle.trim(),
        factualBasis: item?.supervisory_basis ?? '',
        attentionId: id ?? null,
        objective: planObjective.trim() || null,
        scope: planScope.trim() || null,
        theme: item?.theme ?? null,
        sectorId: item?.sector_id ?? null,
        planningPeriod: planPeriod,
        targetCompletion: planTarget || null,
      });
      toast.success(`Supervisory plan ${result.reference} created as a draft.`);
      setPlanOpen(false);
      navigate(`/conduct/plans/${result.id}`);
    } catch (e) { fail(e); }
  };

  const submitIntervention = async () => {
    try {
      const result = await initiate.mutateAsync({
        catalogueCode: ivCode,
        title: ivTitle.trim(),
        basis: ivBasis.trim(),
        attentionId: id ?? null,
        planId: ivPlanId === 'none' ? null : ivPlanId,
        plannedStart: ivStart || null,
        plannedEnd: ivEnd || null,
        aiInsightId: ivInsightId,
      });
      toast.success(`Intervention ${result.reference} initiated.`);
      setIvOpen(false); setIvTitle(''); setIvBasis(''); setIvCode(''); setIvInsightId(null);
      navigate(`/conduct/interventions/${result.id}`);
    } catch (e) { fail(e); }
  };

  const submitReassess = async () => {
    try {
      await reassess.mutateAsync({
        concernState, assessment: assessment.trim(), nextStep,
        nextReviewDate: nextReview || null,
      });
      toast.success('Reassessment recorded.');
      setReassessOpen(false); setAssessment(''); setNextReview('');
    } catch (e) { fail(e); }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !item) {
    return (
      <DashboardLayout>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Not available</AlertTitle>
          <AlertDescription className="text-xs">
            This supervisory attention item could not be opened. It may sit outside the sectors you are
            authorised to supervise.
          </AlertDescription>
        </Alert>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={item.title}
        description={`${item.reference} · ${ATTENTION_SOURCE_LABEL[item.source_type] ?? item.source_type}`}
        backHref="/conduct/attention"
        backLabel="Supervisory attention"
        breadcrumbLabel={item.reference}
        actions={(
          <div className="flex flex-wrap gap-2">
            {canAct && (
              <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={runCompute} disabled={compute.isPending}>
                {compute.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Calculator className="mr-2 h-4 w-4" />}
                Calculate priority
              </Button>
            )}
            {canAct && item.calculated_priority && (
              <Button data-rbac="market_conduct.manage_complaints" onClick={() => { setConfirmBand(item.calculated_priority as PriorityBand); setConfirmOpen(true); }}>
                <ShieldCheck className="mr-2 h-4 w-4" /> Confirm priority
              </Button>
            )}
            {canAct && ATTENTION_NEXT_STATUS[item.status].length > 0 && (
              <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => setStatusOpen(true)}>Change status</Button>
            )}
          </div>
        )}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Supervisory basis</CardTitle>
            <CardDescription className="text-xs">
              The recorded facts this matter was raised from. It is not an assessment or a finding.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{item.supervisory_basis}</p>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Status">
                <Badge variant="outline">{ATTENTION_STATUS_LABEL[item.status]}</Badge>
              </Field>
              <Field label="Materiality">{MATERIALITY_LABEL[item.materiality] ?? item.materiality}</Field>
              <Field label="Urgency">{URGENCY_LABEL[item.urgency] ?? item.urgency}</Field>
              <Field label="Sector">{data?.sector_name ?? 'Not recorded'}</Field>
              <Field label="Theme">{item.theme ?? 'Not recorded'}</Field>
              <Field label="Source record">
                <span className="font-mono text-xs">{item.source_reference ?? '—'}</span>
              </Field>
              <Field label="Owner">{data?.owner_name ?? 'Not assigned'}</Field>
              <Field label="Target review">
                {item.target_review_date ? formatDate(item.target_review_date) : 'Not set'}
              </Field>
              <Field label="Entities in scope">
                {(data?.entities ?? []).length === 0
                  ? 'None recorded'
                  : (data?.entities ?? []).map((e) => e.name).join(', ')}
              </Field>
            </div>
            {item.disposition && (
              <Alert>
                <AlertTitle className="text-sm">Closed: {item.disposition}</AlertTitle>
                <AlertDescription className="text-xs">{item.disposition_rationale}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Priority</CardTitle>
            <CardDescription className="text-xs">
              Calculated from recorded facts. It takes effect only once a supervisor confirms it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Calculated">
                {item.calculated_priority
                  ? <Badge variant={PRIORITY_VARIANT[item.calculated_priority]}>
                      {PRIORITY_BAND_LABEL[item.calculated_priority]}
                    </Badge>
                  : <span className="text-xs text-muted-foreground">Not calculated</span>}
              </Field>
              <Field label="Confirmed">
                {item.confirmed_priority
                  ? <Badge variant={PRIORITY_VARIANT[item.confirmed_priority]}>
                      {PRIORITY_BAND_LABEL[item.confirmed_priority]}
                    </Badge>
                  : <span className="text-xs text-muted-foreground">Awaiting supervisor</span>}
              </Field>
            </div>
            {item.calculated_score !== null && (
              <Field label="Calculated score">{Number(item.calculated_score).toFixed(2)}</Field>
            )}
            {item.priority_overridden && (
              <Alert>
                <AlertDescription className="text-xs">
                  The supervisor recorded a priority different from the calculation, with a rationale.
                </AlertDescription>
              </Alert>
            )}
            {item.confirmation_rationale && (
              <Field label="Confirmation rationale">{item.confirmation_rationale}</Field>
            )}
            {data?.confirmed_by_name && (
              <p className="text-xs text-muted-foreground">
                Confirmed by {data.confirmed_by_name}
                {item.confirmed_at ? ` on ${formatDateTime(item.confirmed_at)}` : ''}
              </p>
            )}
            {latestCalc && (
              <>
                <Separator />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Calculation factors
                </p>
                <ul className="space-y-1 text-xs">
                  {Object.entries(latestCalc.factors ?? {}).map(([k, v]) => (
                    <li key={k} className="flex justify-between gap-2">
                      <span>{FACTOR_LABEL[k] ?? k.replace(/_/g, ' ')}</span>
                      <span className="font-mono">
                        {typeof v === 'object' && v !== null
                          ? String((v as { points?: number }).points ?? JSON.stringify(v))
                          : String(v)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  {latestCalc.method} · window {formatDate(latestCalc.window_start)} to{' '}
                  {formatDate(latestCalc.window_end)}
                </p>
              </>
            )}
            {canAct && (
              <div className="space-y-1.5">
                <Label htmlFor="review-date" className="text-xs">Set target review date</Label>
                <div className="flex gap-2">
                  <Input id="review-date" type="date" value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)} />
                  <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={submitAssign} disabled={!reviewDate || assign.isPending}>
                    Save
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="response" className="mt-4">
        <TabsList>
          <TabsTrigger value="response">Response</TabsTrigger>
          <TabsTrigger value="reassessment">Reassessment</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="response" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-3">
              <div>
                <CardTitle className="text-base">Supervisory plans</CardTitle>
                <CardDescription className="text-xs">
                  Plans raised in response to this matter. A plan needs approval by a second officer before it
                  becomes active.
                </CardDescription>
              </div>
              {canAct && (
                <Button data-rbac="market_conduct.manage_complaints" size="sm" variant="outline" className="ml-auto" onClick={() => setPlanOpen(true)}>
                  Create plan
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {(data?.plans ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No supervisory plan has been raised.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Target</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.plans ?? []).map((p) => (
                      <TableRow key={p.id} className="cursor-pointer"
                        onClick={() => navigate(`/conduct/plans/${p.id}`)}>
                        <TableCell className="font-mono text-xs">{p.reference}</TableCell>
                        <TableCell>{p.title}</TableCell>
                        <TableCell><Badge variant="outline">{PLAN_STATUS_LABEL[p.status]}</Badge></TableCell>
                        <TableCell className="text-xs">
                          {p.target_completion ? formatDate(p.target_completion) : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-3">
              <div>
                <CardTitle className="text-base">Interventions</CardTitle>
                <CardDescription className="text-xs">
                  Only interventions in the approved catalogue may be initiated, and only where you hold the
                  authority for that action.
                </CardDescription>
              </div>
              {canAct && (
                <Button data-rbac="market_conduct.manage_complaints" size="sm" variant="outline" className="ml-auto" onClick={() => setIvOpen(true)}>
                  Initiate intervention
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {(data?.interventions ?? []).length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No intervention has been initiated.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Intervention</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Follow-up</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.interventions ?? []).map((iv) => (
                      <TableRow key={iv.id} className="cursor-pointer"
                        onClick={() => navigate(`/conduct/interventions/${iv.id}`)}>
                        <TableCell className="font-mono text-xs">{iv.reference}</TableCell>
                        <TableCell>
                          <p>{iv.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {data?.intervention_catalogue.find((c) => c.code === iv.catalogue_code)?.name
                              ?? iv.catalogue_code}
                          </p>
                        </TableCell>
                        <TableCell><Badge variant="outline">{iv.status}</Badge></TableCell>
                        <TableCell className="text-xs">
                          {iv.outcome_result ? OUTCOME_RESULT_LABEL[iv.outcome_result] ?? iv.outcome_result : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {iv.followup_due_date
                            ? `${formatDate(iv.followup_due_date)}${iv.followup_completed_at ? ' (done)' : ''}`
                            : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reassessment">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center gap-2 pb-3">
              <div>
                <CardTitle className="text-base">Reassessment history</CardTitle>
                <CardDescription className="text-xs">
                  Append-only supervisory judgements on whether the concern has changed. A later judgement never
                  overwrites an earlier one.
                </CardDescription>
              </div>
              {canAct && (
                <Button data-rbac="market_conduct.manage_complaints" size="sm" variant="outline" className="ml-auto" onClick={() => setReassessOpen(true)}>
                  Record reassessment
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.reassessments ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No reassessment has been recorded.</p>
              ) : (data?.reassessments ?? []).map((r) => (
                <div key={r.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{CONCERN_STATE_LABEL[r.concern_state] ?? r.concern_state}</Badge>
                    <Badge variant="outline">{NEXT_STEP_LABEL[r.next_step] ?? r.next_step}</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {r.assessed_by_name ?? 'Officer'} · {formatDateTime(r.assessed_at)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{r.assessment}</p>
                  {r.next_review_date && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Next review {formatDate(r.next_review_date)}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Audit history</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Rationale</TableHead>
                    <TableHead>Officer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.events ?? []).map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs">{formatDateTime(e.created_at)}</TableCell>
                      <TableCell className="text-xs">
                        {ATTENTION_EVENT_LABEL[e.event_type] ?? e.event_type}
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.from_state || e.to_state ? `${e.from_state ?? '—'} → ${e.to_state ?? '—'}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs">{e.rationale ?? '—'}</TableCell>
                      <TableCell className="text-xs">{e.actor_name ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="mt-6">
        <PlanningAdvisoryPanel
          subject={subject}
          useCases={ATTENTION_ADVISORY_USE_CASES}
          insights={data?.ai_suggestions ?? []}
          catalogue={data?.intervention_catalogue ?? []}
          canOperate={canAct}
          onAdoptOption={(option) => {
            setIvCode(option.catalogueCode);
            setIvTitle(item.title);
            setIvBasis(option.rationale);
            setIvInsightId(option.insightId);
            setIvOpen(true);
          }}
        />
      </div>

      {/* Confirm priority */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm the supervisory priority</DialogTitle>
            <DialogDescription>
              You are accountable for this priority. Recording a band other than the calculated one is an override
              and is shown as such.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={confirmBand} onValueChange={(v) => setConfirmBand(v as PriorityBand)}>
                <SelectTrigger><SelectValue placeholder="Select a priority" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_BAND_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-rationale">Rationale</Label>
              <Textarea id="confirm-rationale" rows={3} value={confirmRationale}
                onChange={(e) => setConfirmRationale(e.target.value)}
                placeholder="Why this priority is right on the recorded facts." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitConfirm}
              disabled={confirm.isPending || !confirmBand || confirmRationale.trim().length < 10}>
              {confirm.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm priority
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status change */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change status</DialogTitle>
            <DialogDescription>
              Only transitions permitted from the current status are offered. Closing requires a disposition.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>New status</Label>
              <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as AttentionStatus)}>
                <SelectTrigger><SelectValue placeholder="Select a status" /></SelectTrigger>
                <SelectContent>
                  {ATTENTION_NEXT_STATUS[item.status].map((s) => (
                    <SelectItem key={s} value={s}>{ATTENTION_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {nextStatus === 'CLOSED' && (
              <div className="space-y-1.5">
                <Label htmlFor="disposition">Disposition</Label>
                <Input id="disposition" value={disposition} onChange={(e) => setDisposition(e.target.value)}
                  placeholder="How the matter was disposed of" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="status-rationale">Rationale</Label>
              <Textarea id="status-rationale" rows={3} value={statusRationale}
                onChange={(e) => setStatusRationale(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitStatus}
              disabled={transition.isPending || !nextStatus || statusRationale.trim().length < 10
                || (nextStatus === 'CLOSED' && disposition.trim().length < 3)}>
              {transition.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create plan */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create a supervisory plan</DialogTitle>
            <DialogDescription>
              The plan starts as a draft. It must be submitted and then approved by a second officer with approval
              authority before it can become active.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="plan-title">Plan title</Label>
              <Input id="plan-title" value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Planning period</Label>
                <Select value={planPeriod} onValueChange={setPlanPeriod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="thematic">Thematic</SelectItem>
                    <SelectItem value="ad_hoc">Ad hoc</SelectItem>
                    <SelectItem value="event_driven">Event driven</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="plan-target">Target completion</Label>
                <Input id="plan-target" type="date" value={planTarget}
                  onChange={(e) => setPlanTarget(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-objective">Objective</Label>
              <Textarea id="plan-objective" rows={3} value={planObjective}
                onChange={(e) => setPlanObjective(e.target.value)}
                placeholder="What this plan is intended to establish or achieve." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-scope">Scope</Label>
              <Textarea id="plan-scope" rows={3} value={planScope}
                onChange={(e) => setPlanScope(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitPlan} disabled={createPlan.isPending || planTitle.trim().length < 3}>
              {createPlan.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create draft plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Initiate intervention */}
      <Dialog open={ivOpen} onOpenChange={setIvOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Initiate an intervention</DialogTitle>
            <DialogDescription>
              Choose from the approved catalogue only. The server checks your authority for the chosen action and,
              where required, that it sits under an approved plan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Intervention</Label>
              <Select value={ivCode} onValueChange={setIvCode}>
                <SelectTrigger><SelectValue placeholder="Select from the approved catalogue" /></SelectTrigger>
                <SelectContent>
                  {(data?.intervention_catalogue ?? []).map((c) => (
                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ivCode && (
                <p className="text-xs text-muted-foreground">
                  {data?.intervention_catalogue.find((c) => c.code === ivCode)?.purpose}
                </p>
              )}
            </div>
            {(data?.plans ?? []).length > 0 && (
              <div className="space-y-1.5">
                <Label>Under plan</Label>
                <Select value={ivPlanId} onValueChange={setIvPlanId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No plan</SelectItem>
                    {(data?.plans ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.reference} — {p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="iv-title">Title</Label>
              <Input id="iv-title" value={ivTitle} onChange={(e) => setIvTitle(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="iv-start">Planned start</Label>
                <Input id="iv-start" type="date" value={ivStart} onChange={(e) => setIvStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="iv-end">Planned end</Label>
                <Input id="iv-end" type="date" value={ivEnd} onChange={(e) => setIvEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="iv-basis">Supervisory basis</Label>
              <Textarea id="iv-basis" rows={4} value={ivBasis} onChange={(e) => setIvBasis(e.target.value)}
                placeholder="Why the recorded facts support this intervention (at least 20 characters)." />
              {ivInsightId && (
                <p className="text-xs text-muted-foreground">
                  Pre-filled from AI assistance. Edit it into your own supervisory wording before proceeding —
                  the basis recorded is yours.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIvOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitIntervention}
              disabled={initiate.isPending || !ivCode || ivTitle.trim().length < 3 || ivBasis.trim().length < 20}>
              {initiate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Initiate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reassess */}
      <Dialog open={reassessOpen} onOpenChange={setReassessOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a reassessment</DialogTitle>
            <DialogDescription>
              Your judgement on whether the concern has changed following the supervisory response.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Concern now</Label>
                <Select value={concernState} onValueChange={setConcernState}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONCERN_STATE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Next step</Label>
                <Select value={nextStep} onValueChange={setNextStep}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(NEXT_STEP_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reassess-text">Assessment</Label>
              <Textarea id="reassess-text" rows={4} value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                placeholder="What the records now show and what it means for supervision (at least 20 characters)." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reassess-next">Next review date</Label>
              <Input id="reassess-next" type="date" value={nextReview}
                onChange={(e) => setNextReview(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassessOpen(false)}>Cancel</Button>
            <Button data-rbac="market_conduct.manage_complaints" onClick={submitReassess} disabled={reassess.isPending || assessment.trim().length < 20}>
              {reassess.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record reassessment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
