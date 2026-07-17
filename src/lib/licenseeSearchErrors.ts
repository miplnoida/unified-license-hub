/**
 * Error taxonomy for the search_licensees RPC.
 *
 * Maps Postgres error codes / hints returned by supabase-js into a small,
 * closed set of UI states. Raw error text is NEVER surfaced to users — we
 * log it via the platform logger and render a category-specific message.
 */
import { logger } from '@/platform/logger';

export type LicenseeSearchErrorCategory =
  | 'permission_denied'
  | 'auth_expired'
  | 'no_regulator_scope'
  | 'network'
  | 'rpc_error'
  | 'shape_error';

export interface LicenseeSearchError {
  category: LicenseeSearchErrorCategory;
  userMessage: string;
  retryable: boolean;
}

const MESSAGES: Record<LicenseeSearchErrorCategory, string> = {
  permission_denied:
    'You do not have permission to search regulated entities. Contact your administrator.',
  auth_expired: 'Your session has expired. Please sign in again.',
  no_regulator_scope:
    'Your account is not assigned to a regulator. Ask an administrator to complete your setup.',
  network: 'Could not reach the server. Check your connection and try again.',
  rpc_error: 'Entity search is temporarily unavailable. Please try again in a moment.',
  shape_error: 'Received an unexpected response from the server.',
};

const RETRYABLE: Record<LicenseeSearchErrorCategory, boolean> = {
  permission_denied: false,
  auth_expired: false,
  no_regulator_scope: false,
  network: true,
  rpc_error: true,
  shape_error: true,
};

export function classifyLicenseeSearchError(err: unknown): LicenseeSearchError {
  logger.error(err as Error, { feature: 'complaints', op: 'search_licensees' });

  const e = err as { code?: string; hint?: string; message?: string; name?: string } | null;
  const hint = e?.hint?.toLowerCase() ?? '';
  const code = e?.code ?? '';
  const msg = (e?.message ?? '').toLowerCase();

  let category: LicenseeSearchErrorCategory = 'rpc_error';

  if (hint === 'auth_required' || msg.includes('jwt') || msg.includes('not authenticated')) {
    category = 'auth_expired';
  } else if (hint === 'no_regulator_scope') {
    category = 'no_regulator_scope';
  } else if (code === '42501' || msg.includes('permission denied')) {
    category = 'permission_denied';
  } else if (
    e?.name === 'TypeError' ||
    msg.includes('failed to fetch') ||
    msg.includes('network')
  ) {
    category = 'network';
  } else if (msg.includes('unexpected') || msg.includes('parse')) {
    category = 'shape_error';
  }

  return {
    category,
    userMessage: MESSAGES[category],
    retryable: RETRYABLE[category],
  };
}
