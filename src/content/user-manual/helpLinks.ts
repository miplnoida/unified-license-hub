import { MANUAL_META } from './meta';

/**
 * Contextual help registry.
 *
 * The single place that maps application surfaces to manual anchors. Screens
 * render `<ScreenHelpLink surface="..." />`; they never hard-code an anchor.
 */
export interface HelpLinkTarget {
  /** Stable surface key referenced by components. */
  surface: string;
  label: string;
  /** Manual anchor (section id, `entity-360-<key>` or `journey-x`). */
  anchor: string;
  /** Route patterns this surface covers — used by the coverage gate. */
  routes: string[];
  /** Short tooltip shown on the help affordance. */
  hint: string;
  audience: 'internal' | 'external' | 'any';
}

export const MANUAL_ROUTE = MANUAL_META.route;

/** Build a deep link into the in-app manual. */
export function manualHref(anchor?: string): string {
  return anchor ? `${MANUAL_ROUTE}#${anchor}` : MANUAL_ROUTE;
}

export const HELP_LINKS: HelpLinkTarget[] = [
  {
    surface: 'entity-360',
    label: 'About Entity 360',
    anchor: 'entity-360',
    routes: ['/entities/:entityId/360', '/entities/:entityId', '/admin/licensees/:id'],
    hint: 'How the supervisory profile is organised and what each group answers',
    audience: 'internal',
  },
  {
    surface: 'entity-structure',
    label: 'About entity structure & ownership',
    anchor: 'entity-360-ownership',
    routes: ['/entities/:entityId/structure'],
    hint: 'Ownership, control and how UBO is calculated',
    audience: 'internal',
  },
  {
    surface: 'ownership-ubo',
    label: 'How UBO is calculated',
    anchor: 'ownership-ubo',
    routes: ['/entities/:entityId/structure'],
    hint: 'Deterministic ownership traversal, thresholds and boundaries',
    audience: 'internal',
  },
  {
    surface: 'licensing',
    label: 'Learn about licensing',
    anchor: 'licensing',
    routes: ['/applications', '/applications/queue', '/licenses', '/licenses/lifecycle'],
    hint: 'How an application becomes a licence',
    audience: 'any',
  },
  {
    surface: 'registration',
    label: 'Learn about registration',
    anchor: 'registration',
    routes: ['/admin/registration-review'],
    hint: 'Establishing verified identity before licensing',
    audience: 'any',
  },
  {
    surface: 'post-licensing',
    label: 'Learn about post-licence services',
    anchor: 'post-licensing',
    routes: ['/post-license/new', '/licensing/regulatory-requests'],
    hint: 'Controlled change requests and their governed effects',
    audience: 'any',
  },
  {
    surface: 'returns',
    label: 'Learn about returns',
    anchor: 'returns',
    routes: ['/returns/obligations', '/returns/queue', '/returns/calendar', '/returns-management'],
    hint: 'Obligations, filing, review, amendment and overdue handling',
    audience: 'any',
  },
  {
    surface: 'fees-payments',
    label: 'Learn about fees & payments',
    anchor: 'fees-payments',
    routes: ['/payments', '/payments/:id', '/billing/penalties'],
    hint: 'Assessments of record, the payment ledger, receipts and currency',
    audience: 'any',
  },
  {
    surface: 'complaints',
    label: 'Learn about complaints',
    anchor: 'complaints',
    routes: ['/complaints', '/complaints/intake-queue', '/complaints/analytics'],
    hint: 'Intake, triage, investigation and outcomes',
    audience: 'any',
  },
  {
    surface: 'enforcement',
    label: 'Learn about enforcement',
    anchor: 'investigations',
    routes: ['/enforcement', '/enforcement/:id'],
    hint: 'Investigations, directions, sanctions and penalties',
    audience: 'internal',
  },
  {
    surface: 'ai-governance',
    label: 'Learn about AI governance',
    anchor: 'ai-governance',
    routes: ['/governance/ai', '/governance/ai/surfaces', '/analytics/ai-insights'],
    hint: 'What the AI surfaces do, and what they must never be claimed to do',
    audience: 'internal',
  },
  {
    surface: 'market-conduct',
    label: 'Learn about market conduct',
    anchor: 'market-conduct',
    routes: ['/conduct', '/conduct/attention'],
    hint: 'Conduct monitoring and customer-outcome supervision',
    audience: 'internal',
  },
];

export const HELP_LINK_BY_SURFACE: Record<string, HelpLinkTarget> = Object.fromEntries(
  HELP_LINKS.map((h) => [h.surface, h]),
);

/** Entity 360 quick links surfaced from the profile itself. */
export const ENTITY_360_QUICK_LINKS: { label: string; anchor: string }[] = [
  { label: 'About Entity 360', anchor: 'entity-360' },
  { label: 'Ownership', anchor: 'entity-360-ownership' },
  { label: 'Governance', anchor: 'entity-360-governance' },
  { label: 'Return filings', anchor: 'entity-360-returns' },
  { label: 'Prudential', anchor: 'entity-360-prudential' },
  { label: 'Enforcement', anchor: 'entity-360-enforcement' },
  { label: 'Provenance', anchor: 'entity-360-provenance' },
];
