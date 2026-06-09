import type { ReportSourceColumnMeta } from '../services/reportMetadataService';

/** Convert snake_case / camelCase to Title Case as a last-resort label. */
export function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bId\b/g, 'ID');
}

export function buildLabelMap(cols: ReportSourceColumnMeta[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  cols.forEach((c) => { out[c.columnKey] = c.label; });
  return out;
}

export function labelFor(key: string, map: Record<string, string>): string {
  return map[key] || humanizeKey(key);
}

export type ColumnGroup = 'business' | 'enriched' | 'computed' | 'advanced';

export interface GroupedColumn extends ReportSourceColumnMeta {
  group: ColumnGroup;
}

export function groupColumns(cols: ReportSourceColumnMeta[]): Record<ColumnGroup, GroupedColumn[]> {
  const out: Record<ColumnGroup, GroupedColumn[]> = { business: [], enriched: [], computed: [], advanced: [] };
  cols.forEach((c) => {
    let g: ColumnGroup = 'business';
    if (c.isRawId) g = 'advanced';
    else if (c.isComputed) g = 'computed';
    else if (c.isEnriched) g = 'enriched';
    out[g].push({ ...c, group: g });
  });
  return out;
}

export const GROUP_LABELS: Record<ColumnGroup, string> = {
  business: 'Business Fields',
  enriched: 'Enriched Fields',
  computed: 'Computed Fields',
  advanced: 'Advanced / Raw IDs',
};
