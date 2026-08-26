/**
 * Wave 3 Batch 2 execution harness — real API surface, real persona tokens.
 * No service-role shortcuts: every call goes through PostgREST/edge functions
 * as an authenticated certification identity, so RLS and RPC guards apply.
 */
const URL_BASE = process.env.VITE_SUPABASE_URL as string;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const PASSWORD = process.env.CERT_V2_DEFAULT_PASSWORD as string;

export const P = (role: string) => `${role}@mishainfotech.com`;

const tokens = new Map<string, string>();

export async function token(email: string): Promise<string> {
  const hit = tokens.get(email);
  if (hit) return hit;
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json: any = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`login failed for ${email}: HTTP ${res.status}`);
  tokens.set(email, json.access_token);
  return json.access_token;
}

async function headers(email: string) {
  return {
    apikey: ANON,
    Authorization: `Bearer ${await token(email)}`,
    'Content-Type': 'application/json',
  } as Record<string, string>;
}

export interface Res { status: number; ok: boolean; body: any; text: string }

async function wrap(res: Response): Promise<Res> {
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* keep */ }
  return { status: res.status, ok: res.ok, body, text: text.slice(0, 600) };
}

export const rpc = async (email: string, fn: string, args: Record<string, unknown> = {}) =>
  wrap(await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: await headers(email), body: JSON.stringify(args) }));

export const sel = async (email: string, path: string) =>
  wrap(await fetch(`${URL_BASE}/rest/v1/${path}`, { headers: await headers(email) }));

export const ins = async (email: string, table: string, payload: unknown) =>
  wrap(await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST', headers: { ...(await headers(email)), Prefer: 'return=representation' }, body: JSON.stringify(payload),
  }));

export const patch = async (email: string, path: string, payload: unknown) =>
  wrap(await fetch(`${URL_BASE}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...(await headers(email)), Prefer: 'return=representation' }, body: JSON.stringify(payload),
  }));

export const del = async (email: string, path: string) =>
  wrap(await fetch(`${URL_BASE}/rest/v1/${path}`, { method: 'DELETE', headers: await headers(email) }));

export const fn = async (email: string, name: string, payload: unknown) =>
  wrap(await fetch(`${URL_BASE}/functions/v1/${name}`, { method: 'POST', headers: await headers(email), body: JSON.stringify(payload) }));


export const denied = (r: Res) =>
  r.status === 401 || r.status === 403 ||
  /permission denied|not[ _]author(is|iz)|row-level security|insufficient|maker[-_]checker|violation|denied/i.test(r.text);

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

export function record(step: string, ok: boolean, detail = '') {
  results.push({ step, ok, detail: detail.slice(0, 240) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${detail ? `  :: ${detail.slice(0, 240)}` : ''}`);
}

export function summary(label: string) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${label}: ${results.length - failed.length}/${results.length} steps passed ===`);
  for (const f of failed) console.log(`  FAILED: ${f.step} :: ${f.detail}`);
  return failed.length;
}
