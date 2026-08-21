/**
 * P04 — standard case header for a licence.
 *
 * Every field comes from the `license_case` server read model.
 */
import { CaseHeader } from '@/components/cases/CaseHeader';
import { useLicenseCase, type LicenseCaseModel } from '@/hooks/useLicenseLifecycle';

const STAGE_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  ACTIVE_WITH_CONDITIONS: 'Active — conditions open',
  RENEWAL: 'Renewal in progress',
  RENEWAL_DUE: 'Renewal due',
  EXPIRY_REVIEW: 'Expiry review',
  SUSPENSION_REVIEW: 'Suspension review',
  REVOCATION_REVIEW: 'Revocation review',
  SURRENDER_REVIEW: 'Surrender review',
  VARIATION: 'Variation',
  SUSPENDED: 'Suspended',
  REVOKED: 'Revoked',
  SURRENDERED: 'Surrendered',
};

const WAITING_LABELS: Record<string, string> = {
  entity: 'Licensee',
  regulator: 'Regulator',
  third_party: 'Third party',
  system: 'System',
};

interface Props {
  licenseId: string;
  audience?: 'internal' | 'external';
  caseModel?: LicenseCaseModel | null;
}

export function LicenseCaseHeader({ licenseId, audience = 'internal', caseModel }: Props) {
  const { data } = useLicenseCase(caseModel ? null : licenseId, audience);
  const model = caseModel ?? data;
  if (!model?.header) return null;
  const h = model.header;

  return (
    <CaseHeader
      reference={h.reference}
      subject={h.subject}
      subjectHref={h.entity_id ? `/entities/${h.entity_id}` : null}
      caseType={h.case_type}
      stageLabel={STAGE_LABELS[h.stage] ?? h.stage}
      statusLabel={h.status}
      ownerName={h.owner_name ?? null}
      team={h.team}
      priority={h.priority}
      slaDueAt={h.sla_due_at}
      slaState={h.sla_state}
      waitingOn={WAITING_LABELS[h.waiting_on] ?? h.waiting_on}
      nextActionLabel={h.next_action?.label ?? null}
      blockers={(h.blockers ?? []).map((b) => ({ code: b.key, label: b.label, href: b.href }))}
      lastActivityAt={h.last_activity_at}
    />
  );
}

export default LicenseCaseHeader;
