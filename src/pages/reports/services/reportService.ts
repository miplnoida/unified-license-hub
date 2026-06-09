import { supabase } from '@/integrations/supabase/client';
import type {
  BuilderConfig,
  ExportFormat,
  ReportFilters,
  ReportRun,
  ReportSchedule,
  ScheduleFrequency,
  ReportSource,
} from '../types';
import { REPORT_DEFINITIONS, SENSITIVE_COLUMNS } from '../reportDefinitions';

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

export function resolveDateRange(filters: ReportFilters): { from?: string; to?: string } {
  if (filters.preset && filters.preset !== 'custom') {
    const now = new Date();
    const from = new Date(now);
    if (filters.preset === 'today') from.setHours(0, 0, 0, 0);
    else if (filters.preset === 'this_week') { const d = now.getDay(); from.setDate(now.getDate() - d); from.setHours(0, 0, 0, 0); }
    else if (filters.preset === 'this_month') { from.setDate(1); from.setHours(0, 0, 0, 0); }
    else if (filters.preset === 'this_quarter') { const q = Math.floor(now.getMonth() / 3) * 3; from.setMonth(q, 1); from.setHours(0, 0, 0, 0); }
    else if (filters.preset === 'this_fy') { const fyStartMonth = 3; const y = now.getMonth() >= fyStartMonth ? now.getFullYear() : now.getFullYear() - 1; from.setFullYear(y, fyStartMonth, 1); from.setHours(0, 0, 0, 0); }
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

const ALLOWED_SOURCES: ReportSource[] = ['applications', 'licenses', 'payments', 'compliance_returns', 'complaints', 'audit_logs'];

export async function runQuery(source: ReportSource, filters: ReportFilters, limit = 5000) {
  if (!ALLOWED_SOURCES.includes(source) && source !== 'users') {
    throw new Error(`Unsupported source: ${source}`);
  }
  const table = source === 'users' ? 'profiles' : source;
  let q = (supabase.from(table as any).select('*', { count: 'exact' }) as any).limit(limit);
  const { from, to } = resolveDateRange(filters);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.sector && filters.sector !== 'all' && (source === 'applications' || source === 'licenses')) {
    // sectors are not directly on these tables; skip silently
  }
  const { data, error, count } = await q;
  if (error) throw error;
  const rows = (data || []).map(stripSensitive);
  return { rows, count: count ?? rows.length };
}

export async function generateReport(opts: {
  name: string;
  category: string;
  source: ReportSource;
  filters: ReportFilters;
  reportType?: 'predefined' | 'ad_hoc';
  description?: string;
}): Promise<ReportRun> {
  const { rows, count } = await runQuery(opts.source, opts.filters);
  const { data: { user } } = await supabase.auth.getUser();
  const payload = {
    name: opts.name,
    description: opts.description ?? null,
    report_type: opts.reportType ?? 'predefined',
    category: opts.category,
    query_config: { source: opts.source, filters: opts.filters } as any,
    result_data: rows as any,
    result_count: count,
    generated_at: new Date().toISOString(),
    status: 'ready',
    created_by: user?.id,
  };
  const { data, error } = await supabase.from('reports').insert(payload).select('*').single();
  if (error) throw error;
  // best-effort log
  await supabase.from('report_logs').insert({ action: 'generated', executed_by: user?.id, record_count: count }).then(() => null, () => null);
  return mapReportRow(data);
}

export async function previewReport(source: ReportSource, filters: ReportFilters, limit = 100) {
  return runQuery(source, filters, limit);
}

export async function getReportHistory(): Promise<ReportRun[]> {
  const { data, error } = await supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []).map(mapReportRow);
}

export async function deleteReportRun(id: string) {
  const { error } = await supabase.from('reports').delete().eq('id', id);
  if (error) throw error;
}

export async function logExport(reportId: string | null, format: ExportFormat, rowCount: number) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from('report_logs').insert({
    action: `export_${format}`,
    executed_by: user?.id,
    record_count: rowCount,
  }).then(() => null, () => null);
}

function mapReportRow(row: any): ReportRun {
  const qc = (row.query_config || {}) as { source?: ReportSource; filters?: ReportFilters };
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    source: qc.source,
    filters: qc.filters || {},
    rows: Array.isArray(row.result_data) ? row.result_data : [],
    rowCount: row.result_count ?? (Array.isArray(row.result_data) ? row.result_data.length : 0),
    generatedBy: row.created_by,
    generatedAt: row.generated_at || row.created_at,
    status: (row.status as ReportRun['status']) || 'ready',
  };
}

// ============ Schedules ============

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
    .from('report_schedules').select('*, reports(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((s: any) => ({
    id: s.id,
    reportId: s.report_id,
    reportName: s.reports?.name,
    frequency: s.schedule_type as ScheduleFrequency,
    recipients: s.recipients || [],
    exportFormat: s.export_format as ExportFormat,
    isActive: s.is_active,
    lastRunAt: s.last_run_at,
    nextRunAt: s.next_run_at,
  }));
}

export async function createReportSchedule(config: {
  reportId: string;
  frequency: ScheduleFrequency;
  recipients: string[];
  exportFormat: ExportFormat;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const next = calculateNextRunAt(config.frequency);
  const { error } = await supabase.from('report_schedules').insert({
    report_id: config.reportId,
    schedule_type: config.frequency,
    recipients: config.recipients,
    export_format: config.exportFormat,
    is_active: true,
    created_by: user?.id,
    next_run_at: next.toISOString(),
  });
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

export function findDefinition(id: string) {
  return REPORT_DEFINITIONS.find((d) => d.id === id);
}

export async function generateFromBuilder(config: BuilderConfig): Promise<ReportRun> {
  return generateReport({
    name: config.name,
    category: 'Ad-Hoc',
    source: config.source,
    filters: config.filters,
    reportType: 'ad_hoc',
    description: config.description,
  });
}

// ============ Metrics ============

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
  const submittedReturns = rets.filter((r: any) => r.submitted_at || ['submitted', 'sub', 'validated', 'approved'].includes((r.status || '').toLowerCase())).length;
  const complianceRate = rets.length ? Math.round((submittedReturns / rets.length) * 100) : 0;
  const retStats = [
    { name: 'Submitted', value: rets.filter((r: any) => (r.status || '').toLowerCase() === 'submitted' || (r.status || '').toLowerCase() === 'sub').length },
    { name: 'Pending', value: rets.filter((r: any) => (r.status || '').toLowerCase() === 'pending').length },
    { name: 'Validated', value: rets.filter((r: any) => (r.status || '').toLowerCase() === 'validated' || (r.status || '').toLowerCase() === 'approved').length },
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
