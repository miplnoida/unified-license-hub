/**
 * Seeded reviewer activity for the Collaborative Review panel.
 *
 * When a record has zero real comments/suggestions AND every narrative field is
 * empty, this module supplies realistic reviewer content so the panel reads as
 * fully populated. The signed-in user is always Reviewer 1 — the roster is
 * built around their real identity so filtering/highlighting keys off their id.
 *
 * The overlay is UI-only: it never touches the DB. Seeded objects use non-UUID
 * synthetic ids so the existing hook mutations refuse to touch them, and the
 * component gates action buttons on `isSyntheticId(...)`.
 */
import type { ReviewComment, ReviewSuggestion, CollabEntityType } from '@/hooks/useCollabReview';

export const SYNTHETIC_ID_PREFIX = 'seed-';
export const isSyntheticId = (id: string | undefined | null) =>
  !!id && id.startsWith(SYNTHETIC_ID_PREFIX);

export interface SeedReviewer {
  id: string;
  name: string;
  roleName: string;
  color: string;
  initials: string;
}

// Palette used both inline (InlineMarkup consumes color per author) and in
// the sidebar/legend. Chosen to be visually distinct at a glance.
const PALETTE = ['#6366F1', '#F59E0B', '#10B981', '#EC4899', '#8B5CF6', '#0EA5E9'];

// Deterministic pool of realistic colleagues. Reviewer 2 & 3 come from here,
// skipping any name that would collide with the current user.
const ROSTER_POOL: Omit<SeedReviewer, 'id' | 'color'>[] = [
  { name: 'Priya Menon',    roleName: 'Senior Examiner',     initials: 'PM' },
  { name: 'Marcus Wright',  roleName: 'Legal Counsel',       initials: 'MW' },
  { name: 'Aisha Rahman',   roleName: 'Head of Supervision', initials: 'AR' },
  { name: 'David Chen',     roleName: 'Compliance Officer',  initials: 'DC' },
  { name: 'Sofia Alvarez',  roleName: 'Risk Analyst',        initials: 'SA' },
];

function initialsOf(name: string): string {
  return (name || 'R')
    .split(/\s+/)
    .filter(Boolean)
    .map(s => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'R';
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export interface CurrentUserDescriptor {
  id: string;
  name: string;
  roleName: string;
}

function currentUserAsReviewer(u: CurrentUserDescriptor): SeedReviewer {
  return {
    id: u.id,
    name: u.name,
    roleName: u.roleName || 'Reviewer',
    color: PALETTE[hashStr(u.id) % PALETTE.length],
    initials: initialsOf(u.name),
  };
}

function pickColleagues(
  currentUser: SeedReviewer,
  recordId: string,
): [SeedReviewer, SeedReviewer] {
  const base = hashStr(recordId || 'default');
  const usedColors = new Set<string>([currentUser.color]);
  const usedNames = new Set<string>([currentUser.name.trim().toLowerCase()]);
  const picks: SeedReviewer[] = [];
  for (let i = 0; picks.length < 2 && i < ROSTER_POOL.length * 2; i++) {
    const cand = ROSTER_POOL[(base + i) % ROSTER_POOL.length];
    if (usedNames.has(cand.name.trim().toLowerCase())) continue;
    // Pick a color not yet used.
    let color = PALETTE[(base + i + 1) % PALETTE.length];
    let guard = 0;
    while (usedColors.has(color) && guard < PALETTE.length) {
      color = PALETTE[(hashStr(color) + 1) % PALETTE.length];
      guard++;
    }
    usedColors.add(color);
    usedNames.add(cand.name.trim().toLowerCase());
    picks.push({
      id: `${SYNTHETIC_ID_PREFIX}user-${picks.length + 1}-${(base + i).toString(36)}`,
      name: cand.name,
      roleName: cand.roleName,
      initials: cand.initials,
      color,
    });
  }
  // Should never happen given pool size, but guard anyway.
  while (picks.length < 2) {
    picks.push({
      id: `${SYNTHETIC_ID_PREFIX}user-x-${picks.length}`,
      name: 'Reviewer',
      roleName: 'Reviewer',
      initials: 'R',
      color: PALETTE[(picks.length + 3) % PALETTE.length],
    });
  }
  return [picks[0], picks[1]];
}

export interface SeedRoster {
  r1: SeedReviewer; // current user
  r2: SeedReviewer;
  r3: SeedReviewer;
}

export function buildSeedRoster(
  currentUser: CurrentUserDescriptor,
  recordId: string,
): SeedRoster {
  const r1 = currentUserAsReviewer(currentUser);
  const [r2, r3] = pickColleagues(r1, recordId);
  return { r1, r2, r3 };
}

interface FieldLike { key: string; label: string; value: string }

// Realistic reviewer prose keyed off the field label so anchored ranges make
// sense in every module.
export function narrativeFor(field: FieldLike, entityType: CollabEntityType): string {
  const label = (field.label || field.key || '').toLowerCase();

  if (/risk|assessment|analysis/.test(label)) {
    return (
      'The inherent risk profile of the entity is assessed as moderate, driven primarily by concentration in short-tenor '
      + 'wholesale funding and elevated exposure to a single counterparty group. Controls appear adequate in design but '
      + 'operating effectiveness could not be verified for the treasury reconciliation process. Management has committed '
      + 'to remediation within the next reporting cycle. Residual risk is judged acceptable pending independent validation.'
    );
  }
  if (/finding|observation|issue/.test(label)) {
    return (
      'During the on-site examination we identified three findings of moderate severity relating to KYC file completeness, '
      + 'board minute retention, and the timeliness of suspicious transaction reporting. Root cause analysis points to '
      + 'insufficient staffing in the compliance unit rather than deliberate non-adherence. Prior period observations have '
      + 'been substantially cleared, evidencing a positive supervisory trajectory.'
    );
  }
  if (/recommendation|conclusion|action/.test(label)) {
    return (
      'We recommend that the Board formally approve a revised Risk Appetite Statement within 60 days and that the CRO '
      + 'circulate a quarterly attestation to the supervisor. A follow-up thematic review should be scheduled for Q3 to '
      + 'confirm sustained remediation. No enforcement action is proposed at this time.'
    );
  }
  if (/complaint|conduct|consumer/.test(label)) {
    return (
      'The complainant alleges that a scheduled debit was processed after cancellation of the underlying mandate, resulting '
      + 'in a returned-payment fee. Review of the entity\u2019s response confirms the mandate cancellation was received but '
      + 'not actioned within the stated service window. The matter falls within the Market Conduct Code and warrants '
      + 'restitution plus a supervisory letter.'
    );
  }
  if (/financial|balance|capital|liquidity|prudent/.test(label)) {
    return (
      'Reported CET1 stands at 14.2% against a regulatory minimum of 10.5%, providing comfortable headroom. Liquidity '
      + 'coverage remains above 130% across the review window. Loan-loss provisioning appears conservative relative to '
      + 'peer institutions, though the stage-2 migration ratio has trended upward for two consecutive quarters and '
      + 'warrants closer monitoring.'
    );
  }
  if (/narrative|summary|justif|reason|rationale/.test(label)) {
    return (
      'The applicant has demonstrated a coherent business model with clearly identified target segments and a defensible '
      + 'competitive position. Governance arrangements are proportionate to the proposed scale of operations. Fit-and-proper '
      + 'assessments for the proposed directors have been completed with no adverse findings. The proposal is aligned with '
      + 'the regulator\u2019s licensing objectives.'
    );
  }

  const subject =
    entityType === 'return' ? 'return'
    : entityType === 'complaint' ? 'complaint'
    : entityType === 'registration' ? 'registration'
    : 'application';
  return (
    `This ${subject} has been reviewed against the applicable regulatory requirements and internal supervisory guidance. `
    + 'The information provided is broadly consistent with prior submissions and no material discrepancies were identified '
    + 'during the initial screening. Two minor clarifications are noted below and should be addressed before the next '
    + 'workflow step. Overall, the submission is of acceptable quality.'
  );
}

function findRange(text: string, needle: string): { start: number; end: number } | null {
  if (!needle) return null;
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return null;
  return { start: idx, end: idx + needle.length };
}

interface BuildInput {
  entityType: CollabEntityType;
  fields: FieldLike[];
  currentUser: CurrentUserDescriptor;
  recordId: string;
}

export interface SeedOverlay {
  active: boolean;
  fields: FieldLike[];
  comments: ReviewComment[];
  suggestions: ReviewSuggestion[];
  roster: SeedRoster | null;
}

export function buildSeedOverlay(
  input: BuildInput,
  hasRealActivity: boolean,
): SeedOverlay {
  const allEmpty = input.fields.every(f => !f.value || !f.value.trim());
  const active = !hasRealActivity && allEmpty && input.fields.length > 0;

  if (!active) {
    return { active: false, fields: input.fields, comments: [], suggestions: [], roster: null };
  }

  const roster = buildSeedRoster(input.currentUser, input.recordId);
  const { r1, r2, r3 } = roster;

  const now = new Date();
  const iso = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60_000).toISOString();

  const effectiveFields: FieldLike[] = input.fields.map(f =>
    f.value && f.value.trim() ? f : { ...f, value: narrativeFor(f, input.entityType) },
  );

  const comments: ReviewComment[] = [];
  const suggestions: ReviewSuggestion[] = [];

  effectiveFields.forEach((f, fi) => {
    const text = f.value;

    const anchorA =
      findRange(text, 'moderate') ||
      findRange(text, 'findings') ||
      findRange(text, 'recommend') ||
      findRange(text, 'complainant') ||
      findRange(text, 'CET1') ||
      findRange(text, 'applicant') ||
      { start: 0, end: Math.min(8, text.length) };

    const anchorB =
      findRange(text, 'remediation') ||
      findRange(text, 'compliance') ||
      findRange(text, 'attestation') ||
      findRange(text, 'restitution') ||
      findRange(text, 'liquidity') ||
      findRange(text, 'governance') ||
      { start: Math.max(0, text.length - 20), end: Math.max(0, text.length - 5) };

    const anchorC =
      findRange(text, 'quarterly') ||
      findRange(text, 'reporting') ||
      findRange(text, 'review') ||
      findRange(text, 'submission') ||
      { start: 0, end: Math.min(6, text.length) };

    const base = {
      entity_type: input.entityType,
      entity_id: input.recordId || 'seed-entity',
      workflow_instance_id: null,
      workflow_step_id: null,
      regulator_id: null,
    };

    // Pending replace by current user (R1).
    suggestions.push({
      ...base,
      id: `${SYNTHETIC_ID_PREFIX}sug-${fi}-1`,
      field_key: f.key,
      author_user_id: r1.id,
      author_role_id: null,
      type: 'replace',
      original_text: text.slice(anchorA.start, anchorA.end),
      suggested_text: 'materially elevated',
      selection_start: anchorA.start,
      selection_end: anchorA.end,
      status: 'pending',
      decided_by: null,
      decided_at: null,
      created_at: iso(45),
    });

    // Accepted insert by R2.
    suggestions.push({
      ...base,
      id: `${SYNTHETIC_ID_PREFIX}sug-${fi}-2`,
      field_key: f.key,
      author_user_id: r2.id,
      author_role_id: null,
      type: 'insert',
      original_text: null,
      suggested_text: ' (subject to Board ratification)',
      selection_start: anchorB.end,
      selection_end: anchorB.end,
      status: 'accepted',
      decided_by: r3.id,
      decided_at: iso(20),
      created_at: iso(90),
    });

    // Rejected delete by R3.
    suggestions.push({
      ...base,
      id: `${SYNTHETIC_ID_PREFIX}sug-${fi}-3`,
      field_key: f.key,
      author_user_id: r3.id,
      author_role_id: null,
      type: 'delete',
      original_text: text.slice(anchorC.start, anchorC.end),
      suggested_text: null,
      selection_start: anchorC.start,
      selection_end: anchorC.end,
      status: 'rejected',
      decided_by: r1.id,
      decided_at: iso(15),
      created_at: iso(120),
    });

    // Open blocking comment by R2, replied to by current user (R1).
    const blockingId = `${SYNTHETIC_ID_PREFIX}cmt-${fi}-1`;
    comments.push({
      ...base,
      id: blockingId,
      field_key: f.key,
      selection_start: anchorB.start,
      selection_end: anchorB.end,
      selection_text: text.slice(anchorB.start, anchorB.end),
      author_user_id: r2.id,
      author_role_id: null,
      body: 'Legal requires evidence of Board approval for this commitment before we can sign off. Please attach the resolution and cross-reference the minute number.',
      parent_comment_id: null,
      status: 'open',
      is_blocking: true,
      resolved_by: null,
      resolved_at: null,
      created_at: iso(60),
    });

    comments.push({
      ...base,
      id: `${SYNTHETIC_ID_PREFIX}cmt-${fi}-1r`,
      field_key: f.key,
      selection_start: null,
      selection_end: null,
      selection_text: null,
      author_user_id: r1.id,
      author_role_id: null,
      body: 'Noted \u2014 the resolution is dated 12 May; I\u2019ll attach the extract and tag it to this thread by end of day.',
      parent_comment_id: blockingId,
      status: 'open',
      is_blocking: false,
      resolved_by: null,
      resolved_at: null,
      created_at: iso(40),
    });

    // Open non-blocking comment by R3.
    comments.push({
      ...base,
      id: `${SYNTHETIC_ID_PREFIX}cmt-${fi}-2`,
      field_key: f.key,
      selection_start: anchorC.start,
      selection_end: anchorC.end,
      selection_text: text.slice(anchorC.start, anchorC.end),
      author_user_id: r3.id,
      author_role_id: null,
      body: 'Consider tightening this phrasing so it aligns with the language used in the supervisory manual. Not a blocker.',
      parent_comment_id: null,
      status: 'open',
      is_blocking: false,
      resolved_by: null,
      resolved_at: null,
      created_at: iso(30),
    });

    // Resolved comment by current user (R1).
    comments.push({
      ...base,
      id: `${SYNTHETIC_ID_PREFIX}cmt-${fi}-3`,
      field_key: f.key,
      selection_start: null,
      selection_end: null,
      selection_text: null,
      author_user_id: r1.id,
      author_role_id: null,
      body: 'Original query on data completeness has been addressed by the applicant\u2019s clarification note dated last Friday.',
      parent_comment_id: null,
      status: 'resolved',
      is_blocking: false,
      resolved_by: r3.id,
      resolved_at: iso(10),
      created_at: iso(180),
    });
  });

  return { active: true, fields: effectiveFields, comments, suggestions, roster };
}

/** Look up a roster entry by uid (used by the panel to render author chips). */
export function reviewerFromRoster(roster: SeedRoster | null, uid: string): SeedReviewer | null {
  if (!roster) return null;
  if (uid === roster.r1.id) return roster.r1;
  if (uid === roster.r2.id) return roster.r2;
  if (uid === roster.r3.id) return roster.r3;
  return null;
}
