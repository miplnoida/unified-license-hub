// Generate a report server-side.
// Validates JWT, restricts to an allowlisted set of data sources, applies filters,
// optionally writes a persistent report run + chunked rows + audit log.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const ALLOWED_SOURCES = new Set([
  'applications',
  'licenses',
  'payments',
  'compliance_returns',
  'complaints',
  'profiles',
  'users', // mapped to profiles
  'audit_logs',
]);

const SENSITIVE = new Set([
  'password', 'password_hash', 'token', 'access_token', 'refresh_token',
  'secret', 'api_key', 'private_key', 'otp', 'otp_code', 'mfa_secret',
  'encrypted_password', 'raw_user_meta_data', 'raw_app_meta_data',
  'confirmation_token', 'recovery_token', 'session_id',
]);

const PREVIEW_LIMIT = 100;
const GENERATE_LIMIT = 10000;
const ROW_BATCH = 1000;

function strip(row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row || {})) {
    if (SENSITIVE.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

function resolveRange(f: Record<string, any>) {
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

function applyEnumFilter(q: any, col: string, value: any) {
  if (!value || value === 'all' || value === '') return q;
  if (Array.isArray(value)) return q.in(col, value);
  return q.eq(col, value);
}

// Slug-aware post-processing
function decorate(slug: string | undefined, rows: any[]) {
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
    const SLA_DAYS = 30; // default; configurable later
    return rows
      .map((r) => {
        const base = new Date(r.submitted_at || r.created_at || now).getTime();
        const days = Math.floor((now - base) / 86_400_000);
        return { ...r, sla_days: SLA_DAYS, age_days: days, sla_breached: days > SLA_DAYS };
      })
      .filter((r) => r.sla_breached);
  }
  if (slug === 'lic-expiry') {
    return rows
      .filter((r) => r.expiry_date)
      .map((r) => {
        const exp = new Date(r.expiry_date).getTime();
        return { ...r, days_to_expiry: Math.floor((exp - now) / 86_400_000) };
      })
      .sort((a, b) => (a.days_to_expiry ?? 1e9) - (b.days_to_expiry ?? 1e9));
  }
  if (slug === 'lic-suspended') {
    return rows.filter((r) => ['suspended', 'revoked'].includes(String(r.status || '').toLowerCase()));
  }
  if (slug === 'ret-overdue') {
    return rows.filter((r) => {
      const due = r.due_date ? new Date(r.due_date).getTime() : null;
      const submitted = r.submitted_at || ['submitted', 'validated', 'approved', 'sub'].includes(String(r.status || '').toLowerCase());
      return due && due < now && !submitted;
    }).map((r) => ({ ...r, days_overdue: Math.max(0, Math.floor((now - new Date(r.due_date).getTime()) / 86_400_000)) }));
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
  if (slug === 'fee-collection') {
    return rows.filter((r) => ['paid', 'completed', 'success'].includes(String(r.status || '').toLowerCase()));
  }
  if (slug === 'fee-outstanding') {
    return rows.filter((r) => ['pending', 'failed', 'unpaid', 'overdue'].includes(String(r.status || '').toLowerCase()));
  }
  if (slug === 'fee-failed') {
    return rows.filter((r) => String(r.status || '').toLowerCase() === 'failed');
  }
  return rows;
}

function summarize(rows: any[], groupBy?: string) {
  const summary: Record<string, any> = { total: rows.length };
  if (groupBy) {
    const g: Record<string, number> = {};
    rows.forEach((r) => {
      const k = String(r[groupBy] ?? 'unknown');
      g[k] = (g[k] || 0) + 1;
    });
    summary.groups = g;
  }
  return summary;
}

function selectColumns(rows: any[], cols?: string[]) {
  if (!cols || cols.length === 0) return rows;
  return rows.map((r) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c) => { if (c in r) o[c] = r[c]; });
    return o;
  });
}

function sortRows(rows: any[], sortBy?: string, dir: 'asc' | 'desc' = 'asc') {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const claims = await userClient.auth.getClaims(token);
    if (claims.error || !claims.data?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.data.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const {
      reportSlug,
      reportName,
      category,
      source,
      filters = {},
      selectedColumns = [],
      groupBy,
      sortBy,
      sortDir = 'asc',
      mode = 'preview',
      limit,
    } = body || {};

    if (!source || !ALLOWED_SOURCES.has(source)) {
      return new Response(JSON.stringify({ ok: false, error: `Unsupported source: ${source}` }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const effectiveLimit = Math.min(
      Number(limit) || (mode === 'preview' ? PREVIEW_LIMIT : GENERATE_LIMIT),
      mode === 'preview' ? PREVIEW_LIMIT : GENERATE_LIMIT,
    );

    const table = source === 'users' ? 'profiles' : source;
    let q = userClient.from(table).select('*', { count: 'exact' }).limit(effectiveLimit);

    const { from, to } = resolveRange(filters);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);
    q = applyEnumFilter(q, 'status', filters.status);
    if (table === 'payments') q = applyEnumFilter(q, 'status', filters.paymentStatus || filters.status);

    const { data, error, count } = await q;
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let rows = (data || []).map(strip);
    rows = decorate(reportSlug, rows);
    rows = sortRows(rows, sortBy, sortDir);
    const summary = summarize(rows, groupBy);
    const projected = selectColumns(rows, selectedColumns);

    if (mode === 'preview') {
      return new Response(JSON.stringify({
        ok: true,
        run: null,
        rows: projected,
        summary,
        rowCount: rows.length,
        totalCount: count ?? rows.length,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Generate: persist run + chunked rows
    const started = new Date().toISOString();
    const startedTs = Date.now();
    const insert = await userClient.from('reports').insert({
      name: reportName || reportSlug || `Report ${started}`,
      category: category || 'Ad-Hoc',
      report_type: reportSlug ? 'predefined' : 'ad_hoc',
      query_config: { source, filters, selectedColumns, groupBy, sortBy, sortDir },
      filters_json: filters,
      source,
      report_slug: reportSlug || null,
      selected_columns: selectedColumns,
      group_by: groupBy || null,
      sort_by: sortBy || null,
      sort_dir: sortDir,
      result_summary: summary,
      result_count: rows.length,
      result_data: projected.slice(0, 500), // small inline preview only
      status: 'ready',
      created_by: userId,
      started_at: started,
      generated_at: started,
    }).select('*').single();

    if (insert.error) {
      return new Response(JSON.stringify({ ok: false, error: insert.error.message }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const runId = insert.data.id;
    // chunk rows
    for (let i = 0; i < projected.length; i += ROW_BATCH) {
      const slice = projected.slice(i, i + ROW_BATCH).map((r, idx) => ({
        report_run_id: runId,
        row_index: i + idx,
        row_data: r,
      }));
      const rowsRes = await userClient.from('report_run_rows').insert(slice);
      if (rowsRes.error) break; // best-effort
    }

    const completed = new Date().toISOString();
    await userClient.from('reports').update({
      completed_at: completed,
      duration_ms: Date.now() - startedTs,
    }).eq('id', runId);

    await userClient.from('report_logs').insert({
      report_id: runId,
      action: 'generated',
      executed_by: userId,
      record_count: rows.length,
      report_name: insert.data.name,
      metadata: { source, slug: reportSlug || null },
    });

    return new Response(JSON.stringify({
      ok: true,
      run: { ...insert.data, completed_at: completed },
      rows: projected,
      summary,
      rowCount: rows.length,
      totalCount: count ?? rows.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Internal error' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
