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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Gavel } from 'lucide-react';
import { SufficiencyPanel } from '@/components/applications/SufficiencyPanel';
import { DecisionGatesPanel } from '@/components/applications/DecisionGatesPanel';

import { TwinPeaksPanel } from '@/components/applications/TwinPeaksPanel';
import { ApplicationAiAssessmentPanel } from '@/components/applications/ApplicationAiAssessmentPanel';
import { DecisionReadySummary } from '@/components/applications/DecisionReadySummary';
import { ConsolidatedCaseTab } from '@/components/applications/ConsolidatedCaseTab';
import { DecisionDocumentPreview } from '@/components/applications/DecisionDocumentPreview';
import { APPLICATION_STATUS_LABELS } from '@/types/platform';

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

const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value}</p>
    </div>
  );
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
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Gavel className="h-4 w-4 text-primary" />
                Consolidated Decision View
              </CardTitle>
              <CardDescription>
                Everything required to determine this application — readiness, gates, exposure and the documents
                that will be issued.
              </CardDescription>
            </div>
            <Badge variant="outline">
              {APPLICATION_STATUS_LABELS[application?.status as keyof typeof APPLICATION_STATUS_LABELS] ??
                application?.status ??
                '—'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Fact label="Application" value={application?.application_number ?? '—'} />
            <Fact label="Applicant" value={resolvedName || '—'} />
            <Fact label="Licence type" value={application?.license_type ?? '—'} />
            <Fact label="Submitted" value={fmtDate(application?.submitted_at)} />
          </div>
          <Separator className="my-4" />
          <p className="text-xs text-muted-foreground">
            Sections below are read-only decision support. The determination is recorded in the decision actions at
            the end of this view.
          </p>
        </CardContent>
      </Card>

      {/* 1 — Gates */}
      <DecisionGatesPanel applicationId={application.id} />
      <SufficiencyPanel applicationId={application.id} />
      <TwinPeaksPanel applicationId={application.id} />


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
      <ConsolidatedCaseTab applicationId={application.id} applicantId={application.applicant_id} />

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
