/**
 * Browser-safe types + pure classifier for the Permission Coverage matrix.
 *
 * Deliberately isolated from the FS-walking scanner so that UI code
 * (`src/pages/admin/PermissionCoverageReport.tsx`) can consume the shape
 * without dragging `node:fs` / `node:path` into the client bundle.
 *
 * Node-side scanning lives in `src/lib/rbac/coverageScanner.ts`.
 */

export type SurfaceKey =
  | 'menu'
  | 'route'
  | 'button'
  | 'marker'
  | 'rls'
  | 'rpc'
  | 'storage'
  | 'report';

export interface SurfaceReference {
  file: string;
  line: number;
  detail?: string;
}

export interface CoverageRow {
  module: string;
  action: string;
  menu: SurfaceReference[];
  route: SurfaceReference[];
  button: SurfaceReference[];
  /** `data-rbac="module.action"` markers — audit signal only, NOT a real gate. */
  marker: SurfaceReference[];
  rls: SurfaceReference[];
  rpc: SurfaceReference[];
  storage: SurfaceReference[];
  report: SurfaceReference[];
  orphaned: boolean;
}

export interface CoverageMatrix {
  generatedAt: string;
  rows: CoverageRow[];
  orphanedCount: number;
}

export interface CatalogEntry {
  module: string;
  name: string;
  enforced: boolean;
}

/** Classify a row's coverage state for UI badges. Markers alone never satisfy a surface. */
export function classifyCoverage(
  row: Pick<
    CoverageRow,
    'menu' | 'route' | 'button' | 'marker' | 'rls' | 'rpc' | 'storage' | 'report' | 'orphaned'
  >,
): 'orphaned' | 'ui-only' | 'backend-only' | 'enforced' {
  if (row.orphaned) return 'orphaned';
  const hasBackend = row.rls.length + row.rpc.length + row.storage.length > 0;
  const hasUi =
    row.menu.length + row.route.length + row.button.length + row.report.length > 0;
  if (hasBackend && hasUi) return 'enforced';
  if (hasBackend) return 'backend-only';
  return 'ui-only';
}

