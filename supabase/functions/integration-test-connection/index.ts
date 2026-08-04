/**
 * ADM-INT-001 — Test Connection.
 *
 * Probes a registered integration connection without creating any real
 * business data, records the attempt in `integration_logs` and updates the
 * connection's health fields (status, latency, last success/error).
 */
import { requireUserPermission, jsonResponse, corsHeaders } from '../_shared/authz.ts';
import { logIntegration } from '../_shared/integration-log.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const gate = await requireUserPermission(req, 'settings', 'edit');
  if (!gate.ok) return gate.response;
  const { userId, adminClient } = gate;

  try {
    const body = await req.json().catch(() => ({}));
    const connectionId = String(body.connection_id ?? '').trim();
    if (!connectionId) return jsonResponse({ error: 'connection_id is required' }, 400);

    const { data: conn, error: connErr } = await adminClient
      .from('integration_connections')
      .select('id, integration_key, name, base_url, protocol, timeout_ms, requires_credentials')
      .eq('id', connectionId)
      .maybeSingle();
    if (connErr) return jsonResponse({ error: connErr.message }, 200);
    if (!conn) return jsonResponse({ error: 'Connection not found' }, 404);

    const { data: cred } = await adminClient
      .from('integration_credentials')
      .select('secret_ref, masked_hint')
      .eq('connection_id', connectionId)
      .eq('is_current', true)
      .maybeSingle();

    const timeout = Math.min(Math.max(conn.timeout_ms ?? 15000, 1000), 60000);
    const started = Date.now();

    let ok = false;
    let httpStatus: number | null = null;
    let message = '';

    if (!conn.base_url) {
      message = conn.protocol === 'SMTP'
        ? 'No endpoint configured — SMTP delivery is verified through the notification channel health console.'
        : 'No endpoint URL configured for this connection.';
    } else if (conn.requires_credentials && !cred?.secret_ref) {
      message = 'No credential configured — connection cannot be probed.';
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(conn.base_url, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': 'RegulatoryPlatform-IntegrationProbe/1.0' },
        });
        httpStatus = res.status;
        await res.arrayBuffer().catch(() => undefined);
        // Any HTTP response proves reachability; auth/route errors are still "reachable".
        ok = res.status < 500;
        message = ok
          ? `Endpoint reachable (HTTP ${res.status}).`
          : `Endpoint returned HTTP ${res.status}.`;
      } catch (e) {
        message = e instanceof Error && e.name === 'AbortError'
          ? `Endpoint did not respond within ${timeout} ms.`
          : `Endpoint unreachable: ${e instanceof Error ? e.message : String(e)}`;
      } finally {
        clearTimeout(timer);
      }
    }

    const latency = Date.now() - started;
    const nowIso = new Date().toISOString();

    await adminClient
      .from('integration_connections')
      .update({
        last_test_at: nowIso,
        last_test_latency_ms: latency,
        status: ok ? 'active' : 'error',
        ...(ok
          ? { last_success_at: nowIso, last_error: null }
          : { last_error_at: nowIso, last_error: message }),
      })
      .eq('id', connectionId);

    await logIntegration(adminClient as never, {
      direction: 'outbound',
      integrationKey: conn.integration_key,
      endpoint: conn.base_url,
      method: 'GET',
      status: ok ? 'success' : 'failure',
      httpStatus,
      actorId: userId,
      entityType: 'integration_connection',
      entityId: connectionId,
      requestSummary: 'Manual test connection (no business data created)',
      responseSummary: message,
      error: ok ? null : message,
      durationMs: latency,
      metadata: { probe: true, connection_name: conn.name },
    });

    return jsonResponse({ ok, message, latency_ms: latency, http_status: httpStatus });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : 'Unexpected error' }, 200);
  }
});
