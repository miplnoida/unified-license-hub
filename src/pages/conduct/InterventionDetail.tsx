/**
 * MC-10 — Supervisory intervention case file.
 *
 * One intervention from the approved catalogue: the basis it was raised on, the
 * attention item and plan it answers, the separate endorsement decision, the
 * canonical module the work is carried out in, the recorded outcome, the
 * follow-up, and the reassessment of the underlying concern that closes the
 * supervisory loop. Every action calls a governed operation that re-checks
 * authority, keeps the proposer and the decider apart and appends to the history.
 */
import { useState } from 'react';
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
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { RecordPicker } from '@/components/documents/RecordPicker';
import type { RecordPickerType } from '@/services/recordPicker';

import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { formatDate, formatDateTime } from '@/lib/datetime';
import {
  ATTENTION_STATUS_LABEL, CONCERN_STATE_LABEL, INTERVENTION_NEXT_STATUS, NEXT_STEP_LABEL,
  OUTCOME_RESULT_LABEL, PLAN_STATUS_LABEL, PRIORITY_BAND_LABEL, attentionErrorMessage,
  useDecideInterventionMc10, useInterventionCaseMc10, useLinkInterventionCanonical,
  useReassessAttention, useRecordInterventionFollowup, useRecordInterventionOutcome,
  useTransitionInterventionMc10,
  type InterventionStatusMc10,
} from '@/hooks/useConductAttention';

const STATUS_LABEL: Record<InterventionStatusMc10, string> = {
  PROPOSED: 'Awaiting a decision',
  ENDORSED: 'Endorsed',
  REJECTED: 'Not approved',
  ACTIVE: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STATUS_VARIANT: Record<InterventionStatusMc10, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  PROPOSED: 'secondary', ENDORSED: 'default', REJECTED: 'outline',
  ACTIVE: 'default', COMPLETED: 'secondary', CANCELLED: 'outline',
};

const TRANSITION_LABEL: Record<InterventionStatusMc10, string> = {
  PROPOSED: 'Return to proposed',
  ENDORSED: 'Endorse',
  REJECTED: 'Refuse',
  ACTIVE: 'Start the intervention',
  COMPLETED: 'Close the intervention',
  CANCELLED: 'Cancel the intervention',
};

/**
 * Which record type the picker should open on for each canonical delivery module.
 * The officer can still change the type; nothing is hard-coded to an identifier.
 */
const CANONICAL_MODULE_RECORD_TYPE: Record<string, RecordPickerType | undefined> = {
  examinations: 'examination',
  examination: 'examination',
  enforcement: 'enforcement',
  complaints: 'complaint',
  investigations: 'investigation',
  correspondence: 'correspondence',
  licensing: 'application',
  returns: 'return',
  fit_and_proper: 'fit_and_proper',
};


const EXCEPTION_TEXT: Record<string, string> = {
  delivery_overdue: 'Delivery is past its planned end date and the intervention is still in progress.',
  outcome_missing: 'The intervention is closed but no outcome has been recorded.',
  followup_missing: 'The recorded outcome expects further supervisory work, but no follow-up date has been set.',
  followup_overdue: 'The follow-up is past its due date and has not been recorded as completed.',
  reassessment_outstanding: 'The outcome is recorded but the underlying concern has not yet been reassessed.',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

export default function InterventionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const canApprove = useCan('market_conduct', 'approve');
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canOperatePrimary = useCan('market_conduct', 'run_conduct_analytics');
  const canOperateAlternate = useCan('market_conduct', 'manage_complaints');
  const canOperate = canOperatePrimary || canOperateAlternate;
  const { data, isLoading, isError, error } = useInterventionCaseMc10(id);
  const decide = useDecideInterventionMc10(id);
  const transition = useTransitionInterventionMc10(id);
  const outcome = useRecordInterventionOutcome(id);
  const followup = useRecordInterventionFollowup(id);
  const linkCanonical = useLinkInterventionCanonical(id);
  const reassess = useReassessAttention(data?.attention?.id);

  const iv = data?.intervention;
  const cat = data?.catalogue ?? null;
  const closed = iv?.status === 'COMPLETED' || iv?.status === 'CANCELLED' || iv?.status === 'REJECTED';
  const canAct = canOperate && !closed;

  const [decideOpen, setDecideOpen] = useState(false);
  const [decision, setDecision] = useState<'ENDORSED' | 'REJECTED'>('ENDORSED');
  const [decideRationale, setDecideRationale] = useState('');

  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<InterventionStatusMc10 | ''>('');
  const [statusRationale, setStatusRationale] = useState('');

  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [result, setResult] = useState('');
  const [outRationale, setOutRationale] = useState('');
  const [findings, setFindings] = useState('');
  const [outstanding, setOutstanding] = useState('');
  const [followDue, setFollowDue] = useState('');
  const [followNote, setFollowNote] = useState('');
  const [actualStart, setActualStart] = useState('');
  const [actualEnd, setActualEnd] = useState('');

  const [fuOpen, setFuOpen] = useState(false);
  const [fuNote, setFuNote] = useState('');
  const [fuDue, setFuDue] = useState('');
  const [fuComplete, setFuComplete] = useState(false);

  const [linkOpen, setLinkOpen] = useState(false);


  const [raOpen, setRaOpen] = useState(false);
  const [concernState, setConcernState] = useState('unchanged');
  const [assessment, setAssessment] = useState('');
  const [nextStep, setNextStep] = useState('continue_monitoring');
  const [nextReview, setNextReview] = useState('');

  const fail = (e: unknown) => toast.error(attentionErrorMessage(String((e as Error)?.message ?? '')));
  const exceptions = Object.entries(data?.exceptions ?? {}).filter(([, v]) => v === true).map(([k]) => k);
  const nextOptions = iv ? (INTERVENTION_NEXT_STATUS[iv.status] ?? []) : [];

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

  if (isError || !iv) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/conduct/interventions')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to the register
          </Button>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>This intervention cannot be opened</AlertTitle>
            <AlertDescription>
              {error
                ? attentionErrorMessage(String((error as Error)?.message ?? ''))
                : 'The intervention does not exist, or it falls outside the sectors you supervise.'}
            </AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate('/conduct/interventions')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to the register
        </Button>

        <PageHeader
          title={`${iv.reference} — ${iv.title}`}
          description="Approved supervisory intervention. The basis, the endorsement, the outcome and the follow-up are all recorded human decisions."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[iv.status]}>{STATUS_LABEL[iv.status]}</Badge>
              {cat && <Badge variant="outline">{cat.name}</Badge>}
              {!canOperate && <Badge variant="outline">View only</Badge>}
            </div>
          }
        />

        {exceptions.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-sm">Outstanding supervisory steps</AlertTitle>
            <AlertDescription className="text-xs">
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {exceptions.map((k) => <li key={k}>{EXCEPTION_TEXT[k] ?? k}</li>)}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {iv.status === 'PROPOSED' && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle className="text-sm">Awaiting a separate endorsement decision</AlertTitle>
            <AlertDescription className="text-xs">
              Proposed{data?.proposed_by_name ? ` by ${data.proposed_by_name}` : ''}
              {iv.proposed_at ? ` on ${formatDateTime(iv.proposed_at)}` : ''}. The officer who proposed the
              intervention cannot decide it — a second supervisor with approval authority must endorse or refuse it.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {iv.status === 'PROPOSED' && canApprove && (
            <Button data-rbac="market_conduct.manage_complaints" onClick={() => { setDecideRationale(''); setDecideOpen(true); }}>
              Record an endorsement decision
            </Button>
          )}
          {canAct && nextOptions.length > 0 && (
            <Button data-rbac="market_conduct.manage_complaints"
              variant="outline"
              onClick={() => { setNextStatus(''); setStatusRationale(''); setStatusOpen(true); }}
            >
              Change status
            </Button>
          )}
          {canAct && (iv.status === 'ACTIVE' || iv.status === 'ENDORSED') && (
            <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => setOutcomeOpen(true)}>Record the outcome</Button>
          )}
          {canOperate && iv.outcome_result && !iv.followup_completed_at && (
            <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => { setFuNote(''); setFuDue(iv.followup_due_date ?? ''); setFuComplete(false); setFuOpen(true); }}>
              Record follow-up
            </Button>
          )}
          {canOperate && cat?.canonical_module && !iv.canonical_record_id && (
            <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => setLinkOpen(true)}>
              Link the {cat.canonical_module} record
            </Button>
          )}
          {canOperate && data?.attention && iv.outcome_result && (
            <Button data-rbac="market_conduct.manage_complaints" variant="outline" onClick={() => { setAssessment(''); setRaOpen(true); }}>
              Reassess the concern
            </Button>
          )}
        </div>

        <Tabs defaultValue="case">
          <TabsList>
            <TabsTrigger value="case">The intervention</TabsTrigger>
            <TabsTrigger value="outcome">Outcome and follow-up</TabsTrigger>
            <TabsTrigger value="loop">Supervisory loop</TabsTrigger>
            <TabsTrigger value="history">History ({data?.events?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="case" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recorded intervention</CardTitle>
                <CardDescription>
                  Raised under the approved supervisory catalogue. Free-form intervention types cannot be used.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Field label="Catalogue entry">{cat?.name ?? iv.catalogue_code ?? iv.intervention_type}</Field>
                <Field label="Authority relied on">{cat?.authority_action ?? '—'}</Field>
                <Field label="Carried out in">{cat?.canonical_module ?? 'Recorded here only'}</Field>
                <Field label="Entity">{data?.licensee_name ?? 'Not entity-specific'}</Field>
                <Field label="Sector">{data?.sector_name ?? 'Not sector-specific'}</Field>
                <Field label="Theme">{iv.theme ?? '—'}</Field>
                <Field label="Owner">{data?.owner_name ?? 'Not assigned'}</Field>
                <Field label="Planned">
                  {iv.planned_start ? formatDate(iv.planned_start) : '—'} → {iv.planned_end ? formatDate(iv.planned_end) : '—'}
                </Field>
                <Field label="Actual">
                  {iv.actual_start ? formatDate(iv.actual_start) : '—'} → {iv.actual_end ? formatDate(iv.actual_end) : '—'}
                </Field>
                <div className="md:col-span-3">
                  <Field label="Basis"><p className="whitespace-pre-wrap">{iv.basis}</p></Field>
                </div>
                {iv.purpose && (
                  <div className="md:col-span-3">
                    <Field label="Purpose"><p className="whitespace-pre-wrap">{iv.purpose}</p></Field>
                  </div>
                )}
                {iv.expected_outcome && (
                  <div className="md:col-span-3">
                    <Field label="Expected outcome"><p className="whitespace-pre-wrap">{iv.expected_outcome}</p></Field>
                  </div>
                )}
                {iv.ai_insight_id && (
                  <div className="md:col-span-3">
                    <Badge variant="outline" className="text-[10px]">
                      An AI suggestion informed this proposal. A supervisor reviewed and accepted the wording recorded above.
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Decision</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Field label="Proposed by">
                  {data?.proposed_by_name ?? '—'}
                  {iv.proposed_at ? ` — ${formatDateTime(iv.proposed_at)}` : ''}
                </Field>
                <Field label="Decided by">
                  {data?.decided_by_name ?? 'Not yet decided'}
                  {iv.decided_at ? ` — ${formatDateTime(iv.decided_at)}` : ''}
                </Field>
                <Field label="Activated">{iv.activated_at ? formatDateTime(iv.activated_at) : '—'}</Field>
                <div className="md:col-span-3">
                  <Field label="Decision rationale">
                    <p className="whitespace-pre-wrap">{iv.decision_rationale ?? '—'}</p>
                  </Field>
                </div>
              </CardContent>
            </Card>

            {cat?.canonical_module && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Canonical record</CardTitle>
                  <CardDescription>
                    This intervention is delivered through the {cat.canonical_module} module. The supervisory work
                    itself is recorded there, not duplicated here.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-3">
                  {iv.canonical_record_id ? (
                    <>
                      <Badge variant="outline" className="font-mono text-xs">
                        {iv.canonical_reference ?? iv.canonical_record_id}
                      </Badge>
                      {iv.canonical_route && (
                        <Button variant="outline" size="sm" onClick={() => navigate(iv.canonical_route!)}>
                          <ExternalLink className="mr-1.5 h-4 w-4" /> Open the {cat.canonical_module} record
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No {cat.canonical_module} record has been linked yet
                      {cat.requires_canonical_record ? ' — this catalogue entry requires one.' : '.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="outcome" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recorded outcome</CardTitle>
                <CardDescription>
                  The outcome is a supervisor's written conclusion. It is not derived from any score or model.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Field label="Result">
                  {iv.outcome_result
                    ? (OUTCOME_RESULT_LABEL[iv.outcome_result] ?? iv.outcome_result)
                    : 'Not yet recorded'}
                </Field>
                <Field label="Recorded by">
                  {data?.outcome_recorded_by_name ?? '—'}
                  {iv.outcome_recorded_at ? ` — ${formatDateTime(iv.outcome_recorded_at)}` : ''}
                </Field>
                <Field label="Closed">{iv.completed_at ? formatDateTime(iv.completed_at) : '—'}</Field>
                <div className="md:col-span-3">
                  <Field label="Rationale"><p className="whitespace-pre-wrap">{iv.outcome_rationale ?? '—'}</p></Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Findings"><p className="whitespace-pre-wrap">{iv.outcome_findings ?? '—'}</p></Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Outstanding actions">
                    <p className="whitespace-pre-wrap">{iv.outstanding_actions ?? '—'}</p>
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Follow-up</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <Field label="Due">{iv.followup_due_date ? formatDate(iv.followup_due_date) : 'None set'}</Field>
                <Field label="Completed">
                  {iv.followup_completed_at ? formatDateTime(iv.followup_completed_at) : 'Outstanding'}
                </Field>
                <div className="md:col-span-3">
                  <Field label="Follow-up record">
                    <p className="whitespace-pre-wrap">{iv.followup_note ?? '—'}</p>
                  </Field>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="loop" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Why this intervention exists</CardTitle>
                <CardDescription>
                  The supervisory chain from the underlying fact to this action and back to reassessment.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.emerging_risk && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{data.emerging_risk.reference}</p>
                      <p className="text-sm font-medium">{data.emerging_risk.title}</p>
                      <p className="text-xs text-muted-foreground">Emerging conduct risk</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/conduct/emerging-risks/${data.emerging_risk!.id}`)}
                    >
                      Open the risk
                    </Button>
                  </div>
                )}
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
                      <Button variant="outline" size="sm" onClick={() => navigate(`/conduct/attention/${data.attention!.id}`)}>
                        Open the attention item
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This intervention is not linked to a supervisory attention item.
                  </p>
                )}
                {data?.plan && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{data.plan.reference}</p>
                      <p className="text-sm font-medium">{data.plan.title}</p>
                      <p className="text-xs text-muted-foreground">{data.plan.objective ?? 'No objective recorded.'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{PLAN_STATUS_LABEL[data.plan.status]}</Badge>
                      <Button variant="outline" size="sm" onClick={() => navigate(`/conduct/plans/${data.plan!.id}`)}>
                        Open the plan
                      </Button>
                    </div>
                  </div>
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reassessment of the concern</CardTitle>
                <CardDescription>
                  Recorded supervisory judgements made after this and other interventions on the same matter.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(data?.reassessments?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">The concern has not been reassessed yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Concern</TableHead>
                        <TableHead>Assessment</TableHead>
                        <TableHead>Next step</TableHead>
                        <TableHead>Officer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.reassessments.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="text-xs">{formatDateTime(r.assessed_at)}</TableCell>
                          <TableCell className="text-xs">
                            {CONCERN_STATE_LABEL[r.concern_state] ?? r.concern_state}
                            {r.intervention_id === iv.id && (
                              <Badge variant="outline" className="ml-1.5 text-[10px]">This intervention</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{r.assessment}</TableCell>
                          <TableCell className="text-xs">{NEXT_STEP_LABEL[r.next_step] ?? r.next_step}</TableCell>
                          <TableCell className="text-xs">{r.assessed_by_name ?? '—'}</TableCell>
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
                <CardTitle className="text-base">Intervention history</CardTitle>
                <CardDescription>Every recorded action, with the officer and the reason given.</CardDescription>
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
                              ? `${e.from_status ?? '—'} → ${e.to_status ?? '—'}`
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

        {/* Endorsement decision */}
        <Dialog open={decideOpen} onOpenChange={setDecideOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record an endorsement decision</DialogTitle>
              <DialogDescription>
                Your decision and reason are recorded against the intervention. The server refuses the decision if
                you proposed it.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Decision</Label>
                <Select value={decision} onValueChange={(v) => setDecision(v as 'ENDORSED' | 'REJECTED')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ENDORSED">Endorse the intervention</SelectItem>
                    <SelectItem value="REJECTED">Refuse the intervention</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason (at least 20 characters)</Label>
                <Textarea rows={4} value={decideRationale} onChange={(e) => setDecideRationale(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDecideOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints"
                disabled={decideRationale.trim().length < 20 || decide.isPending}
                onClick={() => {
                  decide.mutate(
                    { decision, rationale: decideRationale.trim() },
                    {
                      onSuccess: () => { setDecideOpen(false); toast.success('The decision has been recorded.'); },
                      onError: fail,
                    },
                  );
                }}
              >
                {decide.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Record the decision
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Status */}
        <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change the intervention status</DialogTitle>
              <DialogDescription>The reason you give is recorded against the intervention.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>New status</Label>
                <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as InterventionStatusMc10)}>
                  <SelectTrigger><SelectValue placeholder="Select a status" /></SelectTrigger>
                  <SelectContent>
                    {nextOptions.map((s) => (
                      <SelectItem key={s} value={s}>{TRANSITION_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason (at least 20 characters)</Label>
                <Textarea rows={4} value={statusRationale} onChange={(e) => setStatusRationale(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints"
                disabled={!nextStatus || statusRationale.trim().length < 20 || transition.isPending}
                onClick={() => {
                  transition.mutate(
                    { toStatus: nextStatus as InterventionStatusMc10, rationale: statusRationale.trim() },
                    {
                      onSuccess: () => { setStatusOpen(false); toast.success('The change has been recorded.'); },
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

        {/* Outcome */}
        <Dialog open={outcomeOpen} onOpenChange={setOutcomeOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Record the outcome</DialogTitle>
              <DialogDescription>
                Recording an outcome closes the intervention. Where the result expects further supervisory work,
                set a follow-up date so the matter is not lost.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Result</Label>
                <Select value={result} onValueChange={setResult}>
                  <SelectTrigger><SelectValue placeholder="Select the supervisory result" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OUTCOME_RESULT_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rationale (at least 20 characters)</Label>
                <Textarea rows={3} value={outRationale} onChange={(e) => setOutRationale(e.target.value)} />
              </div>
              <div>
                <Label>Findings (optional)</Label>
                <Textarea rows={3} value={findings} onChange={(e) => setFindings(e.target.value)} />
              </div>
              <div>
                <Label>Outstanding actions (optional)</Label>
                <Textarea rows={2} value={outstanding} onChange={(e) => setOutstanding(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Actual start (optional)</Label>
                  <Input type="date" value={actualStart} onChange={(e) => setActualStart(e.target.value)} />
                </div>
                <div>
                  <Label>Actual end (optional)</Label>
                  <Input type="date" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} />
                </div>
                <div>
                  <Label>Follow-up due (optional)</Label>
                  <Input type="date" value={followDue} onChange={(e) => setFollowDue(e.target.value)} />
                </div>
                <div>
                  <Label>Follow-up note (optional)</Label>
                  <Input value={followNote} onChange={(e) => setFollowNote(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOutcomeOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints"
                disabled={!result || outRationale.trim().length < 20 || outcome.isPending}
                onClick={() => {
                  outcome.mutate(
                    {
                      result,
                      rationale: outRationale.trim(),
                      findings: findings.trim() || null,
                      outstandingActions: outstanding.trim() || null,
                      followupDueDate: followDue || null,
                      followupNote: followNote.trim() || null,
                      actualStart: actualStart || null,
                      actualEnd: actualEnd || null,
                    },
                    {
                      onSuccess: () => { setOutcomeOpen(false); toast.success('The outcome has been recorded.'); },
                      onError: fail,
                    },
                  );
                }}
              >
                {outcome.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Record the outcome
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Follow-up */}
        <Dialog open={fuOpen} onOpenChange={setFuOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record follow-up</DialogTitle>
              <DialogDescription>
                Record what was checked after the intervention, and whether the follow-up is now complete.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Follow-up record (at least 20 characters)</Label>
                <Textarea rows={4} value={fuNote} onChange={(e) => setFuNote(e.target.value)} />
              </div>
              <div>
                <Label>Follow-up due date</Label>
                <Input type="date" value={fuDue} onChange={(e) => setFuDue(e.target.value)} />
              </div>
              <div>
                <Label>Is the follow-up complete?</Label>
                <Select value={fuComplete ? 'yes' : 'no'} onValueChange={(v) => setFuComplete(v === 'yes')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">No — still outstanding</SelectItem>
                    <SelectItem value="yes">Yes — completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setFuOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints"
                disabled={fuNote.trim().length < 20 || followup.isPending}
                onClick={() => {
                  followup.mutate(
                    { note: fuNote.trim(), dueDate: fuDue || null, completed: fuComplete },
                    {
                      onSuccess: () => { setFuOpen(false); toast.success('The follow-up has been recorded.'); },
                      onError: fail,
                    },
                  );
                }}
              >
                {followup.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Record the follow-up
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Canonical link */}
        <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Link the {cat?.canonical_module} record</DialogTitle>
              <DialogDescription>
                The supervisory work is carried out and evidenced in the {cat?.canonical_module} module. Choose the
                record here to keep the planning trail complete without duplicating it.
              </DialogDescription>
            </DialogHeader>
            <RecordPicker
              defaultType={CANONICAL_MODULE_RECORD_TYPE[cat?.canonical_module ?? '']}
              busy={linkCanonical.isPending}
              onSelect={(row) => {
                linkCanonical.mutate(
                  {
                    module: cat?.canonical_module ?? 'other',
                    recordId: row.recordId,
                    reference: row.reference || row.title || null,
                    route: cat?.canonical_route ? `${cat.canonical_route}/${row.recordId}` : null,
                  },
                  {
                    onSuccess: () => { setLinkOpen(false); toast.success('The record has been linked.'); },
                    onError: fail,
                  },
                );
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setLinkOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {/* Reassess */}
        <Dialog open={raOpen} onOpenChange={setRaOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reassess the concern</DialogTitle>
              <DialogDescription>
                Record whether this intervention changed the underlying concern, and what happens next. This is
                what closes the supervisory loop back to the attention item.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>State of the concern</Label>
                <Select value={concernState} onValueChange={setConcernState}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONCERN_STATE_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assessment (at least 20 characters)</Label>
                <Textarea rows={4} value={assessment} onChange={(e) => setAssessment(e.target.value)} />
              </div>
              <div>
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
              <div>
                <Label>Next review date (optional)</Label>
                <Input type="date" value={nextReview} onChange={(e) => setNextReview(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRaOpen(false)}>Cancel</Button>
              <Button data-rbac="market_conduct.manage_complaints"
                disabled={assessment.trim().length < 20 || reassess.isPending}
                onClick={() => {
                  reassess.mutate(
                    {
                      concernState,
                      assessment: assessment.trim(),
                      nextStep,
                      interventionId: id ?? null,
                      nextReviewDate: nextReview || null,
                    },
                    {
                      onSuccess: () => { setRaOpen(false); toast.success('The reassessment has been recorded.'); },
                      onError: fail,
                    },
                  );
                }}
              >
                {reassess.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Record the reassessment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
