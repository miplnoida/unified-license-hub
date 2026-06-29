// Deep-equal comparison used to detect whether a renewal form field has been
// changed from the original approved application's submitted value.
//
// Normalization rules (kept intentionally permissive so trivial differences
// don't flag as "changed"):
//   - undefined, null, '' (and whitespace-only strings) are all treated as empty.
//   - Strings are trimmed before compare.
//   - Numbers compare by value (strings that look like numbers do NOT auto-cast —
//     a form value of "5" vs 5 is treated as different, matching how the data
//     was actually stored).
//   - Arrays compare element-wise via deep compare (order-sensitive — order
//     matters in repeatable sections, multi-select, etc.).
//   - Plain objects compare key-by-key via deep compare.
//   - Anything else falls back to strict equality.

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isEmpty = (v: unknown): boolean => {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) return Object.keys(v).length === 0;
  return false;
};

export function deepEqualField(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (isEmpty(a) !== isEmpty(b)) return false;

  if (typeof a === 'string' && typeof b === 'string') {
    return a.trim() === b.trim();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqualField(a[i], b[i])) return false;
    }
    return true;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
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

/** Returns the original value for a fieldName, or undefined when baseline is missing. */
export function pickFieldFromOriginal(
  originalData: Record<string, unknown> | undefined | null,
  fieldName: string,
): unknown {
  if (!originalData) return undefined;
  return originalData[fieldName];
}

/** Compares two table rows for diff highlighting. */
export function isRowChanged(currentRow: unknown, originalRow: unknown): boolean {
  return !deepEqualField(currentRow, originalRow);
}

/** Compares two repeatable-section entries for diff highlighting. */
export function isRepeatableEntryChanged(currentEntry: unknown, originalEntry: unknown): boolean {
  return !deepEqualField(currentEntry, originalEntry);
}

/**
 * File-aware comparison. Files are considered the same when they reference the
 * same underlying upload (uploadId), document group + version, file path, or
 * — as a last resort — the same display name + size. Supports single-file
 * objects and arrays (allowMultiple).
 */
export function isFileFieldChanged(current: unknown, original: unknown): boolean {
  if (isEmpty(current) && isEmpty(original)) return false;
  if (isEmpty(current) !== isEmpty(original)) return true;

  const sameOne = (a: any, b: any): boolean => {
    if (!a || !b) return false;
    if (a.uploadId && b.uploadId) return a.uploadId === b.uploadId;
    if (a.groupId && b.groupId) return a.groupId === b.groupId && (a.version ?? null) === (b.version ?? null);
    if (a.filePath && b.filePath) return a.filePath === b.filePath;
    return (a.name === b.name) && ((a.size ?? null) === (b.size ?? null));
  };

  if (Array.isArray(current) && Array.isArray(original)) {
    if (current.length !== original.length) return true;
    for (let i = 0; i < current.length; i += 1) {
      if (!sameOne(current[i], original[i])) return true;
    }
    return false;
  }

  if (typeof current === 'object' && typeof original === 'object') {
    return !sameOne(current as any, original as any);
  }

  return current !== original;
}
