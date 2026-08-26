// MC-11 — Grounding and numeric-integrity enforcement for management reporting
// narratives.
//
// The server-prepared reporting fact package is authoritative. Fluent wording is
// never evidence. Two independent checks run over every generation:
//
//   1. Reference grounding — every reference the narrative cites must be one of
//      the references supplied in the governed context (canonical MI measure
//      codes, emerging-risk references, the evidence-pack reference). An invented
//      reference, an unknown metric identifier or any URL invalidates the whole
//      generation.
//   2. Numeric integrity — the AI may not calculate authoritative supervisory MI.
//      Every number that appears in the narrative text must match a deterministic
//      value supplied in `permitted_figures`, and every `figures_used` entry must
//      name a supplied measure code and quote that measure's exact value.
//
// Nothing here trusts the model's own claim that a figure is supported: the
// figure must be present in the server-supplied package.

export interface PermittedReference { section?: unknown; reference?: unknown; label?: unknown }
export interface PermittedFigure { code: string; label?: string; value: number | null }

export interface UnsupportedFigure {
  /** The measure code the model named, when it named one. */
  measure_code: string | null;
  /** The value the model stated. */
  value: number | string;
  /** Why it was rejected. */
  reason: 'UNKNOWN_MEASURE' | 'VALUE_MISMATCH' | 'NOT_IN_SUPPLIED_FIGURES';
  statement?: string;
}

export interface GroundingResult {
  /** Supplied references the narrative legitimately cited. */
  cited: string[];
  /** References cited but not supplied — non-empty invalidates the generation. */
  invented: string[];
  /** URLs or external links found anywhere in the output. */
  externalLinks: string[];
  /** `figures_used` rows that do not reconcile with the supplied MI package. */
  unsupportedFigures: UnsupportedFigure[];
  /** Numbers appearing in narrative prose with no supplied deterministic value. */
  unsupportedNarrativeNumbers: string[];
  /** Measure codes named by the model that are not published measures. */
  inventedMeasureCodes: string[];
}

/* ------------------------------------------------------------- collection */

const CITED_LIST_KEYS = [
  'matters_for_management_attention',
  'movements',
  'risks',
  'coverage_observations',
  'chain_as_recorded',
] as const;

function addAll(target: Set<string>, v: unknown) {
  if (!Array.isArray(v)) return;
  for (const x of v) if (typeof x === 'string' && x.trim()) target.add(x.trim());
}

function collectCited(output: Record<string, unknown>): string[] {
  const found = new Set<string>();
  addAll(found, output.cited_references);
  for (const key of CITED_LIST_KEYS) {
    const list = Array.isArray(output[key]) ? (output[key] as Array<Record<string, unknown>>) : [];
    for (const item of list) {
      addAll(found, item?.cited_references);
      const ref = typeof item?.reference === 'string' ? item.reference.trim() : '';
      if (ref) found.add(ref);
    }
  }
  return [...found];
}

/** Every string in the output, so prose can be scanned for numbers and links. */
function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, acc);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, acc);
  }
  return acc;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)"']+/gi;

/** Numbers written in prose. Excludes measure codes, dates and version strings. */
const NUMBER_RE = /-?\d+(?:,\d{3})*(?:\.\d+)?%?/g;
const DATE_RE = /\d{4}-\d{2}-\d{2}/g;

function narrativeStrings(output: Record<string, unknown>): string[] {
  // `figures_used` is validated structurally; measure codes and citation arrays
  // are identifiers, not prose.
  const clone: Record<string, unknown> = { ...output };
  delete clone.figures_used;
  delete clone.cited_references;
  return collectStrings(clone);
}

/* --------------------------------------------------------------- checking */

function normaliseNumber(token: string): number | null {
  const cleaned = token.replace(/,/g, '').replace(/%$/, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function checkGrounding(
  output: Record<string, unknown>,
  permitted: PermittedReference[],
  figures: PermittedFigure[],
): GroundingResult {
  const allowedRefs = new Set(
    permitted.map((r) => (typeof r?.reference === 'string' ? r.reference.trim() : '')).filter(Boolean),
  );
  const measureCodes = new Set(figures.map((f) => f.code));
  const measureRefs = new Set(
    permitted
      .filter((r) => String(r?.section ?? '') === 'measure')
      .map((r) => String(r?.reference ?? '')),
  );
  const supportedValues = new Set<number>();
  for (const f of figures) if (typeof f.value === 'number') supportedValues.add(f.value);

  const cited = collectCited(output);

  // 1. References -----------------------------------------------------------
  const invented = cited.filter((r) => !allowedRefs.has(r));

  // 2. External links -------------------------------------------------------
  const allStrings = collectStrings(output);
  const externalLinks = [...new Set(allStrings.flatMap((s) => s.match(URL_RE) ?? []))];

  // 3. figures_used must reconcile exactly with the supplied MI package ------
  const unsupportedFigures: UnsupportedFigure[] = [];
  const inventedMeasureCodes = new Set<string>();
  const usedRows = Array.isArray(output.figures_used)
    ? (output.figures_used as Array<Record<string, unknown>>)
    : [];
  for (const row of usedRows) {
    const code = typeof row?.measure_code === 'string' ? row.measure_code.trim() : '';
    const stated = typeof row?.value === 'number' ? row.value : normaliseNumber(String(row?.value ?? ''));
    const statement = typeof row?.statement === 'string' ? row.statement : undefined;
    const figure = figures.find((f) => f.code === code);
    if (!figure) {
      if (code) inventedMeasureCodes.add(code);
      unsupportedFigures.push({ measure_code: code || null, value: stated ?? String(row?.value ?? ''), reason: 'UNKNOWN_MEASURE', statement });
      continue;
    }
    if (stated === null || figure.value === null || stated !== figure.value) {
      unsupportedFigures.push({ measure_code: code, value: stated ?? String(row?.value ?? ''), reason: 'VALUE_MISMATCH', statement });
    }
  }

  // Measure codes named in structured fields (e.g. movement rows) must exist.
  for (const key of ['movements'] as const) {
    const list = Array.isArray(output[key]) ? (output[key] as Array<Record<string, unknown>>) : [];
    for (const item of list) {
      const code = typeof item?.measure_code === 'string' ? item.measure_code.trim() : '';
      if (code && !measureCodes.has(code) && !measureRefs.has(code)) inventedMeasureCodes.add(code);
    }
  }

  // 4. Numbers in prose must each match a supplied deterministic value -------
  const unsupportedNarrativeNumbers = new Set<string>();
  for (const s of narrativeStrings(output)) {
    const withoutDates = s.replace(DATE_RE, ' ');
    for (const token of withoutDates.match(NUMBER_RE) ?? []) {
      const n = normaliseNumber(token);
      if (n === null) continue;
      // Ordinals and trivially small integers used as words ("one", "1 of the
      // recorded plans") are still checked: only supplied values are allowed,
      // except 0 and 1 which carry no MI meaning on their own.
      if (n === 0 || n === 1) continue;
      if (token.endsWith('%')) {
        // Percentages are never AI-derived. Only a supplied percentage value passes.
        if (!supportedValues.has(n)) unsupportedNarrativeNumbers.add(token);
        continue;
      }
      if (!supportedValues.has(n)) unsupportedNarrativeNumbers.add(token);
    }
  }

  return {
    cited: cited.filter((r) => allowedRefs.has(r)),
    invented,
    externalLinks,
    unsupportedFigures,
    unsupportedNarrativeNumbers: [...unsupportedNarrativeNumbers],
    inventedMeasureCodes: [...inventedMeasureCodes],
  };
}

/** True when the generation must be rejected outright rather than flagged. */
export function isRejectable(g: GroundingResult): boolean {
  return g.invented.length > 0
    || g.externalLinks.length > 0
    || g.unsupportedFigures.length > 0
    || g.inventedMeasureCodes.length > 0
    || g.unsupportedNarrativeNumbers.length > 0;
}

export function rejectionDetail(g: GroundingResult): string {
  const parts: string[] = [];
  if (g.invented.length) parts.push(`references not in the supplied facts: ${g.invented.slice(0, 5).join(', ')}`);
  if (g.externalLinks.length) parts.push(`external links: ${g.externalLinks.slice(0, 3).join(', ')}`);
  if (g.inventedMeasureCodes.length) parts.push(`unknown measure codes: ${g.inventedMeasureCodes.slice(0, 5).join(', ')}`);
  if (g.unsupportedFigures.length) {
    parts.push(
      `figures that do not reconcile with the deterministic management information: ${
        g.unsupportedFigures.slice(0, 5).map((f) => `${f.measure_code ?? '?'}=${f.value} (${f.reason})`).join(', ')
      }`,
    );
  }
  if (g.unsupportedNarrativeNumbers.length) {
    parts.push(`numbers stated without a supplied deterministic measure: ${g.unsupportedNarrativeNumbers.slice(0, 8).join(', ')}`);
  }
  return parts.join('; ');
}

export function resolveCitations(cited: string[], permitted: PermittedReference[]): PermittedReference[] {
  const wanted = new Set(cited);
  return permitted.filter((r) => wanted.has(String(r?.reference ?? '')));
}
