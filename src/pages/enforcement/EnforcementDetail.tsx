// EnforcementDetail — presentation only.
//
// All lifecycle mutations (issue notice, record response, decide, appeal,
// record payment, close, withdraw) run exclusively through
// `execute_complaint_workflow_action` via <WorkflowActionPanel>. This page
// never writes to `enforcement_actions` or `enforcement_case_events`, never
// dispatches notifications directly, and never gates action visibility by
// hardcoded status strings — the workflow config decides everything.

import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { ENFORCEMENT_STATUS_META } from './EnforcementList';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { DecisionGatesBanner } from '@/components/decision-gates/DecisionGatesBanner';
import { WorkflowActionPanel } from '@/components/complaints/WorkflowActionPanel';
import { ComplaintTrackingTimeline } from '@/components/complaints/ComplaintTrackingTimeline';
import { EnforcementLifecyclePanel } from '@/components/enforcement/EnforcementLifecyclePanel';
import { EnforcementObligationsPanel } from '@/components/enforcement/EnforcementObligationsPanel';
import { CommunicationTimeline } from '@/components/notifications/CommunicationTimeline';
import { SupervisoryAiPanel } from '@/components/ai/SupervisoryAiPanel';
import { AiReportsTab } from '@/components/ai/report/AiReportsTab';


export default function EnforcementDetail() {
  const { id } = useParams<{ id: string }>();

  const { data: caseRow, isLoading } = useQuery({
    queryKey: ['enforcement_case', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('enforcement_actions').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: licensee } = useQuery({
    queryKey: ['enforcement_case_licensee', caseRow?.entity_id],
    enabled: !!caseRow?.entity_id,
    queryFn: async () => {
      const { data } = await supabase.from('licensees').select('id, name').eq('id', caseRow!.entity_id).maybeSingle();
      return data;
    },
  });

  // Enforcement lifecycle is anchored to the linked complaint's workflow.
  const { data: linkedComplaint } = useQuery({
    queryKey: ['enforcement_case_linked_complaint', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await supabase
        .from('complaints')
        .select('id, complaint_number, updated_at')
        .eq('enforcement_action_id', id!)
        .maybeSingle();
      return data as any;
    },
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Loading…
        </div>
      </DashboardLayout>
    );
  }
  if (!caseRow) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Case not found or access denied.</div>
      </DashboardLayout>
    );
  }

  const meta = ENFORCEMENT_STATUS_META[caseRow.status] || ENFORCEMENT_STATUS_META.opened;
  // Marker of the case as displayed — used only for advisory-analysis staleness.
  const aiStaleness = {
    status: caseRow.status,
    updated_at: caseRow.updated_at ?? null,
    decision_at: caseRow.decision_at ?? null,
    notice_issued_at: caseRow.notice_issued_at ?? null,
  };
  const currency = caseRow.penalty_currency || 'USD';

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={`Case ${caseRow.case_number}`}
          description={`${caseRow.enforcement_type} · ${licensee?.name || 'Licensee'}`}
          backHref="/enforcement"
          backLabel="Queue"
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={meta.className}>{meta.label}</Badge>
              <HistoryButton entityType="enforcement_action" entityId={caseRow.id} title={`History — ${caseRow.case_number}`} />
            </div>
          }
        />

        <DecisionGatesBanner subjectType="enforcement_action" subjectId={caseRow.id} compact />

        <Card>
          <CardContent className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><div className="text-xs text-muted-foreground">Licensee</div><div>{licensee ? <Link to={`/admin/licensees/${licensee.id}`} className="underline">{licensee.name}</Link> : '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Opened</div><div>{caseRow.date_opened || '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Notice issued</div><div>{caseRow.notice_issued_at ? new Date(caseRow.notice_issued_at).toLocaleDateString() : '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Decision</div><div>{caseRow.decision_outcome || '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Penalty</div><div>{caseRow.penalty_amount != null ? `${currency} ${Number(caseRow.penalty_amount).toLocaleString()}` : '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Collected</div><div className="text-green-700">{caseRow.penalty_paid_amount ? `${currency} ${Number(caseRow.penalty_paid_amount).toLocaleString()}` : '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Appeal deadline</div><div>{caseRow.appeal_deadline || '—'}</div></div>
            <div><div className="text-xs text-muted-foreground">Closed</div><div>{caseRow.closed_at ? new Date(caseRow.closed_at).toLocaleDateString() : '—'}</div></div>
          </CardContent>
        </Card>

        {caseRow.description && (
          <Card><CardContent className="p-4 text-sm"><div className="text-xs text-muted-foreground mb-1">Description</div>{caseRow.description}</CardContent></Card>
        )}

        {/* Advisory AI — interpretation, drafting help and factor observations.
            No decision, sanction, notice or workflow step is created here. */}
        <AiReportsTab
          description="Every AI-assisted analysis available for this case, in one place. These reports interpret the recorded case information — they change no status, outcome, penalty or notice."
          blocks={[
            {
              id: 'ai-case-chronology',
              label: 'Case chronology and summary',
              hint: 'built from recorded case events',
              node: (
                <SupervisoryAiPanel
                  module="enforcement"
                  analysisType="case_chronology"
                  scopeId={caseRow.id}
                  label={`Case ${caseRow.case_number}`}
                  title="AI case chronology and summary"
                  actionLabel="Summarise case"
                  description="Chronology and summary built from the recorded case events. It does not change the case status, outcome or penalty."
                  stalenessFacts={aiStaleness}
                />
              ),
            },
            {
              id: 'ai-evidence',
              label: 'Evidence completeness observations',
              hint: 'what the record supports and where it looks incomplete',
              node: (
                <SupervisoryAiPanel
                  module="enforcement"
                  analysisType="evidence_assessment"
                  scopeId={caseRow.id}
                  label={`Case ${caseRow.case_number}`}
                  title="AI evidence completeness observations"
                  actionLabel="Review evidence"
                  description="Observations on what the recorded evidence supports and where it looks incomplete. It never concludes that a breach is established."
                  stalenessFacts={aiStaleness}
                />
              ),
            },
            {
              id: 'ai-sanction-factors',
              label: 'Aggravating and mitigating factors',
              hint: 'factors visible in the record for the decision maker',
              node: (
                <SupervisoryAiPanel
                  module="enforcement"
                  analysisType="sanction_factors"
                  scopeId={caseRow.id}
                  label={`Case ${caseRow.case_number}`}
                  title="AI aggravating and mitigating factors observed"
                  actionLabel="List factors"
                  description="Factors visible in the record for the decision maker to weigh. No sanction, amount or outcome is proposed."
                  stalenessFacts={aiStaleness}
                />
              ),
            },
            {
              id: 'ai-precedents',
              label: 'Comparison with recorded past actions',
              hint: 'consistency remains a human judgement',
              node: (
                <SupervisoryAiPanel
                  module="enforcement"
                  analysisType="precedent_comparison"
                  scopeId={caseRow.id}
                  label={`Case ${caseRow.case_number}`}
                  title="AI comparison with recorded past actions"
                  actionLabel="Compare with past cases"
                  description="Comparison against past actions already recorded in the register. Consistency remains a human judgement."
                  stalenessFacts={aiStaleness}
                />
              ),
            },
            {
              id: 'ai-draft-notice',
              label: 'Draft notice text',
              hint: 'suggested wording only, not saved to the case',
              node: (
                <SupervisoryAiPanel
                  module="enforcement"
                  analysisType="enforcement_draft"
                  scopeId={caseRow.id}
                  label={`Case ${caseRow.case_number}`}
                  title="AI draft notice text"
                  actionLabel="Draft notice text"
                  description="Suggested wording only, not saved to the case. Issuance, approval and legal review stay in the existing process."
                  stalenessFacts={aiStaleness}
                />
              ),
            },
          ]}
        />


        <EnforcementLifecyclePanel caseRow={caseRow} />
        <EnforcementObligationsPanel caseId={caseRow.id} />

        {linkedComplaint?.id ? (

          <WorkflowActionPanel
            complaintId={linkedComplaint.id}
            instanceUpdatedAt={linkedComplaint.updated_at ?? null}
          />
        ) : (
          <Card>
            <CardHeader><CardTitle className="text-base">Lifecycle actions</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              This enforcement case has no linked complaint. Lifecycle actions are driven by the Complaint
              Management Workflow — link a complaint to enable them.
            </CardContent>
          </Card>
        )}

        <CommunicationTimeline objectType="enforcement_action" objectId={caseRow.id} />

        {linkedComplaint?.id && (
          <ComplaintTrackingTimeline
            complaintId={linkedComplaint.id}
            enforcementId={caseRow.id}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
