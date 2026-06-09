// Generate a report server-side using the shared report-generator module.
// Validates JWT and report-management permission, then runs identical logic to scheduled runs.
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  corsHeaders, ALLOWED_SOURCES, executeQuery, persistRun,
} from '../_shared/report-generator.ts';

const PREVIEW_LIMIT = 100;
const GENERATE_LIMIT = 10000;

/**
 * Permission check for running reports. Strategy (in order):
 *  1. Dynamic permission `report_management` via user_dynamic_roles -> role_permissions -> permissions.
 *  2. Fallback: super_admin/admin/supervisor/analyst app_role via has_role().
 * Returns true on first satisfied check.
 */
async function userCanRunReports(client: any, userId: string): Promise<boolean> {
  // 1. Dynamic permission lookup (best effort)
  try {
    const { data: udr } = await client
      .from('user_dynamic_roles')
      .select('role_id')
      .eq('user_id', userId);
    const roleIds = Array.from(new Set(((udr as any[]) || []).map((r) => r.role_id).filter(Boolean)));
    if (roleIds.length) {
      const { data: rp } = await client
        .from('role_permissions')
        .select('permission_id')
        .in('role_id', roleIds);
      const permIds = Array.from(new Set(((rp as any[]) || []).map((r) => r.permission_id)));
      if (permIds.length) {
        const { data: perms } = await client
          .from('permissions')
          .select('module')
          .in('id', permIds);
        if ((perms || []).some((p: any) => String(p.module || '').toLowerCase().replace(/\s+/g, '_') === 'report_management')) {
          return true;
        }
      }
    }
  } catch {/* fall through to role-based check */}

  // 2. Role-based fallback
  const roles = ['super_admin', 'admin', 'supervisor', 'analyst'];
  for (const r of roles) {
    const { data, error } = await client.rpc('has_role', { _user_id: userId, _role: r });
    if (!error && data === true) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
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
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claims.data.claims.sub as string;

    const canRun = await userCanRunReports(userClient, userId);
    if (!canRun) {
      return new Response(JSON.stringify({ ok: false, error: 'Not authorized to run this report' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const {
      reportSlug, reportName, category, source, filters = {},
      selectedColumns = [], defaultColumns = [], groupBy, sortBy, sortDir = 'asc',
      mode = 'preview', limit,
    } = body || {};

    if (!source || !ALLOWED_SOURCES.has(source)) {
      return new Response(JSON.stringify({ ok: false, error: `Unsupported source: ${source}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // report_logs source is admin-only (already restricted by the permission check above,
    // but we also reject it for non-admins explicitly to keep the contract clear).
    if (source === 'report_logs') {
      const isAdmin = (await Promise.all(
        ['super_admin', 'admin'].map((r) => userClient.rpc('has_role', { _user_id: userId, _role: r })),
      )).some((res: any) => res?.data === true);
      if (!isAdmin) {
        return new Response(JSON.stringify({ ok: false, error: 'Not authorized for this source' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
