export interface ReportScope { regulatorId: string; sectorId: string; from: string; to: string; }
export interface ReportIdentity { id: string; sector_id?: string | null; lead_regulator_id?: string | null; }
export interface ReportSector { id: string; regulator_id?: string | null; }
export interface ScopedReportRow {
  status: string | null; created_at?: string; regulator_id?: string | null;
  sector_id?: string | null; entity_id?: string | null; holder_id?: string | null;
  licensee_id?: string | null;
}

/** Reporting scope only; underlying queries remain caller/RLS scoped. Unresolved identities never enter a filtered population. */
export function filterReportRows(rows: ScopedReportRow[], scope: ReportScope, entities: ReportIdentity[], sectors: ReportSector[]) {
  const entityMap = new Map(entities.map(e => [e.id, e]));
  const sectorMap = new Map(sectors.map(s => [s.id, s]));
  return rows.filter(row => {
    const entity = entityMap.get(row.entity_id || row.holder_id || row.licensee_id || '');
    const sector = row.sector_id || entity?.sector_id;
    const regulator = row.regulator_id || entity?.lead_regulator_id || (sector ? sectorMap.get(sector)?.regulator_id : undefined);
    if (scope.regulatorId !== 'all' && regulator !== scope.regulatorId) return false;
    if (scope.sectorId !== 'all' && sector !== scope.sectorId) return false;
    const day = row.created_at?.slice(0, 10);
    if (scope.from && (!day || day < scope.from)) return false;
    if (scope.to && (!day || day > scope.to)) return false;
    return true;
  });
}

export function filingAcceptanceRate(accepted: number, total: number): number | null {
  return total > 0 ? Math.round(accepted / total * 100) : null;
}