// Shared report-generator used by generate-report (interactive) and
// run-scheduled-reports (cron). Keeps logic identical between manual and scheduled.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const ALLOWED_SOURCES = new Set([
  'applications', 'licenses', 'payments', 'compliance_returns',
  'complaints', 'profiles', 'users', 'audit_logs', 'report_logs',
]);

export const SENSITIVE = new Set([
  'password', 'password_hash', 'token', 'access_token', 'refresh_token',
  'secret', 'api_key', 'private_key', 'otp', 'otp_code', 'mfa_secret',
  'encrypted_password', 'raw_user_meta_data', 'raw_app_meta_data',
  'confirmation_token', 'recovery_token', 'session_id',
]);

// Map predefined report slug -> source. Mirrors src/pages/reports/reportDefinitions.ts
export const REPORT_SLUG_SOURCE_MAP: Record<string, string> = {
  // Licensing & Applications
  'app-status': 'applications', 'app-aging': 'applications', 'app-sla': 'applications',
  'lic-issuance': 'licenses', 'lic-expiry': 'licenses', 'lic-suspended': 'licenses',
  'lic-distribution': 'licenses',
  // Returns
  'ret-status': 'compliance_returns', 'ret-overdue': 'compliance_returns',
  'ret-defaulters': 'compliance_returns', 'ret-scorecard': 'compliance_returns',
  'ret-latefee': 'compliance_returns', 'ret-risk': 'compliance_returns',
  'ret-repeat': 'compliance_returns',
  // Revenue
  'fee-collection': 'payments', 'fee-outstanding': 'payments', 'fee-failed': 'payments',
  'fee-refund': 'payments', 'fee-sector': 'payments', 'fee-trend': 'payments',
  // Ops
  'op-workload': 'applications', 'op-productivity': 'applications',
  'op-process-time': 'applications', 'op-ratio': 'applications',
  'op-pending': 'applications', 'op-login': 'audit_logs',
  // Complaints
  'cmp-volume': 'complaints', 'cmp-resolution': 'complaints',
  'cmp-pending': 'complaints', 'cmp-category': 'complaints', 'cmp-escalated': 'complaints',
  // Audit
  'aud-trail': 'audit_logs', 'aud-permissions': 'audit_logs',
  'aud-export': 'report_logs', 'aud-failed-login': 'audit_logs', 'aud-admin': 'audit_logs',
};

export function resolveScheduleSource(schedule: { source?: string | null; report_slug?: string | null }): string | null {
  const s = (schedule.source || '').trim();
  if (s && ALLOWED_SOURCES.has(s)) return s;
  const slug = (schedule.report_slug || '').trim();
  if (slug && REPORT_SLUG_SOURCE_MAP[slug]) return REPORT_SLUG_SOURCE_MAP[slug];
  return null;
}

// Per-source safe filter column map. Filters referencing unknown columns are skipped.
export const FILTER_COLUMN_MAP: Record<string, Record<string, string>> = {
  applications: { status: 'status', licenseType: 'license_type', officer: 'ack_by', regulator: 'regulator_id' },
  licenses: { status: 'status', licenseType: 'license_type', regulator: 'regulator_id', sector: 'sector_id', subSector: 'sub_sector_id' },
  payments: { paymentStatus: 'status', status: 'status' },
  compliance_returns: { returnStatus: 'status', status: 'status', licensee: 'license_id' },
  complaints: { complaintStatus: 'status', status: 'status', regulator: 'regulator_id' },
  profiles: {},
  users: {},
  audit_logs: {},
  report_logs: { action: 'action' },
};

// Required computed columns that must always appear for a given report slug,
// even if the user did not pick them in the column selector.
export const REQUIRED_COMPUTED_COLUMNS: Record<string, string[]> = {
  'app-aging': ['aging_days', 'aging_bucket'],
  'app-sla': ['sla_days', 'elapsed_days', 'sla_status'],
  'op-pending': ['aging_days', 'aging_bucket'],
  'op-ratio': ['approved_count', 'rejected_count', 'pending_count', 'approval_rate'],
  'lic-expiry': ['days_to_expiry'],
  'ret-overdue': ['days_overdue'],
  'ret-defaulters': ['overdue_count'],
  'ret-repeat': ['overdue_count'],
  'ret-scorecard': ['submitted_count', 'overdue_count', 'pending_count', 'compliance_rate'],
  'cmp-resolution': ['resolution_days'],
  'fee-trend': ['period_month', 'period_quarter'],
};

/**
 * Determine the actual column set to project, ensuring required computed
 * columns for a predefined report are always included.
 */
export function getEffectiveColumns(slug: string | undefined, selected: string[] | undefined, fallback: string[] = []): string[] {
  const base = (selected && selected.length) ? [...selected] : [...fallback];
  const required = slug ? (REQUIRED_COMPUTED_COLUMNS[slug] || []) : [];
  for (const r of required) if (!base.includes(r)) base.push(r);
  return base;
}

export function strip(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (SENSITIVE.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function resolveRange(f: Record<string, any>): { from?: string; to?: string } {
  const now = new Date();
  if (f?.preset && f.preset !== 'custom') {
    const from = new Date(now);
    if (f.preset === 'today') from.setHours(0, 0, 0, 0);
    else if (f.preset === 'this_week') { from.setDate(now.getDate() - now.getDay()); from.setHours(0, 0, 0, 0); }
    else if (f.preset === 'this_month') { from.setDate(1); from.setHours(0, 0, 0, 0); }
    else if (f.preset === 'this_quarter') { const q = Math.floor(now.getMonth() / 3) * 3; from.setMonth(q, 1); from.setHours(0, 0, 0, 0); }
    else if (f.preset === 'this_fy') { const fy = 3; const y = now.getMonth() >= fy ? now.getFullYear() : now.getFullYear() - 1; from.setFullYear(y, fy, 1); from.setHours(0, 0, 0, 0); }
    return { from: from.toISOString(), to: now.toISOString() };
  }
  return { from: f?.dateFrom, to: f?.dateTo };
}

export function decorate(slug: string | undefined, rows: any[]): any[] {
  if (!slug) return rows;
  const now = Date.now();

  if (slug === 'app-aging' || slug === 'op-pending') {
    return rows.map((r) => {
      const base = new Date(r.submitted_at || r.created_at || now).getTime();
      const days = Math.max(0, Math.floor((now - base) / 86_400_000));
      let bucket = '0-7d';
      if (days > 90) bucket = '90d+';
      else if (days > 30) bucket = '31-90d';
      else if (days > 14) bucket = '15-30d';
      else if (days > 7) bucket = '8-14d';
      return { ...r, aging_days: days, aging_bucket: bucket };
    });
  }
  if (slug === 'app-sla') {
    const SLA_DAYS = 30;
    return rows.map((r) => {
      const base = new Date(r.submitted_at || r.created_at || now).getTime();
      const elapsed = Math.floor((now - base) / 86_400_000);
      const breached = elapsed > SLA_DAYS && !r.approved_at && !r.rejected_at;
      return {
        ...r,
        sla_days: SLA_DAYS,
        elapsed_days: elapsed,
        sla_status: breached ? 'breached' : elapsed > SLA_DAYS - 7 ? 'at_risk' : 'on_track',
      };
    });
  }
  if (slug === 'op-ratio') {
    const approved = rows.filter((r) => String(r.status || '').toLowerCase() === 'approved').length;
    const rejected = rows.filter((r) => String(r.status || '').toLowerCase() === 'rejected').length;
    const pending = rows.length - approved - rejected;
    const rate = rows.length ? Math.round((approved / rows.length) * 100) : 0;
    return rows.map((r) => ({ ...r, approved_count: approved, rejected_count: rejected, pending_count: pending, approval_rate: rate }));
  }
  if (slug === 'lic-expiry') {
    return rows
      .filter((r) => r.valid_until || r.expiry_date)
      .map((r) => {
        const exp = new Date(r.valid_until || r.expiry_date).getTime();
        return { ...r, days_to_expiry: Math.floor((exp - now) / 86_400_000) };
      })
      .sort((a, b) => (a.days_to_expiry ?? 1e9) - (b.days_to_expiry ?? 1e9));
  }
  if (slug === 'lic-suspended') {
    return rows.filter((r) => ['suspended', 'revoked'].includes(String(r.status || '').toLowerCase()));
  }
  if (slug === 'lic-distribution') {
    return rows.map((r) => ({ ...r, group_key: r.sector_id || r.license_type || 'unknown' }));
  }
  if (slug === 'ret-overdue') {
    return rows.filter((r) => {
      const due = r.due_date ? new Date(r.due_date).getTime() : null;
      const submitted = r.submitted_at || ['submitted', 'validated', 'approved', 'sub'].includes(String(r.status || '').toLowerCase());
      return due && due < now && !submitted;
    }).map((r) => ({ ...r, days_overdue: Math.max(0, Math.floor((now - new Date(r.due_date).getTime()) / 86_400_000)) }));
  }
  if (slug === 'ret-defaulters' || slug === 'ret-repeat') {
    const overdueByLicensee: Record<string, number> = {};
    rows.forEach((r) => {
      const due = r.due_date ? new Date(r.due_date).getTime() : null;
      const subm = r.submitted_at || ['submitted', 'validated', 'approved'].includes(String(r.status || '').toLowerCase());
      if (due && due < now && !subm) {
        const k = String(r.license_id || 'unknown');
        overdueByLicensee[k] = (overdueByLicensee[k] || 0) + 1;
      }
    });
    return rows.map((r) => ({ ...r, overdue_count: overdueByLicensee[String(r.license_id || 'unknown')] || 0 }))
      .filter((r) => slug === 'ret-defaulters' ? r.overdue_count > 0 : r.overdue_count > 1);
  }
  if (slug === 'ret-scorecard') {
    const total = rows.length;
    const submitted = rows.filter((r) => r.submitted_at || ['submitted', 'validated', 'approved'].includes(String(r.status || '').toLowerCase())).length;
    const overdue = rows.filter((r) => {
      const due = r.due_date ? new Date(r.due_date).getTime() : null;
      const subm = r.submitted_at;
      return due && due < now && !subm;
    }).length;
    const pending = total - submitted - overdue;
    const rate = total ? Math.round((submitted / total) * 100) : 0;
    return rows.map((r) => ({ ...r, submitted_count: submitted, overdue_count: overdue, pending_count: pending, compliance_rate: rate }));
  }
  if (slug === 'cmp-pending') {
    return rows.filter((r) => !['resolved', 'closed', 'dismissed'].includes(String(r.status || '').toLowerCase()));
  }
  if (slug === 'cmp-resolution') {
    return rows.map((r) => {
      if (!r.created_at || !r.updated_at) return r;
      const days = Math.floor((new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 86_400_000);
      return { ...r, resolution_days: days };
    });
  }
  if (slug === 'cmp-category') {
    return rows.map((r) => ({ ...r, group_key: r.complaint_type_id || 'uncategorized' }));
  }
  if (slug === 'fee-collection') {
    return rows.filter((r) => ['paid', 'completed', 'success'].includes(String(r.status || '').toLowerCase()));
  }
  if (slug === 'fee-outstanding') {
    return rows.filter((r) => ['pending', 'failed', 'unpaid', 'overdue'].includes(String(r.status || '').toLowerCase()));
  }
  if (slug === 'fee-failed') {
    return rows.filter((r) => String(r.status || '').toLowerCase() === 'failed');
  }
  if (slug === 'fee-trend') {
    return rows.map((r) => {
      if (!r.created_at) return r;
      const d = new Date(r.created_at);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const quarter = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
      return { ...r, period_month: month, period_quarter: quarter };
    });
  }
  if (slug === 'aud-admin') {
    return rows.filter((r) => {
      const a = String(r.action || '').toLowerCase();
      return a.includes('admin') || a.includes('role') || a.includes('permission') || a.includes('settings');
    });
  }
  if (slug === 'aud-export') {
    return rows.filter((r) => String(r.action || '').toLowerCase().startsWith('export_'));
  }
  return rows;
}

function countBy(rows: any[], key: string): Record<string, number> {
  const o: Record<string, number> = {};
  rows.forEach((r) => {
    const k = String(r?.[key] ?? 'unknown');
    o[k] = (o[k] || 0) + 1;
  });
  return o;
}

/**
 * Domain-aware summary builder. Falls back to generic total/group counts.
 * Missing optional columns are tolerated and surfaced as warnings.
 */
export function buildReportSummary(slug: string | undefined, rows: any[], groupBy?: string, warnings: string[] = []): Record<string, any> {
  const summary: Record<string, any> = { total: rows.length };
  if (groupBy) summary.groups = countBy(rows, groupBy);

  try {
    switch (slug) {
      case 'app-status':
        summary.status_counts = countBy(rows, 'status');
        break;
      case 'app-aging':
      case 'op-pending':
        summary.aging_bucket_counts = countBy(rows, 'aging_bucket');
        break;
      case 'app-sla': {
        summary.breached_count = rows.filter((r) => r.sla_status === 'breached').length;
        summary.at_risk_count = rows.filter((r) => r.sla_status === 'at_risk').length;
        summary.on_track_count = rows.filter((r) => r.sla_status === 'on_track').length;
        break;
      }
      case 'op-ratio': {
        const first = rows[0] || {};
        summary.approved_count = first.approved_count ?? 0;
        summary.rejected_count = first.rejected_count ?? 0;
        summary.pending_count = first.pending_count ?? 0;
        summary.approval_rate = first.approval_rate ?? 0;
        break;
      }
      case 'ret-scorecard': {
        const first = rows[0] || {};
        summary.submitted_count = first.submitted_count ?? 0;
        summary.overdue_count = first.overdue_count ?? 0;
        summary.pending_count = first.pending_count ?? 0;
        summary.compliance_rate = first.compliance_rate ?? 0;
        break;
      }
      case 'ret-defaulters':
        summary.defaulter_count = new Set(rows.map((r) => r.license_id)).size;
        summary.max_overdue_count = rows.reduce((m, r) => Math.max(m, r.overdue_count || 0), 0);
        break;
      case 'ret-repeat':
        summary.repeated_non_compliance_count = rows.length;
        break;
      case 'fee-trend':
        summary.revenue_by_month = {};
        summary.revenue_by_quarter = {};
        rows.forEach((r) => {
          const amt = Number(r.amount || 0);
          if (r.period_month) summary.revenue_by_month[r.period_month] = (summary.revenue_by_month[r.period_month] || 0) + amt;
          if (r.period_quarter) summary.revenue_by_quarter[r.period_quarter] = (summary.revenue_by_quarter[r.period_quarter] || 0) + amt;
        });
        break;
      case 'cmp-category':
        summary.category_counts = countBy(rows, 'complaint_type_id');
        break;
      case 'aud-export':
        summary.export_count_by_format = countBy(rows, 'export_format');
        summary.export_count_by_user = countBy(rows, 'executed_by');
        break;
    }
  } catch (e: any) {
    warnings.push(`summary:${slug}: ${e?.message || 'failed'}`);
  }
  if (warnings.length) summary.warnings = warnings;
  return summary;
}

// Backward-compatible generic summarizer (kept for callers using it directly).
export function summarize(rows: any[], groupBy?: string, warnings?: string[]) {
  return buildReportSummary(undefined, rows, groupBy, warnings || []);
}

export function selectColumns(rows: any[], cols?: string[]): any[] {
  if (!cols || cols.length === 0) return rows;
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c) => { if (c in r) o[c] = r[c]; });
    return o;
  });
}

export function sortRows(rows: any[], sortBy?: string, dir: 'asc' | 'desc' = 'asc') {
  if (!sortBy) return rows;
  const m = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = a[sortBy]; const bv = b[sortBy];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * m;
    if (av > bv) return 1 * m;
    return 0;
  });
}

export interface RunOptions {
  source: string;
  filters: Record<string, any>;
  reportSlug?: string;
  selectedColumns?: string[];
  defaultColumns?: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
}

export interface RunResult {
  rawRowCount: number;
  totalCount: number | null;
  rows: any[];          // post-decorate, pre-projection
  projected: any[];     // selected columns applied
  summary: Record<string, any>;
  warnings: string[];
}

const HARD_LIMIT = 10000;

export async function executeQuery(client: any, opts: RunOptions): Promise<RunResult> {
  const warnings: string[] = [];
  const source = opts.source;
  if (!ALLOWED_SOURCES.has(source)) {
    throw new Error(`Unsupported source: ${source}`);
  }
  const table = source === 'users' ? 'profiles' : source;
  const effectiveLimit = Math.min(opts.limit ?? HARD_LIMIT, HARD_LIMIT);

  let q = client.from(table).select('*', { count: 'exact' }).limit(effectiveLimit);
  const { from, to } = resolveRange(opts.filters || {});
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);

  const colMap = FILTER_COLUMN_MAP[source] || {};
  for (const [filterKey, val] of Object.entries(opts.filters || {})) {
    if (val == null || val === '' || val === 'all') continue;
    if (['dateFrom', 'dateTo', 'preset', 'slaStatus'].includes(filterKey)) continue;
    const col = colMap[filterKey];
    if (!col) { warnings.push(`filter:${filterKey} not supported for ${source}`); continue; }
    try {
      q = Array.isArray(val) ? q.in(col, val) : q.eq(col, val);
    } catch (e: any) {
      warnings.push(`filter:${filterKey} failed: ${e?.message}`);
    }
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);

  let rows = (data || []).map(strip);
  rows = decorate(opts.reportSlug, rows);
  rows = sortRows(rows, opts.sortBy, opts.sortDir || 'asc');
  const effCols = getEffectiveColumns(opts.reportSlug, opts.selectedColumns, opts.defaultColumns || []);
  const summary = buildReportSummary(opts.reportSlug, rows, opts.groupBy, warnings);
  const projected = selectColumns(rows, effCols);

  return {
    rawRowCount: data?.length ?? 0,
    totalCount: count ?? null,
    rows,
    projected,
    summary,
    warnings,
  };
}

/**
 * Insert a report log row, tolerating schemas that have only `report_id`,
 * only `report_run_id`, or both. Prefers writing both for forward-compat.
 */
export async function insertReportLog(client: any, payload: Record<string, any>) {
  const runId = payload.report_run_id ?? payload.report_id ?? null;
  const full = { ...payload, report_id: runId, report_run_id: runId };
  let res = await client.from('report_logs').insert(full);
  if (!res.error) return res;
  const msg = String(res.error?.message || '');
  if (/report_run_id/i.test(msg)) {
    const { report_run_id: _x, ...rest } = full;
    res = await client.from('report_logs').insert(rest);
    if (!res.error) return res;
  }
  if (/report_id/i.test(String(res.error?.message || ''))) {
    const { report_id: _y, ...rest } = full;
    res = await client.from('report_logs').insert(rest);
  }
  return res;
}

const ROW_BATCH = 1000;

export async function persistRun(client: any, params: {
  userId: string;
  reportSlug?: string;
  reportName?: string;
  category?: string;
  source: string;
  filters: Record<string, any>;
  selectedColumns?: string[];
  groupBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  result: RunResult;
  scheduleId?: string | null;
}) {
  const started = new Date().toISOString();
  const startedTs = Date.now();
  const ins = await client.from('reports').insert({
    name: params.reportName || params.reportSlug || `Report ${started}`,
    category: params.category || 'Ad-Hoc',
    report_type: params.reportSlug ? 'predefined' : 'ad_hoc',
    query_config: {
      source: params.source, filters: params.filters,
      selectedColumns: params.selectedColumns, groupBy: params.groupBy,
      sortBy: params.sortBy, sortDir: params.sortDir,
    },
    filters_json: params.filters,
    source: params.source,
    report_slug: params.reportSlug || null,
    selected_columns: params.selectedColumns || [],
    group_by: params.groupBy || null,
    sort_by: params.sortBy || null,
    sort_dir: params.sortDir || null,
    result_summary: params.result.summary,
    result_count: params.result.rows.length,
    // result_data is a legacy preview cache only (capped); full rows live in report_run_rows.
    result_data: params.result.projected.slice(0, 500),
    status: 'ready',
    created_by: params.userId,
    started_at: started,
    generated_at: started,
  }).select('*').single();

  if (ins.error) throw new Error(ins.error.message);
  const runId = ins.data.id;

  for (let i = 0; i < params.result.projected.length; i += ROW_BATCH) {
    const slice = params.result.projected.slice(i, i + ROW_BATCH).map((r: any, idx: number) => ({
      report_run_id: runId,
      row_index: i + idx,
      row_data: r,
    }));
    const rRes = await client.from('report_run_rows').insert(slice);
    if (rRes.error) break;
  }

  const completed = new Date().toISOString();
  await client.from('reports').update({ completed_at: completed, duration_ms: Date.now() - startedTs }).eq('id', runId);

  await insertReportLog(client, {
    report_run_id: runId,
    schedule_id: params.scheduleId || null,
    action: params.scheduleId ? 'schedule_run_completed' : 'generated',
    executed_by: params.userId,
    record_count: params.result.rows.length,
    report_name: ins.data.name,
    metadata: { source: params.source, slug: params.reportSlug || null, warnings: params.result.warnings },
  });

  return { run: { ...ins.data, completed_at: completed }, runId };
}
