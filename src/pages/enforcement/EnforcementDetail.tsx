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
