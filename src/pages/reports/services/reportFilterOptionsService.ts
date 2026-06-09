/**
 * Resolves filter options from the metadata layer.
 * Supports options_source values seeded in `report_source_filters`:
 *   - "static"            -> use options_static JSON
 *   - "status_options"    -> read report_status_options for (source, filterKey)
 *   - "option_set:<key>"  -> read report_option_sets for key
 *   - "option_set"        -> read report_option_sets where key in ui_config.optionSetKey or filterKey
 *   - "table:<table>"     -> dynamic table read (uses options_table/value/label)
 *   - "table"             -> dynamic table read using options_table/value/label
 *   - "none"/null         -> no options
 */
import {
  getOptionSet, getReportStatusOptions, fetchTableOptions,
  type ReportFilterMeta,
} from './reportMetadataService';
import { supabase } from '@/integrations/supabase/client';

export interface FilterOption { value: string; label: string }

function parseSourceTag(src?: string | null): { kind: string; arg?: string } {
  if (!src) return { kind: 'none' };
  const [kind, arg] = src.split(':');
  return { kind: kind || 'none', arg };
}

export async function resolveFilterOptions(
  meta: ReportFilterMeta,
  currentFilters: Record<string, any> = {},
): Promise<FilterOption[]> {
  const { kind, arg } = parseSourceTag(meta.optionsSource);

  if (kind === 'static') {
    return (meta.optionsStatic || []).map((o) => ({ value: String(o.value), label: String(o.label) }));
  }

  if (kind === 'status_options') {
    const rows = await getReportStatusOptions(meta.sourceKey, meta.filterKey || 'status');
    return rows.map((r) => ({ value: r.value, label: r.label }));
  }

  if (kind === 'option_set') {
    const key = arg || meta.filterKey;
    const rows = await getOptionSet(key);
    return rows.map((r) => ({ value: r.value, label: r.label }));
  }

  if (kind === 'table') {
    const table = arg || meta.optionsTable;
    if (!table) return [];
    const valueCol = meta.optionsValueColumn || 'id';
    const labelCol = meta.optionsLabelColumn || 'name';
    const parentVal = meta.dependsOnFilter ? currentFilters?.[meta.dependsOnFilter] : null;
    if (meta.dependsOnFilter && parentVal) {
      try {
        const parentCol = `${meta.dependsOnFilter.replace(/([A-Z])/g, '_$1').toLowerCase()}_id`;
        const { data, error } = await (supabase.from(table as any) as any)
          .select(`${valueCol}, ${labelCol}, ${parentCol}`)
          .eq(parentCol, parentVal)
          .limit(500);
        if (!error && data) {
          return (data as any[]).map((r) => ({
            value: String(r[valueCol]),
            label: String(r[labelCol] ?? r[valueCol]),
          }));
        }
      } catch {
        // fall through to unscoped table read
      }
    }
    return fetchTableOptions(table, valueCol, labelCol);
  }

  return [];
}
