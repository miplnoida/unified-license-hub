/**
 * Tiny runtime registry shared by the email field control and the form
 * validators. The control owns the verification / uniqueness UI and publishes
 * its resolved state here; validators read it when the applicant presses
 * Next / Save / Submit. Keeping it outside React state avoids threading
 * callbacks through every renderer while remaining a single source of truth.
 */

export type EmailUniqueState = 'idle' | 'checking' | 'available' | 'taken';

export interface EmailFieldRuntimeState {
  /** Normalised email the state refers to. */
  email: string;
  verified: boolean;
  unique: EmailUniqueState;
}

const store = new Map<string, EmailFieldRuntimeState>();

export function setEmailFieldRuntimeState(fieldKey: string, state: EmailFieldRuntimeState): void {
  store.set(fieldKey, state);
}

export function clearEmailFieldRuntimeState(fieldKey: string): void {
  store.delete(fieldKey);
}

export function getEmailFieldRuntimeState(fieldKey: string): EmailFieldRuntimeState | undefined {
  return store.get(fieldKey);
}

export function resetEmailFieldRuntimeStates(): void {
  store.clear();
}

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** State for `fieldKey`, but only when it still refers to the current value. */
export function currentEmailFieldRuntimeState(
  fieldKey: string,
  value: unknown,
): EmailFieldRuntimeState | undefined {
  const state = store.get(fieldKey);
  if (!state) return undefined;
  return state.email === normalize(value) ? state : undefined;
}
