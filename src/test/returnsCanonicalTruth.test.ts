import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { objectRoute } from '@/lib/routes/objectRoutes';

/**
 * EPR-01 closure guard.
 *
 * The legacy Returns truth tables (`returns_filed`, `return_calculated_ratios`,
 * `return_consolidated_analysis`) must not be read by any navigable surface.
 * Only HISTORY_ONLY registers and the intentional legacy-id bridge may keep a
 * reference, and those are enumerated here.
 */
const LEGACY = /\.from\(\s*['"](returns_filed|return_calculated_ratios|return_consolidated_analysis)['"]/;

const NAVIGABLE_SURFACES = [
  'src/pages/entity/returns/EntityReturnsDashboard.tsx',
  'src/pages/entity/returns/canonical/EntityReturnsWorkspace.tsx',
  'src/pages/entity/returns/canonical/EntityFilingWorkspace.tsx',
  'src/pages/returns-canonical/ReturnsFilingQueue.tsx',
  'src/pages/returns-canonical/FilingDetail.tsx',
  'src/pages/returns-mgmt/PrudentialAnalytics.tsx',
  'src/hooks/usePrudentialSupervision.ts',
  'src/hooks/usePrudentialConfig.ts',
  'src/hooks/useSupervisoryMetrics.ts',
  'src/hooks/useSupervisoryTrends.ts',
  'src/lib/returns/canonicalReturnsSummary.ts',
];

describe('EPR-01 canonical Returns truth', () => {
  it('no navigable Returns or Prudential surface reads legacy Returns tables', () => {
    const offenders = NAVIGABLE_SURFACES.filter((f) => LEGACY.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('Prudential Metric Analytics reads only canonical metric read models', () => {
    const src = readFileSync('src/pages/returns-mgmt/PrudentialAnalytics.tsx', 'utf8');
    expect(src).toContain('prudential_analytics_metrics');
    expect(src).toContain('prudential_analytics_metric_context');
    expect(src).toContain('prudential_analytics_metric_trend');
    // Metric labels are resolved from regulatory_metrics server-side, never hardcoded.
    expect(src).not.toMatch(/Capital Adequacy Ratio|NPL Ratio/);
    // Peer engine is still used, and drill-downs go through the route registry.
    expect(src).toContain('usePeerSnapshot');
    expect(src).toContain('objectRoute.returnFiling');
  });

  it('the entity Returns dashboard reads canonical server aggregates', () => {
    const src = readFileSync('src/pages/entity/returns/EntityReturnsDashboard.tsx', 'utf8');
    expect(src).toContain('fetchCanonicalEntityReturnsSummary');
    expect(src).toContain('fetchCanonicalEntityFilingHistory');
    expect(src).not.toContain('useMyReturns');
  });

  it('the route registry emits both canonical filing workspaces', () => {
    expect(objectRoute.returnFiling('abc')).toBe('/returns/filings/abc');
    expect(objectRoute.returnFiling('abc', 'external')).toBe('/entity/returns/filings/abc');
  });
});
