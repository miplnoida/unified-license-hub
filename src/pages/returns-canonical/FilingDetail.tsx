/**
 * EPR-01 — canonical Regulatory Returns case workspace (internal view).
 *
 * The enterprise case standard: a standard case header (object, entity, stage,
 * status, owner, service level), a Current Step control listing what is done,
 * what blocks progression and only the actions the server permits, then the
 * evidence tabs (versions, forms, metrics, validation, comparison, requests,
 * related cases).
 *
 * Stage, status, priority, SLA, waiting-on, blockers and available actions are
 * ALL supplied by `returns_filing_workflow_state`. The browser derives none of
 * them and writes to no canonical return table — every transition goes through
 * `returns_review_filing` / `returns_validate_filing` / `returns_assign_filing`,
 * which remain the authority regardless of what this UI shows.
 */
import { useMemo, useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useFilingDetail, useWaveCMutations, useFilingWorkflowState, useAssignFiling,
  FILING_STATUS_LABELS, FREQUENCY_LABELS, SLA_STATE_LABELS, WAITING_ON_LABELS,
  type FilingAvailableAction,
} from '@/hooks/useWaveC';
import { FilingVersionComparison } from '@/components/returns/FilingVersionComparison';
import { FilingCurrentStepPanel } from '@/components/returns/FilingCurrentStepPanel';
import { FilingRelatedCases } from '@/components/returns/FilingRelatedCases';
import { StatusBadge } from '@/components/presentation/StatusBadge';
import { useInternalUsers } from '@/hooks/useInternalUsers';
import { objectRoute } from '@/lib/routes/objectRoutes';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { Loader2, ShieldCheck, Lock, UserPlus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? '—'}</p>
    </div>
  );
}

const SLA_TONE: Record<string, 'critical' | 'warning' | 'positive' | 'muted'> = {
  BREACHED: 'critical', DUE_SOON: 'warning', ON_TRACK: 'positive', NOT_APPLICABLE: 'muted',
};

export default function FilingDetail() {
  const { filingId } = useParams<{ filingId: string }>();
  const { data, isLoading } = useFilingDetail(filingId);
  const { data: workflow, isLoading: loadingWorkflow } = useFilingWorkflowState(filingId);
  const { validateFiling, reviewFiling, respondToRequest } = useWaveCMutations();
  const assignFiling = useAssignFiling();
  const { data: internalUsers = [] } = useInternalUsers();
  const [reason, setReason] = useState('');
  const [assignee, setAssignee] = useState<string>('');

  const current = useMemo(() => {
    if (!data) return null;
    return [...data.versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null;
  }, [data]);

  if (isLoading || loadingWorkflow) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }
  if (!data) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center text-muted-foreground">Filing not found or not visible to your role.</div>
      </DashboardLayout>
    );
  }

  const currentVersionId = current?.id ?? null;
  const currentStatus = workflow?.status ?? current?.status ?? data.filing.status;
  const requiresReason = (workflow?.available_actions ?? []).some((a) => a.requires_reason);

  const runAction = async (action: FilingAvailableAction) => {
    if (action.code === 'ASSIGN') {
      if (!filingId) return;
      try {
        await assignFiling.mutateAsync({ filingId, ownerUserId: assignee || null });
        toast({ title: assignee ? 'Filing assigned' : 'Assignment cleared' });
      } catch (e: any) {
        toast({ title: 'Assignment failed', description: e.message, variant: 'destructive' });
      }
      return;
    }
    if (action.code === 'VALIDATE') {
      if (!currentVersionId) return;
      try {
        const res = await validateFiling.mutateAsync(currentVersionId);
        toast({ title: 'Validation complete', description: `${res.errors} errors, ${res.warnings} warnings.` });
      } catch (e: any) {
        toast({ title: 'Validation failed', description: e.message, variant: 'destructive' });
      }
      return;
    }
    if (!currentVersionId) return;
    if (action.requires_reason && reason.trim().length < 10) {
      toast({ title: 'Reason required', description: 'Provide at least 10 characters of rationale.', variant: 'destructive' });
      return;
    }
    try {
      await reviewFiling.mutateAsync({
        versionId: currentVersionId,
        action: action.code as 'START_REVIEW' | 'ACCEPT' | 'REJECT' | 'REQUEST_CORRECTION',
        reason: reason.trim() || undefined,
      });
      setReason('');
      toast({ title: 'Filing updated', description: `${action.label} recorded.` });
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    }
  };

  const busy = reviewFiling.isPending || validateFiling.isPending || assignFiling.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={data.filing.filing_reference}
          description={`${data.entity_name ?? 'Regulated entity'} — ${data.definition.name} (${data.period.period_label})`}
          backHref={objectRoute.returnsQueue()}
          backLabel="Back to filing queue"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Assign owner…" /></SelectTrigger>
                <SelectContent>
                  {internalUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name || u.email || 'Staff member'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <GuardedButton module="returns_management" action="workflow_action" data-rbac="returns_management.workflow_action"
                size="sm"
                variant="outline"
                disabled={!assignee || busy}
                onClick={() => runAction({ code: 'ASSIGN', label: 'Assign', variant: 'outline' })}
              >
                <UserPlus className="mr-1 h-4 w-4" />Assign
              </GuardedButton>
            </div>
          }
        />

        {/* Standard case header — one row of the facts every case screen shows. */}
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3 lg:grid-cols-6">
            <Field
              label="Regulated entity"
              value={data.filing.entity_id
                ? <Link className="text-primary underline" to={objectRoute.entity(data.filing.entity_id)}>{data.entity_name ?? 'Open entity'}</Link>
                : (data.entity_name ?? 'Not recorded')}
            />
            <Field label="Stage" value={<StatusBadge code={workflow?.stage} label={workflow?.stage_label} tone="info" />} />
            <Field label="Status" value={<StatusBadge code={currentStatus} label={workflow?.status_label ?? FILING_STATUS_LABELS[currentStatus]} />} />
            <Field label="Owner" value={workflow?.owner_name ?? 'Unassigned'} />
            <Field
              label="Service level"
              value={(
                <span className="flex flex-col gap-1">
                  <StatusBadge
                    code={workflow?.sla_state}
                    label={workflow ? (SLA_STATE_LABELS[workflow.sla_state] ?? workflow.sla_state) : undefined}
                    tone={SLA_TONE[workflow?.sla_state ?? ''] ?? 'muted'}
                  />
                  {workflow?.sla_due_at && (
                    <span className="text-xs font-normal text-muted-foreground">Due {formatDateTime(workflow.sla_due_at)}</span>
                  )}
                </span>
              )}
            />
            <Field
              label="Waiting on"
              value={workflow ? (WAITING_ON_LABELS[workflow.waiting_on] ?? workflow.waiting_on) : '—'}
            />
          </CardContent>
        </Card>

        {workflow && (
          <FilingCurrentStepPanel state={workflow} busy={busy} onAction={runAction} />
        )}

        {workflow?.waiting_on === 'ENTITY' && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Awaiting the regulated entity</AlertTitle>
            <AlertDescription>
              Version v{current?.version_number} is with the entity
              ({workflow.status_label}). Supervisory decisions become available once it is submitted.
            </AlertDescription>
          </Alert>
        )}
        {workflow?.stage === 'CLOSED' && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Filing closed</AlertTitle>
            <AlertDescription>
              This filing is {workflow.status_label.toLowerCase()} and immutable.
              {current?.rejection_reason ? ` Recorded rationale: ${current.rejection_reason}` : ''}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Filing summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Return" value={`${data.definition.code} — ${data.definition.name}`} />
            <Field label="Frequency" value={FREQUENCY_LABELS[data.definition.frequency] ?? data.definition.frequency} />
            <Field label="Reporting period" value={`${formatDateOnly(data.period.period_start)} – ${formatDateOnly(data.period.period_end)}`} />
            <Field label="Regulatory due date" value={formatDateOnly(data.period.due_date)} />
            <Field
              label="Version provenance"
              value={`Current v${data.filing.current_version_number}${workflow?.accepted_version_id
                ? ` — accepted version recorded`
                : ' — no accepted version yet'}`}
            />
            <Field label="Submitted" value={formatDateTime(data.filing.submitted_at)} />
            <Field label="Accepted" value={formatDateTime(data.filing.accepted_at)} />
            <Field label="Rejected" value={formatDateTime(data.filing.rejected_at)} />
            <Field label="Last activity" value={formatDateTime(workflow?.last_activity_at)} />
          </CardContent>
        </Card>

        {requiresReason && (
          <Card>
            <CardHeader><CardTitle className="text-base">Reviewer rationale</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                rows={3}
                placeholder="Required when rejecting or requesting a correction (min. 10 characters)…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </CardContent>
          </Card>
        )}


        <Tabs defaultValue="versions">
          <TabsList className="flex-wrap">
            <TabsTrigger value="versions">Versions ({data.versions.length})</TabsTrigger>
            <TabsTrigger value="forms">Forms ({data.forms.length})</TabsTrigger>
            <TabsTrigger value="metrics">Metrics ({data.metrics.length})</TabsTrigger>
            <TabsTrigger value="findings">Validation ({data.findings.length})</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="requests">Requests ({data.requests.length})</TabsTrigger>
            <TabsTrigger value="related">Related cases</TabsTrigger>

          </TabsList>

          <TabsContent value="versions">
            <Card><CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead>Immutable</TableHead>
                  <TableHead>Submitted</TableHead><TableHead>Accepted</TableHead><TableHead>Rejected</TableHead><TableHead>Reason</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">v{v.version_number}</TableCell>
                      <TableCell><Badge variant="outline">{v.status}</Badge></TableCell>
                      <TableCell>{v.is_immutable ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(v.submitted_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(v.accepted_at)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(v.rejected_at)}</TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">{v.rejection_reason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="forms">
            <Card><CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>#</TableHead><TableHead>Form</TableHead><TableHead>Version</TableHead>
                  <TableHead>Required</TableHead><TableHead>Completion</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.forms.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No forms attached</TableCell></TableRow>
                  ) : data.forms.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.sequence}</TableCell>
                      <TableCell>{f.template_name ?? f.form_template_id}{f.tab_name ? ` — ${f.tab_name}` : ''}</TableCell>
                      <TableCell className="font-mono text-xs">{f.form_version ? `v${f.form_version}` : '—'}</TableCell>
                      <TableCell>{f.is_required ? 'Yes' : 'No'}</TableCell>
                      <TableCell><Badge variant="outline">{f.completion_status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="metrics">
            <Card><CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Metric</TableHead><TableHead className="text-right">Value</TableHead>
                  <TableHead>Unit</TableHead><TableHead>Availability</TableHead><TableHead>Source</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.metrics.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No metrics extracted</TableCell></TableRow>
                  ) : data.metrics.map((m) => (
                    <TableRow key={m.code}>
                      <TableCell className="font-mono text-xs">{m.code}</TableCell>
                      <TableCell>{m.name}</TableCell>
                      <TableCell className="text-right font-mono">
                        {m.value_numeric !== null ? Number(m.value_numeric).toLocaleString() : m.value_text ?? '—'}
                      </TableCell>
                      <TableCell>{m.unit ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{m.availability}</Badge>
                        {m.availability_reason && <span className="ml-2 text-xs text-muted-foreground">{m.availability_reason}</span>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{m.source_kind}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="findings">
            <Card><CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Severity</TableHead><TableHead>Rule</TableHead><TableHead>Scope</TableHead>
                  <TableHead>Message</TableHead><TableHead>Blocking</TableHead><TableHead>Detected</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.findings.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No validation findings</TableCell></TableRow>
                  ) : data.findings.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell><Badge variant="outline" className={f.is_blocking ? 'border-destructive/20 bg-destructive/10 text-destructive' : ''}>{f.severity}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{f.rule_code}</TableCell>
                      <TableCell>{f.scope}</TableCell>
                      <TableCell className="max-w-[360px]">{f.message}</TableCell>
                      <TableCell>{f.is_blocking ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateTime(f.detected_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="compare">
            <FilingVersionComparison
              versions={data.versions.map((v) => ({ id: v.id, version_number: v.version_number, status: v.status }))}
            />
          </TabsContent>

          <TabsContent value="requests">

            <Card><CardContent className="space-y-3 p-4">
              {data.requests.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">No information requests raised</p>
              ) : data.requests.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  onRespond={async (text) => {
                    try {
                      await respondToRequest.mutateAsync({ requestId: r.id, response: text });
                      toast({ title: 'Response submitted' });
                    } catch (e: any) {
                      toast({ title: 'Could not respond', description: e.message, variant: 'destructive' });
                    }
                  }}
                />
              ))}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="related">
            {filingId && <FilingRelatedCases filingId={filingId} />}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function RequestCard({
  request,
  onRespond,
}: {
  request: { id: string; request_kind: string; message: string; status: string; response_text: string | null; created_at: string; responded_at: string | null };
  onRespond: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Badge variant="outline">{request.request_kind}</Badge>
        <Badge variant="outline">{request.status}</Badge>
        <span className="text-xs text-muted-foreground">{formatDateTime(request.created_at)}</span>
      </div>
      <p className="text-sm">{request.message}</p>
      {request.response_text ? (
        <div className="mt-2 rounded-md bg-muted/50 p-2 text-sm">
          <p className="text-xs text-muted-foreground">Response — {formatDateTime(request.responded_at)}</p>
          <p>{request.response_text}</p>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <Textarea rows={2} placeholder="Respond to this request…" value={text} onChange={(e) => setText(e.target.value)} />
          <Button data-rbac="returns_management.submit" size="sm" disabled={text.trim().length < 10} onClick={() => onRespond(text.trim())}>Submit response</Button>
        </div>
      )}
    </div>
  );
}
