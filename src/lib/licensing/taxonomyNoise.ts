/**
 * Presentation filter for AI assessment output.
 *
 * `license_type` is stored as "sector - sub-sector - category". When the three
 * taxonomy levels share a name the label repeats ("Building Society - Building
 * Society - Building Society"), and older stored assessments reported that as a
 * redundancy / data-quality issue. It is correct reference data, so those items
 * are hidden from the report and any repeated label is collapsed for display.
 */
import { n as collapseTaxonomyLabel } from '@/lib/formatTaxonomyLabel';

export { collapseTaxonomyLabel };

/** True when a string contains a "X - X" style repeated taxonomy label. */
function hasRepeatedTaxonomySegment(text: string): boolean {
  return /([A-Za-z][A-Za-z&.\s]{2,})\s*[-–/|>]\s*\1/i.test(text);
}

const REDUNDANCY_WORDS =
  /(redundan|repeat|duplicat|identical|same\s+(name|value)|listed\s+three\s+times|thrice)/i;
const TAXONOMY_WORDS =
  /(licen[cs]e\s*type|license_type|sector|sub[-\s]?sector|category|taxonom)/i;

/**
 * Hide an item whose only substance is the repeated taxonomy naming.
 * `texts` are all user-visible strings of the item (title, description, evidence…).
 */
export function isTaxonomyNamingNoise(texts: Array<string | null | undefined>): boolean {
  const joined = texts.filter(Boolean).join(' \n ');
  if (!joined.trim()) return false;
  if (hasRepeatedTaxonomySegment(joined) && TAXONOMY_WORDS.test(joined)) return true;
  return REDUNDANCY_WORDS.test(joined) && TAXONOMY_WORDS.test(joined);
}

/** Collapse repeated taxonomy segments inside any displayed sentence. */
export function cleanTaxonomyText(text?: string | null): string {
  if (!text) return '';
  return text.replace(
    /([A-Za-z][A-Za-z&.\s]{2,}?)(?:\s*-\s*\1\b)+/gi,
    (_m, first: string) => first.trim(),
  );
}
