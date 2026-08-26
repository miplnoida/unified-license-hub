// MC-09 — Grounding enforcement for cross-entity supervisory intelligence advisory output.
//
// Every material AI statement must be traceable to a source reference that was
// supplied in the governed context. A reference the model invented, reformatted
// or guessed invalidates the whole generation: nothing is persisted.

export interface PermittedReference {
  section?: unknown;
  reference?: unknown;
  href?: unknown;
}

export interface GroundingResult {
  /** References the model actually cited, all of them present in the context. */
  cited: string[];
  /** References the model cited that were NOT in the context. Non-empty ⇒ invalid. */
  invented: string[];
}

/** Collects every reference the model cited anywhere in its structured output. */
export function collectCitedReferences(output: Record<string, unknown>): string[] {
  const found = new Set<string>();
  const add = (v: unknown) => {
    if (!Array.isArray(v)) return;
    for (const x of v) {
      if (typeof x === 'string' && x.trim()) found.add(x.trim());
    }
  };

  add(output.cited_references);
  for (const key of ['sections', 'questions', 'hypotheses'] as const) {
    const list = Array.isArray(output[key]) ? (output[key] as Array<Record<string, unknown>>) : [];
    for (const item of list) add(item?.cited_references);
  }
  const records = Array.isArray(output.records) ? (output.records as Array<Record<string, unknown>>) : [];
  for (const r of records) {
    const ref = typeof r?.reference === 'string' ? r.reference.trim() : '';
    if (ref) found.add(ref);
  }
  return [...found];
}

/** Splits the cited references into permitted and invented. */
export function checkGrounding(
  output: Record<string, unknown>,
  permitted: PermittedReference[],
): GroundingResult {
  const allowed = new Set(
    permitted
      .map((r) => (typeof r?.reference === 'string' ? r.reference.trim() : ''))
      .filter(Boolean),
  );
  const cited = collectCitedReferences(output);
  return {
    cited: cited.filter((r) => allowed.has(r)),
    invented: cited.filter((r) => !allowed.has(r)),
  };
}

/** Resolves cited references back to the context entries used for drill-down. */
export function resolveCitations(
  cited: string[],
  permitted: PermittedReference[],
): PermittedReference[] {
  const wanted = new Set(cited);
  return permitted.filter((r) => wanted.has(String(r?.reference ?? '')));
}
