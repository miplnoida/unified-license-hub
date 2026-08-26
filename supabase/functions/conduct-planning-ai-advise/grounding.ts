// MC-10 — Grounding enforcement for supervisory planning advisory output.
//
// Every material statement must trace to a reference supplied in the governed
// planning fact package, and every intervention option must name a code from the
// approved catalogue supplied in that package. A reference or a code the model
// invented invalidates the whole generation: nothing is persisted.

export interface PermittedReference { section?: unknown; reference?: unknown; label?: unknown }

export interface GroundingResult {
  cited: string[];
  invented: string[];
  /** Intervention codes named outside the approved catalogue. Non-empty ⇒ invalid. */
  unapprovedCodes: string[];
}

function collectCited(output: Record<string, unknown>): string[] {
  const found = new Set<string>();
  const add = (v: unknown) => {
    if (!Array.isArray(v)) return;
    for (const x of v) if (typeof x === 'string' && x.trim()) found.add(x.trim());
  };
  add(output.cited_references);
  for (const key of ['records', 'questions', 'options', 'suggested_milestones', 'considerations'] as const) {
    const list = Array.isArray(output[key]) ? (output[key] as Array<Record<string, unknown>>) : [];
    for (const item of list) {
      add(item?.cited_references);
      const ref = typeof item?.reference === 'string' ? item.reference.trim() : '';
      if (ref) found.add(ref);
    }
  }
  return [...found];
}

function collectCodes(output: Record<string, unknown>): string[] {
  const options = Array.isArray(output.options) ? (output.options as Array<Record<string, unknown>>) : [];
  return options
    .map((o) => (typeof o?.catalogue_code === 'string' ? o.catalogue_code.trim() : ''))
    .filter(Boolean);
}

export function checkGrounding(
  output: Record<string, unknown>,
  permitted: PermittedReference[],
  approvedCodes: string[],
): GroundingResult {
  const allowed = new Set(
    permitted.map((r) => (typeof r?.reference === 'string' ? r.reference.trim() : '')).filter(Boolean),
  );
  const codes = new Set(approvedCodes);
  const cited = collectCited(output);
  return {
    cited: cited.filter((r) => allowed.has(r)),
    invented: cited.filter((r) => !allowed.has(r)),
    unapprovedCodes: [...new Set(collectCodes(output).filter((c) => !codes.has(c)))],
  };
}

export function resolveCitations(cited: string[], permitted: PermittedReference[]): PermittedReference[] {
  const wanted = new Set(cited);
  return permitted.filter((r) => wanted.has(String(r?.reference ?? '')));
}
