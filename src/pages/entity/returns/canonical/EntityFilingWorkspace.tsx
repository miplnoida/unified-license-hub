/**
 * RDM-ENTITY-001 Wave C (external) — single filing preparation + submit.
 * Reads `returns_filing_detail`; renders pinned forms via the canonical
 * Wave B form renderer using the exact `form_version_id` recorded on each
 * requirement. Validation, metric extraction, declaration and immutability
 * are all enforced server-side by the governed RPCs.
 */
import { useCallback, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { FilingLifecyclePanel } from '@/components/returns/FilingLifecyclePanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, ShieldCheck, Send, CheckCircle2, Circle, AlertTriangle, ArrowLeft, ArrowRight, ClipboardCheck } from 'lucide-react';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { toast } from 'sonner';
import { FREQUENCY_LABELS, FILING_STATUS_LABELS } from '@/hooks/useWaveC';
import { useEntityFilingDetail, useEntityCapabilities, useEntityReturnsMutations } from '@/hooks/useEntityReturns';
import { CURRENCY_SOURCE_LABELS, type CurrencySource } from '@/hooks/useEntityCurrency';

import { useReturnFormValidationRules } from '@/hooks/useReturnFormValidationRules';
import { EntityFilingForm } from '@/components/entity/returns-canonical/EntityFilingForm';
import { FilerGuidancePanel } from '@/components/entity/returns-canonical/FilerGuidancePanel';

const EDITABLE_STATUSES = new Set(['DRAFT', 'CORRECTION_REQUESTED']);
const REVIEW_STEP = '__review__';

export default function EntityFilingWorkspace() {
  const { filingId } = useParams<{ filingId: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useEntityFilingDetail(filingId);
  const capabilities = useEntityCapabilities(data?.filing.entity_id);
  const { validateFiling, submitFiling, respondToRequest } = useEntityReturnsMutations();
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [validation, setValidation] = useState<{ errors: number; warnings: number; can_submit: boolean } | null>(null);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [formIssues, setFormIssues] = useState<Record<string, string[]>>({});

  const handleIssuesChange = useCallback((requirementId: string, issues: string[]) => {
    setFormIssues((prev) => {
      const before = prev[requirementId] ?? [];
      if (before.length === issues.length && before.every((m, i) => m === issues[i])) return prev;
      return { ...prev, [requirementId]: issues };
    });
  }, []);

  const templateIds = useMemo(
    () => (data?.forms ?? []).map((f) => f.form_template_id).filter(Boolean),
    [data?.forms],
  );
  const { data: rulesByTemplate = {} } = useReturnFormValidationRules(templateIds);


  if (isLoading) {
    return <DashboardLayout><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></DashboardLayout>;
  }
  if (!data) {
    return <DashboardLayout><div className="py-20 text-center text-muted-foreground">Filing not found or not visible to you.</div></DashboardLayout>;
  }

  const current = data.versions.find((v) => v.id === data.filing.accepted_version_id) ?? data.versions[0];
  const currentVersionId = current?.id ?? null;
  const isEditableVersion = !!current && EDITABLE_STATUSES.has(current.status) && !current.is_immutable;
  const canEdit = capabilities.canOpenOrEdit && isEditableVersion;
  const currentForms = [...data.forms.filter((f) => f.return_filing_version_id === currentVersionId)]
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const historicVersions = data.versions.filter((v) => v.id !== currentVersionId);
  const openRequests = data.requests.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CLOSED');
  const requiredForms = currentForms.filter((f) => f.is_required);
  const completedRequiredForms = requiredForms.filter((f) => f.completion_status === 'COMPLETED').length;
  const currentFindings = data.findings;
  const blockingFindings = currentFindings.filter((f) => f.is_blocking).length;
  const warningFindings = currentFindings.length - blockingFindings;

  // ---- form-level navigation -------------------------------------------
  const stepKey = activeStep ?? currentForms[0]?.id ?? REVIEW_STEP;
  const activeIndex = currentForms.findIndex((f) => f.id === stepKey);
  const activeForm = activeIndex >= 0 ? currentForms[activeIndex] : null;
  const isReviewStep = stepKey === REVIEW_STEP || currentForms.length === 0;

  const issuesFor = (requirementId: string) => formIssues[requirementId] ?? [];
  const totalLiveIssues = currentForms.reduce((n, f) => n + issuesFor(f.id).length, 0);
  const incompleteRequired = requiredForms.filter((f) => f.completion_status !== 'COMPLETED');
  const readyToSubmit =
    incompleteRequired.length === 0 && totalLiveIssues === 0 && blockingFindings === 0;

  const formStatus = (f: typeof currentForms[number]): 'complete' | 'issue' | 'in_progress' | 'not_started' => {
    if (issuesFor(f.id).length > 0) return 'issue';
    if (f.completion_status === 'COMPLETED') return 'complete';
    if (f.form_response_id) return 'in_progress';
    return 'not_started';
  };

  const handleValidate = async () => {
    if (!currentVersionId) return;
    try {
      const res = await validateFiling.mutateAsync(currentVersionId);
      setValidation(res);
      toast.success(`${res.errors} error(s), ${res.warnings} warning(s)`);
      return res;
    } catch (e: any) {
      toast.error(e?.message || 'Validation failed');
    }
  };

  const handleSubmit = async () => {
    if (!currentVersionId) return;
    if (data.definition.requires_declaration && !declarationAccepted) {
      toast.error('You must accept the declaration before submitting.');
      return;
    }
    if (totalLiveIssues > 0) {
      setActiveStep(REVIEW_STEP);
      toast.error('This return cannot be submitted while there are outstanding validation issues.');
      return;
    }
    try {
      const res = await submitFiling.mutateAsync({ versionId: currentVersionId, declarationAccepted });
      setValidation(res.validation);
      if (res.submitted) {
        toast.success('Filing submitted');
      } else {
        setActiveStep(REVIEW_STEP);
        toast.error('Submission blocked — please review the validation findings.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Submit failed');
    }
  };


  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={data.filing.filing_reference}
          description={`${data.entity_name ?? 'Entity'} — ${data.definition.name} (${data.period.period_label})`}
          backHref="/entity/returns"
          backLabel="Back to returns"
          actions={canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button data-rbac="returns_management.edit" variant="outline" size="sm" onClick={handleValidate} disabled={validateFiling.isPending}>
                <ShieldCheck className="mr-1 h-4 w-4" />Validate
              </Button>
              {capabilities.canSubmit && (
                <Button data-rbac="returns_management.submit"
                  size="sm"
                  onClick={() => setActiveStep(REVIEW_STEP)}
                  variant={readyToSubmit ? 'default' : 'outline'}
                >
                  <Send className="mr-1 h-4 w-4" />Review &amp; submit
                </Button>
              )}
            </div>
          ) : undefined}

        />

        {capabilities.isViewer && (
          <p className="text-sm text-muted-foreground">You have read-only access to this filing.</p>
        )}

        {/* EPR-01 — filer-facing guidance only (no internal reviewer/SLA facts). */}
        <FilerGuidancePanel
          filingStatus={data.filing.status}
          versionStatus={current?.status ?? null}
          versionNumber={data.filing.current_version_number ?? null}
          dueDate={data.period.due_date}
          requiresDeclaration={!!data.definition.requires_declaration}
          declarationAccepted={declarationAccepted}
          totalRequiredForms={requiredForms.length}
          completedRequiredForms={completedRequiredForms}
          blockingIssues={blockingFindings}
          warningIssues={warningFindings}
          openRequests={openRequests.length}
          isEditable={canEdit}
          isReadOnly={capabilities.isViewer}
        />


        {current?.status === 'CORRECTION_REQUESTED' && (
          <Card className="border-destructive/30">
            <CardHeader><CardTitle className="text-base text-destructive">Correction requested</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              A correction has been requested on this filing. Only this new draft version is editable; respond to the
              request below once your changes are complete.
            </CardContent>
          </Card>
        )}

        {current?.status === 'REJECTED' && (
          <Card className="border-destructive/30">
            <CardHeader><CardTitle className="text-base text-destructive">Rejected</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">{current.rejection_reason ?? 'No rationale recorded.'}</CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Filing summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Status" value={<Badge variant="outline">{FILING_STATUS_LABELS[data.filing.status] ?? data.filing.status}</Badge>} />
            <Field label="Return" value={`${data.definition.code} — ${data.definition.name}`} />
            <Field label="Frequency" value={FREQUENCY_LABELS[data.definition.frequency] ?? data.definition.frequency} />
            <Field label="Period" value={`${formatDateOnly(data.period.period_start)} – ${formatDateOnly(data.period.period_end)}`} />
            <Field label="Due date" value={formatDateOnly(data.period.due_date)} />
            <Field label="Current version" value={`v${data.filing.current_version_number}`} />
            {/* Currency is snapshotted when the filing is opened, so later profile
                changes never rewrite a historical return. */}
            <Field
              label="Reporting currency"
              value={data.filing.reporting_currency
                ? (
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{data.filing.reporting_currency}</span>
                    {data.filing.currency_source && (
                      <Badge variant="outline">
                        {CURRENCY_SOURCE_LABELS[data.filing.currency_source as CurrencySource] ?? data.filing.currency_source}
                      </Badge>
                    )}
                  </span>
                )
                : 'Not yet recorded'}
            />
            <Field
              label="Currency fixed as at"
              value={data.filing.currency_as_of ? formatDateOnly(data.filing.currency_as_of) : '—'}
            />

          </CardContent>
          {data.filing.currency_source === 'RETURN_DEFINITION' && data.filing.reporting_currency && (
            <CardContent className="pt-0 text-sm text-muted-foreground">
              This return is required to be filed in <span className="font-mono">{data.filing.reporting_currency}</span>.
              The mandated currency is set on the return definition and overrides the entity reporting currency.
            </CardContent>
          )}
        </Card>

        {/* ---- Governed lifecycle: RFI, extensions, amendments, evidence -- */}
        <FilingLifecyclePanel
          audience="ENTITY"
          filingId={data.filing.id}
          versionId={currentVersionId}
          periodId={data.period.id}
          originalDueDate={data.period.due_date}
          requests={data.requests}
        />



        {/* ---- Form-level navigator ------------------------------------ */}
        {currentForms.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">No forms are pinned to this filing.</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  Return filing — {completedRequiredForms} of {requiredForms.length} form
                  {requiredForms.length === 1 ? '' : 's'} completed
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {currentForms.map((f, idx) => {
                  const status = formStatus(f);
                  const isActive = stepKey === f.id;
                  return (
                    <Button
                      key={f.id}
                      type="button"
                      size="sm"
                      variant={isActive ? 'default' : 'outline'}
                      onClick={() => setActiveStep(f.id)}
                      className="gap-2"
                    >
                      {status === 'issue'
                        ? <AlertTriangle className="h-4 w-4 text-destructive" />
                        : status === 'complete'
                          ? <CheckCircle2 className="h-4 w-4" />
                          : <Circle className="h-4 w-4" />}
                      <span>{idx + 1}. {f.template_name ?? f.tab_name ?? 'Form'}</span>
                      {status === 'issue' && (
                        <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
                          {issuesFor(f.id).length}
                        </Badge>
                      )}
                    </Button>
                  );
                })}
                <Button data-rbac="returns_management.submit"
                  type="button"
                  size="sm"
                  variant={isReviewStep ? 'default' : 'outline'}
                  onClick={() => setActiveStep(REVIEW_STEP)}
                  className="gap-2"
                >
                  <ClipboardCheck className="h-4 w-4" />Review &amp; submit
                </Button>
              </CardContent>
            </Card>

            {activeForm && !isReviewStep && (
              <>
                <EntityFilingForm
                  key={activeForm.id}
                  editable={canEdit}
                  rules={rulesByTemplate[activeForm.form_template_id] ?? []}
                  onIssuesChange={handleIssuesChange}
                  continueLabel={
                    activeIndex < currentForms.length - 1
                      ? 'Save & continue to next form'
                      : 'Save & continue to review'
                  }
                  onContinue={canEdit ? () => setActiveStep(
                    activeIndex < currentForms.length - 1 ? currentForms[activeIndex + 1].id : REVIEW_STEP,
                  ) : undefined}
                  requirement={{
                    id: activeForm.id,
                    form_template_id: activeForm.form_template_id,
                    form_version_id: activeForm.form_version_id,
                    template_name: activeForm.template_name,
                    form_version: activeForm.form_version,
                    is_required: activeForm.is_required,
                    sequence: activeForm.sequence,
                    tab_name: activeForm.tab_name,
                    form_response_id: activeForm.form_response_id,
                    completion_status: activeForm.completion_status,
                  }}
                />
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={activeIndex <= 0}
                    onClick={() => setActiveStep(currentForms[activeIndex - 1]?.id ?? null)}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />Previous form
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveStep(
                      activeIndex < currentForms.length - 1 ? currentForms[activeIndex + 1].id : REVIEW_STEP,
                    )}
                  >
                    {activeIndex < currentForms.length - 1 ? 'Next form' : 'Review & submit'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </>
            )}

            {isReviewStep && (
              <Card>
                <CardHeader><CardTitle className="text-base">Review &amp; submit</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Form</TableHead><TableHead>Required</TableHead>
                      <TableHead>Completion</TableHead><TableHead>Validation</TableHead><TableHead />
                    </TableRow></TableHeader>
                    <TableBody>
                      {currentForms.map((f, idx) => {
                        const status = formStatus(f);
                        return (
                          <TableRow key={f.id}>
                            <TableCell className="font-medium">{idx + 1}. {f.template_name ?? f.tab_name ?? 'Form'}</TableCell>
                            <TableCell>{f.is_required ? 'Yes' : 'No'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {f.completion_status === 'COMPLETED' ? 'Complete'
                                  : f.form_response_id ? 'In progress' : 'Not started'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {status === 'issue' ? (
                                <span className="text-sm text-destructive">
                                  {issuesFor(f.id).length} issue{issuesFor(f.id).length === 1 ? '' : 's'}
                                </span>
                              ) : (
                                <span className="text-sm text-muted-foreground">No issues detected</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setActiveStep(f.id)}>
                                Open form
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>

                  {(totalLiveIssues > 0 || incompleteRequired.length > 0) && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>
                        {totalLiveIssues + incompleteRequired.length} issue
                        {totalLiveIssues + incompleteRequired.length === 1 ? '' : 's'} must be fixed before submission
                      </AlertTitle>
                      <AlertDescription className="space-y-1">
                        {incompleteRequired.map((f) => (
                          <button
                            key={`inc-${f.id}`}
                            type="button"
                            className="block text-left underline underline-offset-2"
                            onClick={() => setActiveStep(f.id)}
                          >
                            {f.template_name ?? 'Form'} — not yet marked as complete
                          </button>
                        ))}
                        {currentForms.flatMap((f) => issuesFor(f.id).map((msg, i) => (
                          <button
                            key={`iss-${f.id}-${i}`}
                            type="button"
                            className="block text-left underline underline-offset-2"
                            onClick={() => setActiveStep(f.id)}
                          >
                            {f.template_name ?? 'Form'} — {msg}
                          </button>
                        )))}
                      </AlertDescription>
                    </Alert>
                  )}

                  {validation && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      {validation.errors} blocking error(s), {validation.warnings} warning(s) — {validation.can_submit ? 'ready to submit' : 'not yet ready to submit'}.
                    </div>
                  )}

                  {data.findings.length > 0 && (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Severity</TableHead><TableHead>Message</TableHead><TableHead>Blocking</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {data.findings.map((f) => (
                            <TableRow key={f.id}>
                              <TableCell><Badge variant="outline" className={f.is_blocking ? 'border-destructive/20 bg-destructive/10 text-destructive' : ''}>{f.severity}</Badge></TableCell>
                              <TableCell>{f.message}</TableCell>
                              <TableCell>{f.is_blocking ? 'Yes' : 'No'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}



                  {data.definition.requires_declaration && canEdit && (
                    <div className="rounded-md border p-3">
                      <p className="text-sm text-muted-foreground">{data.definition.declaration_text}</p>
                      <label className="mt-2 flex items-center gap-2 text-sm">
                        <Checkbox checked={declarationAccepted} onCheckedChange={(v) => setDeclarationAccepted(!!v)} />
                        I confirm the above declaration on behalf of the entity.
                      </label>
                    </div>
                  )}

                  {canEdit && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button data-rbac="returns_management.edit" variant="outline" onClick={handleValidate} disabled={validateFiling.isPending}>
                        <ShieldCheck className="mr-2 h-4 w-4" />Validate return
                      </Button>
                      {capabilities.canSubmit && (
                        <Button data-rbac="returns_management.submit"
                          onClick={handleSubmit}
                          disabled={
                            submitFiling.isPending
                            || !readyToSubmit
                            || (data.definition.requires_declaration && !declarationAccepted)
                          }
                        >
                          <Send className="mr-2 h-4 w-4" />Submit return
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}


        {historicVersions.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Previous versions (read-only)</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Version</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead>
                  <TableHead>Accepted</TableHead><TableHead>Rejected</TableHead><TableHead>Reason</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {historicVersions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">v{v.version_number}</TableCell>
                      <TableCell><Badge variant="outline">{v.status}</Badge></TableCell>
                      <TableCell>{formatDateTime(v.submitted_at)}</TableCell>
                      <TableCell>{formatDateTime(v.accepted_at)}</TableCell>
                      <TableCell>{formatDateTime(v.rejected_at)}</TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">{v.rejection_reason ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {openRequests.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Open correction / information requests</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {openRequests.map((r) => (
                <RequestRow
                  key={r.id}
                  request={r}
                  canRespond={capabilities.canRespondToRequest}
                  onRespond={async (text) => {
                    try {
                      await respondToRequest.mutateAsync({ requestId: r.id, response: text });
                      toast.success('Response submitted');
                    } catch (e: any) {
                      toast.error(e?.message || 'Could not respond');
                    }
                  }}
                />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value ?? '—'}</p>
    </div>
  );
}

function RequestRow({
  request, canRespond, onRespond,
}: {
  request: { id: string; request_kind: string; message: string; status: string; response_text: string | null; created_at: string; responded_at: string | null };
  canRespond: boolean;
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
      ) : canRespond ? (
        <div className="mt-2 space-y-2">
          <Textarea rows={2} placeholder="Respond to this request…" value={text} onChange={(e) => setText(e.target.value)} />
          <Button data-rbac="returns_management.submit" size="sm" disabled={text.trim().length < 10} onClick={() => onRespond(text.trim())}>Submit response</Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Awaiting a response.</p>
      )}
    </div>
  );
}
