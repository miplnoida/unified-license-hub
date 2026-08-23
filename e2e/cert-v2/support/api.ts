import { certPassword } from './personas';

/**
 * Direct API/RPC surface for server-enforcement assertions.
 * Hiding a control in the UI is not authorization evidence — every negative
 * UI test is paired with a server-side attempt through these helpers.
 */
const URL_BASE = process.env.VITE_SUPABASE_URL as string;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const tokenCache = new Map<string, string>();

export async function accessToken(email: string): Promise<string> {
  const cached = tokenCache.get(email);
  if (cached) return cached;
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: certPassword() }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`token request failed for ${email}: HTTP ${res.status}`);
  }
  tokenCache.set(email, json.access_token);
  return json.access_token;
}

async function authHeaders(email: string) {
  return {
    apikey: ANON,
    Authorization: `Bearer ${await accessToken(email)}`,
    'Content-Type': 'application/json',
  };
}

export interface ApiResult {
  status: number;
  ok: boolean;
  body: unknown;
  bodyText: string;
}

async function wrap(res: Response): Promise<ApiResult> {
  const bodyText = await res.text();
  let body: unknown = bodyText;
  try { body = JSON.parse(bodyText); } catch { /* keep text */ }
  return { status: res.status, ok: res.ok, body, bodyText: bodyText.slice(0, 800) };
}

export async function restSelect(email: string, path: string): Promise<ApiResult> {
  return wrap(await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: await authHeaders(email) }));
}

export async function restPatch(email: string, path: string, payload: unknown): Promise<ApiResult> {
  return wrap(await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: { ...(await authHeaders(email)), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  }));
}

export async function restInsert(email: string, table: string, payload: unknown): Promise<ApiResult> {
  return wrap(await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...(await authHeaders(email)), Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  }));
}

export async function rpc(email: string, fn: string, args: Record<string, unknown>): Promise<ApiResult> {
  return wrap(await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: await authHeaders(email),
    body: JSON.stringify(args),
  }));
}

/** A denial is any server rejection: 401/403, or a Postgres permission/RLS error. */
export function isDenied(r: ApiResult): boolean {
  if (r.status === 401 || r.status === 403) return true;
  if (r.status >= 400 && /permission denied|row-level security|not authorized|not authorised|insufficient|denied/i.test(r.bodyText)) return true;
  return false;
}
