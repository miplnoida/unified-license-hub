/**
 * AML negative tests require an authorization refusal, not just an unsuccessful
 * request. A missing record, broken RPC, invalid input or expired session must
 * fail certification rather than being counted as permission enforcement.
 */
export interface AuthorizationResult {
  status: number;
  ok: boolean;
  body: unknown;
  bodyText: string;
}

export function isAmlAuthorizationDenied(result: AuthorizationResult): boolean {
  if (result.ok || ![400, 403].includes(result.status)) return false;
  const body = result.body;
  const error = body !== null && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : undefined;
  const code = typeof error?.code === 'string' ? error.code : undefined;
  if (code === '42501') return true;
  // Other structured SQL/PostgREST failures are not authorization evidence.
  if (code && code !== 'P0001') return false;
  const message = typeof error?.message === 'string' ? error.message : result.bodyText;
  return /\b(permission denied|row-level security|not authorized|not authorised|access denied|forbidden)\b/i.test(message);
}
