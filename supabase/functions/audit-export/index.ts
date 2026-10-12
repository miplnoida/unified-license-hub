// Audit export edge function.
//
// Authorization: uses the shared `_shared/authz.ts` helper. The caller must
// have `audit_management.export` in the dynamic permission catalog. No legacy
// role fallback — a signed-in user without the catalog permission is denied.

import { corsHeaders, jsonResponse, requireUserPermission } from '../_shared/authz.ts';
import {
  EXPORT_MAX_ROWS, MODULE_FILTER_COLUMN, ORDER_COLUMNS, fetchAllPages, toCsv, truncationInfo,
} from './exportCore.ts';
// Safety limit: EXPORT_MAX_ROWS (100,000). Exports above it are marked truncated
// on the job (filters.truncated / total_matching / exported) — never silently.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const gate = await requireUserPermission(req, 'audit_management', 'export');
    if (!gate.ok) return gate.response;
    const { userId, adminClient: admin } = gate;

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'run') {
      const source: 'audit_logs' | 'compliance_audit_logs' =
        body.source === 'compliance_audit_logs' ? 'compliance_audit_logs' : 'audit_logs';
      const fromDate = body.from_date as string | null;
      const toDate = body.to_date as string | null;
      const moduleFilter = (body.module_filter as string | null) || null;

      const { data: job, error: jobErr } = await admin.from('audit_export_jobs').insert({
        requested_by: userId, source, from_date: fromDate, to_date: toDate,
        module_filter: moduleFilter, status: 'running',
      }).select('*').single();
      if (jobErr) return jsonResponse({ error: jobErr.message }, 200);

      // deno-lint-ignore no-explicit-any
      const filtered = (q: any) => {
        if (fromDate) q = q.gte('created_at', fromDate);
        if (toDate) q = q.lte('created_at', toDate);
        if (moduleFilter) q = q.eq(MODULE_FILTER_COLUMN[source], moduleFilter);
        return q;
      };
      const fail = async (message: string) => {
        await admin.from('audit_export_jobs').update({
          status: 'failed', error_message: message, completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        return jsonResponse({ error: message }, 200);
      };

      const { count, error: cerr } = await filtered(
        admin.from(source).select('*', { count: 'exact', head: true }),
      );
      if (cerr) return await fail(cerr.message);
      const totalMatching = count ?? 0;

      const [o1, o2] = ORDER_COLUMNS[source];
      const { rows, error: rerr } = await fetchAllPages<Record<string, unknown>>(
        (from, to) => filtered(admin.from(source).select('*'))
          .order(o1, { ascending: true }).order(o2, { ascending: true }).range(from, to),
        Math.min(totalMatching, EXPORT_MAX_ROWS),
      );
      if (rerr) return await fail(rerr);
      const trunc = truncationInfo(totalMatching, rows.length);

      const csv = toCsv(rows);
      const path = `${userId}/${job.id}.csv`;
      const { error: upErr } = await admin.storage.from('audit-exports')
        .upload(path, new Blob([csv], { type: 'text/csv' }), { upsert: true, contentType: 'text/csv' });
      if (upErr) {
        await admin.from('audit_export_jobs').update({
          status: 'failed', error_message: upErr.message, completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        return jsonResponse({ error: upErr.message }, 200);
      }

      await admin.from('audit_export_jobs').update({
        status: 'completed', row_count: rows.length, file_path: path,
        filters: trunc, completed_at: new Date().toISOString(),
      }).eq('id', job.id);

      return jsonResponse({ ok: true, job_id: job.id, row_count: rows.length, file_path: path, ...trunc });
    }

    if (action === 'download_url') {
      const path = body.file_path as string;
      if (!path) return jsonResponse({ error: 'file_path required' }, 400);
      // Scope: signed URL only for the caller's own export folder.
      if (!path.startsWith(`${userId}/`)) {
        return jsonResponse({ error: 'Forbidden' }, 403);
      }
      const { data, error } = await admin.storage.from('audit-exports')
        .createSignedUrl(path, 300);
      if (error) return jsonResponse({ error: error.message }, 200);
      return jsonResponse({ ok: true, url: data.signedUrl });
    }

    return jsonResponse({ error: 'unknown action' }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error';
    return jsonResponse({ error: message }, 200);
  }
});
