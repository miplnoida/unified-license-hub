/**
 * Shared authentication strategies for connector adapters.
 * The credential value is read from the backend secret store at call time and
 * is never logged, echoed or persisted.
 */
import { ConnectorContext, ConnectorRequest } from './types.ts';

export function bearer(req: ConnectorRequest, ctx: ConnectorContext): ConnectorRequest {
  if (!ctx.credential) return req;
  return {
    ...req,
    headers: { ...(req.headers ?? {}), Authorization: `Bearer ${ctx.credential.value}` },
  };
}

export function apiKeyHeader(headerName: string) {
  return (req: ConnectorRequest, ctx: ConnectorContext): ConnectorRequest => {
    if (!ctx.credential) return req;
    return {
      ...req,
      headers: { ...(req.headers ?? {}), [headerName]: ctx.credential.value },
    };
  };
}

export function basicAuth(req: ConnectorRequest, ctx: ConnectorContext): ConnectorRequest {
  if (!ctx.credential) return req;
  // Secret is stored as "user:password".
  const encoded = btoa(ctx.credential.value);
  return {
    ...req,
    headers: { ...(req.headers ?? {}), Authorization: `Basic ${encoded}` },
  };
}

/**
 * OAuth2 client-credentials. Tokens are cached in-process until shortly
 * before expiry, then refreshed transparently — callers never handle tokens.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function oauth2ClientCredentials(
  req: ConnectorRequest,
  ctx: ConnectorContext,
): Promise<ConnectorRequest> {
  if (!ctx.credential || !ctx.connection.base_url) return req;
  const cacheKey = `${ctx.connection.integration_key}:${ctx.credential.version}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - 30_000 > Date.now()) {
    return {
      ...req,
      headers: { ...(req.headers ?? {}), Authorization: `Bearer ${cached.token}` },
    };
  }

  const mapping = (ctx.connection.data_mapping ?? {}) as Record<string, unknown>;
  const tokenPath = typeof mapping.token_path === 'string' ? mapping.token_path : 'oauth/token';
  const base = ctx.connection.base_url.endsWith('/')
    ? ctx.connection.base_url
    : `${ctx.connection.base_url}/`;
  const [clientId, clientSecret] = ctx.credential.value.includes(':')
    ? ctx.credential.value.split(':')
    : ['', ctx.credential.value];

  const res = await fetch(new URL(tokenPath, base).toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(`OAuth2 token request failed with HTTP ${res.status}`);
  }
  const body = await res.json().catch(() => ({}));
  const token = body.access_token;
  if (typeof token !== 'string') throw new Error('OAuth2 token response had no access_token');
  const ttl = Number(body.expires_in ?? 3600) * 1000;
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + ttl });
  return {
    ...req,
    headers: { ...(req.headers ?? {}), Authorization: `Bearer ${token}` },
  };
}

/** Test-only: clears the OAuth token cache. */
export function _resetTokenCache(): void {
  tokenCache.clear();
}

export function noAuth(req: ConnectorRequest): ConnectorRequest {
  return req;
}

/** Standard provider error normalisation used by most REST adapters. */
export function standardParseError(status: number, body: unknown) {
  const b = body as Record<string, unknown> | null;
  const message = (typeof b?.message === 'string' && b.message) ||
    (typeof b?.error === 'string' && b.error) ||
    (typeof b?.error_description === 'string' && b.error_description) ||
    (typeof body === 'string' && body.slice(0, 300)) ||
    `Provider returned HTTP ${status}`;
  return {
    category: status === 401
      ? 'auth' as const
      : status === 403
      ? 'authorization' as const
      : status === 429
      ? 'rate_limit' as const
      : status >= 500
      ? 'server' as const
      : 'validation' as const,
    message: String(message),
  };
}

/** Require a field on a provider response; throws a mapping error when absent. */
export function need<T>(value: T | undefined | null, field: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Provider response is missing required field "${field}"`);
  }
  return value;
}
