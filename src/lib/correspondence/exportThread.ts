import type { CorrespondenceMessage, CorrespondenceThread } from '@/hooks/useCorrespondence';
import { supabase } from '@/integrations/supabase/client';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const KIND_LABEL: Record<string, string> = {
  system: 'System',
  external_outbound: 'Sent by regulator',
  external_inbound: 'Received from entity',
  internal: 'Internal (staff only)',
};

/**
 * Opens a printable rendering of the full thread (Save as PDF from the print
 * dialog) and records a THREAD_EXPORTED audit event.
 */
export async function exportThreadToPdf(thread: CorrespondenceThread, messages: CorrespondenceMessage[]) {
  const rows = messages
    .filter((m) => !m.is_draft)
    .map(
      (m) => `
      <article class="msg ${m.message_kind}">
        <header>
          <strong>${esc(m.author_name ?? 'Unknown')}</strong>
          <span>${esc(KIND_LABEL[m.message_kind] ?? m.message_kind)}</span>
          <span>${new Date(m.sent_at).toLocaleString()}</span>
          <span>${esc(m.delivery_status)}</span>
        </header>
        <pre>${esc(m.body)}</pre>
      </article>`,
    )
    .join('');

  const html = `<!doctype html><html><head><meta charset="utf-8" />
  <title>${esc(thread.reference)} — ${esc(thread.subject)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;margin:32px;color:#111}
    h1{font-size:18px;margin:0 0 4px}
    .meta{font-size:12px;color:#555;margin-bottom:16px}
    .msg{border:1px solid #ddd;border-left-width:4px;padding:8px 12px;margin-bottom:10px;page-break-inside:avoid}
    .msg header{font-size:11px;color:#555;display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
    .msg pre{white-space:pre-wrap;font-family:inherit;font-size:13px;margin:0}
    .external_outbound{border-left-color:#1E3A8A}
    .external_inbound{border-left-color:#16A34A}
    .internal{border-left-color:#7C3AED;background:#faf5ff}
    .system{border-left-color:#9CA3AF;background:#f9fafb}
  </style></head><body>
  <h1>${esc(thread.subject)}</h1>
  <div class="meta">
    ${esc(thread.reference)} · ${esc(thread.thread_type)} · ${esc(thread.thread_state)}<br/>
    Sender: ${esc(thread.sender_name)}${thread.sender_org ? ` (${esc(thread.sender_org)})` : ''}<br/>
    Received: ${new Date(thread.received_at).toLocaleString()}
    ${thread.source_reference ? `<br/>Linked case: ${esc(thread.source_reference)}` : ''}
  </div>
  ${rows || '<p>No messages.</p>'}
  <script>window.onload=()=>window.print()</script>
  </body></html>`;

  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }

  try {
    await (supabase as any).from('correspondence_events').insert({
      thread_id: thread.id,
      action: 'THREAD_EXPORTED',
      detail: `Thread exported (${messages.length} messages)`,
      visible_to_licensee: false,
    });
  } catch {
    /* audit insert is best-effort; export already delivered */
  }
}
