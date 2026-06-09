import { supabase } from '@/integrations/supabase/client';
import type {
  BuilderConfig, ExportFormat, ReportFavorite, ReportFilters, ReportRun,
  ReportSchedule, ReportSource, ReportTemplate, ScheduleFrequency, SortDirection,
} from '../types';
import { REPORT_DEFINITIONS, SENSITIVE_COLUMNS } from '../reportDefinitions';

export const ALLOWED_SOURCES: ReportSource[] = [
  'applications', 'licenses', 'payments', 'compliance_returns', 'complaints', 'users', 'audit_logs', 'report_logs',
];

export function isAllowedSource(s: string): s is ReportSource {
  return (ALLOWED_SOURCES as string[]).includes(s);
}

/** Mirrors REPORT_DEFINITIONS source values; used to resolve schedule source from slug. */
export const REPORT_SLUG_SOURCE_MAP: Record<string, ReportSource> = {
  'app-status': 'applications', 'app-aging': 'applications', 'app-sla': 'applications',
  'lic-issuance': 'licenses', 'lic-expiry': 'licenses', 'lic-suspended': 'licenses', 'lic-distribution': 'licenses',
  'ret-status': 'compliance_returns', 'ret-overdue': 'compliance_returns', 'ret-defaulters': 'compliance_returns',
  'ret-scorecard': 'compliance_returns', 'ret-latefee': 'compliance_returns', 'ret-risk': 'compliance_returns',
  'ret-repeat': 'compliance_returns',
  'fee-collection': 'payments', 'fee-outstanding': 'payments', 'fee-failed': 'payments',
  'fee-refund': 'payments', 'fee-sector': 'payments', 'fee-trend': 'payments',
  'op-workload': 'applications', 'op-productivity': 'applications', 'op-process-time': 'applications',
  'op-ratio': 'applications', 'op-pending': 'applications', 'op-login': 'audit_logs',
  'cmp-volume': 'complaints', 'cmp-resolution': 'complaints', 'cmp-pending': 'complaints',
  'cmp-category': 'complaints', 'cmp-escalated': 'complaints',
  'aud-trail': 'audit_logs', 'aud-permissions': 'audit_logs', 'aud-export': 'report_logs',
  'aud-failed-login': 'audit_logs', 'aud-admin': 'audit_logs',
};

export function resolveScheduleSource(schedule: { source?: string | null; report_slug?: string | null }): ReportSource | null {
  const s = (schedule.source || '').trim();
  if (s && isAllowedSource(s)) return s;
  const slug = (schedule.report_slug || '').trim();
  if (slug && REPORT_SLUG_SOURCE_MAP[slug]) return REPORT_SLUG_SOURCE_MAP[slug];
  return null;
}

export function resolveDateRange(filters: ReportFilters): { from?: string; to?: string } {
  if (filters.preset && filters.preset !== 'custom') {
    const now = new Date();
    const from = new Date(now);
    if (filters.preset === 'today') from.setHours(0, 0, 0, 0);
    else if (filters.preset === 'this_week') { from.setDate(now.getDate() - now.getDay()); from.setHours(0, 0, 0, 0); }
    else if (filters.preset === 'this_month') { from.setDate(1); from.setHours(0, 0, 0, 0); }
    else if (filters.preset === 'this_quarter') { const q = Math.floor(now.getMonth() / 3) * 3; from.setMonth(q, 1); from.setHours(0, 0, 0, 0); }
    else if (filters.preset === 'this_fy') { const fy = 3; const y = now.getMonth() >= fy ? now.getFullYear() : now.getFullYear() - 1; from.setFullYear(y, fy, 1); from.setHours(0, 0, 0, 0); }
    return { from: from.toISOString(), to: now.toISOString() };
  }
  return { from: filters.dateFrom, to: filters.dateTo };
}

function stripSensitive(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SENSITIVE_COLUMNS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function selectColumns<T extends Record<string, unknown>>(rows: T[], cols?: string[]) {
  if (!cols || !cols.length) return rows;
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c) => { if (c in r) o[c] = r[c]; });
    return o as T;
  });
}

// =========== Edge function entry points ===========

async function invokeGenerate(opts: {
  reportSlug?: string;
  reportName?: string;
  category?: string;
  source: ReportSource;
  filters: ReportFilters;
  selectedColumns?: string[];
  defaultColumns?: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: SortDirection;
  mode: 'preview' | 'generate';
  limit?: number;
}) {
  const { data, error } = await supabase.functions.invoke('generate-report', { body: opts });
  if (error) throw error;
  if (data && data.ok === false) throw new Error(data.error || 'Report generation failed');
  return data as { run: any; rows: any[]; summary: any; rowCount: number; totalCount: number };
}

export async function previewReport(
  source: ReportSource,
  filters: ReportFilters,
  limit = 100,
  extra: { selectedColumns?: string[]; groupBy?: string; sortBy?: string; sortDir?: SortDirection; reportSlug?: string } = {},
) {
  try {
    const res = await invokeGenerate({ source, filters, mode: 'preview', limit, ...extra });
    return { rows: res.rows, count: res.totalCount ?? res.rowCount };
  } catch {
    // Client-side fallback (dev only)
    const table = source === 'users' ? 'profiles' : source;
    let q = (supabase.from(table as any).select('*', { count: 'exact' }) as any).limit(limit);
    const { from, to } = resolveDateRange(filters);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
    const { data, count } = await q;
    const rows = (data || []).map(stripSensitive);
    return { rows: selectColumns(rows, extra.selectedColumns), count: count ?? rows.length };
  }
}

export async function generateReport(opts: {
  name: string;
  category: string;
  source: ReportSource;
  filters: ReportFilters;
  reportSlug?: string;
  description?: string;
  selectedColumns?: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: SortDirection;
}): Promise<ReportRun> {
  const def = opts.reportSlug ? REPORT_DEFINITIONS.find((d) => d.id === opts.reportSlug) : undefined;
  const res = await invokeGenerate({
    reportName: opts.name,
    reportSlug: opts.reportSlug,
    category: opts.category,
    source: opts.source,
    filters: opts.filters,
    selectedColumns: opts.selectedColumns,
    defaultColumns: def?.defaultColumns,
    groupBy: opts.groupBy,
    sortBy: opts.sortBy,
    sortDir: opts.sortDir,
    mode: 'generate',
  });
  return mapReportRow(res.run, res.rows, res.summary);
}

export async function generateFromBuilder(config: BuilderConfig): Promise<ReportRun> {
  return generateReport({
    name: config.name,
    category: 'Ad-Hoc',
    source: config.source,
    filters: config.filters,
    selectedColumns: config.columns,
    groupBy: config.groupBy,
    sortBy: config.sortBy,
    sortDir: config.sortDir,
    description: config.description,
  });
}

// =========== History ===========

/**
 * Read report history.
 *
 * Storage model:
 *   - `reports` is the physical, legacy-compatible table that stores each run.
 *   - `report_runs` is a read-only semantic view over `reports` (renamed columns).
 *   - Full row payloads live in `report_run_rows`; `reports.result_data` is a
 *     legacy preview cache only (capped at 500 rows).
 * We prefer reading from `report_runs`. If the view is unavailable in a
 * particular environment we transparently fall back to the physical table.
 */
export async function getReportHistory(): Promise<ReportRun[]> {
  const viewRes = await supabase
    .from('report_runs' as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (!viewRes.error && viewRes.data) {
    return (viewRes.data as any[]).map((row) =>
      mapReportRow(row, [], row.result_summary),
    );
  }
  // Fallback: physical table.
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map((row: any) =>
    mapReportRow(row, Array.isArray(row.result_data) ? row.result_data : [], row.result_summary),
  );
}

export async function fetchRunRows(runId: string, limit = 10000): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from('report_run_rows' as any)
    .select('row_data, row_index')
    .eq('report_run_id', runId)
    .order('row_index', { ascending: true })
    .limit(limit);
  if (error) return [];
  return ((data || []) as any[]).map((r) => r.row_data);
}

export async function deleteReportRun(id: string) {
  // Delete targets the physical `reports` table because `report_runs` is a view.
  const { error } = await supabase.from('reports').delete().eq('id', id);
  if (error) throw error;
}

function mapReportRow(row: any, rows: any[] = [], summary?: any): ReportRun {
  const qc = (row?.query_config || {}) as any;
  // Support both physical-table columns (name/result_count/created_by) and
  // semantic view columns (report_name/row_count/generated_by).
  return {
    id: row?.id,
    name: row?.report_name ?? row?.name,
    category: row?.category,
    source: (row?.source || qc.source) as ReportSource | undefined,
    slug: row?.report_slug || qc.reportSlug,
    filters: row?.filters_json || qc.filters || {},
    selectedColumns: row?.selected_columns || qc.selectedColumns || [],
    groupBy: row?.group_by || qc.groupBy,
    sortBy: row?.sort_by || qc.sortBy,
    sortDir: (row?.sort_dir || qc.sortDir) as SortDirection | undefined,
    summary: summary || row?.result_summary || {},
    rows,
    rowCount: row?.row_count ?? row?.result_count ?? rows.length,
    generatedBy: row?.generated_by ?? row?.created_by,
    generatedAt: row?.generated_at || row?.created_at,
    durationMs: row?.duration_ms ?? null,
    errorMessage: row?.error_message ?? null,
    status: (row?.status as ReportRun['status']) || 'ready',
  };
}

// =========== Audit logging ===========

/**
 * Insert a report log entry. Tolerates schemas that have only `report_id`,
 * only `report_run_id`, or both. Best-effort: never throws.
 */
export async function logExport(reportId: string | null, format: ExportFormat, rowCount: number) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    const base = {
      action: `export_${format}`,
      executed_by: user?.id,
      record_count: rowCount,
      export_format: format,
    } as Record<string, any>;
    // Try with both columns first.
    const full = { ...base, report_id: reportId, report_run_id: reportId };
    let res = await (supabase.from('report_logs') as any).insert(full);
    if (!res.error) return;
    const msg = String(res.error?.message || '');
    if (/report_run_id/i.test(msg)) {
      res = await (supabase.from('report_logs') as any).insert({ ...base, report_id: reportId });
      if (!res.error) return;
    }
    if (/report_id/i.test(String(res.error?.message || ''))) {
      await (supabase.from('report_logs') as any).insert({ ...base, report_run_id: reportId });
    }
  } catch (e) {
    if (typeof console !== 'undefined') console.warn('[reports] logExport failed', e);
  }
}

// =========== Schedules ===========

export function calculateNextRunAt(frequency: ScheduleFrequency, from = new Date()): Date {
  const d = new Date(from);
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
  }
  d.setHours(7, 0, 0, 0);
  return d;
}

export async function getReportSchedules(): Promise<ReportSchedule[]> {
  const { data, error } = await supabase
    .from('report_schedules')
    .select('*, reports(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((s: any) => ({
    id: s.id,
    reportId: s.report_id ?? null,
    reportSlug: s.report_slug,
    reportName: s.report_name || s.reports?.name,
    source: s.source,
    frequency: s.schedule_type as ScheduleFrequency,
    recipients: s.recipients || [],
    recipientRoles: s.recipient_roles || [],
    exportFormat: s.export_format as ExportFormat,
    isActive: s.is_active,
    lastRunAt: s.last_run_at,
    nextRunAt: s.next_run_at,
    lastStatus: s.last_status,
    lastError: s.last_error,
    retryCount: s.retry_count,
  }));
}

export async function createReportSchedule(config: {
  reportId?: string | null;
  reportSlug?: string;
  reportName: string;
  source?: string;
  filters?: ReportFilters;
  selectedColumns?: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: SortDirection;
  frequency: ScheduleFrequency;
  recipients: string[];
  exportFormat: ExportFormat;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const next = calculateNextRunAt(config.frequency);
  // Resolve source: explicit > slug lookup. Never persist an empty source if avoidable.
  const resolvedSource = (config.source && isAllowedSource(config.source))
    ? config.source
    : (config.reportSlug ? REPORT_SLUG_SOURCE_MAP[config.reportSlug] || null : null);
  const { error } = await supabase.from('report_schedules').insert({
    report_id: config.reportId ?? null,
    report_slug: config.reportSlug || null,
    report_name: config.reportName,
    source: resolvedSource,
    filters_json: config.filters || {},
    selected_columns: config.selectedColumns || [],
    group_by: config.groupBy || null,
    sort_by: config.sortBy || null,
    sort_dir: config.sortDir || null,
    schedule_type: config.frequency,
    recipients: config.recipients,
    export_format: config.exportFormat,
    is_active: true,
    created_by: user?.id,
    next_run_at: next.toISOString(),
  } as any);
  if (error) throw error;
}

export async function updateReportSchedule(id: string, patch: Partial<{ isActive: boolean; frequency: ScheduleFrequency; recipients: string[]; exportFormat: ExportFormat }>) {
  const update: Record<string, unknown> = {};
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.frequency) { update.schedule_type = patch.frequency; update.next_run_at = calculateNextRunAt(patch.frequency).toISOString(); }
  if (patch.recipients) update.recipients = patch.recipients;
  if (patch.exportFormat) update.export_format = patch.exportFormat;
  const { error } = await supabase.from('report_schedules').update(update).eq('id', id);
  if (error) throw error;
}

export async function deleteReportSchedule(id: string) {
  const { error } = await supabase.from('report_schedules').delete().eq('id', id);
  if (error) throw error;
}

export async function runScheduleNow(scheduleId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('report_logs').insert({
    schedule_id: scheduleId,
    action: 'schedule_run_manual',
    executed_by: user?.id,
  }).then(() => null, () => null);
  const { data, error } = await supabase.functions.invoke('run-scheduled-reports', {
    body: { scheduleId },
  });
  if (error) throw error;
  if (data?.ok === false) throw new Error(data.error || 'Run failed');
  return data;
}

// =========== Favorites (backend + localStorage fallback) ===========

const LS_FAVS = 'reports:favorites';
function lsFavs(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(LS_FAVS) || '[]')); } catch { return new Set(); }
}
function saveLsFavs(set: Set<string>) {
  localStorage.setItem(LS_FAVS, JSON.stringify(Array.from(set)));
}

export async function listFavorites(): Promise<ReportFavorite[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Array.from(lsFavs()).map((s) => ({ reportSlug: s, createdAt: '' }));
    const { data, error } = await supabase
      .from('report_favorites' as any)
      .select('report_slug, created_at')
      .eq('user_id', user.id);
    if (error) throw error;
    return ((data || []) as any[]).map((r) => ({ reportSlug: r.report_slug, createdAt: r.created_at }));
  } catch {
    return Array.from(lsFavs()).map((s) => ({ reportSlug: s, createdAt: '' }));
  }
}

export async function toggleFavorite(slug: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const set = lsFavs();
      if (set.has(slug)) { set.delete(slug); saveLsFavs(set); return false; }
      set.add(slug); saveLsFavs(set); return true;
    }
    const existing = await supabase
      .from('report_favorites' as any)
      .select('id')
      .eq('user_id', user.id).eq('report_slug', slug).maybeSingle();
    if (existing.data) {
      await supabase.from('report_favorites' as any).delete().eq('id', (existing.data as any).id);
      return false;
    }
    await supabase.from('report_favorites' as any).insert({ user_id: user.id, report_slug: slug });
    return true;
  } catch {
    const set = lsFavs();
    if (set.has(slug)) { set.delete(slug); saveLsFavs(set); return false; }
    set.add(slug); saveLsFavs(set); return true;
  }
}

// =========== Templates ===========

export async function listTemplates(): Promise<ReportTemplate[]> {
  const { data, error } = await supabase
    .from('report_templates' as any)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data || []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    source: r.source as ReportSource,
    filters: r.filters_json || {},
    selectedColumns: r.selected_columns || [],
    groupBy: r.group_by,
    sortBy: r.sort_by,
    sortDir: r.sort_dir,
    visibility: r.visibility,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function saveTemplate(t: {
  id?: string;
  name: string;
  description?: string;
  source: ReportSource;
  filters: ReportFilters;
  selectedColumns: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: SortDirection;
  visibility?: 'private' | 'shared';
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    name: t.name,
    description: t.description || null,
    source: t.source,
    filters_json: t.filters || {},
    selected_columns: t.selectedColumns || [],
    group_by: t.groupBy || null,
    sort_by: t.sortBy || null,
    sort_dir: t.sortDir || 'asc',
    visibility: t.visibility || 'private',
    created_by: user?.id,
  };
  if (t.id) {
    const { error } = await supabase.from('report_templates' as any).update(payload).eq('id', t.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('report_templates' as any).insert(payload as any);
    if (error) throw error;
  }
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase.from('report_templates' as any).delete().eq('id', id);
  if (error) throw error;
}

export function findDefinition(id: string) {
  return REPORT_DEFINITIONS.find((d) => d.id === id);
}

// =========== Metrics (unchanged) ===========

export async function getReportMetrics() {
  const [appsRes, paysRes, licRes, retRes, cmpRes] = await Promise.allSettled([
    supabase.from('applications').select('status, created_at, license_type').limit(5000),
    supabase.from('payments').select('amount, status, created_at').limit(5000),
    supabase.from('licenses').select('status, expiry_date').limit(5000),
    supabase.from('compliance_returns').select('status, due_date, submitted_at').limit(5000),
    supabase.from('complaints').select('status, created_at, complaint_type_id').limit(5000),
  ]);

  const apps = appsRes.status === 'fulfilled' ? (appsRes.value.data || []) : [];
  const pays = paysRes.status === 'fulfilled' ? (paysRes.value.data || []) : [];
  const lics = licRes.status === 'fulfilled' ? (licRes.value.data || []) : [];
  const rets = retRes.status === 'fulfilled' ? (retRes.value.data || []) : [];
  const cmps = cmpRes.status === 'fulfilled' ? (cmpRes.value.data || []) : [];

  const monthLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });

  const statusCounts: Record<string, number> = {};
  const monthCounts: Record<string, number> = {};
  apps.forEach((a: any) => {
    statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
    monthCounts[monthLabel(a.created_at)] = (monthCounts[monthLabel(a.created_at)] || 0) + 1;
  });

  let totalRevenue = 0, outstanding = 0;
  const revByMonth: Record<string, number> = {};
  pays.forEach((p: any) => {
    const amt = Number(p.amount) || 0;
    if (p.status === 'completed' || p.status === 'paid' || p.status === 'success') {
      totalRevenue += amt;
      const m = monthLabel(p.created_at);
      revByMonth[m] = (revByMonth[m] || 0) + amt;
    } else if (p.status === 'pending' || p.status === 'failed') {
      outstanding += amt;
    }
  });

  const now = new Date();
  const activeLicenses = lics.filter((l: any) => (l.status || '').toLowerCase() === 'active').length;
  const expiryTrend: Record<string, number> = {};
  lics.forEach((l: any) => {
    if (!l.expiry_date) return;
    const m = monthLabel(l.expiry_date);
    expiryTrend[m] = (expiryTrend[m] || 0) + 1;
  });

  const overdueReturns = rets.filter((r: any) => {
    const s = (r.status || '').toLowerCase();
    return (s === 'pending' || s === 'tbr' || s === 'rej') && r.due_date && new Date(r.due_date) < now;
  }).length;
  const submittedReturns = rets.filter((r: any) =>
    r.submitted_at || ['submitted', 'sub', 'validated', 'approved'].includes((r.status || '').toLowerCase())
  ).length;
  const complianceRate = rets.length ? Math.round((submittedReturns / rets.length) * 100) : 0;
  const retStats = [
    { name: 'Submitted', value: rets.filter((r: any) => ['submitted', 'sub'].includes((r.status || '').toLowerCase())).length },
    { name: 'Pending', value: rets.filter((r: any) => (r.status || '').toLowerCase() === 'pending').length },
    { name: 'Validated', value: rets.filter((r: any) => ['validated', 'approved'].includes((r.status || '').toLowerCase())).length },
    { name: 'Overdue', value: overdueReturns },
  ];

  const cmpByStatus: Record<string, number> = {};
  cmps.forEach((c: any) => { cmpByStatus[c.status] = (cmpByStatus[c.status] || 0) + 1; });
  const complaintBacklog = cmps.filter((c: any) => !['resolved', 'closed', 'dismissed'].includes((c.status || '').toLowerCase())).length;

  return {
    totalApplications: apps.length,
    pendingApplications: apps.filter((a: any) => ['pending', 'submitted', 'in_review', 'under_review'].includes((a.status || '').toLowerCase())).length,
    activeLicenses,
    totalRevenue,
    outstandingDues: outstanding,
    overdueReturns,
    complianceRate,
    complaintBacklog,
    appsByMonth: Object.entries(monthCounts).slice(-12).map(([month, count]) => ({ month, count })),
    appsByStatus: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
    revenueByMonth: Object.entries(revByMonth).slice(-12).map(([month, amount]) => ({ month, amount })),
    complianceStats: retStats,
    licenseExpiryTrend: Object.entries(expiryTrend).slice(0, 12).map(([month, expiring]) => ({ month, expiring })),
    complaintsByStatus: Object.entries(cmpByStatus).map(([name, value]) => ({ name, value })),
  };
}
