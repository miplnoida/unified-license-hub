/**
 * Collapses consecutive duplicate segments in a `" - "`-joined taxonomy
 * label (sector - sub-sector - category). Keeps the original order and
 * uniqueness when adjacent levels differ.
 *
 *   "Commercial Bank - Commercial Bank - Commercial Bank" -> "Commercial Bank"
 *   "Banking - Commercial Bank - Foreign"                 -> "Banking - Commercial Bank - Foreign"
 */
export function formatTaxonomyLabel(value?: string | null): string {
  if (!value) return '';
  const parts = value.split(' - ').map(p => p.trim()).filter(Boolean);
  const deduped: string[] = [];
  for (const p of parts) {
    if (deduped[deduped.length - 1]?.toLowerCase() !== p.toLowerCase()) {
      deduped.push(p);
    }
  }
  return deduped.join(' - ');
}
