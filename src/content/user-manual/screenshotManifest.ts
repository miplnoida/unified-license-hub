import type { ScreenshotEntry } from './types';

const HEAD = '2f3b9d9c18e8167ad6cbb2afe48d83b10d45e183';
const DATE = '2026-08-30';
const BASE = '/user-manual/screenshots';

/**
 * Machine-readable screenshot manifest.
 *
 * Captured from the running application with synthetic/demo-safe data by
 * `scripts/capture-user-manual-screenshots.mjs`. Entries with `file: ''` are
 * declared coverage that still needs a capture pass (see
 * docs/user-manual/FINAL-E2E-REFRESH.md).
 */
export const SCREENSHOTS: ScreenshotEntry[] = [
  /* ------------------------------------------------------------ public */
  s('pub-landing', 'public', 'public-portal', '/', 'getting-started', 'Public portal landing page.', 'getting-started'),
  s('pub-register', 'public', 'registration', '/register', 'registration', 'Registration entry point for applicants and entities.', 'registration'),
  s('pub-registry', 'public', 'public-register', '/registry/entities', 'public-portal', 'Public register of regulated entities.', 'getting-started'),
  s('pub-complaint', 'public', 'complaints', '/complaints/submit', 'complaints', 'Public complaint submission form.', 'complaints'),
  s('pub-track', 'public', 'complaints', '/complaints/track', 'complaints', 'Public complaint tracking screen.', 'complaints'),

  /* ------------------------------------------------- internal — platform */
  s('int-dashboard', 'supervisor', 'getting-started', '/dashboard', 'getting-started', 'Internal dashboard after sign-in.', 'getting-started'),
  s('int-my-work', 'supervisor', 'work-queue', '/my-work', 'notifications-sla', 'My Work — consolidated personal work queue.', 'notifications-sla'),
  s('int-manual', 'shared', 'documentation', '/help/user-manual', 'getting-started', 'In-application User Manual.', 'getting-started'),

  /* --------------------------------------------------- administration */
  s('adm-control-panel', 'admin', 'administration', '/admin', 'administration', 'Admin Control Panel with configuration hubs.', 'administration'),
  s('adm-users', 'admin', 'administration', '/admin/users', 'administration', 'Employee management.', 'administration'),
  s('adm-roles', 'admin', 'administration', '/admin/roles', 'administration', 'Role and permission management.', 'administration'),
  s('adm-settings', 'admin', 'administration', '/settings', 'administration', 'Platform settings hub.', 'administration'),
  s('adm-audit-logs', 'admin', 'audit', '/admin/audit-logs', 'audit-evidence', 'Activity/audit log register.', 'audit-evidence'),
  s('adm-sla', 'admin', 'sla', '/admin/sla-manager', 'notifications-sla', 'SLA manager configuration.', 'notifications-sla'),

  /* ------------------------------------------------------- registration */
  s('reg-review-queue', 'licensing_officer', 'registration', '/admin/registration-review', 'registration', 'Registration review queue.', 'registration'),

  /* ------------------------------------------------------------ licensing */
  s('lic-app-queue', 'licensing_officer', 'licensing', '/applications/queue', 'licensing', 'Application assessment queue.', 'licensing'),
  s('lic-applications', 'licensing_officer', 'licensing', '/applications', 'licensing', 'Applications register.', 'licensing'),
  s('lic-register', 'licensing_officer', 'licensing', '/licenses', 'licensing', 'Licence register.', 'licensing'),
  s('lic-lifecycle', 'licensing_officer', 'licensing', '/licenses/lifecycle', 'licensing', 'Licence lifecycle queue (renewal, expiry, grace).', 'licensing'),
  s('lic-requests', 'licensing_officer', 'post-licensing', '/licensing/regulatory-requests', 'post-licensing', 'Regulatory requests register (post-licensing services).', 'post-licensing'),

  /* ------------------------------------------------------------ entity 360 */
  s('e360-entities', 'supervisor', 'entity-360', '/entities', 'entity-360', 'Entity registry / supervised population.', 'entity-360'),
  s('e360-overview', 'supervisor', 'entity-360', '/entities/:entityId/360', 'entity-360', 'Entity 360 overview with grouped supervisory sections.', 'entity-360'),
  s('e360-structure', 'supervisor', 'ownership-ubo', '/entities/:entityId/structure', 'ownership-ubo', 'Ownership and control structure view.', 'ownership-ubo'),

  /* -------------------------------------------------------------- returns */
  s('ret-queue', 'analyst', 'returns', '/returns/queue', 'returns', 'Return review queue.', 'returns'),
  s('ret-obligations', 'analyst', 'returns', '/returns/obligations', 'returns', 'Reporting obligations register.', 'returns'),
  s('ret-calendar', 'analyst', 'returns', '/returns/calendar', 'returns', 'Reporting calendar with due dates.', 'returns'),
  s('ret-management', 'analyst', 'returns', '/returns-management', 'returns', 'Returns management workspace.', 'returns'),

  /* ------------------------------------------------------ fees & payments */
  s('fee-config', 'admin', 'fees-payments', '/admin/fees', 'fees-payments', 'Fee configuration and schedules.', 'fees-payments'),
  s('pay-history', 'admin', 'fees-payments', '/payments', 'fees-payments', 'Payment register with allocation state.', 'fees-payments'),
  s('cur-settings', 'admin', 'fees-payments', '/settings/currency', 'fees-payments', 'Currency and FX configuration.', 'fees-payments'),
  s('pen-register', 'admin', 'fees-payments', '/billing/penalties', 'fees-payments', 'Penalty register.', 'fees-payments'),

  /* ----------------------------------------------------------- complaints */
  s('cmp-list', 'analyst', 'complaints', '/complaints', 'complaints', 'Complaint register.', 'complaints'),
  s('cmp-intake', 'analyst', 'complaints', '/complaints/intake-queue', 'complaints', 'Complaint intake/triage queue.', 'complaints'),
  s('cmp-analytics', 'analyst', 'complaints', '/complaints/analytics', 'complaints', 'Complaint analytics.', 'complaints'),

  /* ------------------------------------------------------- market conduct */
  s('cond-work-queue', 'analyst', 'market-conduct', '/conduct/work-queue', 'market-conduct', 'Market conduct work queue.', 'market-conduct'),
  s('cond-attention', 'supervisor', 'market-conduct', '/conduct/attention', 'market-conduct', 'Supervisory attention register.', 'market-conduct'),
  s('cond-investigations', 'analyst', 'investigations', '/conduct/investigations', 'investigations', 'Conduct investigations register.', 'investigations'),

  /* -------------------------------------------------- enforcement/appeals */
  s('enf-queue', 'legal_compliance', 'enforcement', '/enforcement', 'investigations', 'Enforcement work queue.', 'investigations'),
  s('app-appeals', 'legal_compliance', 'appeals', '/admin/license-appeals', 'appeals', 'Licence appeals register.', 'appeals'),

  /* ---------------------------------------------------- thematic reviews */
  s('thm-reviews', 'supervisor', 'thematic-reviews', '/supervision/thematic-reviews', 'thematic-reviews', 'Thematic review programme register.', 'thematic-reviews'),

  /* --------------------------------------------------- prudential & F&P */
  s('prud-dashboard', 'supervisor', 'prudential', '/prudential/dashboard', 'entity-360', 'Prudential supervision dashboard.', 'entity-360'),
  s('fpa-individuals', 'licensing_officer', 'fit-and-proper', '/fpa/individuals', 'licensing', 'Fit & proper individual register.', 'licensing'),

  /* ------------------------------------------------------ correspondence */
  s('corr-inbox', 'analyst', 'correspondence', '/correspondence/inbox', 'correspondence', 'Correspondence inbox.', 'correspondence'),
  s('corr-dashboard', 'analyst', 'correspondence', '/correspondence/dashboard', 'correspondence', 'Correspondence dashboard.', 'correspondence'),

  /* --------------------------------------------------------- AI governance */
  s('ai-overview', 'super_admin', 'ai-governance', '/governance/ai', 'ai-governance', 'AI governance overview.', 'ai-governance'),
  s('ai-models', 'super_admin', 'ai-governance', '/governance/ai/models', 'ai-governance', 'Approved AI model registry.', 'ai-governance'),
  s('ai-surfaces', 'super_admin', 'ai-governance', '/governance/ai/surfaces', 'ai-governance', 'AI surface registry with advisory classification.', 'ai-governance'),
  s('ai-instructions', 'super_admin', 'ai-governance', '/governance/ai/instructions', 'ai-governance', 'Versioned AI instruction registry.', 'ai-governance'),
  s('ai-assurance', 'super_admin', 'ai-governance', '/governance/ai/assurance', 'ai-governance', 'AI assurance reviews.', 'ai-governance'),
  s('ai-exceptions', 'super_admin', 'ai-governance', '/governance/ai/exceptions', 'ai-governance', 'AI exception register.', 'ai-governance'),
  s('ai-activity', 'super_admin', 'ai-governance', '/governance/ai/activity', 'ai-governance', 'AI activity/provenance ledger.', 'ai-governance'),
  s('ai-insights', 'analyst', 'ai-governance', '/analytics/ai-insights', 'ai-governance', 'AI Insights Hub (advisory observations).', 'ai-governance'),

  /* ------------------------------------------------ analytics & reporting */
  s('ana-dashboard', 'supervisor', 'analytics', '/analytics', 'analytics', 'Analytics dashboard.', 'analytics'),
  s('rep-dashboard', 'analyst', 'analytics', '/reports', 'analytics', 'Reporting dashboard and templates.', 'analytics'),

  /* ------------------------------- external personas (capture pass pending) */
  p('ext-applicant-dashboard', 'applicant', 'registration', '/dashboard', 'registration', 'Applicant dashboard with draft application and outstanding fees.', 'registration'),
  p('ext-applicant-application', 'applicant', 'licensing', '/applications', 'licensing', 'Applicant application list and status.', 'licensing'),
  p('ext-applicant-payment', 'applicant', 'fees-payments', '/payments', 'fees-payments', 'Applicant fee settlement and receipts.', 'fees-payments'),
  p('ext-licensee-dashboard', 'licensee_primary', 'post-licensing', '/dashboard', 'post-licensing', 'Licensee dashboard with deadlines and requests.', 'post-licensing'),
  p('ext-licensee-returns', 'licensee_primary', 'returns', '/entity/returns/dashboard', 'returns', 'Licensee returns dashboard with due filings.', 'returns'),
  p('ext-licensee-service', 'licensee_primary', 'post-licensing', '/post-license/new', 'post-licensing', 'Licensee post-licensing service request intake.', 'post-licensing'),
  p('ext-licensee-secondary', 'licensee_secondary', 'returns', '/entity/returns', 'returns', 'Secondary user preparing a filing (no submit authority).', 'returns'),
];

function s(
  id: string,
  persona: ScreenshotEntry['persona'],
  process: string,
  route: string,
  section: string,
  caption: string,
  chapter: string,
): ScreenshotEntry {
  return {
    id,
    persona,
    process,
    route,
    section,
    caption,
    file: `${BASE}/${persona}/${process}/${id}.png`,
    head: HEAD,
    capturedDate: DATE,
    dataClassification: 'SYNTHETIC/DEMO-SAFE',
    chapter,
    status: 'CURRENT',
  };
}

/** Declared-but-not-yet-captured coverage. */
function p(
  id: string,
  persona: ScreenshotEntry['persona'],
  process: string,
  route: string,
  section: string,
  caption: string,
  chapter: string,
): ScreenshotEntry {
  return {
    ...s(id, persona, process, route, section, caption, chapter),
    file: '',
    dataClassification: 'PENDING CAPTURE',
    status: 'NEEDS_REFRESH',
  };
}

export const SCREENSHOT_BY_ID: Record<string, ScreenshotEntry> = Object.fromEntries(
  SCREENSHOTS.map((x) => [x.id, x]),
);

/**
 * Screenshots that MUST exist for the mandatory demo journeys. The coverage
 * gate fails if any of these is missing a captured file.
 */
export const MANDATORY_DEMO_SCREENSHOTS: string[] = [
  'int-dashboard',
  'reg-review-queue',
  'lic-app-queue',
  'lic-register',
  'e360-overview',
  'e360-structure',
  'ret-queue',
  'pay-history',
  'cmp-intake',
  'ai-surfaces',
  'ai-activity',
  'ana-dashboard',
];
