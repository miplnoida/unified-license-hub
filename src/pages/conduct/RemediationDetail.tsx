/**
 * P08.13–P08.16 — Remediation requirement case workspace.
 *
 * The whole page is driven by `conduct_action_case`: header contract, evidence,
 * review outcome and the server-declared available actions. Every state change
 * goes through `conduct_action_step`, which enforces that evidence is submitted
 * and reviewed before a requirement can be recorded as satisfied.
 */
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CaseHeader } from '@/components/cases/CaseHeader';
import { GovernedStepPanel } from '@/components/conduct/GovernedStepPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useRemediationCase, useRemediationStep } from '@/hooks/useConductRegisters';
import { formatDateOnly as formatDate, formatDateTime } from '@/lib/datetime';

export default function RemediationDetail() {
  const { id = '' } = useParams();
  const { data: model, isLoading, error } = useRemediationCase(id);
  const step = useRemediationStep(id);

  if (isLoading) {
    return <DashboardLayout><div className="p-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div></DashboardLayout>;
  }
  if (error || !model) {
    return (
      <DashboardLayout>
        <div className="p-10 text-center text-sm text-muted-foreground">
          {(error as Error)?.message || 'Remediation requirement not found.'}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <CaseHeader
          reference={model.action_reference}
          subject={model.title ?? 'Remediation requirement'}
          subjectHref={model.entity_href}
          caseType="Remediation"
          stageLabel={model.stage_label}
          statusLabel={model.stage_label}
          ownerName={model.assigned_to_name}
          team={model.assigned_team}
          priority={model.is_overdue ? 'high' : 'medium'}
          slaDueAt={model.sla_due_at}
          slaState={model.sla_state}
          waitingOn={model.waiting_on}
          nextActionLabel={model.next_action_label}
          lastActivityAt={model.last_activity_at}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <GovernedStepPanel
              stageLabel={model.stage_label}
              waitingOn={model.waiting_on}
              actions={model.available_actions ?? []}
              isTerminal={model.is_terminal}
              terminalMessage="This requirement is closed. Its outcome and rationale are recorded below."
              pending={step.isPending}
              facts={[
                { label: 'Evidence', value: `${model.evidence_count} item(s) · ${model.evidence_status}` },
                { label: 'Due', value: model.due_date ? formatDate(model.due_date) : 'No due date' },
              ]}
              onSubmit={(actionCode, payload) => step.mutateAsync({ actionCode, payload })}
            />

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Requirement</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <Detail label="Description" value={model.description} />
                <Detail label="Remediation submitted" value={model.evidence_summary} />
                <Detail label="Review outcome" value={model.review_outcome?.replace(/_/g, ' ')} />
                <Detail label="Outcome" value={model.outcome} />
                <Detail label="Review notes" value={model.completion_notes} />
                <Detail label="Returned because" value={model.return_reason} />
                <Detail label="Escalation rationale" value={model.escalation_reason} />
                <Detail label="Waiver rationale" value={model.waiver_reason} />
                <Detail label="Cancellation rationale" value={model.cancellation_reason} />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Provenance</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Source</p>
                  {model.source_href ? (
                    <Link to={model.source_href} className="text-primary hover:underline">
                      {model.source_reference || (model.source_type ?? '').replace(/_/g, ' ')}
                    </Link>
                  ) : (
                    <p className="font-medium">{(model.source_type ?? 'Not recorded').replace(/_/g, ' ')}</p>
                  )}
                </div>
                {model.finding_id ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Finding</p>
                    <Link to={`/conduct/findings/${model.finding_id}`} className="text-primary hover:underline">
                      {model.finding_reference}
                    </Link>
                  </div>
                ) : null}
                <div>
                  <p className="text-xs text-muted-foreground">Entity</p>
                  {model.entity_href ? (
                    <Link to={model.entity_href} className="text-primary hover:underline">{model.entity_name}</Link>
                  ) : <p className="font-medium">{model.entity_name ?? '—'}</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Issued</p>
                  <p className="font-medium">{model.created_at ? formatDateTime(model.created_at) : '—'}</p>
                </div>
                {model.closed_at ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Closed</p>
                    <p className="font-medium">{formatDateTime(model.closed_at)}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Evidence</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(model.evidence ?? []).length === 0 ? (
                  <p className="text-muted-foreground">No evidence has been filed against this requirement.</p>
                ) : model.evidence.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-2 border-b pb-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{e.title ?? 'Evidence item'}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.evidence_type ?? 'document'} · {e.uploaded_at ? formatDateTime(e.uploaded_at) : '—'}
                      </p>
                    </div>
                    {e.restricted ? <Badge variant="secondary" className="text-[10px]">Restricted</Badge> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}
