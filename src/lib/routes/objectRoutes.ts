/**
 * EPR-01 — Canonical object route registry.
 *
 * Single source of truth for cross-module links to regulated objects. Every
 * navigation to one of these objects MUST be built through this helper so that
 * (a) the canonical route is used, and (b) the identifier domain is explicit.
 *
 * Rules:
 *  - A regulated entity link takes `entities.id` (NOT `licensees.licensee_id`
 *    style legacy identifiers).
 *  - A return filing link takes `return_filings.id`. Where only a legacy
 *    `returns_filed.id` is available, use `returnFilingFromLegacy()`, which
 *    routes through a server-side translation instead of guessing.
 *
 * `scripts/verify-canonical-object-routes.mjs` fails the build when new
 * hand-built template-literal links to these routes appear outside this file.
 */

const id = (value: string | null | undefined) => encodeURIComponent(String(value ?? ''));

export const objectRoute = {
  /** Regulated entity 360 profile — expects `entities.id`. */
  entity: (entityId: string) => `/entities/${id(entityId)}`,
  /** Public register profile — expects the entity public slug. */
  entityPublicRegister: (slug: string) => `/registry/entities/${id(slug)}`,
  application: (applicationId: string) => `/applications/${id(applicationId)}`,
  licence: (licenceId: string) => `/licenses/${id(licenceId)}`,
  fpIndividual: (individualId: string) => `/fpa/individuals/${id(individualId)}`,
  fpAssessment: (assessmentId: string) => `/fpa/assessments/${id(assessmentId)}`,
  /**
   * Canonical return filing workspace — expects `return_filings.id`.
   * `audience: 'external'` emits the regulated entity's filing workspace; the
   * default emits the internal supervisory workspace.
   */
  returnFiling: (filingId: string, audience: 'internal' | 'external' = 'internal') =>
    audience === 'external'
      ? `/entity/returns/filings/${id(filingId)}`
      : `/returns/filings/${id(filingId)}`,
  /**
   * Compatibility entry point for call sites that only hold a legacy
   * `returns_filed.id`. The route resolves the canonical filing id server-side
   * (`returns_resolve_legacy_filing`) and redirects to `returnFiling()`.
   */
  returnFilingFromLegacy: (legacyReturnId: string) => `/returns/filings/legacy/${id(legacyReturnId)}`,
  returnsQueue: (params?: { status?: string; stage?: string; overdue?: boolean; owner?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set('status', params.status);
    if (params?.stage) q.set('stage', params.stage);
    if (params?.overdue) q.set('overdue', '1');
    if (params?.owner) q.set('owner', params.owner);
    const qs = q.toString();
    return qs ? `/returns/queue?${qs}` : '/returns/queue';
  },
  complaint: (complaintId: string) => `/complaints/${id(complaintId)}`,
  investigation: (investigationId: string) => `/conduct/investigations/${id(investigationId)}`,
  /**
   * Canonical enterprise examination workspace (EPIC 4 / W6). The legacy
   * `/prudential/examinations/:id` path remains only as a redirect alias.
   */
  examination: (examinationId: string) => `/supervision/examinations/${id(examinationId)}`,
  enforcement: (enforcementId: string) => `/enforcement/${id(enforcementId)}`,
  correspondence: (threadId: string) => `/correspondence/${id(threadId)}`,
  prudentialAssessment: (assessmentId: string) => `/prudential/assessments/${id(assessmentId)}`,
  coordinationCase: (caseId: string) => `/coordination/${id(caseId)}`,
  financialGroup: (groupId: string) => `/prudential/groups/${id(groupId)}`,
} as const;

export type CanonicalObject = keyof typeof objectRoute;
