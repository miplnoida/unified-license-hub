/**
 * Presentation-only labelling for AI service (provider) identifiers.
 *
 * Stored provider keys are canonical technical identifiers written by the
 * governed AI pipeline and referenced by audit evidence, so they are never
 * rewritten. This helper renders an operator-facing service name instead of
 * exposing the underlying platform vendor key on screen.
 */

const SERVICE_LABELS: Record<string, string> = {
  lovable_ai_gateway: 'MIPL AI Service',
  lovable: 'MIPL AI Service',
};

/** Human label for a single AI service identifier. */
export function aiServiceLabel(value?: string | null, fallback = 'Not recorded'): string {
  if (value === null || value === undefined) return fallback;
  const raw = String(value).trim();
  if (!raw) return fallback;
  return SERVICE_LABELS[raw.toLowerCase()] ?? raw;
}

/** Human labels for a list of AI service identifiers (e.g. model policy). */
export function aiServiceLabels(values?: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.map((v) => aiServiceLabel(typeof v === 'string' ? v : String(v), '')).filter(Boolean);
}
