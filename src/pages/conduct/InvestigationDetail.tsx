/**
 * P08 — Conduct investigation case workspace.
 *
 * The header, stage, service level, waiting-on, blockers and every permitted
 * next step come from the canonical `conduct_investigation_case` read model.
 * Free status editing has been retired: `InvestigationCurrentStepPanel` is the
 * only lifecycle controller, and closure runs through the closure gate.
 */
import { useParams, Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useInvestigation } from '@/hooks/useMarketConduct';
import { useConductInvestigationCase } from '@/hooks/useConductProcess';
import { CaseHeader } from '@/components/cases/CaseHeader';
import { InvestigationCurrentStepPanel } from '@/components/conduct/InvestigationCurrentStepPanel';
import { EvidenceRepositoryPanel } from '@/components/conduct/EvidenceRepositoryPanel';
import { InterviewsPanel } from '@/components/conduct/InterviewsPanel';
import { ClosurePanel } from '@/components/conduct/ClosurePanel';
import { InvestigationCaseFilePanel } from '@/components/conduct/InvestigationCaseFilePanel';
import { CommunicationTimeline } from '@/components/notifications/CommunicationTimeline';
import { CaseThreadsPanel } from '@/components/correspondence/CaseThreadsPanel';
import { ConductRelatedCasesPanel } from '@/components/conduct/ConductRelatedCasesPanel';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { formatDateTime } from '@/lib/datetime';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function InvestigationDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, refetch } = useInvestigation(id);
  const { data: model } = useConductInvestigationCase(id);

  if (isLoading || !data) {
    return <DashboardLayout><div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div></DashboardLayout>;
  }

  const concluded = model?.is_terminal ?? ['closed', 'discontinued'].includes(data.status);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <CaseHeader
          reference={model?.reference ?? data.code ?? data.id.slice(0, 8)}
          subject={model?.subject ?? data.allegation.slice(0, 120)}
          subjectHref={model?.entity_href ?? undefined}
          caseType="Conduct investigation"
          stageLabel={model?.stage_label ?? data.status}
          statusLabel={model?.status ?? data.status}
          ownerName={model?.assigned_to_name ?? null}
          team={model?.entity_name ?? data.licensees?.name ?? null}
          priority={model?.priority ?? data.priority}
          slaDueAt={model?.sla_due_at ?? null}
          slaState={model?.sla_state ?? null}
          waitingOn={model?.waiting_on ?? null}
          lastActivityAt={model?.last_activity_at ?? null}
          blockers={model?.blockers?.map((b) => ({ code: b.code, label: b.label })) ?? []}
          actions={
            <div className="flex gap-2">
              <HistoryButton entityType="conduct_investigation" entityId={data.id} title="Investigation history" />
              <Button data-rbac="market_conduct.manage_complaints" variant="ghost" asChild>
                <Link to="/conduct/work-queue"><ArrowLeft className="mr-1 h-4 w-4" />Work queue</Link>
              </Button>
            </div>
          }
        />

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Case scope</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Source:</span> {data.source_type}</div>
              <div><span className="text-muted-foreground">Severity:</span> <span className="capitalize">{model?.severity ?? data.severity}</span></div>
              <div><span className="text-muted-foreground">Target completion:</span> {model?.due_date ?? data.due_date ?? '—'}</div>
              <div><span className="text-muted-foreground">Allegation:</span><br />{data.allegation}</div>
              <div><span className="text-muted-foreground">Scope:</span><br />{model?.scope ?? data.scope ?? '—'}</div>
              <div><span className="text-muted-foreground">Legal basis:</span><br />{model?.legal_basis ?? data.legal_basis ?? '—'}</div>
              {(data as any).discontinuation_ground && (
                <div><span className="text-muted-foreground">Discontinuation ground:</span> {(data as any).discontinuation_ground.replace(/_/g, ' ')}</div>
              )}
              {(model?.outcome ?? data.outcome) && (
                <div><span className="text-muted-foreground">Proposed outcome:</span><br />{model?.outcome ?? data.outcome}</div>
              )}
            </CardContent>
          </Card>
          {model ? <InvestigationCurrentStepPanel model={model} /> : (
            <Card><CardContent className="py-8 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></CardContent></Card>
          )}
        </div>


        {data.source_type === 'surveillance_signal' && data.metadata?.signal_id && (
          <Card>
            <CardHeader><CardTitle className="text-base">Surveillance provenance</CardTitle></CardHeader>
            <CardContent className="grid gap-2 text-sm md:grid-cols-2">
              <div><span className="text-muted-foreground">Signal kind:</span> {String(data.metadata.signal_kind || '—').replace(/_/g, ' ')}</div>
              <div><span className="text-muted-foreground">Rule version:</span> {data.metadata.signal_rule_version ?? '—'}</div>
              <div><span className="text-muted-foreground">Threshold:</span> {data.metadata.signal_threshold ?? '—'}</div>
              <div>
                <span className="text-muted-foreground">Observation window:</span>{' '}
                {data.metadata.signal_observation_start
                  ? `${new Date(data.metadata.signal_observation_start).toLocaleDateString()} → ${
                      data.metadata.signal_observation_end
                        ? new Date(data.metadata.signal_observation_end).toLocaleDateString()
                        : 'open'
                    }`
                  : '—'}
              </div>
              <div className="md:col-span-2"><span className="text-muted-foreground">Signal explanation:</span> {data.metadata.signal_explanation || '—'}</div>
              <div className="md:col-span-2"><span className="text-muted-foreground">Referral reason:</span> {data.metadata.referral_reason || '—'}</div>
              <div className="md:col-span-2">
                <Link className="text-primary hover:underline text-sm" to="/conduct/surveillance">Open Market Surveillance workspace</Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="evidence">
          <TabsList>
            <TabsTrigger value="casefile">Case file</TabsTrigger>
            <TabsTrigger value="evidence">Evidence</TabsTrigger>
            <TabsTrigger value="interviews">Interviews</TabsTrigger>
            <TabsTrigger value="closure">Closure</TabsTrigger>
            <TabsTrigger value="timeline">Case timeline</TabsTrigger>
            <TabsTrigger value="related">Related cases</TabsTrigger>
            <TabsTrigger value="communications">Correspondence</TabsTrigger>
          </TabsList>
          <TabsContent value="casefile">
            <InvestigationCaseFilePanel investigation={data as any} locked={concluded} onSaved={refetch} />
          </TabsContent>
          <TabsContent value="evidence"><EvidenceRepositoryPanel investigationId={data.id} entityId={data.licensee_id || undefined} /></TabsContent>
          <TabsContent value="interviews"><InterviewsPanel investigationId={data.id} entityId={data.licensee_id || undefined} /></TabsContent>
          <TabsContent value="closure"><ClosurePanel investigationId={data.id} investigation={data} /></TabsContent>
          <TabsContent value="timeline">
            <Card>
              <CardHeader><CardTitle className="text-base">Case timeline</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {(model?.timeline ?? []).length === 0 ? (
                  <p className="text-muted-foreground">No recorded case events yet.</p>
                ) : (model?.timeline ?? []).map((t, i) => (
                  <div key={`${t.code}-${i}`} className="flex items-start gap-3 border-b pb-2 last:border-0">
                    <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">
                      {t.at ? formatDateTime(t.at) : '—'}
                    </span>
                    <span>{t.label}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="related">
            <ConductRelatedCasesPanel caseType="conduct_investigation" caseId={data.id} />
          </TabsContent>
          <TabsContent value="communications" className="space-y-4">
            <CaseThreadsPanel
              sourceType="conduct_investigation"
              sourceId={data.id}
              sourceReference={model?.reference ?? data.code ?? null}
              licenseeId={data.licensee_id ?? null}
              title="Correspondence on this investigation"
            />
            <CommunicationTimeline objectType="conduct_investigation" objectId={data.id} title="Emails and text messages sent" />
          </TabsContent>
        </Tabs>



      </div>
    </DashboardLayout>
  );
}
