import { toast } from 'sonner';

/** Sentinel values — shadcn Select cannot hold an empty string. */
export const NONE = 'none';
export const ANY = 'any';

export const TEAM_ROLES = [
  { value: 'lead', label: 'Lead' },
  { value: 'deputy', label: 'Deputy' },
  { value: 'member', label: 'Member' },
  { value: 'observer', label: 'Observer' },
];

export const errText = (e: unknown) =>
  ((e as any)?.message || String(e)).replace(/^(BAD_INPUT|FORBIDDEN|UNAUTHORIZED|NOT_FOUND):\s*/, '');

/** Run a governed mutation and surface a plain-language result. */
export const act = async (fn: () => Promise<unknown>, ok: string) => {
  try {
    await fn();
    toast.success(ok);
    return true;
  } catch (e) {
    toast.error(errText(e));
    return false;
  }
};

/**
 * Plain-language wording for the backend coverage-warning codes. The technical
 * code stays available for the secondary details area — it is never the primary
 * label an administrator reads.
 */
const WARNING_COPY: Record<string, { title: string; action?: string }> = {
  ENTITY_WITHOUT_PRIMARY_SUPERVISOR: { title: 'No supervisor has been assigned to this entity.', action: 'entity' },
  TEAM_WITHOUT_LEAD: { title: 'This organisational unit has no lead.', action: 'team' },
  EXPIRED_TEAM_MEMBERSHIP: { title: 'A unit membership has passed its end date.', action: 'team' },
  EXPIRED_ASSIGNMENT: { title: 'An entity assignment has passed its end date.', action: 'entity' },
  SINGLE_PERSON_FUNCTION: { title: 'Only one person covers this area of work.', action: 'coverage' },
  NO_BACKUP_AVAILABLE: { title: 'There is no backup for this area of work.', action: 'coverage' },
  NO_ELIGIBLE_ALTERNATE: { title: 'No alternate supervisor is available.', action: 'entity' },
  NO_INDEPENDENT_CHECKER_AVAILABLE: { title: 'No independent reviewer is available.', action: 'coverage' },
  PANEL_BELOW_QUORUM: { title: 'This panel cannot sit — it is below quorum.', action: 'panel' },
  COMMITTEE_BELOW_QUORUM: { title: 'This committee cannot sit — it is below quorum.', action: 'panel' },
  PORTFOLIO_CONFIGURATION_REQUIRED: { title: 'No staff coverage has been assigned.', action: 'coverage' },
  MANDATE_COVERAGE_INCOMPLETE: { title: 'Some areas of work have no responsible unit.', action: 'coverage' },
};

export type WarningAction = 'coverage' | 'team' | 'entity' | 'panel' | 'people';

export function humaniseWarning(code: string): { title: string; action: WarningAction } {
  const hit = WARNING_COPY[code];
  return {
    title: hit?.title || code.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()) + '.',
    action: (hit?.action as WarningAction) || 'coverage',
  };
}

export const ACTION_LABEL: Record<WarningAction, string> = {
  coverage: 'View coverage',
  team: 'Open organisational units',
  entity: 'Open entity ownership',
  panel: 'Open panel',
  people: 'Assign responsibility',
};

/** Human date, no timestamps in normal administration UI. */
export const shortDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : null;

export const effectiveRange = (from: string | null | undefined, to: string | null | undefined) =>
  `${shortDate(from) || '—'} → ${shortDate(to) || 'No end date'}`;
