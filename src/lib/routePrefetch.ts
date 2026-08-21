/**
 * Route chunk prefetch registry.
 *
 * Warms the JS chunk of a navigation destination when an authorised user
 * hovers, focuses or touches its sidebar entry. Only code is fetched — no
 * business data, no queries, nothing for unauthorised destinations (the sidebar
 * only renders entries the user may see, and it is the only caller).
 *
 * Nothing is preloaded at startup: the registry is a lookup table of thunks
 * that fire on intent.
 */

type Thunk = () => Promise<unknown>;

/**
 * High-frequency destinations, longest-prefix matched. The module specifiers are
 * identical to the ones used by the route definitions, so the prefetched chunk
 * is exactly the chunk the route will use.
 */
const ROUTE_CHUNKS: Record<string, Thunk> = {
  '/dashboard': () => import('@/pages/Dashboard'),
  '/applications/queue': () => import('@/pages/applications/ApplicationQueue'),
  '/applications': () => import('@/pages/applications/ApplicationsList'),
  '/licenses': () => import('@/pages/licenses/LicensesList'),
  '/returns/queue': () => import('@/pages/returns-canonical/ReturnsFilingQueue'),
  '/complaints': () => import('@/pages/complaints/ComplaintsList'),
  '/conduct/surveillance': () => import('@/pages/conduct/SurveillanceWorkspace'),
  '/conduct/investigations': () => import('@/pages/conduct/Investigations'),
  '/conduct/alerts': () => import('@/pages/conduct/ConductAlerts'),
  '/conduct/actions': () => import('@/pages/conduct/ConductActions'),
  '/conduct': () => import('@/pages/conduct/ConductDashboard'),
  '/prudential/dashboard': () => import('@/pages/prudential/PrudentialDashboard'),
  '/prudential/entities': () => import('@/pages/prudential/PrudentialEntitiesList'),
  '/prudential/assessments': () => import('@/pages/prudential/AssessmentsList'),
  '/entities': () => import('@/pages/entities/EntityDirectory'),
  '/licensing/entity-resolution': () => import('@/pages/licensing/EntityResolutionQueue'),
  '/admin/entity-memberships': () => import('@/pages/admin/EntityMemberships'),

  '/correspondence/inbox': () => import('@/pages/correspondence/CorrespondenceInbox'),
  '/correspondence/records': () => import('@/pages/correspondence/CorrespondenceRecords'),
  '/correspondence': () => import('@/pages/correspondence/CorrespondenceDashboard'),
  '/analytics/ai-reports': () => import('@/pages/analytics/SupervisoryAiReports'),
  '/analytics': () => import('@/pages/analytics/AnalyticsDashboard'),
  '/reports': () => import('@/pages/reports/ReportsDashboard'),
  '/notifications': () => import('@/pages/notifications/NotificationCenter'),
  '/profile': () => import('@/pages/Profile'),
};

const started = new Set<string>();

function matchKey(href: string): string | null {
  let best: string | null = null;
  for (const key of Object.keys(ROUTE_CHUNKS)) {
    if (href === key || href.startsWith(`${key}/`)) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best;
}

/** Fire-and-forget chunk warm-up. Safe to call repeatedly; runs at most once. */
export function prefetchRoute(href?: string): void {
  if (!href || typeof window === 'undefined') return;
  const key = matchKey(href);
  if (!key || started.has(key)) return;
  started.add(key);
  try {
    void ROUTE_CHUNKS[key]().catch(() => undefined);
  } catch {
    /* prefetch is best-effort only */
  }
}

/** Test/diagnostic helper. */
export function __resetRoutePrefetch(): void {
  started.clear();
}

export function isPrefetchable(href?: string): boolean {
  return !!href && !!matchKey(href);
}
