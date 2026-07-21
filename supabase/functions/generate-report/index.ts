// Generate a report server-side using the shared report-generator module.
// Authorization: `report_management.view` for previews, `report_management.export`
// when persisting a run (mode !== 'preview'). No legacy role fallback.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  ALLOWED_SOURCES, executeQuery, persistRun,
} from '../_shared/report-generator.ts';
import { corsHeaders, jsonResponse, requireUserPermission } from '../_shared/authz.ts';

const PREVIEW_LIMIT = 100;
const GENERATE_LIMIT = 10000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Preview requires view; anything that persists a run requires export.
    // We defer the export check until after we've read the body.
    const gate = await requireUserPermission(req, 'report_management', 'view');
    if (!gate.ok) return gate.response;
    const { userId, adminClient } = gate;

    // Reconstruct a user-scoped client (RLS applies) for the actual query so
    // an authorized reporter cannot bypass row-level scope via service role.
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const body = await req.json().catch(() => ({}));
    const {
      reportSlug, reportName, category, source, filters = {},
      selectedColumns = [], defaultColumns = [], groupBy, sortBy, sortDir = 'asc',
      mode = 'preview', limit,
    } = body || {};

    if (!source || !ALLOWED_SOURCES.has(source)) {
      return jsonResponse({ ok: false, error: `Unsupported source: ${source}` }, 400);
    }

    if (mode !== 'preview') {
      const { data: canExport } = await adminClient.rpc('has_permission', {
        _user_id: userId, _module: 'report_management', _action: 'export',
      });
      if (canExport !== true) {
        return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      }
    }

    // report_logs source is admin-only. Require audit_management.view.
    if (source === 'report_logs') {
      const { data: canAudit } = await adminClient.rpc('has_permission', {
        _user_id: userId, _module: 'audit_management', _action: 'view',
      });
      if (canAudit !== true) {
        return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
      }
    }


    const effectiveLimit = Math.min(
      Number(limit) || (mode === 'preview' ? PREVIEW_LIMIT : GENERATE_LIMIT),
      mode === 'preview' ? PREVIEW_LIMIT : GENERATE_LIMIT,
    );

    const result = await executeQuery(userClient, {
      source, filters, reportSlug, selectedColumns, defaultColumns,
      groupBy, sortBy, sortDir, limit: effectiveLimit,
    });

    if (mode === 'preview') {
      return new Response(JSON.stringify({
        ok: true, run: null,
        rows: result.projected, summary: result.summary,
        rowCount: result.rows.length, totalCount: result.totalCount ?? result.rows.length,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { run } = await persistRun(userClient, {
      userId, reportSlug, reportName, category, source, filters,
      selectedColumns, groupBy, sortBy, sortDir, result,
    });

    return new Response(JSON.stringify({
      ok: true, run,
      rows: result.projected, summary: result.summary,
      rowCount: result.rows.length, totalCount: result.totalCount ?? result.rows.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message || 'Internal error' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
