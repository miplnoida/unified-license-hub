/**
 * MC-10 — Supervisory plan workspace.
 *
 * One plan: the attention item it answers, its written objective and factual
 * basis, its milestones, the interventions raised under it, and the full record
 * of who submitted, approved, activated or completed it and why. Approval is a
 * separate human act — the officer who submitted a plan cannot approve it, and
 * the server refuses the attempt regardless of what this page offers. AI
 * assistance sits at the foot of the page and changes no part of the record.
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, ArrowLeft, CheckCircle2, Flag, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { formatDate, formatDateTime } from '@/lib/datetime';
import {
  ATTENTION_STATUS_LABEL, OUTCOME_RESULT_LABEL,
  PLAN_NEXT_STATUS, PLAN_STATUS_LABEL, PRIORITY_BAND_LABEL, attentionErrorMessage,
  useInitiateIntervention, usePlanCase, useTransitionPlan, useUpsertPlanMilestone,
  type PlanStatus,
} from '@/hooks/useConductAttention';
import { PlanningAdvisoryPanel } from '@/components/conduct/intelligence/PlanningAdvisoryPanel';
import { PLAN_ADVISORY_USE_CASES } from '@/lib/conductAdvisoryLabels';

const STATUS_VARIANT: Record<PlanStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  DRAFT: 'outline', SUBMITTED: 'secondary', APPROVED: 'default', ACTIVE: 'default',
  COMPLETED: 'secondary', CANCELLED: 'outline',
};

const PERIOD_LABEL: Record<string, string> = {
  ad_hoc: 'Ad hoc', quarterly: 'Quarterly', annual: 'Annual', multi_year: 'Multi-year',
};

const TRANSITION_LABEL: Record<PlanStatus, string> = {
  DRAFT: 'Return to draft',
  SUBMITTED: 'Submit for approval',
  APPROVED: 'Approve the plan',
  ACTIVE: 'Start delivery',
  COMPLETED: 'Record completion',
  CANCELLED: 'Cancel the plan',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

export default function SupervisoryPlanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Hooks must run unconditionally: evaluate both permissions, then combine.

  const canOperatePrimary = useCan('market_conduct', 'run_conduct_analytics');

  const canOperateAlternate = useCan('market_conduct', 'manage_complaints');

  const canOperate = canOperatePrimary || canOperateAlternate;
  const canApprove = useCan('market_conduct', 'approve');

  const { data, isLoading, isError, error } = usePlanCase(id);
  const transition = useTransitionPlan(id);
  const milestone = useUpsertPlanMilestone(id);
  const initiate = useInitiateIntervention();

  const plan = data?.plan;
  const finished = plan?.status === 'COMPLETED' || plan?.status === 'CANCELLED';
  const canAct = canOperate && !finished;

  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<PlanStatus | ''>('');
  const [statusRationale, setStatusRationale] = useState('');

  const [msOpen, setMsOpen] = useState(false);
  const [msId, setMsId] = useState<string | null>(null);
  const [msTitle, setMsTitle] = useState('');
  const [msDetail, setMsDetail] = useState('');
  const [msDue, setMsDue] = useState('');

  const [ivOpen, setIvOpen] = useState(false);
  const [ivCode, setIvCode] = useState('');
  const [ivTitle, setIvTitle] = useState('');
  const [ivBasis, setIvBasis] = useState('');
  const [ivPurpose, setIvPurpose] = useState('');
  const [ivStart, setIvStart] = useState('');
  const [ivEnd, setIvEnd] = useState('');
  const [ivInsightId, setIvInsightId] = useState<string | null>(null);

  const subject = useMemo(() => (id ? { kind: 'plan' as const, id } : null), [id]);
  const catalogue = data?.intervention_catalogue ?? [];
  const chosenType = catalogue.find((c) => c.code === ivCode) ?? null;

  const fail = (e: unknown) => toast.error(attentionErrorMessage(String((e as Error)?.message ?? '')));

  const nextOptions = plan ? (PLAN_NEXT_STATUS[plan.status] ?? []) : [];
  /** Approval is only offered to an officer holding the approval permission. */
  const offeredOptions = nextOptions.filter((s) => (s === 'APPROVED' ? canApprove : true));

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (isError || !plan) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/conduct/attention')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to supervisory attention
          </Button>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>This plan cannot be opened</AlertTitle>
            <AlertDescription>
              {error
                ? attentionErrorMessage(String((error as Error)?.message ?? ''))
                : 'The plan does not exist, or it falls outside the sectors you supervise.'}
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/conduct/attention')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to supervisory attention
        </Button>

        <PageHeader
          title={`${plan.reference} — ${plan.title}`}
          description="Supervisory plan recorded by an officer. Its objective, scope and approval are written human decisions; nothing here is generated or approved automatically."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[plan.status]}>{PLAN_STATUS_LABEL[plan.status]}</Badge>
              {plan.priority && <Badge variant="outline">{PRIORITY_BAND_LABEL[plan.priority]}</Badge>}
              {!canOperate && <Badge variant="outline">View only</Badge>}
            </div>
          }
        />

        {plan.status === 'SUBMITTED' && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle className="text-sm">Awaiting a separate approval decision</AlertTitle>
            <AlertDescription className="text-xs">
              Submitted{data?.submitted_by_name ? ` by ${data.submitted_by_name}` : ''}
              {plan.submitted_at ? ` on ${formatDateTime(plan.submitted_at)}` : ''}. The officer who submitted
              the plan cannot approve it — a second supervisor with approval authority must decide.
            </AlertDescription>
          </Alert>
        )}

        {finished && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">
              This plan is {PLAN_STATUS_LABEL[plan.status].toLowerCase()}
            </AlertTitle>
            <AlertDescription className="text-xs">
              It is retained in full as a supervisory record and can no longer be amended.
            </AlertDescription>
          </Alert>
        )}

        {canAct && (
          <div className="flex flex-wrap gap-2">
            {offeredOptions.length > 0 && (
              <Button data-rbac="market_conduct.manage_complaints" onClick={() => { setNextStatus(''); setStatusRationale(''); setStatusOpen(true); }}>
                <Flag className="mr-1.5 h-4 w-4" /> Change status
              </Button>
            )}
            <Button data-rbac="market_conduct.manage_complaints"
              variant="outline"
              onClick={() => { setMsId(null); setMsTitle(''); setMsDetail(''); setMsDue(''); setMsOpen(true); }}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add a milestone
            </Button>
            {(plan.status === 'APPROVED' || plan.status === 'ACTIVE') && (
              <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => setIvOpen(true)}>
                Raise an intervention under this plan
              </Button>
            )}
          </div>
        )}

        {nextOptions.includes('APPROVED') && !canApprove && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">Approval is reserved</AlertTitle>
            <AlertDescription className="text-xs">
              This plan is awaiting approval by an officer who holds conduct approval authority.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="plan">
          <TabsList>
            <TabsTrigger value="plan">The plan</TabsTrigger>
            <TabsTrigger value="milestones">Milestones ({data?.milestones?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="interventions">Interventions ({data?.interventions?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="history">History ({data?.events?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="plan" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recorded plan</CardTitle>
                <CardDescription>
                  Written by a supervisor. Where an objective was drafted with AI assistance, the source is
                  shown and a supervisor accepted the wording before it was recorded.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Field label="Planning period">
                  {PERIOD_LABEL[plan.planning_period] ?? plan.planning_period}
                  {plan.period_label ? ` — ${plan.period_label}` : ''}
                </Field>
                <Field label="Sector">{data?.sector_name ?? 'Not sector-specific'}</Field>
                <Field label="Theme">{plan.theme ?? '—'}</Field>
                <Field label="Lead officer">{data?.lead_officer_name ?? 'Not assigned'}</Field>
                <Field label="Start">{plan.start_date ? formatDate(plan.start_date) : '—'}</Field>
                <Field label="Target completion">
                  {plan.target_completion ? formatDate(plan.target_completion) : '—'}
                </Field>
                <Field label="Next review">
                  {plan.next_review_date ? formatDate(plan.next_review_date) : '—'}
                </Field>
                <Field label="Submitted">
                  {plan.submitted_at ? `${formatDateTime(plan.submitted_at)} — ${data?.submitted_by_name ?? 'unrecorded officer'}` : '—'}
                </Field>
                <Field label="Approved">
                  {plan.approved_at ? `${formatDateTime(plan.approved_at)} — ${data?.approved_by_name ?? 'unrecorded officer'}` : 'Not approved'}
                </Field>
                <div className="md:col-span-3">
                  <Field label="Objective">
                    <p className="whitespace-pre-wrap">{plan.objective ?? 'No objective recorded.'}</p>
                    <Badge variant="outline" className="mt-1.5 text-[10px]">
                      {plan.objective_source === 'human'
                        ? 'Written by a supervisor'
                        : 'AI-assisted wording, reviewed and accepted by a supervisor'}
                    </Badge>
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Scope">
                    <p className="whitespace-pre-wrap">{plan.scope ?? '—'}</p>
                  </Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Factual basis">
                    <p className="whitespace-pre-wrap">{plan.factual_basis}</p>
                  </Field>
                </div>
                {plan.approval_rationale && (
                  <div className="md:col-span-3">
                    <Field label="Approval rationale">
                      <p className="whitespace-pre-wrap">{plan.approval_rationale}</p>
                    </Field>
                  </div>
                )}
                {plan.outcome_summary && (
                  <div className="md:col-span-3">
                    <Field label="Outcome summary">
                      <p className="whitespace-pre-wrap">{plan.outcome_summary}</p>
                    </Field>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">What this plan answers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.attention ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{data.attention.reference}</p>
                      <p className="text-sm font-medium">{data.attention.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{data.attention.supervisory_basis}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{ATTENTION_STATUS_LABEL[data.attention.status]}</Badge>
                      {data.attention.confirmed_priority && (
                        <Badge variant="secondary">{PRIORITY_BAND_LABEL[data.attention.confirmed_priority]}</Badge>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/conduct/attention/${data.attention!.id}`)}
                      >
                        Open the attention item
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This plan is not linked to a specific attention item.
                  </p>
                )}
                {(data?.entities?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {data!.entities.map((e) => (
                      <Badge key={e.id} variant="outline">{e.name}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="milestones">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Milestones</CardTitle>
                <CardDescription>Recorded delivery steps and their state.</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.milestones?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No milestones recorded.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Milestone</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Completed</TableHead>
                        {canAct && <TableHead className="text-right">Action</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.milestones.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <p className="text-sm font-medium">{m.title}</p>
                            {m.detail && <p className="text-xs text-muted-foreground">{m.detail}</p>}
                          </TableCell>
                          <TableCell className="text-xs">{m.due_date ? formatDate(m.due_date) : '—'}</TableCell>
                          <TableCell>
                            <Badge variant={m.status === 'OPEN' ? 'outline' : 'secondary'}>
                              {m.status === 'OPEN' ? 'Open' : m.status === 'DONE' ? 'Completed' : m.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {m.completed_at ? formatDateTime(m.completed_at) : '—'}
                          </TableCell>
                          {canAct && (
                            <TableCell className="space-x-1 text-right">
                              <Button data-rbac="market_conduct.manage_complaints"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setMsId(m.id); setMsTitle(m.title);
                                  setMsDetail(m.detail ?? ''); setMsDue(m.due_date ?? ''); setMsOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                              {m.status === 'OPEN' && (
                                <Button data-rbac="market_conduct.manage_complaints"
                                  variant="outline"
                                  size="sm"
                                  disabled={milestone.isPending}
                                  onClick={() => {
                                    milestone.mutate(
                                      { milestoneId: m.id, title: m.title, detail: m.detail, dueDate: m.due_date, status: 'DONE' },
                                      {
                                        onSuccess: () => toast.success('Milestone recorded as completed.'),
                                        onError: fail,
                                      },
                                    );
                                  }}
                                >
                                  Mark completed
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="interventions">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Interventions raised under this plan</CardTitle>
                <CardDescription>
                  Each intervention is an approved catalogue action carried out by an officer.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.interventions?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No interventions raised under this plan yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Intervention</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Follow-up</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.interventions.map((iv) => (
                        <TableRow key={iv.id}>
                          <TableCell className="font-mono text-xs">{iv.reference}</TableCell>
                          <TableCell className="text-sm">{iv.title}</TableCell>
                          <TableCell><Badge variant="outline">{iv.status}</Badge></TableCell>
                          <TableCell className="text-xs">
                            {iv.outcome_result ? (OUTCOME_RESULT_LABEL[iv.outcome_result] ?? iv.outcome_result) : 'Not recorded'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {iv.followup_completed_at
                              ? `Completed ${formatDate(iv.followup_completed_at)}`
                              : iv.followup_due_date ? `Due ${formatDate(iv.followup_due_date)}` : '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => navigate(`/conduct/interventions/${iv.id}`)}>
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Plan history</CardTitle>
                <CardDescription>Every recorded change, with the officer and the reason given.</CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.events?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No history recorded.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Event</TableHead>
                        <TableHead>Change</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Officer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.events.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs">{formatDateTime(e.created_at)}</TableCell>
                          <TableCell className="text-xs">{e.event_type}</TableCell>
                          <TableCell className="text-xs">
                            {e.from_status || e.to_status
                              ? `${e.from_status ? PLAN_STATUS_LABEL[e.from_status as PlanStatus] ?? e.from_status : '—'} → ${e.to_status ? PLAN_STATUS_LABEL[e.to_status as PlanStatus] ?? e.to_status : '—'}`
                              : '—'}
                          </TableCell>
                          <TableCell className="text-xs">{e.rationale ?? '—'}</TableCell>
                          <TableCell className="text-xs">{e.actor_name ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <PlanningAdvisoryPanel
          subject={subject}
          useCases={PLAN_ADVISORY_USE_CASES}
          insights={data?.ai_suggestions ?? []}
          catalogue={catalogue}
          canOperate={canAct}
          onAdoptOption={(option) => {
            setIvCode(option.catalogueCode);
            setIvTitle(plan.title);
            setIvBasis(option.rationale);
            setIvInsightId(option.insightId);
            setIvOpen(true);
          }}
        />

        {/* Change status */}
        <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change the plan status</DialogTitle>
              <DialogDescription>
                The reason you give is recorded against the plan. Approval requires a different officer from the
                one who submitted it; the server checks this again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>New status</Label>
                <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as PlanStatus)}>
                  <SelectTrigger><SelectValue placeholder="Select a status" /></SelectTrigger>
                  <SelectContent>
                    {offeredOptions.map((s) => (
                      <SelectItem key={s} value={s}>{TRANSITION_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason (at least 20 characters)</Label>
                <Textarea
                  rows={4}
                  value={statusRationale}
                  onChange={(e) => setStatusRationale(e.target.value)}
                  placeholder="Explain the supervisory reason for this change."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints"
                disabled={!nextStatus || statusRationale.trim().length < 20 || transition.isPending}
                onClick={() => {
                  transition.mutate(
                    { toStatus: nextStatus as PlanStatus, rationale: statusRationale.trim() },
                    {
                      onSuccess: () => { setStatusOpen(false); toast.success('The plan status has been recorded.'); },
                      onError: fail,
                    },
                  );
                }}
              >
                {transition.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Record the change
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Milestone */}
        <Dialog open={msOpen} onOpenChange={setMsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{msId ? 'Edit the milestone' : 'Add a milestone'}</DialogTitle>
              <DialogDescription>Milestones record the delivery steps agreed for this plan.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Milestone</Label>
                <Input value={msTitle} onChange={(e) => setMsTitle(e.target.value)} />
              </div>
              <div>
                <Label>Detail (optional)</Label>
                <Textarea rows={3} value={msDetail} onChange={(e) => setMsDetail(e.target.value)} />
              </div>
              <div>
                <Label>Due date (optional)</Label>
                <Input type="date" value={msDue} onChange={(e) => setMsDue(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setMsOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints"
                disabled={msTitle.trim().length < 3 || milestone.isPending}
                onClick={() => {
                  milestone.mutate(
                    {
                      milestoneId: msId,
                      title: msTitle.trim(),
                      detail: msDetail.trim() || null,
                      dueDate: msDue || null,
                    },
                    {
                      onSuccess: () => { setMsOpen(false); toast.success('The milestone has been recorded.'); },
                      onError: fail,
                    },
                  );
                }}
              >
                {milestone.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save the milestone
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Raise an intervention */}
        <Dialog open={ivOpen} onOpenChange={setIvOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Raise an intervention under this plan</DialogTitle>
              <DialogDescription>
                Only interventions in the approved supervisory catalogue can be raised. The catalogue entry
                determines the authority relied on and the canonical module the work is carried out in.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Intervention (approved catalogue)</Label>
                <Select value={ivCode} onValueChange={setIvCode}>
                  <SelectTrigger><SelectValue placeholder="Select an approved intervention" /></SelectTrigger>
                  <SelectContent>
                    {catalogue.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {chosenType && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {chosenType.purpose} Authority relied on: {chosenType.authority_action}.
                    {chosenType.canonical_module ? ` Carried out in ${chosenType.canonical_module}.` : ''}
                  </p>
                )}
              </div>
              <div>
                <Label>Title</Label>
                <Input value={ivTitle} onChange={(e) => setIvTitle(e.target.value)} />
              </div>
              <div>
                <Label>Basis (at least 20 characters)</Label>
                <Textarea rows={3} value={ivBasis} onChange={(e) => setIvBasis(e.target.value)} />
                {ivInsightId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Drafted with AI assistance. You remain responsible for the wording recorded here.
                  </p>
                )}
              </div>
              <div>
                <Label>Purpose (optional)</Label>
                <Textarea rows={2} value={ivPurpose} onChange={(e) => setIvPurpose(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Planned start</Label>
                  <Input type="date" value={ivStart} onChange={(e) => setIvStart(e.target.value)} />
                </div>
                <div>
                  <Label>Planned end</Label>
                  <Input type="date" value={ivEnd} onChange={(e) => setIvEnd(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIvOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints"
                disabled={!ivCode || ivTitle.trim().length < 3 || ivBasis.trim().length < 20 || initiate.isPending}
                onClick={() => {
                  initiate.mutate(
                    {
                      catalogueCode: ivCode,
                      title: ivTitle.trim(),
                      basis: ivBasis.trim(),
                      attentionId: data?.attention?.id ?? null,
                      planId: id ?? null,
                      purpose: ivPurpose.trim() || null,
                      plannedStart: ivStart || null,
                      plannedEnd: ivEnd || null,
                      aiInsightId: ivInsightId,
                    },
                    {
                      onSuccess: () => {
                        setIvOpen(false); setIvInsightId(null);
                        toast.success('The intervention has been raised and is awaiting a decision.');
                      },
                      onError: fail,
                    },
                  );
                }}
              >
                {initiate.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Raise the intervention
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
