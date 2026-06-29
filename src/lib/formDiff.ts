// Diff utilities for the License Renewal flow.
//
// Used to detect whether a renewal-form field, repeatable entry, or table row
// has been changed from the original approved application's value.
//
// Normalization rules (intentionally permissive to avoid spurious "Changed"
// flags from trivial differences):
//   - undefined, null, '' (and whitespace-only strings) are all empty.
//   - Strings compare after trim + internal-whitespace collapse.
//   - Numbers and numeric-only strings cross-compare by numeric value
//     (so "5" === 5 === " 5 ").
//   - Booleans normalize from common truthy/falsy strings
//     ("true"/"yes"/"1" -> true, "false"/"no"/"0" -> false) and from 1/0.
//   - Date strings (ISO 8601, YYYY-MM-DD, epoch ms) compare by getTime().
//   - Arrays compare element-wise via deep compare (order-sensitive).
//   - Plain objects compare key-by-key with sorted keys.
//   - Anything else falls back to strict equality.

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isEmpty = (v: unknown): boolean => {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) {
    // file objects with only undefined/null fields still count as non-empty
    // because the renderer treats them as a value. Object with at least one
    // own key is non-empty.
    return Object.keys(v).length === 0;
  }
  return false;
};

const NUMERIC_RE = /^-?\d+(?:\.\d+)?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

const tryNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (NUMERIC_RE.test(t)) return Number(t);
  }
  return null;
};

const tryBoolean = (v: unknown): boolean | null => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    if (t === 'true' || t === 'yes' || t === '1') return true;
    if (t === 'false' || t === 'no' || t === '0') return false;
  }
  return null;
};

const tryDateMs = (v: unknown): number | null => {
  if (v instanceof Date) {
    const n = v.getTime();
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (!ISO_DATE_RE.test(t)) return null;
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const normalizeString = (s: string): string => s.trim().replace(/\s+/g, ' ');

export function deepEqualField(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) !== isEmpty(b)) return false;

  // Date normalization (must run before string compare so "2024-01-01" vs
  // "2024-01-01T00:00:00.000Z" match).
  const da = tryDateMs(a);
  const db = tryDateMs(b);
  if (da !== null && db !== null) return da === db;

  // Boolean normalization across string/number/boolean.
  const ba = tryBoolean(a);
  const bb = tryBoolean(b);
  if (ba !== null && bb !== null && (typeof a === 'boolean' || typeof b === 'boolean')) {
    return ba === bb;
  }

  // Numeric cross-compare (string-number).
  const na = tryNumber(a);
  const nb = tryNumber(b);
  if (na !== null && nb !== null) return na === nb;

  if (typeof a === 'string' && typeof b === 'string') {
    return normalizeString(a) === normalizeString(b);
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualField(a[i], b[i])) return false;
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    const all = new Set([...keysA, ...keysB]);
    for (const k of all) {
      if (!deepEqualField(a[k], b[k])) return false;
    }
    return true;
  }

  return a === b;
}

export function isFieldChanged(
  fieldName: string,
  currentValue: unknown,
  originalData: Record<string, unknown> | undefined | null,
): boolean {
  if (!originalData) return false;
  return !deepEqualField(currentValue, originalData[fieldName]);
}

export function pickFieldFromOriginal(
  originalData: Record<string, unknown> | undefined | null,
  fieldName: string,
): unknown {
  if (!originalData) return undefined;
  return originalData[fieldName];
}

export function isRowChanged(currentRow: unknown, originalRow: unknown): boolean {
  return !deepEqualField(currentRow, originalRow);
}

export function isRepeatableEntryChanged(currentEntry: unknown, originalEntry: unknown): boolean {
  return !deepEqualField(currentEntry, originalEntry);
}

/* ----------------------- File / upload comparison ----------------------- */

type FileLike = {
  uploadId?: string;
  groupId?: string;
  versionId?: string;
  version?: number | string;
  filePath?: string;
  name?: string;
  size?: number;
  mimeType?: string;
};

function fileIdentity(f: FileLike | null | undefined): string | null {
  if (!f || typeof f !== 'object') return null;
  if (f.uploadId) return `u:${f.uploadId}`;
  if (f.groupId && f.versionId) return `gv:${f.groupId}:${f.versionId}`;
  if (f.groupId && f.version != null) return `gver:${f.groupId}:${f.version}`;
  if (f.filePath) return `p:${f.filePath}`;
  if (f.name) return `ns:${f.name}:${f.size ?? ''}:${f.mimeType ?? ''}`;
  return null;
}

function sameFile(a: FileLike, b: FileLike): boolean {
  const ia = fileIdentity(a);
  const ib = fileIdentity(b);
  if (ia && ib) return ia === ib;
  // Fallback: name + size match
  return (a.name === b.name) && ((a.size ?? null) === (b.size ?? null));
}

export function isFileFieldChanged(current: unknown, original: unknown): boolean {
  if (isEmpty(current) && isEmpty(original)) return false;
  if (isEmpty(current) !== isEmpty(original)) return true;

  if (Array.isArray(current) && Array.isArray(original)) {
    if (current.length !== original.length) return true;
    // Order-insensitive identity match — uploads in different positions but
    // same identity should not be flagged.
    const remaining = [...(original as FileLike[])];
    for (const c of current as FileLike[]) {
      const idx = remaining.findIndex((o) => sameFile(c, o));
      if (idx === -1) return true;
      remaining.splice(idx, 1);
    }
    return false;
  }

  if (typeof current === 'object' && typeof original === 'object') {
    return !sameFile(current as FileLike, original as FileLike);
  }

  return current !== original;
}

/* ----------------------- Repeatable / row pairing ----------------------- */

export type DiffStatus = 'unchanged' | 'edited' | 'added' | 'deleted' | 'reordered';

export interface DiffPair<T> {
  current: T | null;
  original: T | null;
  currentIndex: number | null;
  originalIndex: number | null;
  status: DiffStatus;
}

/**
 * Compute a stable identity key for a repeatable entry or table row.
 * Prefers explicit ids when present, otherwise hashes the content so identical
 * entries collapse to the same key (and reorder vs edit can be detected).
 */
export function entryKey(entry: unknown): string {
  if (!isPlainObject(entry)) return JSON.stringify(entry ?? null);
  const e = entry as Record<string, unknown>;
  const id = e.id ?? e.uuid ?? e._key ?? e._id ?? e.key;
  if (id != null && id !== '') return `id:${String(id)}`;
  // Content hash via sorted-key JSON.
  return `c:${stableJson(e)}`;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => JSON.stringify(k) + ':' + stableJson((value as any)[k])).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/**
 * Pair entries/rows from current[] and original[] by identity and classify
 * each pair as unchanged | edited | added | deleted | reordered.
 *
 * Algorithm:
 *  - Build identity keys for every entry on each side.
 *  - For entries with identical keys present on both sides → unchanged (or
 *    reordered if their positions differ).
 *  - For keys only in current → added.
 *  - For keys only in original → deleted.
 *  - Best-effort edit detection: when an added entry and a deleted entry
 *    occupy the same index, treat them as an edit pair.
 *
 * Returns pairs in current-first order, then trailing deleted entries.
 */
export function diffRepeatable<T = any>(
  current: T[] | undefined | null,
  original: T[] | undefined | null,
): {
  pairs: DiffPair<T>[];
  added: number;
  deleted: number;
  edited: number;
  reordered: number;
} {
  const cur = Array.isArray(current) ? current : [];
  const orig = Array.isArray(original) ? original : [];

  const curKeys = cur.map(entryKey);
  const origKeys = orig.map(entryKey);

  // Track which original indexes are still available to match against.
  const origAvailable = new Set(orig.map((_, i) => i));
  const pairs: DiffPair<T>[] = [];

  // 1) For each current entry, try to match by key first.
  const curMatches: Array<number | null> = cur.map(() => null);
  curKeys.forEach((k, ci) => {
    for (const oi of origAvailable) {
      if (origKeys[oi] === k) {
        curMatches[ci] = oi;
        origAvailable.delete(oi);
        break;
      }
    }
  });

  // 2) For unmatched current entries, try same-index edit pairing.
  curMatches.forEach((m, ci) => {
    if (m !== null) return;
    if (origAvailable.has(ci)) {
      curMatches[ci] = ci;
      origAvailable.delete(ci);
    }
  });

  let added = 0;
  let deleted = 0;
  let edited = 0;
  let reordered = 0;

  cur.forEach((c, ci) => {
    const oi = curMatches[ci];
    if (oi === null) {
      pairs.push({ current: c, original: null, currentIndex: ci, originalIndex: null, status: 'added' });
      added += 1;
      return;
    }
    const o = orig[oi];
    if (deepEqualField(c, o)) {
      if (oi !== ci) {
        pairs.push({ current: c, original: o, currentIndex: ci, originalIndex: oi, status: 'reordered' });
        reordered += 1;
      } else {
        pairs.push({ current: c, original: o, currentIndex: ci, originalIndex: oi, status: 'unchanged' });
      }
    } else {
      pairs.push({ current: c, original: o, currentIndex: ci, originalIndex: oi, status: 'edited' });
      edited += 1;
    }
  });

  // 3) Trailing deletions (original entries not matched to any current).
  origAvailable.forEach((oi) => {
    pairs.push({ current: null, original: orig[oi], currentIndex: null, originalIndex: oi, status: 'deleted' });
    deleted += 1;
  });

  return { pairs, added, deleted, edited, reordered };
}

/* ----------------------- Memoized diff index ----------------------- */

export interface FieldDiffResult {
  changed: boolean;
  original: unknown;
}

/**
 * Build a Map<fieldName, { changed, original }> once per render so callers
 * don't redo deep comparison per field. Pair this with useMemo keyed on the
 * (formData, originalData) identity to amortize the cost.
 */
export function buildDiffIndex(
  formData: Record<string, unknown> | undefined | null,
  originalData: Record<string, unknown> | undefined | null,
  fieldNames: string[],
): Map<string, FieldDiffResult> {
  const out = new Map<string, FieldDiffResult>();
  if (!originalData) return out;
  const data = formData || {};
  for (const fn of fieldNames) {
    const cur = data[fn];
    const orig = originalData[fn];
    out.set(fn, { changed: !deepEqualField(cur, orig), original: orig });
  }
  return out;
}
