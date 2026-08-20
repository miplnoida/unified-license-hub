/**
 * RDM-ENTITY-001 Wave C (external) — single filing preparation + submit.
 * Reads `returns_filing_detail`; renders pinned forms via the canonical
 * Wave B form renderer using the exact `form_version_id` recorded on each
 * requirement. Validation, metric extraction, declaration and immutability
 * are all enforced server-side by the governed RPCs.
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, ShieldCheck, Send } from 'lucide-react';
import { formatDateOnly, formatDateTime } from '@/lib/datetime';
import { toast } from 'sonner';
import { FREQUENCY_LABELS, FILING_STATUS_LABELS } from '@/hooks/useWaveC';
import { useEntityFilingDetail, useEntityCapabilities, useEntityReturnsMutations } from '@/hooks/useEntityReturns';
import { EntityFilingForm } from '@/components/entity/returns-canonical/EntityFilingForm';

const EDITABLE_STATUSES = new Set(['DRAFT', 'CORRECTION_REQUESTED']);

export default function EntityFilingWorkspace() {
  const { filingId } = useParams<{ filingId: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useEntityFilingDetail(filingId);
  const capabilities = useEntityCapabilities(data?.filing.entity_id);
  const { validateFiling, submitFiling, respondToRequest } = useEntityReturnsMutations();
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [validation, setValidation] = useState<{ errors: number; warnings: number; can_submit: boolean } | null>(null);

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
  const currentForms = data.forms.filter((f) => f.return_filing_version_id === currentVersionId);
  const historicVersions = data.versions.filter((v) => v.id !== currentVersionId);
  const openRequests = data.requests.filter((r) => r.status !== 'RESOLVED' && r.status !== 'CLOSED');

  const handleValidate = async () => {
    if (!currentVersionId) return;
    try {
      const res = await validateFiling.mutateAsync(currentVersionId);
      setValidation(res);
      toast.success(`${res.errors} error(s), ${res.warnings} warning(s)`);
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
    try {
      const res = await submitFiling.mutateAsync({ versionId: currentVersionId, declarationAccepted });
      toast.success('Filing submitted');
      setValidation(res.validation);
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
              <Button variant="outline" size="sm" onClick={handleValidate} disabled={validateFiling.isPending}>
                <ShieldCheck className="mr-1 h-4 w-4" />Validate
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitFiling.isPending || (data.definition.requires_declaration && !declarationAccepted)}
              >
                <Send className="mr-1 h-4 w-4" />Submit
              </Button>
            </div>
          ) : undefined}
        />

        {capabilities.isViewer && (
          <p className="text-sm text-muted-foreground">You have read-only access to this filing.</p>
        )}

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
          </CardContent>
        </Card>

        {validation && (
          <Card>
            <CardHeader><CardTitle className="text-base">Validation result</CardTitle></CardHeader>
            <CardContent className="text-sm">
              {validation.errors} blocking error(s), {validation.warnings} warning(s) — {validation.can_submit ? 'ready to submit' : 'not yet ready to submit'}.
            </CardContent>
          </Card>
        )}

        {data.findings.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Validation findings</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Severity</TableHead><TableHead>Message</TableHead><TableHead>Blocking</TableHead></TableRow></TableHeader>
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
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {currentForms.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No forms are pinned to this filing.</CardContent></Card>
          ) : currentForms.map((f) => (
            <EntityFilingForm
              key={f.id}
              editable={canEdit}
              requirement={{
                id: f.id,
                form_template_id: f.form_template_id,
                form_version_id: f.form_version_id,
                template_name: f.template_name,
                form_version: f.form_version,
                is_required: f.is_required,
                sequence: f.sequence,
                tab_name: f.tab_name,
                form_response_id: f.form_response_id,
                completion_status: f.completion_status,
              }}
            />
          ))}
        </div>

        {data.definition.requires_declaration && canEdit && (
          <Card>
            <CardHeader><CardTitle className="text-base">Declaration</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{data.definition.declaration_text}</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={declarationAccepted} onCheckedChange={(v) => setDeclarationAccepted(!!v)} />
                I confirm the above declaration on behalf of the entity.
              </label>
            </CardContent>
          </Card>
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
          <Button size="sm" disabled={text.trim().length < 10} onClick={() => onRespond(text.trim())}>Submit response</Button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Awaiting a response.</p>
      )}
    </div>
  );
}
