/**
 * EPR-05 — standard case header for a licensing application.
 *
 * All values come from `application_case` (server read model). The component
 * renders; it never computes stage, priority, SLA or eligibility.
 */
import { CaseHeader } from '@/components/cases/CaseHeader';
import { useApplicationCase, type ApplicationCaseModel } from '@/hooks/useApplicationCaseModels';

interface Props {
  applicationId: string;
  audience?: 'internal' | 'external';
  /** Called when the user asks to open the Current Step tab. */
  onOpenCurrentStep?: () => void;
  caseModel?: ApplicationCaseModel | null;
}

export function ApplicationCaseHeader({ applicationId, audience = 'internal', caseModel }: Props) {
  const { data } = useApplicationCase(caseModel ? null : applicationId, audience);
  const c = caseModel ?? data;
  if (!c) return null;

  return (
    <CaseHeader
      reference={c.reference}
      subject={c.entity_name || c.applicant_org || c.applicant_name || 'Applicant'}
      subjectHref={c.entity_href}
      caseType={c.license_type || undefined}
      stageLabel={c.stage_label}
      statusLabel={c.status_label}
      ownerName={c.owner_name ?? null}
      team={c.team ?? null}
      priority={c.priority ?? null}
      slaDueAt={c.sla_due_at ?? null}
      slaState={c.sla_state ?? null}
      waitingOn={c.waiting_on === 'entity' ? 'Applicant' : c.waiting_on ?? null}
      nextActionLabel={c.next_action?.label ?? null}
      blockers={(c.blockers ?? []).map((b) => ({
        code: b.code,
        label: b.label,
        href: b.href ? `${b.href}${b.href.includes('?') ? '&' : '?'}from=current` : undefined,
      }))}
      lastActivityAt={c.last_activity_at ?? null}
    />
  );
}

export default ApplicationCaseHeader;
