/**
 * ADM-INT-001 — fallback governance + log redaction unit tests.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  BUSINESS_DECISION_CATEGORIES,
  decideFallback,
} from '../_shared/integration/invoke.ts';
import {
  idempotencyFingerprint,
  isSensitiveKey,
  redactedKeys,
  redactPayload,
} from '../_shared/integration/redact.ts';

const approved = {
  fallback_enabled: true,
  fallback_strategy: 'internal_logic' as const,
  fallback_allowed_categories: ['network', 'timeout', 'server', 'not_configured'],
  fallback_approval_status: 'approved' as const,
};

Deno.test('technical failures fall back when configured', () => {
  for (const cat of ['network', 'timeout', 'server', 'not_configured'] as const) {
    const d = decideFallback(approved, cat);
    assert(d.allowed, `${cat} should be allowed`);
  }
});

Deno.test('provider business decisions never fall back', () => {
  for (const cat of [...BUSINESS_DECISION_CATEGORIES] as never[]) {
    const d = decideFallback(approved, cat);
    assertEquals(d.allowed, false);
    assertEquals(d.reason, 'provider_business_decision');
  }
});

Deno.test('fallback is refused when disabled, unapproved or not permitted', () => {
  assertEquals(
    decideFallback({ ...approved, fallback_enabled: false }, 'timeout').reason,
    'fallback_disabled_for_connection',
  );
  assertEquals(
    decideFallback({ ...approved, fallback_strategy: 'none' }, 'timeout').reason,
    'fallback_strategy_none',
  );
  assertEquals(
    decideFallback({ ...approved, fallback_approval_status: 'pending' }, 'timeout').reason,
    'fallback_not_approved',
  );
  assertEquals(
    decideFallback({ ...approved, fallback_allowed_categories: ['network'] }, 'rate_limit')
      .allowed,
    false,
  );
});

Deno.test('caller can forbid fallback, and unregistered integrations fall back', () => {
  assertEquals(decideFallback(approved, 'timeout', 'forbid').allowed, false);
  assertEquals(decideFallback(null, 'not_configured').allowed, true);
});

Deno.test('redaction removes credentials and PII, keeps shape', () => {
  const payload = {
    fullName: 'Jane Doe',
    nationalId: 'A1234567',
    password: 'hunter2',
    card: { pan: '4111111111111111', cvv: '123', expiry: '12/29' },
    documents: [{ base64: 'AAAA' }],
    amount: 5000,
    consent: true,
  };
  const out = redactPayload(payload) as Record<string, any>;
  assertEquals(out.nationalId, '[redacted]');
  assertEquals(out.password, '[redacted]');
  assertEquals(out.card.pan, '[redacted]');
  assertEquals(out.card.cvv, '[redacted]');
  assertEquals(out.amount, '[number]');
  assertEquals(out.consent, true);
  assertEquals(out.fullName, '[string:8]');
  assert(!JSON.stringify(out).includes('4111111111111111'));
  assert(!JSON.stringify(out).includes('hunter2'));
  assert(redactedKeys(payload).includes('pan'));
  assert(isSensitiveKey('Authorization'));
  assert(!isSensitiveKey('amount'));
});

Deno.test('idempotency keys are logged only as a fingerprint', async () => {
  const raw = 'payment:APP-2026-000131:attempt-1';
  const fp = await idempotencyFingerprint(raw);
  assert(fp && fp.length === 24, 'fingerprint should be 24 hex chars');
  assert(!fp!.includes('APP-2026-000131'));
  assertEquals(fp, await idempotencyFingerprint(raw));
  assertEquals(await idempotencyFingerprint(null), null);
});
