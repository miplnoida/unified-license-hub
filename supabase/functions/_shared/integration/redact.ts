/**
 * ADM-INT-001 — payload redaction for the Integration Manager.
 *
 * Integration logs never store raw request/response bodies. What they store is
 * a *shape summary*: which fields were sent, with sensitive values removed and
 * every other value reduced to its type/length. That keeps the log useful for
 * mapping debugging while making it useless as a data-exfiltration surface.
 */

const SENSITIVE_KEY = new RegExp(
  [
    'authorization',
    'auth[_-]?token',
    'access[_-]?token',
    'refresh[_-]?token',
    'id[_-]?token',
    'api[_-]?key',
    'client[_-]?secret',
    'secret',
    'password',
    'passphrase',
    'pin',
    'otp',
    'national[_-]?id',
    'nid',
    'trn',
    'ssn',
    'passport',
    'card[_-]?number',
    'pan',
    'cvv',
    'cvc',
    'account[_-]?number',
    'iban',
    'routing',
    'dob',
    'date[_-]?of[_-]?birth',
    'document[_-]?data',
    'file[_-]?content',
    'base64',
    'signature',
  ].join('|'),
  'i',
);

const REDACTED = '[redacted]';

function summariseScalar(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return '[number]';
  if (typeof value === 'string') return `[string:${value.length}]`;
  return '[value]';
}

/**
 * Recursively replace sensitive values with `[redacted]` and non-sensitive
 * scalars with a type marker. Depth- and width-capped so a large provider
 * payload can never blow up a log row.
 */
export function redactPayload(
  input: unknown,
  depth = 0,
): unknown {
  if (depth > 4) return '[truncated]';
  if (input === null || input === undefined) return null;
  if (Array.isArray(input)) {
    return {
      _array: input.length,
      sample: input.length ? redactPayload(input[0], depth + 1) : null,
    };
  }
  if (typeof input !== 'object') return summariseScalar(input);

  const out: Record<string, unknown> = {};
  const entries = Object.entries(input as Record<string, unknown>).slice(0, 40);
  for (const [key, value] of entries) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = value !== null && typeof value === 'object'
      ? redactPayload(value, depth + 1)
      : summariseScalar(value);
  }
  return out;
}

/** Names of the keys that were redacted — useful evidence in reports. */
export function redactedKeys(input: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 4 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.slice(0, 5).forEach((x) => walk(x, depth + 1));
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) found.push(k);
      else walk(val, depth + 1);
    }
  };
  walk(input, 0);
  return [...new Set(found)];
}

/** True when the key would be redacted — used by the redaction test suite. */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

/**
 * Safe representation of an idempotency key. The raw key can embed business
 * identifiers, so logs keep only a stable fingerprint.
 */
export async function idempotencyFingerprint(
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null;
  const bytes = new TextEncoder().encode(`adm-int-001:${key}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
