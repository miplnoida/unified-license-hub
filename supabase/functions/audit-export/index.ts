// Audit export edge function.
//
// Authorization: uses the shared `_shared/authz.ts` helper. The caller must
// have `audit_management.export` in the dynamic permission catalog. No legacy
// role fallback — a signed-in user without the catalog permission is denied.

import { corsHeaders, jsonResponse, requireUserPermission } from '../_shared/authz.ts';

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

      let q = admin.from(source).select('*').limit(20000);
      if (fromDate) q = q.gte('created_at', fromDate);
      if (toDate) q = q.lte('created_at', toDate);
      if (moduleFilter) {
        if (source === 'audit_logs') q = q.eq('entity_type', moduleFilter);
        else q = q.eq('table_name', moduleFilter);
      }
      const { data: rows, error: rerr } = await q;
      if (rerr) {
        await admin.from('audit_export_jobs').update({
          status: 'failed', error_message: rerr.message, completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        return jsonResponse({ error: rerr.message }, 200);
      }

      const csv = toCsv(rows ?? []);
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
        status: 'completed', row_count: rows?.length ?? 0, file_path: path,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);

      return jsonResponse({ ok: true, job_id: job.id, row_count: rows?.length ?? 0, file_path: path });
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

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(',');
  const body = rows
    .map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(','))
    .join('\n');
  return header + '\n' + body;
}
