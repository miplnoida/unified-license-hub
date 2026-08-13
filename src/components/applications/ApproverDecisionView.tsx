/**
 * Approver — Consolidated Decision View
 *
 * Single decision-ready screen for approvers. Composes the existing read-only
 * decision-support panels in decision order and ends with the decision letter /
 * certificate preview and the decision actions, so an approver never has to
 * hunt across tabs to determine an application.
 *
 * Purely a composition + presentation layer: every panel keeps its own data
 * loading and business rules.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SufficiencyPanel } from '@/components/applications/SufficiencyPanel';
import { DecisionGatesPanel } from '@/components/applications/DecisionGatesPanel';
// Twin Peaks clearance is currently hidden from the Decision tab (kept for future use):
// import { TwinPeaksPanel } from '@/components/applications/TwinPeaksPanel';
import { ApplicationAiAssessmentPanel } from '@/components/applications/ApplicationAiAssessmentPanel';
import { DecisionReadySummary } from '@/components/applications/DecisionReadySummary';
import { ConsolidatedCaseTab } from '@/components/applications/ConsolidatedCaseTab';
import { DecisionDocumentPreview } from '@/components/applications/DecisionDocumentPreview';

interface TimelineEvent {
  id: string;
  action: string;
  status: string;
  comments: string | null;
  actor_id: string;
  created_at: string;
  actor_email?: string;
}

interface Props {
  application: any;
  events: TimelineEvent[];
  templateNames: Record<string, string>;
  paymentComplete: boolean;
  applicantName: string;
  currentUserId?: string | null;
  onJumpToFormsTab?: () => void;
  /** Decision actions (workflow panel or manual decision actions) rendered last. */
  actions?: ReactNode;
}


export function ApproverDecisionView({
  application,
  events,
  templateNames,
  paymentComplete,
  applicantName,
  currentUserId,
  onJumpToFormsTab,
  actions,
}: Props) {
  // Fall back to resolving the applicant's name from their account when the
  // application payload does not carry one.
  const [resolvedName, setResolvedName] = useState(applicantName);
  useEffect(() => {
    setResolvedName(applicantName);
    const applicantId = application?.applicant_id as string | undefined;
    if (applicantName || !applicantId) return;
    let alive = true;
    (async () => {
      const [{ data: profile }, { data: preUser }] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', applicantId).maybeSingle(),
        supabase.from('pre_license_users').select('full_name, email').eq('id', applicantId).maybeSingle(),
      ]);
      const name =
        (profile as any)?.full_name || (preUser as any)?.full_name ||
        (profile as any)?.email || (preUser as any)?.email || '';
      if (alive && name) setResolvedName(name);
    })();
    return () => { alive = false; };
  }, [applicantName, application?.applicant_id]);

  return (
    <div className="space-y-4">
      {/* 1 — Gates */}
      <DecisionGatesPanel applicationId={application.id} />
      <SufficiencyPanel applicationId={application.id} />
      {/* Twin Peaks clearance hidden for now (component retained for future use):
      <TwinPeaksPanel applicationId={application.id} /> */}



      {/* 2 — Advisory AI assessment */}
      {currentUserId && (
        <ApplicationAiAssessmentPanel applicationId={application.id} currentUserId={currentUserId} />
      )}

      {/* 3 — Readiness summary */}
      <DecisionReadySummary
        application={application}
        events={events}
        templateNames={templateNames}
        paymentComplete={paymentComplete}
        onJumpToFormsTab={onJumpToFormsTab}
      />

      {/* 4 — Wider exposure for the same applicant */}
      <ConsolidatedCaseTab
        applicationId={application.id}
        applicantId={application.applicant_id}
        hiddenSections={['other_applications', 'licenses']}
      />

      {/* 5 — Documents that will be issued */}
      <DecisionDocumentPreview
        applicationId={application.id}
        applicationNumber={application.application_number ?? ''}
        applicantName={resolvedName}
        licenseType={application.license_type ?? ''}
        submittedAt={application.submitted_at ?? null}
        defaultRationale={application.decision_rationale ?? ''}
        applicationStatus={(application as any).status ?? null}
        sectorId={(application as any).sector_id ?? null}
        subSectorId={(application as any).sub_sector_id ?? null}
        categoryId={(application as any).category_id ?? null}

      />

      {/* 6 — Decision actions */}
      {actions}
    </div>
  );
}

export default ApproverDecisionView;
