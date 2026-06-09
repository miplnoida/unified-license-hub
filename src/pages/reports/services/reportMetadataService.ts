/**
 * Reports & Analytics — metadata service.
 *
 * All metadata for sources, filters, definitions, dashboard widgets and
 * option sets lives in the database (see migration adding `report_sources`,
 * `report_source_filters`, `report_status_options`, `report_dashboard_layouts`,
 * `report_dashboard_widgets`, `report_option_sets`, `report_runtime_config`).
 *
 * Each fetcher falls back to the frontend constants in `reportDefinitions.ts`
 * when the database is empty or returns an error, so the UI never breaks.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  REPORT_DEFINITIONS, COLUMN_OPTIONS_BY_SOURCE, SENSITIVE_COLUMNS,
} from '../reportDefinitions';
import type { ReportDefinition, ReportSource, ExportFormat } from '../types';

export interface ReportSourceMeta {
  sourceKey: string;
  label: string;
  tableName: string;
  module: string;
  description?: string;
  defaultDateColumn: string;
  isActive: boolean;
  supportsAdHoc: boolean;
  supportsScheduling: boolean;
  maxPreviewRows: number;
  maxGenerateRows: number;
  safeColumns: string[];
  defaultColumns: string[];
  sensitiveColumns: string[];
  searchColumns: string[];
  sourceRoutes: Record<string, unknown>;
  sortOrder: number;
}

export interface ReportFilterMeta {
  id: string;
  sourceKey: string;
  filterKey: string;
  label: string;
  filterType: 'select' | 'multi_select' | 'text' | 'date' | 'date_range' | 'number' | 'boolean';
  columnName?: string | null;
  operator: string;
  optionsSource?: string | null;
  optionsStatic: Array<{ value: string; label: string }>;
  optionsTable?: string | null;
  optionsValueColumn?: string | null;
  optionsLabelColumn?: string | null;
  dependsOnFilter?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ReportStatusOption {
  sourceKey: string;
  filterKey: string;
  value: string;
  label: string;
  color?: string | null;
  sortOrder: number;
}

export interface ReportOption {
  value: string;
  label: string;
  metadata?: Record<string, unknown>;
  sortOrder: number;
}

export interface ReportDashboardLayout {
  layoutKey: string;
  name: string;
  description?: string;
  module: string;
  isDefault: boolean;
}

export type WidgetKind = 'kpi' | 'bar_chart' | 'pie_chart' | 'line_chart' | 'area_chart' | 'table' | 'trend' | 'number';

export interface ReportDashboardWidget {
  id: string;
  layoutKey: string;
  widgetKey: string;
  title: string;
  description?: string;
  widgetType: WidgetKind;
  sourceKey?: string | null;
  metricConfig: Record<string, any>;
  queryConfig: Record<string, any>;
  chartConfig: Record<string, any>;
  drilldownReportSlug?: string | null;
  drilldownFilters: Record<string, unknown>;
  icon?: string | null;
  variant?: string | null;
  width: string;
  sortOrder: number;
  isActive: boolean;
}

const sb = supabase as any;

function warnFallback(scope: string, err?: unknown) {
  if (typeof console !== 'undefined' && (import.meta as any).env?.DEV) {
    console.warn(`[reports/metadata] falling back to static for ${scope}`, err);
  }
}

// =========== Sources ===========
export async function getReportSources(): Promise<ReportSourceMeta[]> {
  try {
    const { data, error } = await sb.from('report_sources').select('*').eq('is_active', true).order('sort_order');
    if (error) throw error;
    if (!data?.length) throw new Error('empty');
    return data.map(mapSource);
  } catch (e) {
    warnFallback('report_sources', e);
    return staticSources();
  }
}

function mapSource(r: any): ReportSourceMeta {
  return {
    sourceKey: r.source_key,
    label: r.label,
    tableName: r.table_name,
    module: r.module,
    description: r.description,
    defaultDateColumn: r.default_date_column || 'created_at',
    isActive: r.is_active,
    supportsAdHoc: r.supports_ad_hoc,
    supportsScheduling: r.supports_scheduling,
    maxPreviewRows: r.max_preview_rows ?? 100,
    maxGenerateRows: r.max_generate_rows ?? 10000,
    safeColumns: r.safe_columns || [],
    defaultColumns: r.default_columns || [],
    sensitiveColumns: r.sensitive_columns || [],
    searchColumns: r.search_columns || [],
    sourceRoutes: r.source_routes || {},
    sortOrder: r.sort_order ?? 0,
  };
}

function staticSources(): ReportSourceMeta[] {
  const labels: Record<string, string> = {
    applications: 'Applications', licenses: 'Licenses', payments: 'Payments',
    compliance_returns: 'Compliance Returns', complaints: 'Complaints',
    users: 'Users', audit_logs: 'Audit Logs', report_logs: 'Report Logs',
  };
  const tables: Record<string, string> = { users: 'profiles' };
  const routes: Record<string, Record<string, string>> = {
    applications: { detailPath: '/applications/:id', idColumn: 'id' },
    licenses: { detailPath: '/licenses/:id', idColumn: 'id' },
    complaints: { detailPath: '/complaints', idColumn: 'id' },
    compliance_returns: { detailPath: '/returns-management/:id', idColumn: 'id' },
  };
  return Object.entries(COLUMN_OPTIONS_BY_SOURCE).map(([k, cols], i) => ({
    sourceKey: k, label: labels[k] || k, tableName: tables[k] || k,
    module: 'report_management', defaultDateColumn: 'created_at',
    isActive: true, supportsAdHoc: true, supportsScheduling: true,
    maxPreviewRows: 100, maxGenerateRows: 10000,
    safeColumns: cols, defaultColumns: cols.slice(0, 5),
    sensitiveColumns: Array.from(SENSITIVE_COLUMNS),
    searchColumns: [], sourceRoutes: routes[k] || {}, sortOrder: i,
  }));
}

// =========== Filters ===========
export async function getReportFilters(sourceKey: string): Promise<ReportFilterMeta[]> {
  try {
    const { data, error } = await sb.from('report_source_filters')
      .select('*').eq('source_key', sourceKey).eq('is_active', true).order('sort_order');
    if (error) throw error;
    if (!data?.length) throw new Error('empty');
    return data.map((r: any) => ({
      id: r.id,
      sourceKey: r.source_key,
      filterKey: r.filter_key,
      label: r.label,
      filterType: r.filter_type,
      columnName: r.column_name,
      operator: r.operator || 'eq',
      optionsSource: r.options_source,
      optionsStatic: Array.isArray(r.options_static) ? r.options_static : [],
      optionsTable: r.options_table,
      optionsValueColumn: r.options_value_column,
      optionsLabelColumn: r.options_label_column,
      dependsOnFilter: r.depends_on_filter,
      isActive: r.is_active,
      sortOrder: r.sort_order ?? 0,
    }));
  } catch (e) {
    warnFallback(`report_source_filters:${sourceKey}`, e);
    return [];
  }
}

// =========== Status options ===========
export async function getReportStatusOptions(sourceKey: string, filterKey = 'status'): Promise<ReportStatusOption[]> {
  try {
    const { data, error } = await sb.from('report_status_options')
      .select('*').eq('source_key', sourceKey).eq('filter_key', filterKey).eq('is_active', true).order('sort_order');
    if (error) throw error;
    return (data || []).map((r: any) => ({
      sourceKey: r.source_key, filterKey: r.filter_key, value: r.value, label: r.label,
      color: r.color, sortOrder: r.sort_order ?? 0,
    }));
  } catch (e) {
    warnFallback(`report_status_options:${sourceKey}`, e);
    return [];
  }
}

// =========== Definitions ===========
export async function getReportDefinitions(): Promise<ReportDefinition[]> {
  try {
    const { data, error } = await sb.from('report_definitions')
      .select('*').eq('is_active', true).order('sort_order').order('name');
    if (error) throw error;
    if (!data?.length) throw new Error('empty');
    return data.map(mapDefinition);
  } catch (e) {
    warnFallback('report_definitions', e);
    return REPORT_DEFINITIONS;
  }
}

export async function getReportDefinition(slug: string): Promise<ReportDefinition | null> {
  try {
    const { data, error } = await sb.from('report_definitions').select('*').eq('slug', slug).maybeSingle();
    if (error || !data) throw error || new Error('not found');
    return mapDefinition(data);
  } catch {
    return REPORT_DEFINITIONS.find((d) => d.id === slug) || null;
  }
}

function mapDefinition(r: any): ReportDefinition {
  const src = (r.source_key || r.source) as ReportSource;
  const formats: ExportFormat[] = (r.export_formats || ['csv', 'xlsx']).filter(Boolean);
  return {
    id: r.slug,
    name: r.name,
    category: r.category,
    module: r.module,
    description: r.description || '',
    source: src,
    filters: Array.isArray(r.filter_config) ? r.filter_config : [],
    defaultColumns: r.default_columns || [],
    defaultGroupBy: r.default_group_by || undefined,
    exportFormats: formats,
  };
}

// =========== Dashboard layouts & widgets ===========
export async function getDashboardLayouts(): Promise<ReportDashboardLayout[]> {
  try {
    const { data, error } = await sb.from('report_dashboard_layouts')
      .select('*').eq('is_active', true).order('is_default', { ascending: false });
    if (error) throw error;
    return (data || []).map((r: any) => ({
      layoutKey: r.layout_key, name: r.name, description: r.description,
      module: r.module, isDefault: r.is_default,
    }));
  } catch (e) {
    warnFallback('report_dashboard_layouts', e);
    return [{ layoutKey: 'executive-overview', name: 'Executive Overview', module: 'report_management', isDefault: true }];
  }
}

export async function getDashboardWidgets(layoutKey: string): Promise<ReportDashboardWidget[]> {
  try {
    const { data, error } = await sb.from('report_dashboard_widgets')
      .select('*').eq('layout_key', layoutKey).eq('is_active', true).order('sort_order');
    if (error) throw error;
    return (data || []).map((r: any) => ({
      id: r.id, layoutKey: r.layout_key, widgetKey: r.widget_key, title: r.title,
      description: r.description, widgetType: r.widget_type, sourceKey: r.source_key,
      metricConfig: r.metric_config || {}, queryConfig: r.query_config || {},
      chartConfig: r.chart_config || {}, drilldownReportSlug: r.drilldown_report_slug,
      drilldownFilters: r.drilldown_filters || {}, icon: r.icon, variant: r.variant,
      width: r.width || 'md', sortOrder: r.sort_order ?? 0, isActive: r.is_active,
    }));
  } catch (e) {
    warnFallback(`report_dashboard_widgets:${layoutKey}`, e);
    return [];
  }
}

// =========== Option sets ===========
export async function getOptionSet(key: string): Promise<ReportOption[]> {
  try {
    const { data, error } = await sb.from('report_option_sets')
      .select('*').eq('option_set_key', key).eq('is_active', true).order('sort_order');
    if (error) throw error;
    if (!data?.length) throw new Error('empty');
    return (data || []).map((r: any) => ({
      value: r.value, label: r.label, metadata: r.metadata, sortOrder: r.sort_order ?? 0,
    }));
  } catch (e) {
    warnFallback(`report_option_sets:${key}`, e);
    return staticOptionSet(key);
  }
}

function staticOptionSet(key: string): ReportOption[] {
  switch (key) {
    case 'schedule_frequency':
      return [
        { value: 'daily', label: 'Daily', sortOrder: 1 },
        { value: 'weekly', label: 'Weekly', sortOrder: 2 },
        { value: 'monthly', label: 'Monthly', sortOrder: 3 },
        { value: 'quarterly', label: 'Quarterly', sortOrder: 4 },
      ];
    case 'export_format':
      return [
        { value: 'csv', label: 'CSV', sortOrder: 1 },
        { value: 'xlsx', label: 'Excel (XLSX)', sortOrder: 2 },
        { value: 'json', label: 'JSON', sortOrder: 3 },
        { value: 'pdf', label: 'PDF', sortOrder: 4 },
      ];
    case 'sort_direction':
      return [
        { value: 'asc', label: 'Ascending', sortOrder: 1 },
        { value: 'desc', label: 'Descending', sortOrder: 2 },
      ];
    case 'date_preset':
      return [
        { value: 'today', label: 'Today', sortOrder: 1 },
        { value: 'this_week', label: 'This Week', sortOrder: 2 },
        { value: 'this_month', label: 'This Month', sortOrder: 3 },
        { value: 'this_quarter', label: 'This Quarter', sortOrder: 4 },
        { value: 'this_fy', label: 'This Financial Year', sortOrder: 5 },
        { value: 'custom', label: 'Custom', sortOrder: 6 },
      ];
    case 'report_run_status':
      return [
        { value: 'ready', label: 'Ready', sortOrder: 1 },
        { value: 'generating', label: 'Generating', sortOrder: 2 },
        { value: 'queued', label: 'Queued', sortOrder: 3 },
        { value: 'failed', label: 'Failed', sortOrder: 4 },
        { value: 'expired', label: 'Expired', sortOrder: 5 },
      ];
    default:
      return [];
  }
}

// =========== Runtime config ===========
export async function getRuntimeConfig(): Promise<Record<string, unknown>> {
  try {
    const { data, error } = await sb.from('report_runtime_config').select('key, value');
    if (error) throw error;
    const out: Record<string, unknown> = {};
    (data || []).forEach((r: any) => { out[r.key] = r.value; });
    return out;
  } catch {
    return {};
  }
}

// =========== Dynamic option lookup (table-backed) ===========
export async function fetchTableOptions(table: string, valueCol = 'id', labelCol = 'name'): Promise<Array<{ value: string; label: string }>> {
  try {
    const { data, error } = await (supabase.from(table as any) as any).select(`${valueCol}, ${labelCol}`).limit(500);
    if (error) throw error;
    return (data || []).map((r: any) => ({ value: String(r[valueCol]), label: String(r[labelCol] ?? r[valueCol]) }));
  } catch (e) {
    warnFallback(`fetchTableOptions:${table}`, e);
    return [];
  }
}

// =========== Bundle (single round trip for shared screens) ===========
export async function getReportMetadataBundle() {
  const [sources, definitions, layouts, runtime] = await Promise.all([
    getReportSources(), getReportDefinitions(), getDashboardLayouts(), getRuntimeConfig(),
  ]);
  return { sources, definitions, layouts, runtime };
}

// =========== Admin CRUD (service-layer scaffolding — UI is future scope) ===========
// TODO: surface in a future Admin Metadata tab. RLS already restricts writes to admins.
export async function upsertReportSource(input: Partial<ReportSourceMeta> & { sourceKey: string }) {
  const row = {
    source_key: input.sourceKey, label: input.label, table_name: input.tableName,
    module: input.module, description: input.description,
    safe_columns: input.safeColumns, default_columns: input.defaultColumns,
    sensitive_columns: input.sensitiveColumns, source_routes: input.sourceRoutes,
    is_active: input.isActive ?? true, supports_ad_hoc: input.supportsAdHoc ?? true,
    supports_scheduling: input.supportsScheduling ?? true,
    updated_at: new Date().toISOString(),
  };
  return sb.from('report_sources').upsert(row, { onConflict: 'source_key' });
}

export async function setSourceActive(sourceKey: string, active: boolean) {
  return sb.from('report_sources').update({ is_active: active, updated_at: new Date().toISOString() }).eq('source_key', sourceKey);
}

export async function setDefinitionActive(slug: string, active: boolean) {
  return sb.from('report_definitions').update({ is_active: active, updated_at: new Date().toISOString() }).eq('slug', slug);
}

export async function setWidgetActive(id: string, active: boolean) {
  return sb.from('report_dashboard_widgets').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id);
}
