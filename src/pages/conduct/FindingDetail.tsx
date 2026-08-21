/**
 * P08.9–P08.11 — Conduct finding case workspace.
 *
 * Reads `conduct_finding_case` and advances only through `conduct_finding_step`,
 * so confirmation, dismissal, remediation and enforcement referral are all
 * governed and audited server-side.
 */
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CaseHeader } from '@/components/cases/CaseHeader';
import { GovernedStepPanel } from '@/components/conduct/GovernedStepPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { useFindingCase, useFindingStep } from '@/hooks/useConductRegisters';
import { formatDate, formatDateTime } from '@/lib/datetime';

export default function FindingDetail() {
  const { id = '' } = useParams();
  const { data, isLoading, error } = useFindingCase(id);
  const step = useFindingStep(id);
  const model = data as Record<string, any> | undefined;

  if (isLoading) {
    return <DashboardLayout><div className="p-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></div></DashboardLayout>;
  }
  if (error || !model) {
    return (
      <DashboardLayout>
        <div className="p-10 text-center text-sm text-muted-foreground">
          {(error as Error)?.message || 'Finding not found.'}
        </div>
      </DashboardLayout>
    );
  }

  const remediation: Array<Record<string, any>> = model.remediation ?? [];
  const evidence: Array<Record<string, any>> = model.evidence ?? [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <CaseHeader
          reference={model.finding_reference}
          subject={model.title ?? 'Conduct finding'}
          subjectHref={model.entity_href}
          caseType="Conduct finding"
          stageLabel={String(model.status ?? '').replace(/_/g, ' ')}
          statusLabel={String(model.status ?? '').replace(/_/g, ' ')}
          ownerName={model.owner_name}
          team={model.owner_team}
          priority={model.severity}
          slaState={model.status === 'closed' ? 'paused' : 'on_track'}
          waitingOn={model.status === 'awaiting_entity_response' ? 'Regulated entity' : 'Conduct officer'}
          lastActivityAt={model.updated_at ?? model.opened_at}
        />

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <GovernedStepPanel
              stageLabel={String(model.status ?? '').replace(/_/g, ' ')}
              actions={model.available_actions ?? []}
              isTerminal={model.status === 'closed' || model.status === 'dismissed'}
              terminalMessage="This finding is concluded. Its determination and rationale are recorded below."
              pending={step.isPending}
              facts={[
                { label: 'Evidence', value: `${evidence.length} item(s)` },
                { label: 'Remediation', value: `${remediation.length} requirement(s)` },
              ]}
              onSubmit={(actionCode, payload) => step.mutateAsync({ actionCode, payload })}
            />

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Finding</CardTitle></CardHeader>
              <CardContent className="space-y-4 text-sm">
                <Detail label="Description" value={model.description} />
                <Detail label="Legal / regulatory basis" value={model.legal_basis} />
                <Detail label="Category" value={model.category} />
                <Detail label="Risk rating" value={model.risk_rating} />
                <Detail label="Entity response" value={model.entity_response} />
                <Detail label="Dismissal reason" value={model.dismissal_reason} />
                <Detail label="Closure rationale" value={model.closure_rationale} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Remediation requirements</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {remediation.length === 0 ? (
                  <p className="text-muted-foreground">No remediation requirement has been issued from this finding.</p>
                ) : remediation.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
                    <Link to={`/conduct/actions/${r.id}`} className="min-w-0 truncate text-primary hover:underline">
                      {r.title}
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline" className="capitalize">{String(r.status ?? '').replace(/_/g, ' ')}</Badge>
                      <span className="text-xs text-muted-foreground">{r.due_date ? formatDate(r.due_date) : 'No date'}</span>
                    </div>
                  </div>
                ))}
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
                      {model.investigation_code || model.complaint_number || String(model.source_type ?? '').replace(/_/g, ' ')}
                    </Link>
                  ) : (
                    <p className="font-medium">{String(model.source_type ?? '—').replace(/_/g, ' ')}</p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entity</p>
                  {model.entity_href ? (
                    <Link to={model.entity_href} className="text-primary hover:underline">{model.entity_name}</Link>
                  ) : <p className="font-medium">{model.entity_name ?? '—'}</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Opened</p>
                  <p className="font-medium">{model.opened_at ? formatDateTime(model.opened_at) : '—'}</p>
                </div>
                {model.enforcement_referred_at ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Referred to enforcement</p>
                    <p className="font-medium">{formatDateTime(model.enforcement_referred_at)}</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Evidence</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {evidence.length === 0 ? (
                  <p className="text-muted-foreground">No evidence is linked to this finding.</p>
                ) : evidence.map((e) => (
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
