/**
 * RDM-ENTITY-001 Wave C — canonical return filing detail (regulator view).
 *
 * Read-only 3-column presentation of the filing header plus tabs for versions,
 * forms, extracted metrics, validation findings, version comparison and
 * correction requests. Every state transition goes through
 * `returns_review_filing` / `returns_validate_filing`; the browser never writes
 * to the canonical return tables.
 *
 * Action visibility is driven by BOTH:
 *   1. dynamic permissions — `returns_management.review` for internal review
 *      progression, `returns_management.approve` for final Accept/Reject; and
 *   2. the current filing/version status — only transitions that are legal for
 *      that status are offered.
 */
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useFilingDetail, useWaveCMutations, FILING_STATUS_LABELS, FREQUENCY_LABELS } from '@/hooks/useWaveC';
import { FilingVersionComparison } from '@/components/returns/FilingVersionComparison';
import { useCan } from '@/hooks/useCan';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { CheckCircle2, Loader2, ShieldCheck, XCircle, RotateCcw, Lock, Eye } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? '—'}</p>
    </div>
  );
}

/** Statuses in which a reviewer may still act on the version. */
const REVIEWABLE = new Set(['SUBMITTED', 'UNDER_REVIEW']);
/** Terminal / entity-owned statuses — regulator actions are closed. */
const TERMINAL = new Set(['ACCEPTED', 'REJECTED', 'SUPERSEDED']);

export default function FilingDetail() {
  const { filingId } = useParams<{ filingId: string }>();
  const { data, isLoading } = useFilingDetail(filingId);
  const { validateFiling, reviewFiling, respondToRequest } = useWaveCMutations();
  const [reason, setReason] = useState('');

  const canReview = useCan('returns_management', 'review');
  const canApprove = useCan('returns_management', 'approve');

  const current = useMemo(() => {
    if (!data) return null;
    return [...data.versions].sort((a, b) => b.version_number - a.version_number)[0] ?? null;
  }, [data]);

  if (isLoading) {
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
  const currentStatus = current?.status ?? data.filing.status;

  // ---- state-aware action availability -------------------------------------
  const isDraftWithEntity = currentStatus === 'DRAFT' || currentStatus === 'CORRECTION_REQUESTED';
  const isReviewable = REVIEWABLE.has(currentStatus);
  const isTerminal = TERMINAL.has(currentStatus);

  const showStartReview = canReview && currentStatus === 'SUBMITTED';
  const showRequestCorrection = canReview && isReviewable;
  const showValidate = (canReview || canApprove) && !isTerminal;
  const showDecision = canApprove && isReviewable;
  const showRationale = showRequestCorrection || showDecision;
  const readOnly = !showStartReview && !showRequestCorrection && !showDecision && !showValidate;

  const act = async (action: 'START_REVIEW' | 'ACCEPT' | 'REJECT' | 'REQUEST_CORRECTION') => {
    if (!currentVersionId) return;
    if ((action === 'REJECT' || action === 'REQUEST_CORRECTION') && reason.trim().length < 10) {
      toast({ title: 'Reason required', description: 'Provide at least 10 characters of rationale.', variant: 'destructive' });
      return;
    }
    try {
      await reviewFiling.mutateAsync({ versionId: currentVersionId, action, reason: reason.trim() || undefined });
      setReason('');
      toast({ title: 'Filing updated', description: `Action ${action} recorded.` });
    } catch (e: any) {
      toast({ title: 'Action failed', description: e.message, variant: 'destructive' });
    }
  };

  const validate = async () => {
    if (!currentVersionId) return;
    try {
      const res = await validateFiling.mutateAsync(currentVersionId);
      toast({ title: 'Validation complete', description: `${res.errors} errors, ${res.warnings} warnings.` });
    } catch (e: any) {
      toast({ title: 'Validation failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={data.filing.filing_reference}
          description={`${data.entity_name ?? 'Entity'} — ${data.definition.name} (${data.period.period_label})`}
          backHref="/returns/queue"
          backLabel="Back to filing queue"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {showValidate && (
                <Button variant="outline" size="sm" onClick={validate} disabled={validateFiling.isPending}>
                  <ShieldCheck className="mr-1 h-4 w-4" />Validate
                </Button>
              )}
              {showStartReview && (
                <Button variant="outline" size="sm" onClick={() => act('START_REVIEW')} disabled={reviewFiling.isPending}>
                  Start review
                </Button>
              )}
              {showRequestCorrection && (
                <Button variant="outline" size="sm" onClick={() => act('REQUEST_CORRECTION')} disabled={reviewFiling.isPending}>
                  <RotateCcw className="mr-1 h-4 w-4" />Request correction
                </Button>
              )}
              {showDecision && (
                <>
                  <Button variant="outline" size="sm" className="text-destructive" onClick={() => act('REJECT')} disabled={reviewFiling.isPending}>
                    <XCircle className="mr-1 h-4 w-4" />Reject
                  </Button>
                  <Button size="sm" onClick={() => act('ACCEPT')} disabled={reviewFiling.isPending}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />Accept
                  </Button>
                </>
              )}
              {readOnly && (
                <Badge variant="outline" className="gap-1"><Eye className="h-3 w-3" />Read-only</Badge>
              )}
            </div>
          }
        />

        {isDraftWithEntity && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertTitle>Awaiting the entity</AlertTitle>
            <AlertDescription>
              Version v{current?.version_number} is currently
              {currentStatus === 'DRAFT' ? ' being prepared' : ' open for correction'} by the entity.
              Supervisory decisions become available once it is submitted.
            </AlertDescription>
          </Alert>
        )}
        {isTerminal && (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Filing closed</AlertTitle>
            <AlertDescription>
              This filing is {FILING_STATUS_LABELS[currentStatus] ?? currentStatus.toLowerCase()} and immutable.
              {current?.rejection_reason ? ` Recorded rationale: ${current.rejection_reason}` : ''}
            </AlertDescription>
          </Alert>
        )}
        {!readOnly && isReviewable && !canApprove && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Review only</AlertTitle>
            <AlertDescription>
              You can progress and annotate this review, but the final accept/reject decision requires
              returns approval authority.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Filing summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Status" value={<Badge variant="outline">{FILING_STATUS_LABELS[data.filing.status] ?? data.filing.status}</Badge>} />
            <Field label="Return" value={`${data.definition.code} — ${data.definition.name}`} />
            <Field label="Frequency" value={FREQUENCY_LABELS[data.definition.frequency] ?? data.definition.frequency} />
            <Field label="Period" value={`${formatDateOnly(data.period.period_start)} – ${formatDateOnly(data.period.period_end)}`} />
            <Field label="Due date" value={formatDateOnly(data.period.due_date)} />
            <Field label="Current version" value={`v${data.filing.current_version_number} (${currentStatus})`} />
            <Field label="Submitted" value={formatDateTime(data.filing.submitted_at)} />
            <Field label="Accepted" value={formatDateTime(data.filing.accepted_at)} />
            <Field label="Rejected" value={formatDateTime(data.filing.rejected_at)} />
          </CardContent>
        </Card>

        {showRationale && (
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
            <TabsTrigger value="requests">Requests ({data.requests.length})</TabsTrigger>
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
          <Button size="sm" disabled={text.trim().length < 10} onClick={() => onRespond(text.trim())}>Submit response</Button>
        </div>
      )}
    </div>
  );
}
