/**
 * RDM-ENTITY-001 Wave C — resumable application journey (§20).
 *
 * The onboarding chain (`/register` → `/register/entity` → membership request)
 * must not always dump the user at `/dashboard`. Callers can attach an
 * `?intent=` query param describing the application/form-package the user was
 * trying to reach; it is persisted in sessionStorage so it survives the
 * multi-step, multi-page onboarding journey and a later visit once the
 * membership authority is approved.
 */

const INTENT_KEY = 'onboarding:intendedApplication';

export interface ApplicationIntent {
  /** Where to resume once entity access is usable, e.g. "/applications/new?package=xyz". */
  path: string;
  /** Optional human label shown while the user waits for authority approval. */
  label?: string;
}

export function readIntentFromSearch(search: string): ApplicationIntent | null {
  const params = new URLSearchParams(search);
  const intent = params.get('intent');
  if (!intent) return null;
  try {
    return { path: decodeURIComponent(intent), label: params.get('intentLabel') || undefined };
  } catch {
    return null;
  }
}

export function persistIntent(intent: ApplicationIntent | null): void {
  try {
    if (intent) sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
    else sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* best-effort */
  }
}

export function loadPersistedIntent(): ApplicationIntent | null {
  try {
    const raw = sessionStorage.getItem(INTENT_KEY);
    return raw ? (JSON.parse(raw) as ApplicationIntent) : null;
  } catch {
    return null;
  }
}

export function clearPersistedIntent(): void {
  persistIntent(null);
}

/** Appends the intent (if any) as a query string to a target path, e.g. for /register links. */
export function withIntentParam(path: string, intent: ApplicationIntent | null): string {
  if (!intent) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}intent=${encodeURIComponent(intent.path)}${intent.label ? `&intentLabel=${encodeURIComponent(intent.label)}` : ''}`;
}
