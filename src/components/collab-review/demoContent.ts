/**
 * Demo overlay for the Collaborative Review panel.
 *
 * When a record has zero real comments/suggestions AND every field value is empty,
 * this module supplies realistic dummy narrative + comments + suggestions so the
 * feature reads as fully populated for demos. It never touches the DB — the demo
 * objects use synthetic ids prefixed with `demo-` so the UI can hide mutation
 * actions on them.
 */
import type { ReviewComment, ReviewSuggestion, CollabEntityType } from '@/hooks/useCollabReview';

export const DEMO_ID_PREFIX = 'demo-';
export const isDemoId = (id: string | undefined | null) => !!id && id.startsWith(DEMO_ID_PREFIX);

export interface DemoReviewer {
  id: string;
  name: string;
  roleName: string;
  color: string;
  initials: string;
}

export const DEMO_REVIEWERS: Record<'r1' | 'r2' | 'r3', DemoReviewer> = {
  r1: { id: 'demo-r1', name: 'Priya Menon',   roleName: 'Senior Examiner',     color: '#6366F1', initials: 'PM' },
  r2: { id: 'demo-r2', name: 'Marcus Wright', roleName: 'Legal Counsel',       color: '#F59E0B', initials: 'MW' },
  r3: { id: 'demo-r3', name: 'Aisha Rahman',  roleName: 'Head of Supervision', color: '#10B981', initials: 'AR' },
};

export function demoReviewerFor(uid: string): DemoReviewer | null {
  if (uid === DEMO_REVIEWERS.r1.id) return DEMO_REVIEWERS.r1;
  if (uid === DEMO_REVIEWERS.r2.id) return DEMO_REVIEWERS.r2;
  if (uid === DEMO_REVIEWERS.r3.id) return DEMO_REVIEWERS.r3;
  return null;
}

interface FieldLike { key: string; label: string; value: string }

// Pick a realistic narrative paragraph based on the field label so the anchored
// selections read naturally in every module.
export function demoNarrativeFor(field: FieldLike, entityType: CollabEntityType): string {
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

  // Generic fallback — still reads as reviewer prose so anchored ranges make sense.
  const subject = entityType === 'return' ? 'return' : entityType === 'complaint' ? 'complaint' : entityType === 'registration' ? 'registration' : 'application';
  return (
    `This ${subject} has been reviewed against the applicable regulatory requirements and internal supervisory guidance. `
    + 'The information provided is broadly consistent with prior submissions and no material discrepancies were identified '
    + 'during the initial screening. Two minor clarifications are noted below and should be addressed before the next '
    + 'workflow step. Overall, the submission is of acceptable quality.'
  );
}

// Utility: find a case-insensitive substring range within a text.
function findRange(text: string, needle: string): { start: number; end: number } | null {
  if (!needle) return null;
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx < 0) return null;
  return { start: idx, end: idx + needle.length };
}

interface BuildInput {
  entityType: CollabEntityType;
  fields: FieldLike[];
}

export interface DemoOverlay {
  active: boolean;
  fields: FieldLike[]; // fields with demo narrative substituted for empty values
  comments: ReviewComment[];
  suggestions: ReviewSuggestion[];
}

export function buildDemoOverlay(
  input: BuildInput,
  hasRealActivity: boolean,
): DemoOverlay {
  const allEmpty = input.fields.every(f => !f.value || !f.value.trim());
  const active = !hasRealActivity && allEmpty && input.fields.length > 0;

  if (!active) {
    return { active: false, fields: input.fields, comments: [], suggestions: [] };
  }

  const now = new Date();
  const iso = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60_000).toISOString();

  const effectiveFields: FieldLike[] = input.fields.map(f =>
    f.value && f.value.trim() ? f : { ...f, value: demoNarrativeFor(f, input.entityType) },
  );

  const comments: ReviewComment[] = [];
  const suggestions: ReviewSuggestion[] = [];

  effectiveFields.forEach((f, fi) => {
    const text = f.value;

    // Anchor phrases — pick words that actually appear in the narrative.
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
      entity_id: 'demo-entity',
      workflow_instance_id: null,
      workflow_step_id: null,
      regulator_id: null,
    };

    // --- Suggestions ---------------------------------------------------------
    // Pending replace by Priya, anchored to phrase A.
    suggestions.push({
      ...base,
      id: `${DEMO_ID_PREFIX}sug-${fi}-1`,
      field_key: f.key,
      author_user_id: DEMO_REVIEWERS.r1.id,
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

    // Accepted insert by Marcus (no anchor needed in inline view — accepted are sidebar-only).
    suggestions.push({
      ...base,
      id: `${DEMO_ID_PREFIX}sug-${fi}-2`,
      field_key: f.key,
      author_user_id: DEMO_REVIEWERS.r2.id,
      author_role_id: null,
      type: 'insert',
      original_text: null,
      suggested_text: ' (subject to Board ratification)',
      selection_start: anchorB.end,
      selection_end: anchorB.end,
      status: 'accepted',
      decided_by: DEMO_REVIEWERS.r3.id,
      decided_at: iso(20),
      created_at: iso(90),
    });

    // Rejected delete by Aisha.
    suggestions.push({
      ...base,
      id: `${DEMO_ID_PREFIX}sug-${fi}-3`,
      field_key: f.key,
      author_user_id: DEMO_REVIEWERS.r3.id,
      author_role_id: null,
      type: 'delete',
      original_text: text.slice(anchorC.start, anchorC.end),
      suggested_text: null,
      selection_start: anchorC.start,
      selection_end: anchorC.end,
      status: 'rejected',
      decided_by: DEMO_REVIEWERS.r1.id,
      decided_at: iso(15),
      created_at: iso(120),
    });

    // --- Comments ------------------------------------------------------------
    // Open blocking comment by Marcus anchored to phrase B, with 1 reply from Priya.
    const blockingId = `${DEMO_ID_PREFIX}cmt-${fi}-1`;
    comments.push({
      ...base,
      id: blockingId,
      field_key: f.key,
      selection_start: anchorB.start,
      selection_end: anchorB.end,
      selection_text: text.slice(anchorB.start, anchorB.end),
      author_user_id: DEMO_REVIEWERS.r2.id,
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
      id: `${DEMO_ID_PREFIX}cmt-${fi}-1r`,
      field_key: f.key,
      selection_start: null,
      selection_end: null,
      selection_text: null,
      author_user_id: DEMO_REVIEWERS.r1.id,
      author_role_id: null,
      body: 'Noted \u2014 the resolution is dated 12 May; I\u2019ll attach the extract and tag it to this thread by end of day.',
      parent_comment_id: blockingId,
      status: 'open',
      is_blocking: false,
      resolved_by: null,
      resolved_at: null,
      created_at: iso(40),
    });

    // Open non-blocking comment by Aisha anchored to phrase C.
    comments.push({
      ...base,
      id: `${DEMO_ID_PREFIX}cmt-${fi}-2`,
      field_key: f.key,
      selection_start: anchorC.start,
      selection_end: anchorC.end,
      selection_text: text.slice(anchorC.start, anchorC.end),
      author_user_id: DEMO_REVIEWERS.r3.id,
      author_role_id: null,
      body: 'Consider tightening this phrasing so it aligns with the language used in the supervisory manual. Not a blocker.',
      parent_comment_id: null,
      status: 'open',
      is_blocking: false,
      resolved_by: null,
      resolved_at: null,
      created_at: iso(30),
    });

    // Resolved comment by Priya, no anchor.
    comments.push({
      ...base,
      id: `${DEMO_ID_PREFIX}cmt-${fi}-3`,
      field_key: f.key,
      selection_start: null,
      selection_end: null,
      selection_text: null,
      author_user_id: DEMO_REVIEWERS.r1.id,
      author_role_id: null,
      body: 'Original query on data completeness has been addressed by the applicant\u2019s clarification note dated last Friday.',
      parent_comment_id: null,
      status: 'resolved',
      is_blocking: false,
      resolved_by: DEMO_REVIEWERS.r3.id,
      resolved_at: iso(10),
      created_at: iso(180),
    });
  });

  return { active: true, fields: effectiveFields, comments, suggestions };
}
