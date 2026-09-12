import { supabase } from '@/integrations/supabase/client';

const esc = (s: string) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Allows only the inline formatting produced by the thread composer. */
const ALLOWED = /<\/?(b|strong|i|em|u|ul|ol|li|br|p|div|span)(\s[^>]*)?>/gi;
const sanitize = (html: string) => {
  const stripped = String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
  const kept: string[] = [];
  const placeholder = stripped.replace(ALLOWED, (m) => {
    kept.push(m.replace(/\s[^>]*/, (attrs) => (/^\s*\/?$/.test(attrs) ? attrs : '')));
    return `\u0000${kept.length - 1}\u0000`;
  });
  // eslint-disable-next-line no-control-regex -- NUL sentinels are intentional placeholders
  return esc(placeholder).replace(/\u0000(\d+)\u0000/g, (_, i) => kept[Number(i)]);
};

const KIND_LABEL: Record<string, string> = {
  system: 'System generated',
  external_outbound: 'Sent by regulator',
  external_inbound: 'Received from entity',
  internal: 'Internal (staff only)',
};

interface ManifestMessage {
  id: string;
  author_name: string | null;
  author_role: string | null;
  sent_at: string;
  direction: string;
  message_kind: string;
  body: string;
  body_format: string | null;
  delivery_status: string | null;
  is_internal: boolean;
  system_generated: boolean | null;
  attachments: string[];
}

interface Manifest {
  thread: Record<string, any>;
  participants: Array<{ name: string; role: string | null; is_internal: boolean }>;
  messages: ManifestMessage[];
  audit: Array<{ action: string; actor: string | null; role: string | null; detail: string | null; at: string }>;
}

/**
 * Exports a thread as a printable PDF. The content is produced server-side by
 * `correspondence_export_manifest`, which strips anything the requesting user is
 * not authorised to see and records the THREAD_EXPORTED audit event.
 */
export async function exportThreadToPdf(threadId: string) {
  const { data, error } = await (supabase as any).rpc('correspondence_export_manifest', { _thread_id: threadId });
  if (error) throw error;
  const manifest = data as Manifest;
  const t = manifest.thread ?? {};

  const body = (m: ManifestMessage) =>
    m.body_format === 'text'
      ? `<pre>${esc(m.body)}</pre>`
      : `<div class="rich">${sanitize(m.body)}</div>`;

  const rows = (manifest.messages ?? [])
    .map(
      (m) => `
      <article class="msg ${esc(m.message_kind)}">
        <header>
          <strong>${esc(m.author_name ?? 'Unknown')}</strong>
          <span>${esc(m.author_role ?? '')}</span>
          <span>${esc(KIND_LABEL[m.message_kind] ?? m.message_kind)}</span>
          <span>${new Date(m.sent_at).toLocaleString()}</span>
          ${m.delivery_status ? `<span>${esc(m.delivery_status)}</span>` : ''}
          ${m.system_generated ? '<span>system</span>' : ''}
        </header>
        ${body(m)}
        ${m.attachments?.length ? `<footer>Attachments: ${m.attachments.map(esc).join(', ')}</footer>` : ''}
      </article>`,
    )
    .join('');

  const audit = (manifest.audit ?? [])
    .map((a) => `<tr><td>${new Date(a.at).toLocaleString()}</td><td>${esc(a.action)}</td><td>${esc(a.actor ?? '')}</td><td>${esc(a.detail ?? '')}</td></tr>`)
    .join('');

  const parties = (manifest.participants ?? [])
    .map((p) => `${esc(p.name)}${p.role ? ` (${esc(p.role)})` : ''}${p.is_internal ? ' [internal]' : ''}`)
    .join(', ');

  const html = `<!doctype html><html><head><meta charset="utf-8" />
  <title>${esc(t.reference)} — ${esc(t.subject)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#111}
    h1{font-size:18px;margin:0 0 4px}
    h2{font-size:13px;margin:20px 0 6px}
    .meta{font-size:12px;color:#555;margin-bottom:16px;line-height:1.6}
    .msg{border:1px solid #ddd;border-left-width:4px;padding:8px 12px;margin-bottom:10px;page-break-inside:avoid}
    .msg header{font-size:11px;color:#555;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
    .msg footer{font-size:11px;color:#555;margin-top:6px}
    .msg pre{white-space:pre-wrap;font-family:inherit;font-size:13px;margin:0}
    .rich{font-size:13px;line-height:1.5}
    .rich ul{padding-left:18px}
    .external_outbound{border-left-color:#1E3A8A}
    .external_inbound{border-left-color:#16A34A}
    .internal{border-left-color:#7C3AED;background:#faf5ff}
    .system{border-left-color:#9CA3AF;background:#f9fafb}
    table{width:100%;border-collapse:collapse;font-size:11px}
    td,th{border:1px solid #e5e7eb;padding:4px 6px;text-align:left;vertical-align:top}
  </style></head><body>
  <h1>${esc(t.subject)}</h1>
  <div class="meta">
    ${esc(t.reference)} · ${esc(t.thread_type)} · ${esc(t.thread_state)} · ${esc(t.module)}<br/>
    ${t.entity_name ? `Entity: ${esc(t.entity_name)}<br/>` : ''}
    ${t.source_reference ? `Linked case: ${esc(t.source_reference)} (${esc(t.source_type ?? '')})<br/>` : ''}
    Participants: ${parties || 'none recorded'}<br/>
    Opened: ${new Date(t.received_at).toLocaleString()}
    ${t.response_due_at ? `<br/>Response due: ${new Date(t.response_due_at).toLocaleString()}` : ''}
    ${t.closed_at ? `<br/>Closed: ${new Date(t.closed_at).toLocaleString()}` : ''}
    <br/>Exported by ${esc(t.exported_by ?? '')} on ${new Date(t.exported_at ?? Date.now()).toLocaleString()}
    <br/><em>${t.includes_internal ? 'Includes internal messages — regulator use only.' : 'External correspondence only.'}</em>
  </div>
  <h2>Messages</h2>
  ${rows || '<p>No messages.</p>'}
  <h2>Audit trail</h2>
  <table><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Detail</th></tr></thead>
  <tbody>${audit || '<tr><td colspan="4">No events.</td></tr>'}</tbody></table>
  <script>window.onload=()=>window.print()</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}
