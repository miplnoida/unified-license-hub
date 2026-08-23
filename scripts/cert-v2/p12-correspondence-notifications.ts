import { P, rpc, sel, ins, patch, fn, record, summary } from './api';

const CORR = P('correspondence_officer');
const COFF = P('complaints_officer');
const CSUP = P('complaints_supervisor');
const ENTITY = P('licensee_primary_user');
const ADMIN = P('super_admin');

async function main() {
  // --- 1. Business action: real complaint on file ---
  const cRes = await sel(COFF, 'complaints?select=id,licensee_id,investigator_id&licensee_id=not.is.null&order=created_at.desc&limit=1');
  const complaint = cRes.body?.[0];
  record('P12.01 real complaint exists to anchor correspondence', !!complaint?.id, cRes.text);
  if (!complaint?.id) return summary('P12');
  const licenseeId = complaint.licensee_id;

  // --- 2. Correspondence thread linked to the complaint case ---
  const thread = await ins(CORR, 'correspondence_threads', {
    subject: 'Complaint follow-up correspondence', category: 'Conduct', channel: 'email', direction: 'outbound',
    sender_name: 'Correspondence Officer', licensee_id: licenseeId, source_type: 'complaint', source_id: complaint.id,
    thread_type: 'case_correspondence', is_entity_facing: true, module: 'conduct',
  });
  const threadId = thread.body?.[0]?.id;
  record('P12.02 correspondence thread created and case-linked', thread.ok && !!threadId, thread.text);
  if (!threadId) return summary('P12');

  // --- 3. Internal note + outbound message on the thread ---
  const note = await ins(CORR, 'correspondence_messages', {
    thread_id: threadId, direction: 'internal', channel: 'portal', body: 'INTERNAL ONLY: escalate if entity does not respond in 5 days.',
    is_internal_note: true, message_kind: 'internal', author_name: 'Correspondence Officer',
  });
  record('P12.03 internal note recorded on thread', note.ok, note.text);

  const outMsg = await ins(CORR, 'correspondence_messages', {
    thread_id: threadId, direction: 'outbound', channel: 'email', subject: 'Regarding your complaint',
    body: 'We are writing regarding the complaint on file. Please respond within 10 business days.',
    is_internal_note: false, message_kind: 'external_outbound', author_name: 'Correspondence Officer',
  });
  record('P12.04 outbound external message recorded', outMsg.ok, outMsg.text);

  // --- 4. Recipient resolution + dispatch attempt ---
  const entityUser = await sel(ADMIN, `profiles?select=id,email&email=eq.${encodeURIComponent('licensee_primary_user@mishainfotech.com')}`);
  const recipientId = entityUser.body?.[0]?.id;
  const dispatch = await fn(CORR, 'send-correspondence', {
    subject: 'Regarding your complaint', body: 'We are writing regarding the complaint on file. Please respond within 10 business days.',
    channel: 'email', source_type: 'complaint', source_id: complaint.id, recipient_user_id: recipientId,
  });
  record('P12.05 dispatch attempt resolves recipient and logs a dispatch row', dispatch.ok && dispatch.body?.ok && !!dispatch.body?.dispatch_id, dispatch.text);

  // --- 5. Visibility check: entity token must NOT see the internal note ---
  const entityView = await sel(ENTITY, `correspondence_messages?thread_id=eq.${threadId}&select=id,is_internal_note,body`);
  const rows: any[] = Array.isArray(entityView.body) ? entityView.body : [];
  const leaks = rows.filter((r) => r.is_internal_note === true).length;
  record('P12.06 entity token can read the outbound message', entityView.ok && rows.some((r) => !r.is_internal_note), entityView.text);
  record('P12.07 CORRESPONDENCE_VISIBILITY_LEAKS = 0 (internal note hidden from entity)', leaks === 0, `leaks=${leaks}`);
  console.log(`CORRESPONDENCE_VISIBILITY_LEAKS=${leaks}`);

  // --- 6. Inbound response from the entity, linked back to the case ---
  const reply = await ins(ENTITY, 'correspondence_messages', {
    thread_id: threadId, direction: 'inbound', channel: 'email', body: 'We acknowledge receipt and will respond by the deadline.',
    is_internal_note: false, message_kind: 'external_inbound', author_name: 'Entity PPoC',
  });
  record('P12.08 entity inbound response recorded on the same thread', reply.ok, reply.text);

  const threadCheck = await sel(CORR, `correspondence_threads?id=eq.${threadId}&select=id,source_type,source_id,last_message_at`);
  const tRow = threadCheck.body?.[0];
  record('P12.09 case linkage preserved (thread still points at the complaint)', tRow?.source_type === 'complaint' && tRow?.source_id === complaint.id, threadCheck.text);

  // Entity cannot forge an internal note.
  const forgeNote = await ins(ENTITY, 'correspondence_messages', {
    thread_id: threadId, direction: 'internal', channel: 'portal', body: 'entity trying to write an internal note', is_internal_note: true, message_kind: 'internal',
  });
  record('P12.10 entity token cannot write an internal note', !forgeNote.ok, forgeNote.text);

  // --- 7. Notifications: event -> durable queue row -> recipient + template ---
  const officerA = 'b27db069-d6be-4789-b024-ff78a71e75cc'; // complaints_officer
  const officerB = '896f66ad-ef24-46cd-be1f-ab0515610ddb'; // complaints_supervisor
  const other = officerA === complaint.investigator_id ? officerB : officerA;

  const assign1 = await patch(CSUP, `complaints?id=eq.${complaint.id}`, { investigator_id: other });
  record('P12.11 business action (assign investigator) succeeds', assign1.ok, assign1.text);
  const assign2 = await patch(CSUP, `complaints?id=eq.${complaint.id}`, { investigator_id: other === officerA ? officerB : officerA });
  const assignBack = await patch(CSUP, `complaints?id=eq.${complaint.id}`, { investigator_id: other });
  record('P12.12 re-run of the same assignment event (idempotency probe) succeeds', assignBack.ok, assignBack.text);

  const q = await sel(ADMIN, `notification_event_queue?event_key=eq.complaint.assigned&entity_id=eq.${complaint.id}&select=id,idempotency_key,payload,created_at&order=created_at.desc&limit=20`);
  const qRows: any[] = Array.isArray(q.body) ? q.body : [];
  const byKey = new Map<string, number>();
  for (const r of qRows) byKey.set(r.idempotency_key, (byKey.get(r.idempotency_key) || 0) + 1);
  const dupes = [...byKey.values()].filter((n) => n > 1).length;
  record('P12.13 notification event queue captured the assignment events', q.ok && qRows.length > 0, `${qRows.length} queue rows`);
  console.log(`DUPLICATE_NOTIFICATION_EVENTS=${dupes}`);
  record('P12.14 DUPLICATE_NOTIFICATION_EVENTS = 0 (idempotency_key dedupe holds on re-run)', dupes === 0, `dupe_keys=${dupes}`);

  const wrongRecipients = qRows.filter((r) => {
    const suffix = r.idempotency_key.split('#')[3];
    const payloadInvestigator = r.payload?.investigator_id;
    return suffix && payloadInvestigator && suffix !== payloadInvestigator;
  }).length;
  console.log(`WRONG_RECIPIENT_NOTIFICATIONS=${wrongRecipients}`);
  record('P12.15 WRONG_RECIPIENT_NOTIFICATIONS = 0 (queue suffix matches intended investigator)', wrongRecipients === 0, `${wrongRecipients}`);

  // --- 8. External delivery configuration check ---
  const smtp = await sel(ADMIN, 'site_settings?select=value&key=eq.email_sms_settings');
  const smtpCfg = smtp.body?.[0]?.value?.smtp;
  const smtpConfigured = !!(smtpCfg && smtpCfg.enabled && smtpCfg.host && smtpCfg.username && smtpCfg.password && smtpCfg.fromEmail);
  console.log(`SMTP_CONFIGURED=${smtpConfigured}`);
  if (!smtpConfigured) {
    console.log('BLOCKED_EXTERNAL: SMTP not configured (site_settings.email_sms_settings.smtp missing host/username/password/fromEmail or disabled) — actual email delivery cannot be certified. No SMS provider is integrated at all (see send-notification: SMS always fails with sms_provider_not_configured).');
  }
  record('P12.16 external SMTP/SMS delivery config check performed (BLOCKED_EXTERNAL reported if absent)', true, `smtp_configured=${smtpConfigured}`);

  const failures = summary('P12');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
