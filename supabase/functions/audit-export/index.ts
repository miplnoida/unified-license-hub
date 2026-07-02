import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: aerr } = await supa.auth.getClaims(token);
    if (aerr || !claims?.claims) return json({ error: 'Unauthorized' }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: rr } = await admin.from('user_roles').select('role').eq('user_id', userId);
    const roles = (rr ?? []).map((r: any) => r.role);
    if (!['admin', 'super_admin', 'supervisor'].some(r => roles.includes(r))) {
      return json({ error: 'Forbidden' }, 403);
    }

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
      if (jobErr) return json({ error: jobErr.message }, 200);

      // Fetch rows in one page (cap 20k)
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
        return json({ error: rerr.message }, 200);
      }

      const csv = toCsv(rows ?? []);
      const path = `${userId}/${job.id}.csv`;
      const { error: upErr } = await admin.storage.from('audit-exports')
        .upload(path, new Blob([csv], { type: 'text/csv' }), { upsert: true, contentType: 'text/csv' });
      if (upErr) {
        await admin.from('audit_export_jobs').update({
          status: 'failed', error_message: upErr.message, completed_at: new Date().toISOString(),
        }).eq('id', job.id);
        return json({ error: upErr.message }, 200);
      }

      await admin.from('audit_export_jobs').update({
        status: 'completed', row_count: rows?.length ?? 0, file_path: path,
        completed_at: new Date().toISOString(),
      }).eq('id', job.id);

      return json({ ok: true, job_id: job.id, row_count: rows?.length ?? 0, file_path: path });
    }

    if (action === 'download_url') {
      const path = body.file_path as string;
      if (!path) return json({ error: 'file_path required' }, 400);
      const { data, error } = await admin.storage.from('audit-exports')
        .createSignedUrl(path, 300);
      if (error) return json({ error: error.message }, 200);
      return json({ ok: true, url: data.signedUrl });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e: any) {
    return json({ error: e?.message ?? 'error' }, 200);
  }
});

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(',');
  const body = rows.map(r => cols.map(c => esc((r as any)[c])).join(',')).join('\n');
  return header + '\n' + body;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
