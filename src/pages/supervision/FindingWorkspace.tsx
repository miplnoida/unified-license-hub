/**
 * Canonical enterprise finding workspace — `/supervision/findings/:id`.
 *
 * One screen serves every supervisory domain. The finding declares its own
 * `domain_code`, the route guard derives authorization from it, and the
 * database decides entity scope, confidentiality and action authority. There
 * is no AML-specific, prudential-specific or conduct-specific copy of this
 * workspace.
 */
import { Link, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Building2, ClipboardList, Plus } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useCan } from '@/hooks/useCan';
import { moduleForSupervisoryDomain } from '@/routes/ExaminationDomainRoute';
import {
  findingNextAction, useOpenRemediation, useRecordFindingResponse, useSupervisoryFinding,
} from '@/hooks/useSupervisoryFinding';
import { RemediationActionCard } from '@/components/supervision/finding/RemediationActionCard';
import { FindingClosurePanel } from '@/components/supervision/finding/FindingClosurePanel';
import { AMBER, BLUE, EMERALD, NEUTRAL, RED, fmtDate, ratingTone, statusTone, titleCase } from '@/lib/amlLabels';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{children ?? '—'}</div>
    </div>
  );
}

function ProvenanceLink({ label, reference, detail, to }: {
  label: string; reference?: string | null; detail?: string | null; to?: string | null;
}) {
  if (!reference && !detail) return null;
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-medium">
        {to ? <Link to={to} className="text-primary underline-offset-2 hover:underline">{reference}</Link> : reference || '—'}
      </div>
      {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export default function FindingWorkspace() {
  const { id } = useParams<{ id: string }>();
  const { data: model, isLoading, error } = useSupervisoryFinding(id);

  const domainModule = moduleForSupervisoryDomain(model?.finding?.domain_code ?? null);
  const canManage = useCan(domainModule, 'edit');
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canReferEnforcement = useCan('enforcement_management', 'refer');
  const canApproveDomain = useCan(domainModule, 'approve');
  const canRefer = canReferEnforcement || canApproveDomain;


  const respond = useRecordFindingResponse(id);
  const openRemediation = useOpenRemediation(id);

  const [dialog, setDialog] = useState<null | 'response' | 'remediation'>(null);
  const [responseState, setResponseState] = useState<'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'DISPUTED'>('ACCEPTED');
  const [managementResponse, setManagementResponse] = useState('');
  const [proposedAction, setProposedAction] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [receivedFrom, setReceivedFrom] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [channel, setChannel] = useState('EMAIL');
  const [description, setDescription] = useState('');
  const [requiredOutcome, setRequiredOutcome] = useState('');
  const [responsibleParty, setResponsibleParty] = useState('');

  if (isLoading) {
    return <div className="space-y-4 p-6"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (error || !model) {
    return (
      <div className="p-6">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          {(error as Error)?.message ?? 'This finding could not be loaded.'}
        </CardContent></Card>
      </div>
    );
  }

  const f = model.finding;
  const p = model.provenance;
  const status = String(f.status ?? '').toUpperCase();
  const registerHref = domainModule === 'aml_supervision' ? '/supervision/aml/findings' : '/supervision/work';

  const reset = () => {
    setDialog(null); setManagementResponse(''); setProposedAction(''); setResponsiblePerson('');
    setTargetDate(''); setReceivedFrom(''); setReceivedDate(''); setDescription('');
    setRequiredOutcome(''); setResponsibleParty('');
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="mb-1 -ml-2">
            <Link to={registerHref}><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Findings register</Link>
          </Button>
          <h1 className="truncate text-xl font-semibold">{f.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">{f.reference}</span>
            <Badge variant="outline" className={statusTone(status)}>{titleCase(status)}</Badge>
            <Badge variant="outline" className={NEUTRAL}>{titleCase(f.domain_code)}</Badge>
            <Badge variant="outline" className={ratingTone(f.severity)}>{titleCase(f.severity)} severity</Badge>
            {f.confidentiality && f.confidentiality !== 'STANDARD' ? (
              <Badge variant="outline" className={RED}>{titleCase(f.confidentiality)}</Badge>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Next action</div>
          <div className="text-sm font-medium">{findingNextAction(model)}</div>
          {model.entityName ? (
            <Button asChild variant="link" size="sm" className="h-auto p-0">
              <Link to={`/entities/${f.entity_id}/360`}>
                <Building2 className="mr-1 h-3.5 w-3.5" />{model.entityName}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="provenance">Provenance</TabsTrigger>
          <TabsTrigger value="response">Management response</TabsTrigger>
          <TabsTrigger value="remediation">Corrective actions ({model.remediation.length})</TabsTrigger>
          <TabsTrigger value="closure">Closure</TabsTrigger>
          <TabsTrigger value="reassessment">Reassessment ({model.reassessments.length})</TabsTrigger>
          <TabsTrigger value="history">History ({model.events.length})</TabsTrigger>
        </TabsList>

        {/* --------------------------------------------------------- overview - */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Finding</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Entity">{model.entityName ?? '—'}</Field>
              <Field label="Category">{titleCase(f.category)}</Field>
              <Field label="Owner">{model.ownerName ?? '—'}</Field>
              <Field label="Issued">{fmtDate(f.issued_at)}</Field>
              <Field label="Response due">{fmtDate(f.response_due_date)}</Field>
              <Field label="Closed">{fmtDate(f.closed_at)}</Field>
              <div className="sm:col-span-2"><Field label="Observation">{f.observation}</Field></div>
              <div className="sm:col-span-2"><Field label="Root cause">{f.root_cause}</Field></div>
              <div className="sm:col-span-2"><Field label="Required corrective outcome">{f.recommendation}</Field></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Regulatory criterion</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Criteria breached">
                {f.criteria_breached ? <span className="font-mono text-sm">{f.criteria_breached}</span> : 'Not recorded'}
              </Field>
              <Field label="Legal reference">{f.legal_reference ?? '—'}</Field>
              <div className="sm:col-span-2">
                <Field label="Compliance requirement">{f.compliance_requirement ?? '—'}</Field>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------ provenance -- */}
        <TabsContent value="provenance" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The exact origin of this finding, as recorded by the platform. Nothing here is inferred from ordering.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProvenanceLink
              label="Driving assessment" reference={p.assessment?.reference}
              detail={p.assessment ? `${titleCase(p.assessment.assessment_type)} · ${titleCase(p.assessment.overall_rating)} · ${titleCase(p.assessment.status)}` : null}
              to={p.assessment ? `/supervision/aml/assessments/${p.assessment.id}` : null}
            />
            <ProvenanceLink
              label="Assessment dimension" reference={p.dimension?.dimension_code}
              detail={p.dimension ? `Residual ${titleCase(p.dimension.residual_rating)}` : null}
            />
            <ProvenanceLink
              label="Supervisory attention" reference={p.attention?.reference}
              detail={p.attention ? `${p.attention.title} · ${titleCase(p.attention.status)}` : null}
            />
            <ProvenanceLink
              label="Supervisory plan" reference={p.plan?.reference}
              detail={p.plan ? `${p.plan.title} · ${titleCase(p.plan.status)}` : null}
              to={p.plan ? '/supervision/plans' : null}
            />
            <ProvenanceLink
              label="Intervention" reference={p.intervention?.reference}
              detail={p.intervention ? `${titleCase(p.intervention.intervention_type)} · ${titleCase(p.intervention.status)}` : null}
            />
            <ProvenanceLink
              label="Examination" reference={p.examination?.reference}
              detail={p.examination ? `${p.examination.title ?? ''} ${titleCase(p.examination.stage)}` : null}
              to={p.examination ? `/supervision/examinations/${p.examination.id}` : null}
            />
            <ProvenanceLink
              label="Workpaper" reference={p.workpaper?.reference}
              detail={p.workpaper ? `${p.workpaper.area ?? ''} — ${p.workpaper.conclusion ?? ''}` : null}
            />
          </div>
          {!p.assessment && !p.examination && !p.workpaper ? (
            <Card><CardContent className="p-4 text-sm text-muted-foreground">
              This finding has no upstream supervisory record linked. Standalone findings are permitted but carry no
              assessment or examination provenance.
            </CardContent></Card>
          ) : null}
        </TabsContent>

        {/* -------------------------------------------------------- response -- */}
        <TabsContent value="response" className="space-y-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Management response</CardTitle>
              {canManage && !['CLOSED', 'WITHDRAWN', 'SUPERSEDED'].includes(status) ? (
                <Button data-rbac={`${domainModule}.edit`} size="sm" variant="outline" onClick={() => setDialog('response')}>
                  <ClipboardList className="mr-1.5 h-3.5 w-3.5" />Record response
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-3">
              {f.response_at ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={
                      f.response_state === 'ACCEPTED' ? EMERALD : f.response_state === 'DISPUTED' ? RED : AMBER
                    }>
                      {titleCase(f.response_state)}
                    </Badge>
                    <Badge variant="outline" className={NEUTRAL}>
                      {f.response_source === 'OFFICER_RECORDED' ? 'Officer-recorded' : 'Entity submission'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Received {fmtDate(f.response_received_date ?? f.response_at)}
                    </span>
                  </div>
                  <Field label="Entity response">{f.management_response}</Field>
                  <Field label="Proposed action">{f.proposed_action ?? '—'}</Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Responsible person">{f.responsible_person ?? '—'}</Field>
                    <Field label="Committed target date">{fmtDate(f.response_target_date)}</Field>
                  </div>
                  {f.response_source === 'OFFICER_RECORDED' ? (
                    <p className={`rounded-md border p-2 text-xs ${NEUTRAL}`}>
                      Transcribed by a supervisory officer from a response received outside the platform — from{' '}
                      {f.response_received_from || 'an unstated correspondent'} via {titleCase(f.response_channel)} on{' '}
                      {fmtDate(f.response_received_date)}, recorded {fmtDate(f.response_recorded_at)}. This is not an
                      entity submission in the platform.
                    </p>
                  ) : (
                    <p className={`rounded-md border p-2 text-xs ${NEUTRAL}`}>
                      Submitted by the entity itself through the portal on {fmtDate(f.response_at)}.
                    </p>
                  )}
                </>
              ) : (

                <p className="text-sm text-muted-foreground">
                  No management response has been recorded. Remediation cannot be treated as agreed until the entity's
                  position is on record.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ----------------------------------------------------- remediation -- */}
        <TabsContent value="remediation" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              A finding may require several corrective actions. Each has its own owner, target date, evidence, validation
              and escalation history, and each is decided on its own merits.
            </p>
            {canManage && !['CLOSED', 'WITHDRAWN', 'SUPERSEDED'].includes(status) ? (
              <Button data-rbac={`${domainModule}.edit`} size="sm" onClick={() => setDialog('remediation')}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />Add corrective action
              </Button>
            ) : null}
          </div>
          {model.remediation.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
              No corrective action has been raised for this finding yet.
            </CardContent></Card>
          ) : (
            model.remediation.map((a) => (
              <RemediationActionCard key={a.id} action={a} model={model} canManage={canManage} canRefer={canRefer} />
            ))
          )}
        </TabsContent>

        {/* --------------------------------------------------------- closure -- */}
        <TabsContent value="closure">
          <FindingClosurePanel model={model} canManage={canManage} />
        </TabsContent>

        {/* ---------------------------------------------------- reassessment -- */}
        <TabsContent value="reassessment" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Remediation outcomes never silently rewrite authoritative risk. A reassessment requirement is raised, and the
            entity's risk state changes only when a new assessment is approved.
          </p>
          {model.reassessments.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
              No reassessment has been required from this finding.
            </CardContent></Card>
          ) : (
            model.reassessments.map((r) => (
              <Card key={r.id}>
                <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
                  <Field label="Trigger">{titleCase(r.trigger_kind)}</Field>
                  <Field label="Status">
                    <Badge variant="outline" className={statusTone(r.status)}>{titleCase(r.status)}</Badge>
                  </Field>
                  <Field label="Requested type">{titleCase(r.requested_type)}</Field>
                  <Field label="Due">{fmtDate(r.due_date)}</Field>
                  <div className="sm:col-span-2"><Field label="Rationale">{r.trigger_rationale}</Field></div>
                  <Field label="Triggering corrective action">
                    {r.remediation_action_id
                      ? model.remediation.find((a) => a.id === r.remediation_action_id)?.reference ?? 'Recorded'
                      : 'Finding-level'}
                  </Field>
                  <Field label="Fulfilled by">
                    {r.fulfilled_assessment_id
                      ? <Link className="text-primary hover:underline" to={`/supervision/aml/assessments/${r.fulfilled_assessment_id}`}>
                          Approved assessment
                        </Link>
                      : 'Outstanding'}
                  </Field>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* --------------------------------------------------------- history -- */}
        <TabsContent value="history">
          <Card>
            <CardContent className="p-4">
              {model.events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No events recorded.</p>
              ) : (
                <ol className="space-y-3">
                  {model.events.map((e) => (
                    <li key={`${e.scope}-${e.id}`} className="border-l-2 pl-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={e.scope === 'FINDING' ? BLUE : NEUTRAL}>
                          {e.scope === 'FINDING' ? 'Finding' : e.scope_reference}
                        </Badge>
                        <span className="text-sm font-medium">{titleCase(e.event_type)}</span>
                        {e.from_status || e.to_status ? (
                          <span className="text-xs text-muted-foreground">
                            {titleCase(e.from_status)} → {titleCase(e.to_status)}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {fmtDate(e.created_at)} · {e.actor_name || 'Platform'}
                      </div>
                      {e.rationale ? <p className="mt-0.5 text-sm">{e.rationale}</p> : null}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------- response dialog --- */}
      <Dialog open={dialog === 'response'} onOpenChange={(o) => (o ? null : reset())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record the management response</DialogTitle>
            <DialogDescription>
              Where the response arrived outside the platform, record how and from whom it was received. It is then shown
              as officer-recorded, never as an entity submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Entity position</Label>
              <Select value={responseState} onValueChange={(v) => setResponseState(v as typeof responseState)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="PARTIALLY_ACCEPTED">Partially accepted</SelectItem>
                  <SelectItem value="DISPUTED">Disputed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Management response</Label>
              <Textarea rows={4} value={managementResponse} onChange={(e) => setManagementResponse(e.target.value)} />
            </div>
            <div>
              <Label>Proposed action</Label>
              <Textarea rows={2} value={proposedAction} onChange={(e) => setProposedAction(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Responsible person</Label>
                <Input value={responsiblePerson} onChange={(e) => setResponsiblePerson(e.target.value)} />
              </div>
              <div>
                <Label>Committed target date</Label>
                <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
              <div className="sm:col-span-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Receipt provenance — required for an officer-recorded response
              </div>
              <div>
                <Label className="text-xs">Received from</Label>
                <Input value={receivedFrom} onChange={(e) => setReceivedFrom(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Received date</Label>
                <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Channel</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['EMAIL', 'LETTER', 'MEETING', 'TELEPHONE', 'OTHER'].map((c) => (
                      <SelectItem key={c} value={c}>{titleCase(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button data-rbac={`${domainModule}.edit`}
              disabled={
                managementResponse.trim().length < 10 || receivedFrom.trim().length < 3
                || !receivedDate || respond.isPending
              }
              onClick={async () => {
                try {
                  await respond.mutateAsync({
                    responseState, managementResponse,
                    proposedAction: proposedAction || null,
                    responsiblePerson: responsiblePerson || null,
                    targetDate: targetDate || null,
                    receivedFrom: receivedFrom || null,
                    receivedDate: receivedDate || null,
                    channel,
                  });
                  toast.success('Management response recorded');
                  reset();
                } catch (e: any) {
                  toast.error(e?.message ?? 'The response could not be recorded');
                }
              }}
            >
              Record response
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------- remediation dialog --- */}
      <Dialog open={dialog === 'remediation'} onOpenChange={(o) => (o ? null : reset())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a corrective action</DialogTitle>
            <DialogDescription>
              Each corrective action is tracked, validated and closed independently of the others on this finding.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Required corrective action</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div>
              <Label>Required outcome</Label>
              <Textarea rows={2} value={requiredOutcome} onChange={(e) => setRequiredOutcome(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Responsible party</Label>
                <Input value={responsibleParty} onChange={(e) => setResponsibleParty(e.target.value)} />
              </div>
              <div>
                <Label>Target date</Label>
                <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={reset}>Cancel</Button>
            <Button data-rbac={`${domainModule}.edit`}
              disabled={description.trim().length < 10 || openRemediation.isPending}
              onClick={async () => {
                try {
                  await openRemediation.mutateAsync({
                    description,
                    requiredOutcome: requiredOutcome || null,
                    responsibleParty: responsibleParty || null,
                    targetDate: targetDate || null,
                  });
                  toast.success('Corrective action raised');
                  reset();
                } catch (e: any) {
                  toast.error(e?.message ?? 'The corrective action could not be raised');
                }
              }}
            >
              Raise corrective action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
